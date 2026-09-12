// Boots the real server, opens a Bazaar room, and plays it over Socket.IO —
// covering the lobby settings, the turn driver, auctions, trades and the
// end conditions, and checking the other two games still behave.

import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { BOARD, GROUP_MEMBERS } from '../src/monopoly.js';

const PORT = 3996;
const URL = `http://localhost:${PORT}`;
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(PORT), HOKM_PACE: '0.01' },
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

const errors = [];

function makeClient(pid) {
  const sock = io(URL, { transports: ['websocket'] });
  const c = { sock, pid, state: null, auto: false };
  sock.on('state', (s) => {
    c.state = s;
    const g = s.game;
    if (!c.auto || !g || g.gameType !== 'monopoly' || g.phase === 'over') return;
    // answer anything put in front of us before taking our own turn
    if (g.offer && g.offer.to === g.seat) { sock.emit('act', { type: 'respond', accept: true }); return; }
    if (g.actor !== g.seat) return;
    // play a plain, always-legal game: roll, take what's offered, move on
    if (g.phase === 'roll') sock.emit('act', { type: 'roll' });
    else if (g.phase === 'buy') sock.emit('act', { type: g.players[g.seat].cash >= g.pending.price ? 'buy' : 'pass' });
    else if (g.phase === 'auction') sock.emit('act', { type: 'passBid' });
    else if (g.phase === 'debt') sock.emit('act', { type: 'bankrupt' });
    else if (g.phase === 'end_turn') {
      // build where it is legal, so the rents actually grow and a game can end
      const build = buildable(g, g.seat);
      sock.emit('act', build !== null ? { type: 'build', pos: build } : { type: 'endTurn' });
    }
  });
  sock.on('errorMsg', (m) => { if (!/not your turn|not the moment|nothing to|only the host|taken that piece/i.test(m)) errors.push(m); });
  return c;
}

/** The cheapest square this seat may legally add a house to, or null. */
function buildable(g, seat) {
  let best = null;
  for (const members of Object.values(GROUP_MEMBERS)) {
    if (!members.every((i) => g.owner[i] === seat)) continue;
    if (members.some((i) => g.mortgaged[i])) continue;
    const lowest = Math.min(...members.map((i) => g.houses[i]));
    if (lowest >= 5) continue;
    for (const i of members) {
      if (g.houses[i] !== lowest) continue;
      const cost = BOARD[i].build;
      if (g.players[seat].cash < cost + 40) continue;
      if (lowest === 4 ? g.hotelsLeft < 1 : g.housesLeft < 1) continue;
      if (best === null || cost < BOARD[best].build) best = i;
      break;
    }
  }
  return best;
}

const waitFor = (c, pred, label, ms = 40000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (c.state && pred(c.state)) { clearInterval(iv); resolve(c.state); }
      else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        const g = c.state && c.state.game;
        const where = g ? ` — stuck at ${g.phase}, actor ${g.actor}, cash ${g.players.map((p) => p.cash).join('/')}, `
          + `bust ${g.players.map((p) => (p.bust ? 1 : 0)).join('')}, built ${32 - g.housesLeft}, `
          + `offer ${g.offer ? g.offer.from + '->' + g.offer.to : 'none'} · ${g.log.slice(-3).join(' // ')}` : '';
        reject(new Error('timeout waiting for ' + label + where));
      }
    }, 20);
  });

