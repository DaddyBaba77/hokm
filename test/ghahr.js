// Plays thousands of bot games of Ghahr Nakon and checks that nothing the rules
// forbid ever happens.

import {
  GhahrGame, BOARDS, PIECES, HOME_SLOTS, LEG, YARD, TOKEN_COLOURS, DEFAULT_SETTINGS,
} from '../src/ghahr.js';
import { act } from '../src/ghahr-bot.js';

const GAMES = Number(process.argv[2] || 400);
let failures = 0;
const seen = new Set();
const check = (cond, msg) => {
  if (cond) return;
  if (seen.has(msg)) return;
  seen.add(msg);
  failures++;
  console.error('  ✗ ' + msg);
};

// ─────────────────────────── the boards themselves

check(BOARDS.cross.ring === BOARDS.cross.seats * LEG, 'the cross is four legs of ten');
check(BOARDS.hex.ring === BOARDS.hex.seats * LEG, 'the hexagon is six legs of ten');
check(PIECES === 4 && HOME_SLOTS === 4, 'four pieces and four places to park them');
check(TOKEN_COLOURS.length >= BOARDS.hex.seats, 'a colour for every corner');
check(new Set(TOKEN_COLOURS).size === TOKEN_COLOURS.length, 'and no two the same');

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const names = ['Ava', 'Bijan', 'Cyrus', 'Dara', 'Elham', 'Farid'];
const makePlayers = (n) => names.slice(0, n).map((name) => ({ name, isBot: true }));

// ─────────────────────────── invariants, after every single action

function audit(g, tag) {
  const n = g.players.length;
  check(g.pieces.length === n, `${tag}: one set of pieces per player`);
  const seenSquares = new Map();

  for (let s = 0; s < n; s++) {
    check(g.pieces[s].length === PIECES, `${tag}: everybody has four pieces`);
    const homeSlots = new Set();
    for (const d of g.pieces[s]) {
      check(d === YARD || (d >= 0 && d < g.ring + HOME_SLOTS),
        `${tag}: a piece is somewhere real`);
      if (d >= g.ring) {
        check(!homeSlots.has(d), `${tag}: two pieces never share a home slot`);
        homeSlots.add(d);
      }
      if (d >= 0 && d < g.ring) {
        const sq = g.square(s, d);
        const who = seenSquares.get(sq);
        check(who === undefined, `${tag}: two pieces never share a square on the ring`);
        seenSquares.set(sq, s);
      }
    }
    // no two of your own pieces on the same ring distance either
    const ring = g.pieces[s].filter((d) => d >= 0 && d < g.ring);
    check(new Set(ring).size === ring.length, `${tag}: no two of your own on one square`);
  }

  check(g.turn >= 0 && g.turn < n, `${tag}: the turn belongs to somebody`);
  check(['roll', 'move', 'game_over'].includes(g.phase), `${tag}: the phase is one we know`);
  if (g.phase === 'move') {
    check(g.die !== null, `${tag}: choosing a piece means a die was rolled`);
    check(g.moves.length > 1, `${tag}: you are only asked to choose when there is a choice`);
  }
  if (g.phase === 'roll') check(g.moves.length === 0, `${tag}: nothing is pending before a roll`);
  if (g.phase !== 'game_over') {
    check(!g.allHome(g.turn), `${tag}: a finished player never has the turn`);
  }
  if (g.winner !== null) check(g.allHome(g.winner), `${tag}: the winner really is all home`);
}

// ─────────────────────────── the rules, checked directly

