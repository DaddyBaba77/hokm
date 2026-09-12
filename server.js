import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HokmGame, shuffle, teamOf, TEAM_NAME } from './src/game.js';
import { chooseTrump as botTrump, chooseCard as botCard, botName } from './src/bot.js';
import { SnakesGame, MIN_PLAYERS as SNAKE_MIN, MAX_PLAYERS as SNAKE_MAX } from './src/snakes.js';
import {
  MonopolyGame, DEFAULT_SETTINGS as MONO_DEFAULTS,
  MIN_PLAYERS as MONO_MIN, MAX_PLAYERS as MONO_MAX,
  BOARD as MONO_BOARD, GROUPS as MONO_GROUPS,
  RAILS as MONO_RAILS, UTILS as MONO_UTILS, RAIL_RENT as MONO_RAIL_RENT,
  PIECES as MONO_PIECES, TOKENS as MONO_TOKENS,
} from './src/monopoly.js';
import { act as monoAct, judgeOffer as monoJudge } from './src/monopoly-bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// Scales every animation pause. 1 = normal table pace; the test suite runs it fast.
const PACE = Number(process.env.HOKM_PACE || 1);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_req, res) => res.send('ok'));
// The client draws the board from this rather than keeping its own copy, so the
// deeds on screen can never drift from the deeds the rules use.
app.get('/bazaar-board.json', (_req, res) => {
  // no caching: a deploy that changes a price must not leave a client drawing
  // last week's board
  res.set('Cache-Control', 'no-cache');
  res.json({
    board: MONO_BOARD, groups: MONO_GROUPS, rails: MONO_RAILS,
    utils: MONO_UTILS, railRent: MONO_RAIL_RENT, pieces: MONO_PIECES,
  });
});

const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

// ─────────────────────────────────────────── games

// What the lobby needs to know about each game it can host.
const GAMES = {
  hokm:     { id: 'hokm',     name: 'Hokm',             seats: 4,         min: 4,         max: 4,        teams: true  },
  snakes:   { id: 'snakes',   name: 'Snakes & Ladders', seats: SNAKE_MAX, min: SNAKE_MIN, max: SNAKE_MAX, teams: false },
  monopoly: { id: 'monopoly', name: 'Bazaar',           seats: MONO_MAX,  min: MONO_MIN,  max: MONO_MAX,  teams: false, settings: MONO_DEFAULTS },
};
const gameMeta = (type) => GAMES[type] || GAMES.hokm;

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

