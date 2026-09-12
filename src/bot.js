// A competent (not brilliant) Hokm bot: follows suit, counts what's been played,
// protects its partner, and doesn't throw trump away.

import {
  SUITS,
  RANKS,
  RANK_VALUE,
  suitOf,
  rankOf,
  valueOf,
  legalCards,
  trickWinnerIndex,
  partnerOf,
  teamOf,
} from './game.js';

const HIGH_CARD_POINTS = { A: 6, K: 4, Q: 3, J: 2, T: 1 };

/** Hakem's trump call, from the first five cards. */
export function chooseTrump(hand) {
  let best = null;
  let bestScore = -Infinity;
  for (const s of SUITS) {
    const cards = hand.filter((c) => suitOf(c) === s);
    // Length is king in Hokm — a long suit with a couple of honours beats
    // a short suit full of them.
    const score =
      cards.length * 10 +
      cards.reduce((sum, c) => sum + (HIGH_CARD_POINTS[rankOf(c)] || 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

const lowest = (cards) => cards.reduce((a, b) => (valueOf(b) < valueOf(a) ? b : a));
const highest = (cards) => cards.reduce((a, b) => (valueOf(b) > valueOf(a) ? b : a));

/** Would playing `card` take the trick as it stands right now? */
function wins(trick, card, seat, trump) {
  const probe = [...trick, { seat, card }];
  return trickWinnerIndex(probe, trump) === probe.length - 1;
}

/** Is `card` the highest card of its suit still unaccounted for? */
function isBoss(card, hand, seen) {
  const s = suitOf(card);
  const v = valueOf(card);
  for (const r of RANKS) {
    if (RANK_VALUE[r] <= v) continue;
    const higher = r + s;
    if (!seen.includes(higher) && !hand.includes(higher)) return false;
  }
  return true;
}

function shortestSuitDiscard(cards, trump) {
  const nonTrump = cards.filter((c) => suitOf(c) !== trump);
  const pool = nonTrump.length ? nonTrump : cards;
  const bySuit = {};
  for (const c of pool) (bySuit[suitOf(c)] ||= []).push(c);
  const suits = Object.keys(bySuit).sort(
    (a, b) => bySuit[a].length - bySuit[b].length || valueOf(lowest(bySuit[a])) - valueOf(lowest(bySuit[b]))
  );
  return lowest(bySuit[suits[0]]);
}

function leadCard(hand, trump, seen, myTricks, theirTricks) {
  const trumps = hand.filter((c) => suitOf(c) === trump);
  const plain = hand.filter((c) => suitOf(c) !== trump);
  const trumpsGone = seen.filter((c) => suitOf(c) === trump).length;
  const trumpsOut = 13 - trumps.length - trumpsGone;

  // Holding a long trump suit? Pull the opponents' trumps before cashing side winners.
  if (trumps.length >= 4 && trumpsOut > 0) return highest(trumps);

  // Cash a guaranteed winner in a side suit.
  const boss = plain.filter((c) => isBoss(c, hand, seen));
  if (boss.length) return highest(boss);

  // Nothing certain: lead low from the shortest side suit to get void for trumping.
  if (plain.length) return shortestSuitDiscard(plain, trump);

  // Trump-only hand.
  return trumpsOut > 0 ? highest(trumps) : lowest(trumps);
}

function followCard(hand, legal, trick, seat, trump, seen) {
  const winnerIdx = trickWinnerIndex(trick, trump);
  const leaderPlay = trick[winnerIdx];
  const partnerIsWinning = leaderPlay.seat === partnerOf(seat);
  const isLastToPlay = trick.length === 3;

  const winning = legal.filter((c) => wins(trick, c, seat, trump));
  const losing = legal.filter((c) => !wins(trick, c, seat, trump));

  if (partnerIsWinning) {
    // Partner has it. Last to play, or partner's card is unbeatable — throw the trash.
    const safe = isLastToPlay || isBoss(leaderPlay.card, hand, seen) || suitOf(leaderPlay.card) === trump;
    if (safe || !winning.length) {
      return losing.length ? shortestSuitDiscard(losing, trump) : lowest(legal);
    }
    // Partner is winning but shakily and an opponent still has to play:
    // back them up only if it's cheap and not a trump.
    const cheap = winning.filter((c) => suitOf(c) !== trump);
    return cheap.length ? lowest(cheap) : losing.length ? shortestSuitDiscard(losing, trump) : lowest(legal);
  }

  if (winning.length) {
    // Prefer winning in the led suit over burning a trump.
    const inSuit = winning.filter((c) => suitOf(c) !== trump);
    if (inSuit.length) return lowest(inSuit);
    // Trumping in: use the cheapest trump that does the job, and don't bother
    // ruffing from a void when we're not last and the trick is worthless.
    return lowest(winning);
  }

  return losing.length ? shortestSuitDiscard(losing, trump) : lowest(legal);
}

/** Pick a card for `seat`. `game` is a HokmGame. */
export function chooseCard(game, seat) {
  const hand = game.hands[seat];
  const legal = legalCards(hand, game.trick);
  if (legal.length === 1) return legal[0];

  const seen = game.playedThisRound || [];
  const trump = game.trump;
  const myTeam = teamOf(seat);
  const myTricks = game.roundTricks[myTeam];
  const theirTricks = game.roundTricks[myTeam === 'A' ? 'B' : 'A'];

  if (game.trick.length === 0) {
    return leadCard(hand, trump, seen, myTricks, theirTricks);
  }
  return followCard(hand, legal, game.trick, seat, trump, seen);
}

const FIRST_NAMES = [
  'Darius', 'Roxana', 'Cyrus', 'Anahita', 'Kaveh', 'Shirin',
  'Bahram', 'Parisa', 'Farhad', 'Yasmin', 'Sohrab', 'Nasrin',
];

export function botName(taken = []) {
  const free = FIRST_NAMES.filter((n) => !taken.includes(n + ' (bot)'));
  const pool = free.length ? free : FIRST_NAMES;
  return pool[Math.floor(Math.random() * pool.length)] + ' (bot)';
}
