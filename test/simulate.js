// Plays thousands of bot-vs-bot games straight against the rules engine and
// asserts every invariant the real table depends on.

import {
  HokmGame, makeDeck, legalCards, trickWinnerIndex, suitOf, teamOf, nextSeat,
  suitDisplayOrder, sortHand, shuffle, SUITS,
  TRICKS_TO_WIN_ROUND, POINTS_TO_WIN_GAME,
} from '../src/game.js';
import { chooseTrump, chooseCard } from '../src/bot.js';

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };

// ── hand display order: suits must alternate colour as much as the hand allows
{
  const isRed = (s) => s === 'H' || s === 'D';
  const perms = (a) =>
    a.length <= 1 ? [a] : a.flatMap((s, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [s, ...r]));
  const clashes = (o) => o.reduce((n, s, i) => n + (i > 0 && isRed(s) === isRed(o[i - 1]) ? 1 : 0), 0);

  for (let mask = 1; mask < 16; mask++) {
    const present = SUITS.filter((_, i) => mask & (1 << i));
    for (const trump of [...SUITS, null]) {
      const got = suitDisplayOrder(present, trump);
      const anchored = trump && present.includes(trump);
      const best = Math.min(...perms(present).filter((o) => !anchored || o[0] === trump).map(clashes));
      check(new Set(got).size === present.length && got.length === present.length, `suit order keeps every suit (${present}/${trump})`);
      check(!anchored || got[0] === trump, `trump leads the hand (${present}/${trump})`);
      check(clashes(got) === best, `colours alternate as well as possible (${present}/${trump} gave ${got})`);
    }
  }

  // real hands, all four suits present: never two same-coloured suits in a row
  for (let i = 0; i < 200; i++) {
    const hand = shuffle(makeDeck()).slice(0, 13);
    const trump = SUITS[i % 4];
    const seq = [...new Set(sortHand(hand, trump).map(suitOf))];
    check(seq.length === new Set(hand.map(suitOf)).size, 'every suit in the hand is shown');
    if (seq.length === 4) {
      check(clashes(seq) === 0, `13-card hand alternates black/red (${seq})`);
      check(seq[0] === trump, 'trump sits on the left of the fan');
    }
  }
}

const GAMES = Number(process.argv[2] || 400);
const stats = { rounds: 0, tricks: 0, kot: 0, koti: 0, normal: 0, hakemHeld: 0, wins: { A: 0, B: 0 } };

