// Plays thousands of Snakes and Ladders games against the engine and checks the
// board is always well formed and every house rule holds.

import {
  SnakesGame, makeBoard, stepTo, squareToCell, SQUARES, COLS, TOKEN_COLOURS,
} from '../src/snakes.js';

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };

// ── the board itself ──────────────────────────────────────────────────────────
for (let i = 0; i < 400; i++) {
  const { ladders, snakes } = makeBoard();
  const squares = [];

  for (const [bottom, top] of Object.entries(ladders)) {
    const b = Number(bottom);
    check(top > b, `ladder ${b}→${top} goes up`);
    check(b > 1 && top < SQUARES, `ladder ${b}→${top} stays off squares 1 and 100`);
    check(squareToCell(b).row !== squareToCell(top).row, `ladder ${b}→${top} changes row`);
    squares.push(b, top);
  }
  for (const [head, tail] of Object.entries(snakes)) {
    const h = Number(head);
    check(tail < h, `snake ${h}→${tail} goes down`);
    check(tail > 1 && h < SQUARES, `snake ${h}→${tail} stays off squares 1 and 100`);
    check(squareToCell(h).row !== squareToCell(tail).row, `snake ${h}→${tail} changes row`);
    squares.push(h, tail);
  }

  check(new Set(squares).size === squares.length, 'no square is used by two chutes (nothing chains)');
  check(!squares.includes(1) && !squares.includes(SQUARES), 'start and finish are never endpoints');
  check(Object.keys(snakes).length >= 5 && Object.keys(ladders).length >= 5, 'enough snakes and ladders');
  check(Object.keys(snakes).some((h) => Number(h) >= SQUARES - 10), 'there is a snake near the finish');
}

// ── the boustrophedon layout ──────────────────────────────────────────────────
check(squareToCell(1).row === 0 && squareToCell(1).col === 0, 'square 1 is bottom-left');
check(squareToCell(10).row === 0 && squareToCell(10).col === 9, 'square 10 is bottom-right');
check(squareToCell(11).row === 1 && squareToCell(11).col === 9, 'square 11 sits directly above 10');
check(squareToCell(20).row === 1 && squareToCell(20).col === 0, 'row 2 runs right to left');
check(squareToCell(100).row === 9 && squareToCell(100).col === 0, 'square 100 is top-left');
{
  const seen = new Set();
  for (let n = 1; n <= SQUARES; n++) seen.add(`${squareToCell(n).row},${squareToCell(n).col}`);
  check(seen.size === SQUARES, 'every square maps to its own cell');
}

// ── bounce-back ───────────────────────────────────────────────────────────────
check(stepTo(97, 3).landed === 100 && !stepTo(97, 3).bounced, 'an exact roll lands on 100');
check(stepTo(97, 5).landed === 98 && stepTo(97, 5).bounced, 'overshooting 100 by 2 bounces to 98');
check(stepTo(99, 6).landed === 95, '99 + 6 bounces back to 95');
check(stepTo(95, 6).landed === 99, 'a roll that stops short just moves');
for (let from = 94; from < 100; from++) {
  for (let d = 1; d <= 6; d++) {
    const { landed } = stepTo(from, d);
    check(landed >= 1 && landed <= SQUARES, `a bounce from ${from}+${d} stays on the board`);
  }
}

// ── full games ────────────────────────────────────────────────────────────────
const stats = { games: 0, rolls: 0, bites: 0, climbs: 0, bounces: 0, forfeits: 0, extra: 0 };

