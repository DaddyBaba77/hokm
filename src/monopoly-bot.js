// Bot play for Bazaar. Every function is pure — hand it the game and a seat and
// it hands back one action for the server to apply. Keeping it to one action at
// a time means the table animates a bot's turn the same way it animates a
// person's, instead of a dozen things happening at once.

import { BOARD, GROUP_MEMBERS, RAILS, UTILS, SPACES } from './monopoly.js';

// How much a bot likes to keep in hand for the rent that is surely coming.
const RESERVE = 140;

/** Rough worth of a square to this particular bot, in cash terms. */
export function valueTo(g, seat, pos) {
  const s = BOARD[pos];
  if (!s || !s.price) return 0;
  let v = s.price;

  if (s.type === 'street') {
    const members = GROUP_MEMBERS[s.group];
    const mine = members.filter((i) => g.owner[i] === seat).length;
    const free = members.filter((i) => g.owner[i] === null).length;
    if (mine === members.length - 1) v *= 2.0;            // this completes the set
    else if (mine > 0) v *= 1.3;
    else if (free === members.length) v *= 1.05;
    // blocking somebody else's set is worth something too
    for (const other of g.aliveSeats()) {
      if (other === seat) continue;
      const theirs = members.filter((i) => g.owner[i] === other).length;
      if (theirs === members.length - 1) { v *= 1.2; break; }
    }
    // the orange and red ranks get landed on most, being a jail-roll away
    if (pos >= 16 && pos <= 24) v *= 1.12;
  } else if (s.type === 'rail') {
    v *= 1 + 0.3 * g.countOwned(RAILS, seat);
  } else if (s.type === 'utility') {
    v *= g.countOwned(UTILS, seat) === 1 ? 1.35 : 0.85;
  }
  return Math.round(v);
}

const unowned = (g) => BOARD.filter((s) => s.price && g.owner[s.i] === null).length;

/** Best legal house to add, or null. Cheapest first, so building stays even. */
function bestBuild(g, seat) {
  let best = null;
  for (const s of BOARD) {
    if (s.type !== 'street') continue;
    if (g.canBuild(seat, s.i)) continue;                  // returns a reason string when it can't
    const score = s.rent[g.houses[s.i] + 1] / s.build;    // rent bought per coin spent
    if (!best || score > best.score) best = { pos: s.i, score, cost: s.build };
  }
  return best;
}

/** The next thing to liquidate when money is short. */
function nextToRaise(g, seat) {
  // sell buildings first, most expensive group last
  let sellable = null;
  for (const s of BOARD) {
    if (s.type !== 'street' || g.houses[s.i] === 0) continue;
    if (g.canSell(seat, s.i)) continue;
    if (!sellable || s.build < sellable.build) sellable = { pos: s.i, build: s.build };
  }

  // then mortgage, starting with whatever is least useful
  let mortgageable = null;
  for (const i of g.holdings(seat)) {
    if (g.mortgaged[i]) continue;
    const s = BOARD[i];
    if (s.type === 'street' && GROUP_MEMBERS[s.group].some((j) => g.houses[j] > 0)) continue;
    const keep = valueTo(g, seat, i);
    if (!mortgageable || keep < mortgageable.keep) mortgageable = { pos: i, keep };
  }

  if (sellable) return { type: 'sell', pos: sellable.pos };
  if (mortgageable) return { type: 'mortgage', pos: mortgageable.pos };
  return null;
}

/**
 * Look for a deal worth doing. Without this, a table of bots simply splits the
 * board between them and nobody ever completes a colour group, so no rent ever
 * gets big enough to finish a game.
 */
