// Boots the real server, opens a Ghahr Nakon room, and plays it to a finish
// over Socket.IO — the lobby, the settings channel, both boards and the bots.

import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3996;
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
  if (/EADDRINUSE/.test(text)) {
    console.error(`  ✗ port ${PORT} is already in use — kill the stray server first`);
    process.exit(1);
  }
  console.error('[server]', text);
});
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(1); });

/** A client that plays its own turns: roll, and pick a piece when asked to. */
function makeClient(pid) {
  const sock = io(URL, { transports: ['websocket'] });
  const c = { sock, pid, state: null, hold: true, picks: 0, rolls: 0 };
  sock.on('state', (s) => {
    c.state = s;
    const g = s.game;
    if (c.hold || !g || g.gameType !== 'ghahr' || g.turn !== g.seat) return;
    if (g.phase === 'roll') { c.rolls++; sock.emit('ghahr', { type: 'roll' }); }
    else if (g.phase === 'move' && g.moves.length) {
      // take a capture if one is on offer, otherwise the furthest piece along
      const take = g.moves.find((m) => m.kind === 'capture');
      const best = take || g.moves.reduce((a, b) => (b.to > a.to ? b : a));
      c.picks++;
      sock.emit('ghahr', { type: 'move', piece: best.piece });
    }
  });
  sock.on('errorMsg', (m) => { if (!/not your turn|moment to roll/i.test(m)) console.error('  ! server said:', m); });
  return c;
}

const waitFor = (c, pred, label, ms = 40000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (c.state && pred(c.state)) { clearInterval(iv); resolve(c.state); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout waiting for ' + label)); }
    }, 20);
  });