for (let n = 0; n < 600; n++) {
  const count = 2 + (n % 7);
  const players = Array.from({ length: count }, (_, i) => ({ id: 'p' + i, name: 'P' + i, isBot: true }));
  const g = new SnakesGame(players);
  check(g.positions.every((p) => p === 0), 'everyone starts off the board');
  check(g.turn === 0, 'the first player leads');

  let guard = 0;
  let expectedTurn = 0;
  while (g.phase === 'playing') {
    if (++guard > 6000) { check(false, 'the game terminated'); break; }

    check(g.turn === expectedTurn, 'the turn is with the player the engine says it is');
    const seat = g.turn;
    const before = g.positions[seat];

    // nobody else may roll
    const other = (seat + 1) % count;
    check(!!g.roll(other).error, 'a player out of turn is refused');

    const streakBefore = g.sixStreak;
    const { ok, move } = g.roll(seat);
    check(ok, 'the player whose turn it is may roll');
    stats.rolls++;

    check(move.die >= 1 && move.die <= 6, `die ${move.die} is in range`);
    check(move.from === before, 'the move starts where the player was');
    check(g.positions[seat] === move.to, 'the player ends where the move says');
    check(move.to >= 0 && move.to <= SQUARES, 'the player stays on the board');

    if (move.kind === 'forfeit') {
      check(streakBefore === 2 && move.die === 6, 'a forfeit only follows a third six');
      check(!move.again, 'a forfeit ends the turn');
      stats.forfeits++;
    } else {
      const { landed, bounced } = stepTo(move.from, move.die);
      check(move.landed === landed, 'the landing square follows the roll');
      check(move.bounced === bounced, 'bouncing is reported');
      if (bounced) stats.bounces++;
      if (move.kind === 'ladder') {
        check(g.board.ladders[landed] === move.to, 'a ladder carries the player to its top');
        check(move.to > landed, 'a ladder goes up');
        stats.climbs++;
      } else if (move.kind === 'snake') {
        check(g.board.snakes[landed] === move.to, 'a snake drags the player to its tail');
        check(move.to < landed, 'a snake goes down');
        stats.bites++;
      } else {
        check(move.to === landed, 'an ordinary move ends on the landing square');
      }
    }

    if (g.phase === 'game_over') {
      check(move.to === SQUARES, 'the game only ends on an exact 100');
      check(g.winner === seat, 'the winner is whoever got there');
      check(!!g.roll(g.turn).error, 'no more rolls once somebody has won');
    } else if (move.again) {
      check(move.die === 6, 'only a six earns another roll');
      check(g.turn === seat, 'the player rolls again');
      stats.extra++;
      expectedTurn = seat;
    } else {
      check(g.turn === (seat + 1) % count, 'otherwise the turn passes to the left');
      expectedTurn = (seat + 1) % count;
    }

    check(g.sixStreak <= 2, 'the six streak never reaches three without forfeiting');
  }

  check(g.winner !== null, 'somebody won');
  check(g.positions[g.winner] === SQUARES, 'the winner is on 100');
  check(g.positions.filter((p) => p === SQUARES).length === 1, 'only one player finishes');
  stats.games++;
}

// ── the view a client receives ────────────────────────────────────────────────
{
  const g = new SnakesGame([0, 1, 2].map((i) => ({ id: 'p' + i, name: 'P' + i, isBot: true })));
  const v = g.viewFor(1);
  check(v.gameType === 'snakes', 'the view names the game');
  check(v.seat === 1, 'the view knows which seat is looking');
  check(v.players.length === 3 && v.players[0].colour === TOKEN_COLOURS[0], 'players carry their colours');
  check(g.viewFor(null).seat === null, 'a spectator gets a seatless view');
  check(COLS === 10, 'the board is ten wide');
}

console.log(`\nPlayed ${stats.games} games / ${stats.rolls} rolls`);
console.log(`  ${stats.climbs} ladders climbed · ${stats.bites} snake bites · ${stats.bounces} bounces`);
console.log(`  ${stats.extra} extra rolls from sixes · ${stats.forfeits} triple-six forfeits`);
console.log(`  average ${(stats.rolls / stats.games).toFixed(1)} rolls per game`);
console.log(failures === 0 ? '\n✓ all invariants held\n' : `\n✗ ${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