export function seekTrade(g, seat) {
  if (g.offer || g.offersThisTurn > 0) return null;

  for (const members of Object.values(GROUP_MEMBERS)) {
    const held = members.filter((i) => g.owner[i] === seat).length;
    if (held !== members.length - 1) continue;
    const missing = members.find((i) => g.owner[i] !== seat);
    const holder = g.owner[missing];
    if (holder === null || holder === seat || g.bust[holder]) continue;
    if (members.some((i) => g.houses[i] > 0)) continue;

    // best of all is swapping the last piece of their set for the last of mine
    let sweetener = null;
    for (const p of g.holdings(seat)) {
      if (members.includes(p)) continue;
      const s = BOARD[p];
      if (s.type !== 'street') continue;
      const gm = GROUP_MEMBERS[s.group];
      if (gm.some((j) => g.houses[j] > 0)) continue;
      if (gm.filter((j) => g.owner[j] === holder).length === gm.length - 1) { sweetener = p; break; }
    }

    const price = BOARD[missing].price;
    const spare = Math.max(0, g.cash[seat] - 120);
    // the richer the bot, the harder it leans on the offer — a table sitting on
    // piles of GO salary should be bidding those piles at the last deed it needs
    const wanted = sweetener !== null
      ? Math.round(price * 0.5)
      : Math.max(Math.round(price * 2.4), Math.round(spare * 0.18));
    const cash = Math.min(spare, wanted);
    if (sweetener === null && cash < price * 1.2) continue;   // not enough to tempt anyone

    return {
      type: 'propose',
      to: holder,
      give: { cash, props: sweetener !== null ? [sweetener] : [] },
      want: { cash: 0, props: [missing] },
    };
  }
  return null;
}

/** One action for `seat`, or null when the bot is happy to sit still. */
export function act(g, seat) {
  switch (g.phase) {
    case 'roll': {
      if (g.jailed[seat]) {
        // worth buying your way out while there is still property to win
        const early = unowned(g) > 6;
        if (g.jailFree[seat] > 0 && early) return { type: 'useCard' };
        if (early && g.cash[seat] > 200) return { type: 'payFine' };
        return { type: 'roll' };
      }
      const build = bestBuild(g, seat);
      if (build && g.cash[seat] - build.cost > RESERVE) return { type: 'build', pos: build.pos };
      // lift a mortgage if flush and it unlocks building
      for (const i of g.holdings(seat)) {
        if (!g.mortgaged[i]) continue;
        const cost = Math.round(BOARD[i].mortgage * 1.1);
        if (g.cash[seat] - cost > RESERVE * 3) return { type: 'unmortgage', pos: i };
      }
      return { type: 'roll' };
    }

    case 'buy': {
      const { pos, price } = g.pending;
      const worth = valueTo(g, seat, pos);
      const after = g.cash[seat] - price;
      if (after < 0) return { type: 'pass' };
      // always take a bargain; take a fair one if it leaves rent money
      if (worth >= price * 1.5 && after >= 0) return { type: 'buy' };
      if (after >= RESERVE && worth >= price * 0.95) return { type: 'buy' };
      if (after >= RESERVE * 2) return { type: 'buy' };
      return { type: 'pass' };
    }

    case 'auction': {
      const a = g.auction;
      const worth = valueTo(g, seat, a.pos);
      const ceiling = Math.min(g.cash[seat], Math.round(worth * 0.95));
      const step = Math.max(5, Math.round(BOARD[a.pos].price * 0.08 / 5) * 5);
      const next = a.high + step;
      if (next > ceiling || next > g.cash[seat]) return { type: 'passBid' };
      return { type: 'bid', amount: next };
    }

    case 'debt': {
      const d = g.debt;
      if (d.seat !== seat) return null;
      if (g.cash[seat] >= d.amount) return null;           // settles itself
      const move = nextToRaise(g, seat);
      if (move) return move;
      return { type: 'bankrupt' };
    }

    case 'end_turn': {
      const build = bestBuild(g, seat);
      if (build && g.cash[seat] - build.cost > RESERVE) return { type: 'build', pos: build.pos };
      const deal = seekTrade(g, seat);
      if (deal) return deal;
      return { type: 'endTurn' };
    }

    default:
      return null;
  }
}

/** Should a bot take the offer sitting in front of it? */
export function judgeOffer(g, seat, offer) {
  if (!offer || offer.to !== seat) return false;
  const gain = offer.giveProps.reduce((n, i) => n + valueTo(g, seat, i), 0) + offer.giveCash;
  const loss = offer.wantProps.reduce((n, i) => n + valueTo(g, seat, i), 0) + offer.wantCash;
  if (offer.wantCash > g.cash[seat] - 50) return false;
  // hand over the last piece of somebody's monopoly only for a lot
  const completesTheirs = offer.wantProps.some((i) => {
    const s = BOARD[i];
    if (s.type !== 'street') return false;
    const members = GROUP_MEMBERS[s.group];
    return members.filter((j) => g.owner[j] === offer.from || j === i).length === members.length;
  });
  return gain > loss * (completesTheirs ? 1.35 : 1.1);
}
