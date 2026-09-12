// Boots the real server and plays a full game over Socket.IO with two "human"
// clients plus two bots, then checks reconnection keeps a player's seat.

import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(PORT), HOKM_PACE: '0.02' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => {
  const text = d.toString().trim();
  // a leftover server from an aborted run would quietly answer in this one's
  // place, and the whole suite would then be testing yesterday's build
  if (/EADDRINUSE/.test(text)) {
    console.error(`  \u2717 port ${PORT} is already in use \u2014 kill the stray server first`);
    process.exit(1);
  }
  console.error('[server]', text);
});
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(1); });

function makeClient(pid) {
  const sock = io(URL, { transports: ['websocket'] });
  const c = { sock, pid, state: null, seat: null, acted: new Set(), emotes: [] };
  sock.on('emote', (e) => c.emotes.push(e));
  sock.on('state', (s) => {
    c.state = s;
    c.seat = s.mySeat;
    const g = s.game;
    if (!g || g.seat === null) return;
    if (g.phase === 'choosing_trump' && g.hakem === g.seat) {
      const key = `t${g.roundNumber}`;
      if (c.acted.has(key)) return;
      c.acted.add(key);
      const counts = {};
      for (const card of g.hand) counts[card.slice(-1)] = (counts[card.slice(-1)] || 0) + 1;
      const suit = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      sock.emit('chooseTrump', { suit });
    }
    if (c.skipTurn) return; // pretend this player wandered off
    if (g.phase === 'playing' && g.turn === g.seat && g.legal.length) {
      const key = `p${g.roundNumber}-${g.trickNumber}-${g.trick.length}`;
      if (c.acted.has(key)) return;
      c.acted.add(key);
      sock.emit('play', { card: g.legal[Math.floor(Math.random() * g.legal.length)] });
    }
  });
  sock.on('errorMsg', (m) => console.error('  ! server said:', m));
  return c;
}

const waitFor = (c, pred, label, ms = 45000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (c.state && pred(c.state)) { clearInterval(iv); resolve(c.state); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout waiting for ' + label)); }
    }, 20);
  });

try {
  await sleep(900);

  const alice = makeClient('alice');
  const bob = makeClient('bob');

  let code = null;
  alice.sock.on('joined', (d) => (code = d.code));
  alice.sock.emit('create', { name: 'Alice', playerId: 'alice' });
  await waitFor(alice, (s) => !!s.code, 'room creation');
  check(!!code && code.length === 4, `room created with code ${code}`);
  check(alice.state.mySeat === 0, 'host is seated at seat 1');

  bob.sock.emit('join', { code, name: 'Bob', playerId: 'bob' });
  await waitFor(bob, (s) => s.mySeat !== null, 'Bob seated');
  check(bob.state.mySeat === 1, 'second player takes the next free seat');

  // Bob moves so the two humans are partners (seats 0 and 2 = Team A).
  bob.sock.emit('takeSeat', { seat: 2 });
  await waitFor(bob, (s) => s.mySeat === 2, 'Bob moved');
  check(bob.state.mySeat === 2, 'a player can move to an empty seat');
  check(bob.state.seats[1] === null, 'the vacated seat is freed');

  alice.sock.emit('addBot', { seat: 1 });
  alice.sock.emit('addBot', { seat: 3 });
  await waitFor(alice, (s) => s.seats.every(Boolean), 'table full');
  check(alice.state.seats.filter((s) => s.isBot).length === 2, 'two bots filled the empty seats');

  // Non-host cannot start.
  bob.sock.emit('start');
  await sleep(150);
  check(!alice.state.inGame, 'a non-host cannot start the game');

  alice.sock.emit('start');
  await waitFor(alice, (s) => !!s.game, 'game start');
  check(alice.state.game.phase === 'hakem_draw', 'the game opens with the Hakem draw');

  await waitFor(alice, (s) => s.game.trump !== null, 'trump called');
  check(!!alice.state.game.trump, `Hokm called: ${alice.state.game.trump}`);
  check(alice.state.game.hand.length + alice.state.game.trick.length >= 12, 'Alice holds a full hand');

  // Emotes reach the table, are rate limited, and reject anything unknown.
  const fromAlice = () => bob.emotes.filter((e) => e.seat === 0);
  alice.sock.emit('emote', { id: 'hello' });
  await sleep(350);
  check(fromAlice().length === 1 && fromAlice()[0].id === 'hello', 'an emote reaches the other players');
  alice.sock.emit('emote', { id: 'nice' });
  await sleep(350);
  check(fromAlice().length === 1, 'the cooldown blocks emote spam');
  alice.sock.emit('emote', { id: 'definitely-not-an-emote' });
  await sleep(350);
  check(fromAlice().length === 1, 'unknown emote ids are ignored');

  // A present-but-idle player is covered by the turn clock rather than stalling the table.
  alice.skipTurn = true;
  await waitFor(alice, (s) => s.game.phase === 'playing' && s.game.turn === s.game.seat, 'Alice on turn');
  check(!!alice.state.game.turnDeadline, 'a present human gets a turn clock');
  check(alice.state.game.turnTotal > 0, 'the clock reports how long it runs');
  const handBefore = alice.state.game.hand.length;
  await waitFor(alice, (s) => s.game.hand.length < handBefore, 'the clock played for Alice', 20000);
  check(true, 'the turn clock plays a legal card when a human stalls');
  alice.skipTurn = false;

  // Reconnect mid-game: Bob drops and comes back with the same player id.
  await waitFor(alice, (s) => s.game.trickNumber >= 2, 'a couple of tricks played');
  bob.sock.disconnect();
  await sleep(300);
  const awayView = alice.state.game.players[2];
  check(awayView.connected === false, 'a dropped player shows as away');

  const bob2 = makeClient('bob');
  bob2.sock.emit('join', { code, name: 'Bob', playerId: 'bob' });
  await waitFor(bob2, (s) => s.mySeat === 2, 'Bob reconnected');
  check(bob2.state.mySeat === 2, 'reconnecting restores the same seat');
  check(bob2.state.game.hand.length > 0, 'the returning player gets their hand back');

  const final = await waitFor(alice, (s) => s.game.phase === 'game_over', 'game over', 120000);
  const g = final.game;
  check(Math.max(g.scores.A, g.scores.B) >= 7, `game finished ${g.scores.A}–${g.scores.B}`);
  check(!!g.gameWinner, `team ${g.gameWinner} won`);
  check(g.roundNumber >= 4, `played ${g.roundNumber} rounds`);

  alice.sock.emit('newGame');
  await waitFor(alice, (s) => !s.game, 'back to lobby');
  check(!alice.state.game, 'the host can return the table to the lobby');

  alice.sock.close(); bob2.sock.close();
} catch (err) {
  failures++;
  console.error('  ✗', err.message);
}

server.kill();
console.log(failures === 0 ? '\n✓ end-to-end passed\n' : `\n✗ ${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