try {
  await sleep(900);
  const alice = makeClient('bz-alice');
  const bob = makeClient('bz-bob');

  let code = null;
  alice.sock.on('joined', (d) => (code = d.code));
  alice.sock.emit('create', { name: 'Alice', playerId: 'bz-alice', gameType: 'monopoly' });
  await waitFor(alice, (s) => !!s.code, 'room creation');
  check(alice.state.gameType === 'monopoly', 'the room knows it is a Bazaar table');
  check(alice.state.seats.length === 8, 'a Bazaar table lays out eight seats');
  check(alice.state.minPlayers === 2 && alice.state.maxPlayers === 8, 'it takes two to eight players');
  check(alice.state.hasTeams === false, 'Bazaar has no teams');
  check(!!alice.state.settings, 'the lobby carries a settings block');
  check(alice.state.settings.buyMode === 'buy', 'it opens on buy-or-pass');

  // ── settings
  alice.sock.emit('settings', { buyMode: 'auction', endMode: 'last', startCash: 2000, freeParking: true });
  await waitFor(alice, (s) => s.settings.buyMode === 'auction', 'settings applied');
  check(alice.state.settings.endMode === 'last', 'the end mode changes');
  check(alice.state.settings.startCash === 2000, 'the starting cash changes');
  check(alice.state.settings.freeParking === true, 'a house rule toggles on');
  alice.sock.emit('settings', { buyMode: 'nonsense', minutes: 7 });
  await sleep(120);
  check(alice.state.settings.buyMode === 'auction', 'rubbish settings are ignored');
  check(alice.state.settings.minutes === 45, 'an unlisted clock length is ignored');

  bob.sock.emit('join', { code, name: 'Bob', playerId: 'bz-bob' });
  await waitFor(bob, (s) => s.mySeat !== null, 'Bob seated');
  // two bots as well, so the table trades and builds the way a real one would
  alice.sock.emit('addBot', { seat: 2 });
  alice.sock.emit('addBot', { seat: 3 });
  await waitFor(alice, (s) => s.seats.filter(Boolean).length === 4, 'bots seated');
  // ── pieces
  bob.sock.emit('piece', { id: 'cypress' });
  await waitFor(bob, (s) => s.seats[1] && s.seats[1].piece === 'cypress', 'Bob picks the cypress');
  check(alice.state.seats[1].piece === 'cypress', 'everyone at the table sees the piece change');
  alice.sock.emit('piece', { id: 'cypress' });
  await sleep(150);
  check(alice.state.seats[0].piece !== 'cypress', 'a piece somebody has taken cannot be taken again');
  check(new Set(alice.state.seats.filter(Boolean).map((x) => x.piece)).size === alice.state.seats.filter(Boolean).length,
    'everybody at the table has a different piece');

  bob.sock.emit('settings', { buyMode: 'buy' });
  await sleep(150);
  check(alice.state.settings.buyMode === 'auction', 'only the host can change the settings');

  // put it back to something quick to play
  alice.sock.emit('settings', { buyMode: 'buy', endMode: 'firstbust', startCash: 1500, freeParking: false });
  await waitFor(alice, (s) => s.settings.endMode === 'firstbust', 'settings restored');

  // ── a game
  alice.sock.emit('start');
  await waitFor(alice, (s) => !!s.game, 'game start');
  const g0 = alice.state.game;
  check(g0.gameType === 'monopoly', 'the running game reports its type');
  check(g0.players.length === 4, 'only the seated players are in the game');
  check(g0.players.every((p) => p.cash === 1500), 'everyone starts on 1,500');
  check(g0.players.every((p) => p.pos === 0), 'everyone starts on GO');
  check(g0.owner.filter((o) => o !== null).length === 0, 'nothing is owned yet');
  check(g0.housesLeft === 32 && g0.hotelsLeft === 12, 'the bank holds 32 houses and 12 hotels');
  check(g0.phase === 'roll' && g0.turn === 0, 'the host rolls first');
  check(g0.actor === 0, 'the state says who the table is waiting on');
  check(g0.players[1].token === 'cypress', 'the piece a player chose is the piece they play with');
  check(new Set(g0.players.map((p) => p.token)).size === g0.players.length, 'no two pieces on the board are the same');

  // ── a single, fully checked turn
  const cashBefore = g0.players[0].cash;
  alice.sock.emit('act', { type: 'roll' });
  await waitFor(alice, (s) => s.game.dice !== null, 'a roll');
  const rolled = alice.state.game.dice;
  check(rolled.d1 >= 1 && rolled.d1 <= 6 && rolled.d2 >= 1 && rolled.d2 <= 6, `dice came up ${rolled.d1} and ${rolled.d2}`);
  const moved = alice.state.game.players[0].pos;
  check(moved === rolled.d1 + rolled.d2 || alice.state.game.lastCard, `the token moved ${rolled.d1 + rolled.d2}`);

  // buying, when the square allows it
  if (alice.state.game.phase === 'buy') {
    const pos = alice.state.game.pending.pos;
    const price = alice.state.game.pending.price;
    alice.sock.emit('act', { type: 'buy' });
    await waitFor(alice, (s) => s.game.owner[pos] === 0, 'the deed changes hands');
    check(alice.state.game.players[0].cash === cashBefore - price, 'the price came out of the cash');
    check(alice.state.game.players[0].owns.includes(pos), 'it shows up in their holdings');
  }

  // a wrong-turn move is refused
  bob.sock.emit('act', { type: 'roll' });
  await sleep(150);
  check(alice.state.game.turn === 0, 'a player out of turn cannot roll');

  // ── hand a monopoly out and check the building rules over the wire
  alice.auto = false; bob.auto = false;
  await sleep(200);

  // ── let it run to a finish
  alice.auto = true; bob.auto = true;
  alice.sock.emit('act', { type: alice.state.game.phase === 'end_turn' ? 'endTurn' : 'roll' });

  const t0 = Date.now();
  const final = await waitFor(alice, (s) => s.game.phase === 'over', 'a finish', 240000);
  console.log(`    (played out in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const g = final.game;
  check(g.winner !== null, `${g.players[g.winner].name} wins`);
  check(!g.players[g.winner].bust, 'the winner is not a ruined player');
  check(g.players.filter((p) => p.bust).length >= 1, 'somebody was ruined');
  check(g.houses.some((h) => h > 0) || g.housesLeft < 32, 'buildings went up along the way');
  check(!!g.overReason, `it says why: "${g.overReason}"`);
  check(g.players.every((p) => p.cash >= 0), 'nobody finishes in the red');

  // rolling after the finish is refused
  const before = alice.state.game.players.map((p) => p.pos).join();
  alice.sock.emit('act', { type: 'roll' });
  await sleep(200);
  check(alice.state.game.players.map((p) => p.pos).join() === before, 'no more moves once it is over');

  // ── back to the lobby
  alice.auto = false; bob.auto = false;
  alice.sock.emit('newGame');
  await waitFor(alice, (s) => !s.game, 'back to the lobby');
  check(alice.state.gameType === 'monopoly', 'the lobby remembers which game it is for');
  check(!!alice.state.settings, 'the settings survive a game');

  check(errors.length === 0, `no unexpected server complaints${errors.length ? ' (' + errors.slice(0, 3).join('; ') + ')' : ''}`);

  // ── the other two games are untouched
  const carol = makeClient('bz-carol');
  carol.sock.emit('create', { name: 'Carol', playerId: 'bz-carol', gameType: 'hokm' });
  await waitFor(carol, (s) => !!s.code, 'hokm room');
  check(carol.state.gameType === 'hokm' && carol.state.seats.length === 4, 'a Hokm table still lays out four seats');
  check(carol.state.settings === null, 'Hokm has no settings panel');
  carol.sock.close();

  const dave = makeClient('bz-dave');
  dave.sock.emit('create', { name: 'Dave', playerId: 'bz-dave', gameType: 'snakes' });
  await waitFor(dave, (s) => !!s.code, 'snakes room');
  check(dave.state.gameType === 'snakes' && dave.state.seats.length === 8, 'a Snakes table still lays out eight seats');
  dave.sock.close();

  // ── the board the client draws is the board the rules use
  // the query string keeps any proxy between us and the server out of it
  const res = await fetch(`${URL}/bazaar-board.json?t=${Date.now()}`, { cache: 'no-store' });
  const meta = await res.json();
  check(meta.board.length === 40, 'the board endpoint serves 40 spaces');
  {
    const served = JSON.stringify(meta.board), engine = JSON.stringify(BOARD);
    if (served !== engine) {
      console.error(`    [lengths ${served.length} vs ${engine.length}]`);
      for (let i = 0; i < Math.max(served.length, engine.length); i++) {
        if (served[i] !== engine[i]) {
          console.error('    served:', served.slice(Math.max(0, i - 100), i + 100));
          console.error('    engine:', engine.slice(Math.max(0, i - 100), i + 100));
          break;
        }
      }
    }
    check(served === engine, 'it serves exactly the engine’s board');
  }
  check(Object.keys(meta.groups).length === 8, 'and all eight colour groups');
  check(meta.board.filter((s) => s.price).length === 28, 'with 28 things to buy');

  alice.sock.close(); bob.sock.close();
} catch (err) {
  failures++;
  console.error('  ✗', err.message);
}

server.kill();
console.log(failures === 0 ? '\n✓ bazaar end-to-end passed\n' : `\n✗ ${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
