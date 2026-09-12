import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HokmGame, shuffle, teamOf, TEAM_NAME } from './src/game.js';
import { chooseTrump as botTrump, chooseCard as botCard, botName } from './src/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// Scales every animation pause. 1 = normal table pace; the test suite runs it fast.
const PACE = Number(process.env.HOKM_PACE || 1);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_req, res) => res.send('ok'));

const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

// ─────────────────────────────────────────── rooms

/** @type {Map<string, Room>} */
const rooms = new Map();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(hostId) {
  const room = {
    code: newCode(),
    hostId,
    seats: [null, null, null, null], // { id, name, isBot, connected }
    sockets: new Map(), // playerId -> socket.id
    names: new Map(), // playerId -> name
    game: null,
    timer: null,
    chat: [],
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const seatOfPlayer = (room, playerId) => room.seats.findIndex((s) => s && s.id === playerId);
const isAuto = (p) => !p || p.isBot || p.connected === false;
const seatedCount = (room) => room.seats.filter(Boolean).length;

function roomPayload(room, playerId) {
  const mySeat = seatOfPlayer(room, playerId);
  const base = {
    code: room.code,
    isHost: room.hostId === playerId,
    mySeat: mySeat === -1 ? null : mySeat,
    seats: room.seats.map((s, i) =>
      s ? { seat: i, name: s.name, isBot: s.isBot, connected: s.connected !== false, team: teamOf(i) } : null
    ),
    chat: room.chat.slice(-40),
    inGame: !!room.game,
  };
  if (!room.game) return { ...base, game: null };
  return { ...base, game: room.game.viewFor(mySeat === -1 ? null : mySeat) };
}

function broadcast(room) {
  for (const [playerId, socketId] of room.sockets) {
    io.to(socketId).emit('state', roomPayload(room, playerId));
  }
}

function syncPlayersIntoGame(room) {
  if (!room.game) return;
  room.game.players = room.seats.map((s, i) =>
    s ? { id: s.id, name: s.name, isBot: s.isBot, connected: s.connected !== false } : { id: null, name: `Seat ${i + 1}`, isBot: true, connected: false }
  );
}

// ─────────────────────────────────────────── game driver

// How long a present human gets before the table plays for them.
const TURN_MS = 60000;
const TRUMP_MS = 45000;

// Canned table talk. Ids only — the wording lives in the client.
const EMOTES = new Set(['hello', 'wellplayed', 'nice', 'oops', 'thanks', 'hurry']);
const EMOTE_COOLDOWN_MS = 2500;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function advance(room) {
  const g = room.game;
  clearTimeout(room.timer);
  if (!g) return;
  syncPlayersIntoGame(room);
  g.turnDeadline = null;
  g.turnTotal = null;

  const schedule = (ms, fn) => {
    room.timer = setTimeout(() => {
      try {
        fn();
        advance(room);
        broadcast(room);
      } catch (err) {
        console.error('[advance]', err);
      }
    }, Math.max(10, ms * PACE));
  };

  // A human who is present gets a visible clock; when it runs out the table
  // makes a sensible play for them so nobody's evening stalls.
  const withClock = (ms, fn) => {
    g.turnTotal = ms * PACE;
    g.turnDeadline = Date.now() + g.turnTotal;
    schedule(ms, fn);
  };

  switch (g.phase) {
    case 'hakem_draw':
      schedule(900 + g.draw.reveals.length * 260 + 1400, () => g.startRound());
      break;

    case 'choosing_trump':
      if (isAuto(g.players[g.hakem])) {
        schedule(1800, () => g.chooseTrump(g.hakem, botTrump(g.hands[g.hakem])));
      } else {
        withClock(TRUMP_MS, () => g.chooseTrump(g.hakem, botTrump(g.hands[g.hakem])));
      }
      break;

    case 'playing':
      if (g.trick.length === 4) {
        schedule(1900, () => {
          const out = g.resolveTrick();
          // bots chirp now and then, so the table doesn't feel empty
          const winner = g.players[out.winner];
          if (winner.isBot && Math.random() < 0.14) {
            io.to(room.code).emit('emote', { seat: out.winner, id: pick(['nice', 'wellplayed']) });
          }
        });
      } else if (isAuto(g.players[g.turn])) {
        schedule(800 + Math.random() * 700, () => {
          const seat = g.turn;
          g.playCard(seat, botCard(g, seat));
        });
      } else {
        withClock(TURN_MS, () => {
          const seat = g.turn;
          g.playCard(seat, botCard(g, seat));
        });
      }
      break;

    case 'round_over':
      schedule(7000, () => g.startRound());
      break;

    default:
      break;
  }
}

// ─────────────────────────────────────────── sockets

io.on('connection', (socket) => {
  let playerId = null;
  let roomCode = null;

  const room = () => (roomCode ? rooms.get(roomCode) : null);
  const fail = (msg) => socket.emit('errorMsg', msg);

  function attach(r, id, name) {
    playerId = id;
    roomCode = r.code;
    r.sockets.set(id, socket.id);
    r.names.set(id, name);
    socket.join(r.code);
    const seat = seatOfPlayer(r, id);
    if (seat !== -1) {
      r.seats[seat].connected = true;
      r.seats[seat].name = name;
    }
    syncPlayersIntoGame(r);
  }

  socket.on('create', ({ name, playerId: pid }) => {
    if (!pid || !name) return fail('Missing name.');
    const r = createRoom(pid);
    attach(r, pid, name.slice(0, 18));
    // Host takes seat 1 by default.
    r.seats[0] = { id: pid, name: r.names.get(pid), isBot: false, connected: true };
    socket.emit('joined', { code: r.code });
    broadcast(r);
  });

  socket.on('join', ({ code, name, playerId: pid }) => {
    if (!pid || !name) return fail('Missing name.');
    const r = rooms.get((code || '').toUpperCase().trim());
    if (!r) return fail('No room with that code.');
    attach(r, pid, name.slice(0, 18));
    if (seatOfPlayer(r, pid) === -1 && !r.game) {
      const free = r.seats.findIndex((s) => s === null);
      if (free !== -1) r.seats[free] = { id: pid, name: r.names.get(pid), isBot: false, connected: true };
    }
    socket.emit('joined', { code: r.code });
    broadcast(r);
  });

  socket.on('takeSeat', ({ seat }) => {
    const r = room();
    if (!r || r.game) return;
    if (seat < 0 || seat > 3) return;
    if (r.seats[seat]) return fail('That seat is taken.');
    const current = seatOfPlayer(r, playerId);
    if (current !== -1) r.seats[current] = null;
    r.seats[seat] = { id: playerId, name: r.names.get(playerId), isBot: false, connected: true };
    broadcast(r);
  });

  socket.on('leaveSeat', () => {
    const r = room();
    if (!r || r.game) return;
    const current = seatOfPlayer(r, playerId);
    if (current !== -1) r.seats[current] = null;
    broadcast(r);
  });

  socket.on('addBot', ({ seat }) => {
    const r = room();
    if (!r || r.game) return;
    if (r.seats[seat]) return fail('That seat is taken.');
    const taken = r.seats.filter(Boolean).map((s) => s.name);
    r.seats[seat] = { id: `bot-${seat}-${Date.now()}`, name: botName(taken), isBot: true, connected: true };
    broadcast(r);
  });

  socket.on('clearSeat', ({ seat }) => {
    const r = room();
    if (!r || r.game) return;
    const occ = r.seats[seat];
    if (!occ) return;
    // Anyone can remove a bot; only the occupant or host removes a human.
    if (!occ.isBot && occ.id !== playerId && r.hostId !== playerId) return fail('Only the host can remove a player.');
    r.seats[seat] = null;
    broadcast(r);
  });

  socket.on('randomizeTeams', () => {
    const r = room();
    if (!r || r.game) return;
    if (r.hostId !== playerId) return fail('Only the host can shuffle the seats.');
    const occupants = shuffle(r.seats.filter(Boolean));
    r.seats = [null, null, null, null];
    occupants.forEach((o, i) => (r.seats[i] = o));
    broadcast(r);
  });

  socket.on('start', () => {
    const r = room();
    if (!r || r.game) return;
    if (r.hostId !== playerId) return fail('Only the host can start the game.');
    if (seatedCount(r) < 4) return fail('All four seats must be filled.');
    r.game = new HokmGame(
      r.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot, connected: s.connected !== false }))
    );
    r.game.startHakemDraw();
    advance(r);
    broadcast(r);
  });

  socket.on('chooseTrump', ({ suit }) => {
    const r = room();
    if (!r || !r.game) return;
    const seat = seatOfPlayer(r, playerId);
    const res = r.game.chooseTrump(seat, suit);
    if (res.error) return fail(res.error);
    advance(r);
    broadcast(r);
  });

  socket.on('play', ({ card }) => {
    const r = room();
    if (!r || !r.game) return;
    const seat = seatOfPlayer(r, playerId);
    const res = r.game.playCard(seat, card);
    if (res.error) return fail(res.error);
    advance(r);
    broadcast(r);
  });

  socket.on('newGame', () => {
    const r = room();
    if (!r) return;
    if (r.hostId !== playerId) return fail('Only the host can start a new game.');
    clearTimeout(r.timer);
    r.game = null;
    broadcast(r);
  });

  socket.on('emote', ({ id }) => {
    const r = room();
    if (!r || !EMOTES.has(id)) return;
    const seat = seatOfPlayer(r, playerId);
    if (seat === -1) return;
    const now = Date.now();
    r.emoteAt ||= {};
    if (now - (r.emoteAt[playerId] || 0) < EMOTE_COOLDOWN_MS) return;
    r.emoteAt[playerId] = now;
    io.to(r.code).emit('emote', { seat, id });
  });

  socket.on('chat', ({ text }) => {
    const r = room();
    if (!r || !text) return;
    r.chat.push({ name: r.names.get(playerId) || '?', text: String(text).slice(0, 160), at: Date.now() });
    if (r.chat.length > 60) r.chat.shift();
    broadcast(r);
  });

  socket.on('disconnect', () => {
    const r = room();
    if (!r) return;
    if (r.sockets.get(playerId) === socket.id) r.sockets.delete(playerId);
    const seat = seatOfPlayer(r, playerId);
    if (seat !== -1) {
      if (r.game) {
        r.seats[seat].connected = false; // a bot covers the seat until they return
        syncPlayersIntoGame(r);
        advance(r);
      } else {
        r.seats[seat] = null;
      }
    }
    if (r.hostId === playerId) {
      const nextHost = r.seats.find((s) => s && !s.isBot && s.connected);
      if (nextHost) r.hostId = nextHost.id;
    }
    if (r.sockets.size === 0) {
      clearTimeout(r.timer);
      setTimeout(() => {
        if (rooms.get(r.code) && r.sockets.size === 0) rooms.delete(r.code);
      }, 1000 * 60 * 30);
    }
    broadcast(r);
  });
});

// Sweep rooms nobody has touched in 6 hours.
setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60 * 6;
  for (const [code, r] of rooms) {
    if (r.sockets.size === 0 && r.createdAt < cutoff) {
      clearTimeout(r.timer);
      rooms.delete(code);
    }
  }
}, 1000 * 60 * 30);

http.listen(PORT, () => console.log(`Hokm server listening on :${PORT}`));