function createRoom(hostId, gameType) {
  const meta = gameMeta(gameType);
  const room = {
    code: newCode(),
    hostId,
    gameType: meta.id,
    seats: Array(meta.seats).fill(null), // { id, name, isBot, connected }
    sockets: new Map(), // playerId -> socket.id
    names: new Map(), // playerId -> name
    game: null,
    timer: null,
    endTimer: null,
    settings: meta.settings ? { ...meta.settings } : null,
    chat: [],
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const seatOfPlayer = (room, playerId) => room.seats.findIndex((s) => s && s.id === playerId);

/** The first piece nobody at this table has taken. */
function freePiece(room, exceptSeat = -1) {
  const taken = new Set(room.seats.map((s, i) => (s && i !== exceptSeat ? s.piece : null)).filter(Boolean));
  return MONO_TOKENS.find((id) => !taken.has(id)) || MONO_TOKENS[0];
}
const isAuto = (p) => !p || p.isBot || p.connected === false;
const seatedCount = (room) => room.seats.filter(Boolean).length;

function roomPayload(room, playerId) {
  const mySeat = seatOfPlayer(room, playerId);
  const meta = gameMeta(room.gameType);
  const base = {
    code: room.code,
    isHost: room.hostId === playerId,
    gameType: meta.id,
    gameName: meta.name,
    minPlayers: meta.min,
    maxPlayers: meta.max,
    hasTeams: meta.teams,
    settings: room.settings,
    mySeat: mySeat === -1 ? null : mySeat,
    seats: room.seats.map((s, i) =>
      s ? { seat: i, name: s.name, isBot: s.isBot, connected: s.connected !== false, piece: s.piece || null, team: meta.teams ? teamOf(i) : null } : null
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
  if (room.gameType === 'snakes' || room.gameType === 'monopoly') {
    // snakes players are compacted at start, so map them one for one
    room.game.players = room.game.players.map((p, i) => {
      const seat = room.seats[i];
      return seat ? { id: seat.id, name: seat.name, isBot: seat.isBot, connected: seat.connected !== false, piece: seat.piece || p.piece } : p;
    });
    return;
  }
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

const ROLL_MS = 45000;
// long enough for the client to finish hopping, climbing or being eaten
const SNAKE_BOT_PAUSE = 2600;

// Bazaar: how long a present human gets at each decision, and how long a bot
// pretends to think so the table reads as a game rather than a log file.
const MONO_CLOCK = { roll: 75000, buy: 45000, auction: 30000, debt: 120000, end_turn: 60000 };
// An offer nobody answers would block the table's only offer slot for good.
const MONO_OFFER_MS = 60000;
// How long a bot waits before acting. Deliberately unhurried: you should have
// time to see whose turn it is, watch the piece walk and read what happened.
const MONO_PAUSE = {
  roll: 2600, buy: 2400, auction: 1800, debt: 1400, end_turn: 2000,
  build: 1300, sell: 1200, mortgage: 1200, unmortgage: 1200, bankrupt: 2200,
};

/** Apply one bot/timeout decision. Returns false if there was nothing to do. */
function applyMonoAction(g, seat, a) {
  if (!a) return false;
  switch (a.type) {
    case 'roll':       g.roll(seat); return true;
    case 'payFine':    g.payFine(seat); return true;
    case 'useCard':    g.useJailCard(seat); return true;
    case 'buy':        g.buy(seat); return true;
    case 'pass':       g.pass(seat); return true;
    case 'bid':        g.bid(seat, a.amount); return true;
    case 'passBid':    g.passBid(seat); return true;
    case 'build':      g.build(seat, a.pos); return true;
    case 'sell':       g.sell(seat, a.pos); return true;
    case 'mortgage':   g.mortgage(seat, a.pos); return true;
    case 'unmortgage': g.unmortgage(seat, a.pos); return true;
    case 'bankrupt':   g.declareBankrupt(seat); return true;
    case 'endTurn':    g.endTurn(seat); return true;
    case 'propose':    g.propose(seat, a.to, a.give, a.want); return true;
    default:           return false;
  }
}

/**
 * What to do for a seat that has run out of clock. Never buys or bids on a
 * missing player's behalf — it just gets the table moving again.
 */
function monoTimeout(g, seat) {
  switch (g.phase) {
    case 'roll':     return g.jailed[seat] ? { type: 'roll' } : { type: 'roll' };
    case 'buy':      return { type: 'pass' };
    case 'auction':  return { type: 'passBid' };
    case 'end_turn': return { type: 'endTurn' };
    case 'debt':     return monoAct(g, seat) || { type: 'bankrupt' };
    default:         return null;
  }
}

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

  if (room.gameType === 'snakes') {
    if (g.phase !== 'playing') return;
    if (isAuto(g.players[g.turn])) schedule(SNAKE_BOT_PAUSE, () => g.roll(g.turn));
    else withClock(ROLL_MS, () => g.roll(g.turn));
    return;
  }

  if (room.gameType === 'monopoly') {
    clearTimeout(room.endTimer);
    if (g.phase === 'over') return;

    // a timed game ends between turns, not in the middle of somebody's move
    if (g.endsAt) {
      if (Date.now() >= g.endsAt && g.phase !== 'debt' && g.phase !== 'auction') { g.timeUp(); return; }
      room.endTimer = setTimeout(() => {
        try {
          if (room.game === g && g.phase !== 'over') { g.timeUp(); broadcast(room); }
        } catch (err) { console.error('[endTimer]', err); }
      }, Math.max(50, g.endsAt - Date.now() + 250));
    }

    // an offer left in front of a bot gets answered before anything else
    clearTimeout(room.offerTimer);
    if (g.offer) {
      const o = g.offer;
      if (isAuto(g.players[o.to])) {
        schedule(1300, () => g.respond(o.to, monoJudge(g, o.to, o)));
        return;
      }
      // a present player gets a while to think, then it lapses
      o.expiresAt ||= Date.now() + MONO_OFFER_MS * PACE;
      room.offerTimer = setTimeout(() => {
        try {
          if (room.game !== g || !g.offer || g.offer.at !== o.at) return;
          g.respond(o.to, false);
          g.note(`The offer to ${g.name(o.to)} lapses.`);
          advance(room);
          broadcast(room);
        } catch (err) { console.error('[offerTimer]', err); }
      }, Math.max(50, o.expiresAt - Date.now()));
    }

    const seat = g.actorSeat();
    if (seat === null) return;

    // A decision that leaves the game exactly as it found it would be taken
    // again on the next pass, and again, for ever. Rather than trust every
    // branch of the bot to always make progress, watch the state itself: after
    // a few identical passes, force the move that certainly ends the turn.
    const snapshot = [g.phase, g.turn, g.owner.join(), g.houses.join(''), g.cash.join(), g.offer ? 1 : 0].join('|');
    room.monoSpin = snapshot === room.monoAt ? (room.monoSpin || 0) + 1 : 0;
    room.monoAt = snapshot;
    const stuck = room.monoSpin > 3;

    if (isAuto(g.players[seat])) {
      const a = (stuck ? null : monoAct(g, seat)) || monoTimeout(g, seat);
      if (!a) return;
      schedule(stuck ? 40 : (MONO_PAUSE[a.type] ?? MONO_PAUSE[g.phase] ?? 1000), () => applyMonoAction(g, seat, a));
    } else if (stuck && g.phase === 'end_turn') {
      // a present human cannot wedge the table either
      schedule(40, () => g.endTurn(seat));
    } else {
      withClock(MONO_CLOCK[g.phase] || 45000, () => applyMonoAction(g, seat, monoTimeout(g, seat)));
    }
    return;
  }

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

  socket.on('create', ({ name, playerId: pid, gameType }) => {
    if (!pid || !name) return fail('Missing name.');
    const r = createRoom(pid, gameType);
    attach(r, pid, name.slice(0, 18));
    // Host takes seat 1 by default.
    r.seats[0] = { id: pid, name: r.names.get(pid), isBot: false, connected: true, piece: freePiece(r) };
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
      if (free !== -1) r.seats[free] = { id: pid, name: r.names.get(pid), isBot: false, connected: true, piece: freePiece(r) };
    }
    socket.emit('joined', { code: r.code });
    broadcast(r);
  });

  socket.on('takeSeat', ({ seat }) => {
    const r = room();
    if (!r || r.game) return;
    if (!(seat >= 0 && seat < r.seats.length)) return;
    if (r.seats[seat]) return fail('That seat is taken.');
    const current = seatOfPlayer(r, playerId);
    const held = current !== -1 ? r.seats[current].piece : null;
    if (current !== -1) r.seats[current] = null;
    r.seats[seat] = { id: playerId, name: r.names.get(playerId), isBot: false, connected: true, piece: current !== -1 ? held : freePiece(r) };
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
    r.seats[seat] = { id: `bot-${seat}-${Date.now()}`, name: botName(taken), isBot: true, connected: true, piece: freePiece(r) };
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
    r.seats = Array(r.seats.length).fill(null);
    occupants.forEach((o, i) => (r.seats[i] = o));
    broadcast(r);
  });

  socket.on('start', () => {
    const r = room();
    if (!r || r.game) return;
    if (r.hostId !== playerId) return fail('Only the host can start the game.');
    const meta = gameMeta(r.gameType);
    const seated = seatedCount(r);
    if (seated < meta.min) {
      return fail(meta.min === meta.max
        ? `All ${meta.min} seats must be filled.`
        : `You need at least ${meta.min} players.`);
    }

    // close any gaps so seat order is also turn order
    const occupants = r.seats.filter(Boolean);
    r.seats = r.seats.map((_, i) => occupants[i] || null);

    const roster = occupants.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot, connected: s.connected !== false, piece: s.piece }));
    if (r.gameType === 'snakes') {
      r.game = new SnakesGame(roster);
    } else if (r.gameType === 'monopoly') {
      r.game = new MonopolyGame(roster, { settings: r.settings || undefined });
    } else {
      r.game = new HokmGame(roster);
      r.game.startHakemDraw();
    }
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

  socket.on('roll', () => {
    const r = room();
    if (!r || !r.game || r.gameType !== 'snakes') return;
    const seat = seatOfPlayer(r, playerId);
    const res = r.game.roll(seat);
    if (res.error) return fail(res.error);
    advance(r);
    broadcast(r);
  });

  // ── Bazaar. One channel for every move so the client stays simple.
  socket.on('settings', (patch) => {
    const r = room();
    if (!r || r.game || !r.settings) return;
    if (r.hostId !== playerId) return fail('Only the host can change the settings.');
    const s = r.settings;
    if (['buy', 'buyAuction', 'auction'].includes(patch.buyMode)) s.buyMode = patch.buyMode;
    if (['timed', 'last', 'firstbust'].includes(patch.endMode)) s.endMode = patch.endMode;
    if ([20, 30, 45, 60, 90, 120].includes(Number(patch.minutes))) s.minutes = Number(patch.minutes);
    for (const k of ['freeParking', 'doubleGo', 'noJailRent', 'tripleDouble']) {
      if (typeof patch[k] === 'boolean') s[k] = patch[k];
    }
    if ([1000, 1500, 2000, 2500].includes(Number(patch.startCash))) s.startCash = Number(patch.startCash);
    broadcast(r);
  });

  socket.on('piece', ({ id }) => {
    const r = room();
    if (!r || r.game) return;
    const seat = seatOfPlayer(r, playerId);
    if (seat === -1) return fail('Take a seat first.');
    if (!MONO_TOKENS.includes(id)) return;
    if (r.seats.some((s, i) => s && i !== seat && s.piece === id)) return fail('Somebody has taken that piece.');
    r.seats[seat].piece = id;
    broadcast(r);
  });

  socket.on('act', (msg) => {
    const r = room();
    if (!r || !r.game || r.gameType !== 'monopoly') return;
    const g = r.game;
    const seat = seatOfPlayer(r, playerId);
    if (seat === -1) return fail('You are not seated.');
    const a = msg || {};
    let res;
    switch (a.type) {
      case 'roll':       res = g.roll(seat); break;
      case 'payFine':    res = g.payFine(seat); break;
      case 'useCard':    res = g.useJailCard(seat); break;
      case 'buy':        res = g.buy(seat); break;
      case 'pass':       res = g.pass(seat); break;
      case 'bid':        res = g.bid(seat, a.amount); break;
      case 'passBid':    res = g.passBid(seat); break;
      case 'build':      res = g.build(seat, a.pos); break;
      case 'sell':       res = g.sell(seat, a.pos); break;
      case 'mortgage':   res = g.mortgage(seat, a.pos); break;
      case 'unmortgage': res = g.unmortgage(seat, a.pos); break;
      case 'bankrupt':   res = g.declareBankrupt(seat); break;
      case 'endTurn':    res = g.endTurn(seat); break;
      case 'propose':    res = g.propose(seat, a.to, a.give || {}, a.want || {}); break;
      case 'respond':    res = g.respond(seat, !!a.accept); break;
      case 'withdraw':   res = g.withdraw(seat); break;
      default: return;
    }
    if (res && res.error) return fail(res.error);
    advance(r);
    broadcast(r);
  });

  socket.on('newGame', () => {
    const r = room();
    if (!r) return;
    if (r.hostId !== playerId) return fail('Only the host can start a new game.');
    clearTimeout(r.timer);
    clearTimeout(r.endTimer);
    clearTimeout(r.offerTimer);
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
      clearTimeout(r.endTimer);
      clearTimeout(r.offerTimer);
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
      clearTimeout(r.endTimer);
      clearTimeout(r.offerTimer);
      rooms.delete(code);
    }
  }
}, 1000 * 60 * 30);

http.listen(PORT, () => console.log(`Hokm server listening on :${PORT}`));