{
  // you need a six to leave the yard
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(1) });
  check(g.legalMoves(0, 5).length === 0, 'a five leaves you in the yard');
  check(g.legalMoves(0, 1).length === 0, 'so does a one');
  const six = g.legalMoves(0, 6);
  check(six.length === 1, 'a six offers one way out — four identical pieces are one choice');
  check(six[0].kind === 'exit' && six[0].to === 0, 'and it comes out onto the start');
}
{
  // your own piece blocks your start square
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(2) });
  g.pieces[0][0] = 0;
  check(g.legalMoves(0, 6).every((m) => m.kind !== 'exit'),
    'you cannot bring another piece out onto your own');
}
{
  // landing on somebody sends them home
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(3) });
  g.pieces[0][0] = 0;
  g.pieces[1][0] = (g.corner[0] * LEG + 3 - g.corner[1] * LEG + g.ring) % g.ring;
  const m = g.legalMoves(0, 3).find((x) => x.piece === 0);
  check(!!m && !!m.capture, 'a move onto a rival is a capture');
  g.phase = 'move'; g.die = 3; g.moves = g.legalMoves(0, 3);
  g.move(0, 0);
  check(g.pieces[1][0] === YARD, 'and it really does send them back to the yard');
}
{
  // you cannot land on your own piece
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(4) });
  g.pieces[0][0] = 0;
  g.pieces[0][1] = 3;
  check(!g.legalMoves(0, 3).some((m) => m.piece === 0), 'your own piece is in the way');
}
{
  // the home column, with and without the exact-roll rule
  const loose = new GhahrGame(makePlayers(4), { rng: mulberry(5) });
  const last = loose.ring + HOME_SLOTS - 1;
  loose.pieces[0][0] = loose.ring + 2;                 // two slots from the back
  const b = loose.legalMoves(0, 3).find((m) => m.piece === 0);
  check(!!b && b.to === last - (loose.ring + 2 + 3 - last), 'an overshoot bounces off the back');

  const strict = new GhahrGame(makePlayers(4), { rng: mulberry(5), settings: { exactHome: true } });
  strict.pieces[0][0] = strict.ring + 2;
  check(!strict.legalMoves(0, 3).some((m) => m.piece === 0),
    'with the exact rule an overshoot is simply not a move');
  check(strict.legalMoves(0, 1).some((m) => m.piece === 0 && m.to === strict.ring + 3),
    'but the exact roll goes in');
}
{
  // a six brings you out when the house says it must
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(6), settings: { sixMustExit: true } });
  g.pieces[0][0] = 12;
  const moves = g.legalMoves(0, 6);
  check(moves.length > 0 && moves.every((m) => m.kind === 'exit'),
    'the six has to bring a piece out, not move the one on the track');
}
{
  // and you have to knock somebody out when the house says so
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(7), settings: { mustCapture: true } });
  g.pieces[0][0] = 0;
  g.pieces[0][1] = 8;
  g.pieces[1][0] = (g.corner[0] * LEG + 3 - g.corner[1] * LEG + g.ring) % g.ring;
  const moves = g.legalMoves(0, 3);
  check(moves.length === 1 && moves[0].piece === 0 && !!moves[0].capture,
    'the only move on offer is the one that takes them');
}
{
  // three tries for a six, and only while somebody is in the yard
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(8) });
  const first = g.roll(0, 2);
  check(first.again === true, 'a dud roll with everyone in the yard buys another');
  check(g.turn === 0, 'and the turn has not moved on');
  g.roll(0, 3);
  check(g.turn === 0, 'nor after the second');
  g.roll(0, 4);
  check(g.turn === 1, 'but the third dud hands the turn over');
}
{
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(9), settings: { threeTries: false } });
  g.roll(0, 2);
  check(g.turn === 1, 'without the house rule one dud roll is the whole turn');
}
{
  // a six is another roll
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(10) });
  const r = g.roll(0, 6);
  check(r.again === true, 'a six that moves a piece earns another roll');
  check(g.turn === 0 && g.phase === 'roll', 'and the turn stays put');
  check(g.pieces[0].filter((d) => d === 0).length === 1, 'with one piece now on the start');
}
{
  // a single legal move is played for you
  const g = new GhahrGame(makePlayers(4), { rng: mulberry(11) });
  g.pieces[0] = [5, YARD, YARD, YARD];
  g.phase = 'roll';
  g.roll(0, 3);
  check(g.pieces[0][0] === 8, 'with one move on offer the table just plays it');
  check(g.phase === 'roll' && g.turn === 1, 'and moves the turn on');
}
{
  // everybody home wins it
  const g = new GhahrGame(makePlayers(2), { rng: mulberry(12) });
  g.pieces[0] = [g.ring, g.ring + 1, g.ring + 2, g.ring - 1];
  g.phase = 'roll';
  g.moves = [];
  const r = g.roll(0, 4);
  check(g.winner === 0, 'the last piece home wins it');
  check(g.phase === 'game_over', 'and the game is over');
  check(!!r.ok, 'cleanly');
}
{
  // the hexagon seats six
  const g = new GhahrGame(makePlayers(6), { rng: mulberry(13), settings: { board: 'hex' } });
  check(g.ring === 60, 'sixty squares round the hexagon');
  check(new Set(g.corner).size === 6, 'and six corners, one each');
  let threw = false;
  try { new GhahrGame(makePlayers(6), { rng: mulberry(13) }); } catch { threw = true; }
  check(threw, 'six players will not fit on the cross');
}
{
  // fewer players than corners are spread out rather than bunched
  const g = new GhahrGame(makePlayers(2), { rng: mulberry(14) });
  check(g.corner[0] === 0 && g.corner[1] === 2, 'two players sit opposite each other');
  const h = new GhahrGame(makePlayers(3), { rng: mulberry(15), settings: { board: 'hex' } });
  check(h.corner.join() === '0,2,4', 'three on the hexagon sit every other corner');
}