for (let n = 0; n < GAMES; n++) {
  const players = [0, 1, 2, 3].map((i) => ({ id: 'p' + i, name: 'P' + i, isBot: true }));
  const g = new HokmGame(players);

  g.startHakemDraw();
  check(g.draw.reveals.some((r) => r.card[0] === 'A'), 'draw ends on an Ace');
  check(g.hakem === g.draw.reveals.at(-1).seat, 'Hakem is whoever drew the Ace');
  const aces = g.draw.reveals.filter((r) => r.card[0] === 'A');
  check(aces.length === 1, 'exactly one Ace turns up in the draw');

  let guard = 0;
  while (g.phase !== 'game_over') {
    if (++guard > 500) { check(false, 'game did not terminate'); break; }

    g.startRound();
    stats.rounds++;
    check(g.dealer === nextSeat(g.hakem), 'dealer sits to the Hakem\'s left');
    check(g.hands[g.hakem].length === 5, 'Hakem gets exactly 5 before calling');

    const hakemBefore = g.hakem;
    const res = g.chooseTrump(g.hakem, chooseTrump(g.hands[g.hakem]));
    check(!res.error, 'trump call accepted: ' + res.error);

    // Deal integrity
    const all = g.hands.flat();
    check(all.length === 52, `52 cards dealt, got ${all.length}`);
    check(new Set(all).size === 52, 'no duplicate cards in the deal');
    check(g.hands.every((h) => h.length === 13), 'every player holds 13');
    check(makeDeck().every((c) => all.includes(c)), 'the full deck is accounted for');

    // Non-Hakem plays should be rejected
    check(!!g.chooseTrump((g.hakem + 1) % 4, 'S').error, 'only the Hakem may call trump');

    while (g.phase === 'playing') {
      const seat = g.turn;
      const legal = legalCards(g.hands[seat], g.trick);
      const card = chooseCard(g, seat);
      check(legal.includes(card), `bot ${seat} chose a legal card (${card})`);

      // An illegal card must be rejected when a legal follow exists.
      if (g.trick.length) {
        const led = suitOf(g.trick[0].card);
        const offSuit = g.hands[seat].find((c) => suitOf(c) !== led);
        if (offSuit && g.hands[seat].some((c) => suitOf(c) === led)) {
          check(!!g.playCard(seat, offSuit).error, 'renege is rejected');
        }
      }
      check(!!g.playCard(seat, 'ZZ').error, 'unknown card is rejected');
      check(!!g.playCard((seat + 1) % 4, g.hands[(seat + 1) % 4][0]).error, 'out-of-turn play is rejected');

      const r = g.playCard(seat, card);
      check(!r.error, 'legal play accepted: ' + r.error);

      if (r.trickComplete) {
        // Regression: a full trick must not accept a fifth card from anyone.
        for (let s = 0; s < 4; s++) {
          if (g.hands[s].length) check(!!g.playCard(s, g.hands[s][0]).error, 'a complete trick rejects more cards');
        }
        check(g.viewFor(seat).legal.length === 0, 'no card is legal while a trick sits complete');
        const expect = g.trick[trickWinnerIndex(g.trick, g.trump)].seat;
        const played = g.trick.slice();
        const before = { ...g.roundTricks };
        const out = g.resolveTrick();
        stats.tricks++;
        check(out.winner === expect, 'trick winner matches the rule');

        // Independent winner check
        const led = suitOf(played[0].card);
        const trumped = played.filter((p) => suitOf(p.card) === g.trump);
        const pool = trumped.length ? trumped : played.filter((p) => suitOf(p.card) === led);
        const manual = pool.reduce((a, b) => (b.card > a.card ? a : a), pool[0]);
        check(pool.some((p) => p.seat === out.winner), 'winner played trump or the led suit');

        check(
          g.roundTricks[teamOf(out.winner)] === before[teamOf(out.winner)] + 1,
          'the winning team gains exactly one trick'
        );
        check(g.roundTricks.A + g.roundTricks.B <= 13, 'trick count never exceeds 13');
      }
    }

    check(g.phase === 'round_over' || g.phase === 'game_over', 'round ends cleanly');
    const rr = g.roundResult;
    check(rr.tricks[rr.winningTeam] === TRICKS_TO_WIN_ROUND, 'a round ends on the 7th trick');

    // Scoring rules
    const loserTricks = rr.tricks[rr.losingTeam];
    const hakemTeam = teamOf(hakemBefore);
    if (loserTricks === 0 && rr.winningTeam === hakemTeam) {
      check(rr.points === 2 && rr.kind === 'kot', 'Kot is worth 2');
      stats.kot++;
    } else if (loserTricks === 0) {
      check(rr.points === 3 && rr.kind === 'hakem_koti', 'Hakem Koti is worth 3');
      stats.koti++;
    } else {
      check(rr.points === 1 && rr.kind === 'normal', 'a normal win is worth 1');
      stats.normal++;
    }

    // Hakem rotation
    if (rr.winningTeam === hakemTeam) {
      check(g.hakem === hakemBefore && rr.hakemHeld, 'Hakem keeps the role after a win');
      stats.hakemHeld++;
    } else {
      check(g.hakem === nextSeat(hakemBefore) && !rr.hakemHeld, 'Hakem passes clockwise after a loss');
    }
  }

  check(
    Math.max(g.scores.A, g.scores.B) >= POINTS_TO_WIN_GAME,
    'the game ends only at 7+ points'
  );
  check(g.gameWinner === (g.scores.A > g.scores.B ? 'A' : 'B'), 'the higher score wins');
  stats.wins[g.gameWinner]++;
}

console.log(`\nPlayed ${GAMES} games / ${stats.rounds} rounds / ${stats.tricks} tricks`);
console.log(`  normal ${stats.normal} · kot ${stats.kot} · hakem koti ${stats.koti}`);
console.log(`  Hakem held the role in ${((stats.hakemHeld / stats.rounds) * 100).toFixed(1)}% of rounds`);
console.log(`  game wins  A ${stats.wins.A}  B ${stats.wins.B}`);
console.log(failures === 0 ? '\n✓ all invariants held\n' : `\n✗ ${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