try {
  await sleep(900);

  // ─────────────── the lobby
  const ava = makeClient('gh-ava');
  const bijan = makeClient('gh-bijan');

  let code = null;
  ava.sock.on('joined', (d) => (code = d.code));
  ava.sock.emit('create', { name: 'Ava', playerId: 'gh-ava', gameType: 'ghahr' });
  await waitFor(ava, (s) => !!s.code, 'room creation');
  check(ava.state.gameType === 'ghahr', 'the room knows it is a Ghahr Nakon table');
  check(ava.state.seats.length === 6, 'the table lays out six seats');
  check(ava.state.minPlayers === 2 && ava.state.maxPlayers === 6, 'it takes two to six players');
  check(ava.state.hasTeams === false, 'Ghahr Nakon has no teams');
  check(ava.state.settings && ava.state.settings.board === 'cross', 'the cross is the board by default');
  check(ava.state.settings.threeTries === true, 'and three tries for a six is on');
  check(ava.state.settings.mustCapture === false, 'while the stricter rules are off');

  // ─────────────── the settings channel
  bijan.sock.emit('join', { code, name: 'Bijan', playerId: 'gh-bijan' });
  await waitFor(bijan, (s) => s.mySeat !== null, 'Bijan seated');
  bijan.sock.emit('settings', { board: 'hex' });
  await sleep(200);
  check(ava.state.settings.board === 'cross', 'only the host may change the settings');
  ava.sock.emit('settings', { board: 'nonsense', threeTries: 'yes' });
  await sleep(200);
  check(ava.state.settings.board === 'cross' && ava.state.settings.threeTries === true,
    'and rubbish in the patch is ignored');
  ava.sock.emit('settings', { mustCapture: true, exactHome: true });
  await waitFor(ava, (s) => s.settings.mustCapture === true, 'settings applied');
  check(ava.state.settings.exactHome === true, 'the house rules go through');

  // ─────────────── a game on the cross
  ava.sock.emit('addBot');
  ava.sock.emit('addBot');
  await waitFor(ava, (s) => s.seats.filter(Boolean).length === 4, 'a full cross');
  ava.sock.emit('start');
  await waitFor(ava, (s) => !!s.game, 'game start');

  const g0 = ava.state.game;
  check(g0.gameType === 'ghahr', 'the running game reports its type');
  check(g0.board === 'cross' && g0.ring === 40, 'four play the cross, forty squares round');
  check(g0.players.length === 4, 'only the seated players are in the game');
  check(g0.pieces.every((row) => row.length === 4 && row.every((d) => d === -1)),
    'everybody starts with four pieces in the yard');
  check(new Set(g0.corner).size === 4, 'a corner each');
  check(new Set(g0.players.map((p) => p.colour)).size === 4, 'and a colour each');
  check(g0.settings.mustCapture === true, 'the game was built with the settings from the lobby');
  check(g0.seat === 0, 'the host is in seat one');

  ava.hold = false; bijan.hold = false;
  if (g0.turn === 0) ava.sock.emit('ghahr', { type: 'roll' });

  const done = await waitFor(ava, (s) => s.game.phase === 'game_over', 'a winner', 180000);
  const g = done.game;
  check(g.winner !== null, `${g.players[g.winner].name} won`);
  check(g.pieces[g.winner].every((d) => d >= g.ring), 'the winner really has everybody home');
  check(g.finished[0] === g.winner, 'and got there first');
  check(ava.rolls > 0, 'the human rolled for herself');

  // the game is shut once it is over
  const frozen = JSON.stringify(g.pieces);
  ava.sock.emit('ghahr', { type: 'roll' });
  await sleep(250);
  check(JSON.stringify(ava.state.game.pieces) === frozen, 'no more rolls once the game is over');

  // ─────────────── a spectator cannot play
  const nosy = makeClient('gh-nosy');
  let refused = '';
  nosy.sock.on('errorMsg', (m) => { refused = m; });
  nosy.sock.emit('join', { code, name: 'Nosy', playerId: 'gh-nosy' });
  await waitFor(nosy, (s) => !!s.code, 'watcher joined');
  nosy.sock.emit('ghahr', { type: 'roll' });
  await sleep(250);
  check(/watching|seat/i.test(refused) || nosy.state.mySeat !== null,
    'somebody with no seat is told they are only watching');
  nosy.sock.close();

  // ─────────────── back to the lobby, then six on the hexagon
  ava.hold = true; bijan.hold = true;
  ava.sock.emit('newGame');
  await waitFor(ava, (s) => !s.game, 'back to the lobby');
  check(ava.state.gameType === 'ghahr', 'the lobby remembers which game it is for');

  ava.sock.emit('settings', { board: 'hex', mustCapture: false, exactHome: false });
  await waitFor(ava, (s) => s.settings.board === 'hex', 'the hexagon chosen');
  ava.sock.emit('addBot');
  ava.sock.emit('addBot');
  await waitFor(ava, (s) => s.seats.filter(Boolean).length === 6, 'six round the table');
  ava.sock.emit('start');
  await waitFor(ava, (s) => !!s.game, 'the hexagon game');
  check(ava.state.game.board === 'hex' && ava.state.game.ring === 60, 'sixty squares round the hexagon');
  check(new Set(ava.state.game.corner).size === 6, 'six corners, one each');

  ava.hold = false; bijan.hold = false;
  if (ava.state.game.turn === 0) ava.sock.emit('ghahr', { type: 'roll' });
  const hexDone = await waitFor(ava, (s) => s.game.phase === 'game_over', 'a hexagon winner', 240000);
  check(hexDone.game.winner !== null, `${hexDone.game.players[hexDone.game.winner].name} won on the hexagon`);

  // ─────────────── too many for the cross falls back rather than failing
  ava.sock.emit('newGame');
  await waitFor(ava, (s) => !s.game, 'lobby again');
  ava.sock.emit('settings', { board: 'cross' });
  await waitFor(ava, (s) => s.settings.board === 'cross', 'the cross chosen with six at the table');
  ava.sock.emit('start');
  await waitFor(ava, (s) => !!s.game, 'the fallback game');
  check(ava.state.game.board === 'hex', 'six players on a cross table are given the hexagon instead');

  ava.sock.close(); bijan.sock.close();
} catch (err) {
  failures++;
  console.error('  ✗', err.message);
}

server.kill();
console.log(failures === 0 ? '\n✓ ghahr end-to-end passed\n' : `\n✗ ${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