// ─────────────────────────── and now a great many games

let played = 0, turns = 0, captures = 0, boards = { cross: 0, hex: 0 };
for (let n = 0; n < GAMES; n++) {
  const rng = mulberry(1000 + n);
  const hex = n % 3 === 0;
  const count = hex ? 2 + (n % 5) : 2 + (n % 3);
  const settings = {
    board: hex ? 'hex' : 'cross',
    threeTries: n % 2 === 0,
    mustCapture: n % 5 === 0,
    sixMustExit: n % 7 === 0,
    exactHome: n % 4 === 0,
  };
  const g = new GhahrGame(makePlayers(count), { rng, settings });
  boards[settings.board]++;
  audit(g, `new/${n}`);

  let guard = 0;
  while (g.phase !== 'game_over' && guard++ < 20000) {
    const seat = g.turn;
    const a = act(g, seat);
    check(!!a, `${n}/${guard}: a bot always has something to do`);
    if (!a) break;
    const before = g.pieces.map((row) => row.slice());
    const res = a.type === 'roll' ? g.roll(seat) : g.move(seat, a.piece);
    check(!res.error, `${n}/${guard}: the bot never plays an illegal move (${res.error})`);
    if (g.lastMove && g.lastMove.sentHome) captures++;
    if (a.type === 'move') {
      turns++;
      // exactly one piece of the mover changed place
      const moved = before[seat].filter((d, i) => d !== g.pieces[seat][i]).length;
      check(moved === 1, `${n}/${guard}: a move moves exactly one of your pieces`);
    }
    audit(g, `${n}/${guard}`);
  }
  check(g.phase === 'game_over', `${n}: the game reaches an end`);
  check(g.winner !== null, `${n}: and somebody wins it`);
  played++;
}

console.log(`Played ${played}/${GAMES} games to a finish`);
console.log(`  ${turns} moves · ${captures} knocked back · ${boards.cross} cross · ${boards.hex} hexagon`);
console.log(`  settings in play: ${Object.keys(DEFAULT_SETTINGS).join(', ')}`);

if (failures) {
  console.error(`\n✗ ${failures} distinct failures`);
  process.exit(1);
}
console.log('\n✓ all invariants held');
