// Boots the real server, opens a Snakes and Ladders room, and plays it to a
// finish over Socket.IO — covering the multi-game lobby as well as the game.

import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3997;
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
  const c = { sock, pid, state: null, hold: true }; // held until the opening checks are done
  sock.on('state', (s) => {
    c.state = s;
    const g = s.game;
    // roll the moment it is our turn; the server is the only judge of legality
    if (!c.hold && g && g.gameType === 'snakes' && g.phase === 'playing' && g.turn === g.seat) sock.emit('roll');
  });
  sock.on('errorMsg', (m) => { if (!/not your turn/i.test(m)) console.error('  ! server said:', m); });
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
  const alice = makeClient('sl-alice');
  const bob = makeClient('sl-bob');

  let code = null;
  alice.sock.on('joined', (d) => (code = d.code));
  alice.sock.emit('create', { name: 'Alice', playerId: 'sl-alice', gameType: 'snakes' });
  await waitFor(alice, (s) => !!s.code, 'room creation');
  check(alice.state.gameType === 'snakes', 'the room knows it is a Snakes table');
  check(alice.state.seats.length === 8, 'a Snakes table lays out eight seats');
  check(alice.state.minPlayers === 2 && alice.state.maxPlayers === 8, 'it takes two to eight players');
  check(alice.state.hasTeams === false, 'Snakes has no teams');
  check(alice.state.seats[0].team === null, 'seats carry no team for a teamless game');

  bob.sock.emit('join', { code, name: 'Bob', playerId: 'sl-bob' });
  await waitFor(bob, (s) => s.mySeat !== null, 'Bob seated');
  check(bob.state.mySeat === 1, 'the second player takes the next seat');

  // two humans is already a legal table
  alice.sock.emit('start');
  await waitFor(alice, (s) => !!s.game, 'game start');
  const g0 = alice.state.game;
  check(g0.gameType === 'snakes', 'the running game reports its type');
  check(g0.players.length === 2, 'only the seated players are in the game');
  check(g0.positions.every((p) => p === 0), 'everyone starts off the board');
  check(Object.keys(g0.board.snakes).length >= 5, 'the board has snakes');
  check(Object.keys(g0.board.ladders).length >= 5, 'the board has ladders');
  check(g0.players[0].colour !== g0.players[1].colour, 'players get different colours');

  const firstBoard = JSON.stringify(g0.board);

  alice.hold = false; bob.hold = false;   // let them play
  alice.sock.emit('roll');

  const final = await waitFor(alice, (s) => s.game.phase === 'game_over', 'a winner', 120000);
  const g = final.game;
  check(g.winner !== null, `${g.players[g.winner].name} won`);
  check(g.positions[g.winner] === 100, 'the winner is on 100 exactly');
  check(g.positions.filter((p) => p === 100).length === 1, 'only one player finishes');
  check(g.lastMove && g.lastMove.to === 100, 'the last move is the winning one');

  // rolling after the finish is refused
  const before = JSON.stringify(g.positions);
  alice.sock.emit('roll');
  await sleep(250);
  check(JSON.stringify(alice.state.game.positions) === before, 'no more rolls once the game is over');

  // back to the lobby, and a fresh board next time
  alice.sock.emit('newGame');
  await waitFor(alice, (s) => !s.game, 'back to the lobby');
  check(alice.state.gameType === 'snakes', 'the lobby remembers which game it is for');
  alice.sock.emit('start');
  await waitFor(alice, (s) => !!s.game, 'second game');
  check(JSON.stringify(alice.state.game.board) !== firstBoard, 'a new game draws a new board');

  // and a Hokm room is still a Hokm room
  const carol = makeClient('sl-carol');
  carol.sock.emit('create', { name: 'Carol', playerId: 'sl-carol', gameType: 'hokm' });
  await waitFor(carol, (s) => !!s.code, 'hokm room');
  check(carol.state.gameType === 'hokm' && carol.state.seats.length === 4, 'a Hokm table still lays out four seats');
  check(carol.state.hasTeams === true && carol.state.seats[0].team === 'A', 'Hokm still has teams');
  carol.sock.close();

  alice.sock.close(); bob.sock.close();
} catch (err) {
  failures++;
  console.error('  ✗', err.message);
}

server.kill();
console.log(failures === 0 ? '\n✓ snakes end-to-end passed\n' : `\n✗ ${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
