// Plays thousands of bot games against the Bazaar engine and checks that
// nothing the rules forbid ever happens.

import {
  MonopolyGame, BOARD, GROUP_MEMBERS, GROUPS, RAILS, UTILS, BUYABLE,
  SPACES, HOUSE_STOCK, HOTEL_STOCK, FORTUNE, TREASURY, RAIL_RENT,
} from '../src/monopoly.js';
import { act, judgeOffer } from '../src/monopoly-bot.js';

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

// ─────────────────────────── the board itself

check(BOARD.length === SPACES, 'the board has 40 spaces');
check(BOARD.every((s, i) => s.i === i), 'every space knows its own index');
check(BUYABLE.length === 28, 'there are 28 things to buy');
check(BOARD.filter((s) => s.type === 'street').length === 22, 'there are 22 streets');
check(RAILS.length === 4, 'there are four caravanserais');
check(UTILS.length === 2, 'there are two utilities');
check(BOARD.filter((s) => s.type === 'fortune').length === 3, 'three fortune squares');
check(BOARD.filter((s) => s.type === 'treasury').length === 3, 'three treasury squares');
check(BOARD.filter((s) => s.type === 'tax').length === 2, 'two tax squares');
check(Object.keys(GROUPS).length === 8, 'eight colour groups');
for (const [key, g] of Object.entries(GROUPS)) {
  check(GROUP_MEMBERS[key].length === g.size, `${key} has ${g.size} streets`);
}
check(BOARD.every((s) => !s.price || s.mortgage === s.price / 2), 'every mortgage is half the price');
for (const s of BOARD) {
  if (s.type !== 'street') continue;
  check(s.rent.length === 6, `${s.name} has six rent tiers`);
  for (let i = 1; i < 6; i++) check(s.rent[i] > s.rent[i - 1], `${s.name} rent rises with every building`);
  check(s.build === GROUPS[s.group].build, `${s.name} builds at its group's price`);
}
check(new Set(BOARD.map((s) => s.name)).size >= 34, 'the names are distinct enough to tell apart');
check(FORTUNE.length === 16 && TREASURY.length === 16, 'sixteen cards in each deck');
check(new Set([...FORTUNE, ...TREASURY].map((c) => c.id)).size === 32, 'every card id is unique');
check(RAIL_RENT.join() === '0,25,50,100,200', 'caravanserai rents are 25/50/100/200');

// the four corners land where they should
check(BOARD[0].type === 'go', 'GO is space 0');
check(BOARD[10].type === 'jail', 'the dungeon is space 10');
check(BOARD[20].type === 'parking', 'the tea house is space 20');
check(BOARD[30].type === 'gotojail', 'go-to-jail is space 30');

// ─────────────────────────── a deterministic little RNG so failures repeat

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────── invariants checked after every single action

function audit(g, tag) {
  let houses = 0, hotels = 0;
  for (let i = 0; i < SPACES; i++) {
    const s = BOARD[i];
    const h = g.houses[i];
    if (h > 0) {
      check(s.type === 'street', `${tag}: only streets carry buildings`);
      check(g.owner[i] !== null, `${tag}: buildings always have an owner`);
      check(!g.mortgaged[i], `${tag}: a mortgaged street carries no buildings`);
      check(g.ownsGroup(g.owner[i], s.group), `${tag}: buildings need the whole group`);
      if (h === 5) hotels++; else houses += h;
    }
    check(h >= 0 && h <= 5, `${tag}: houses stay between 0 and a hotel`);
    if (g.owner[i] !== null) check(!!s.price, `${tag}: only purchasable squares get owners`);
    if (g.mortgaged[i]) check(g.owner[i] !== null, `${tag}: only owned things are mortgaged`);
  }
  // even building, across every group
  for (const members of Object.values(GROUP_MEMBERS)) {
    const levels = members.map((i) => (g.houses[i] === 5 ? 5 : g.houses[i]));
    check(Math.max(...levels) - Math.min(...levels) <= 1, `${tag}: building stays even across a group`);
  }
  check(houses + g.housesLeft === HOUSE_STOCK, `${tag}: the 32 houses are all accounted for`);
  check(hotels + g.hotelsLeft === HOTEL_STOCK, `${tag}: the 12 hotels are all accounted for`);
  check(g.housesLeft >= 0 && g.hotelsLeft >= 0, `${tag}: the bank never goes below zero buildings`);

  for (let s = 0; s < g.players.length; s++) {
    check(Number.isFinite(g.cash[s]), `${tag}: cash stays a number`);
    if (g.phase !== 'debt') check(g.cash[s] >= 0, `${tag}: nobody holds negative cash outside a debt`);
    check(g.pos[s] >= 0 && g.pos[s] < SPACES, `${tag}: tokens stay on the board`);
    if (g.bust[s]) {
      check(g.cash[s] === 0, `${tag}: a ruined player has nothing`);
      check(g.holdings(s).length === 0, `${tag}: a ruined player owns nothing`);
      check(g.turn !== s || g.phase === 'over', `${tag}: a ruined player never has the turn`);
    }
    check(g.jailTurns[s] <= 3, `${tag}: nobody serves more than three turns`);
  }
  check(g.doubles <= 2, `${tag}: a third double always goes to the dungeon`);
  if (g.phase === 'auction') check(g.auction && g.auction.turn !== null, `${tag}: an auction always has a bidder`);
  if (g.phase === 'debt') check(!!g.debt, `${tag}: the debt phase always has a debt`);
  if (g.phase === 'buy') check(!!g.pending, `${tag}: the buy phase always has something to buy`);
}

// ─────────────────────────── rent maths, checked directly

{
  const g = new MonopolyGame([{ name: 'A' }, { name: 'B' }], { rng: mulberry(1) });
  const med = 1, baltic = 3;
  g.owner[med] = 0;
  check(g.rentAt(med, 7) === 2, 'a lone brown street rents for its base');
  g.owner[baltic] = 0;
  check(g.rentAt(med, 7) === 4, 'an unimproved monopoly doubles the rent');
  g.houses[med] = 1;
  check(g.rentAt(med, 7) === 10, 'one house uses the house rent, not double');
  g.houses[med] = 5;
  check(g.rentAt(med, 7) === 250, 'a hotel charges the hotel rent');
  g.mortgaged[med] = true;
  check(g.rentAt(med, 7) === 0, 'a mortgaged street collects nothing');
  g.mortgaged[med] = false;

  // railroads
  for (const [n, expected] of [[1, 25], [2, 50], [3, 100], [4, 200]]) {
    const h = new MonopolyGame([{ name: 'A' }, { name: 'B' }], { rng: mulberry(2) });
    for (let k = 0; k < n; k++) h.owner[RAILS[k]] = 0;
    check(h.rentAt(RAILS[0], 7) === expected, `${n} caravanserai charge ${expected}`);
  }
  // and the fortune card that doubles it
  {
    const h = new MonopolyGame([{ name: 'A' }, { name: 'B' }], { rng: mulberry(3) });
    h.owner[RAILS[0]] = 0; h.owner[RAILS[1]] = 0;
    check(h.rentAt(RAILS[0], 7, 2) === 100, 'the caravan card pays double the toll');
  }
  // utilities
  {
    const h = new MonopolyGame([{ name: 'A' }, { name: 'B' }], { rng: mulberry(4) });
    h.owner[UTILS[0]] = 0;
    check(h.rentAt(UTILS[0], 9) === 36, 'one utility charges four times the roll');
    h.owner[UTILS[1]] = 0;
    check(h.rentAt(UTILS[0], 9) === 90, 'both utilities charge ten times the roll');
    check(h.rentAt(UTILS[0], 9, 10) === 90, 'the fortune card always charges ten times');
  }
}

// ─────────────────────────── building rules, checked directly

{
  const g = new MonopolyGame([{ name: 'A' }, { name: 'B' }], { rng: mulberry(5) });
  const [a, b, c] = GROUP_MEMBERS.amber;
  g.owner[a] = 0;
  check(!!g.canBuild(0, a), 'you cannot build without the whole group');
  g.owner[b] = 0; g.owner[c] = 0;
  g.cash[0] = 5000;
  check(g.canBuild(0, a) === null, 'with the group you can build');
  g.build(0, a);
  check(!!g.canBuild(0, a), 'you cannot put a second house on before the others have one');
  g.build(0, b); g.build(0, c);
  check(g.canBuild(0, a) === null, 'once level again, you can go round a second time');
  for (let k = 0; k < 3; k++) { g.build(0, a); g.build(0, b); g.build(0, c); }
  check(g.houses[a] === 4 && g.houses[b] === 4 && g.houses[c] === 4, 'four houses each');
  const beforeHouses = g.housesLeft;
  g.build(0, a);
  check(g.houses[a] === 5, 'the fifth purchase is a hotel');
  check(g.housesLeft === beforeHouses + 4, 'the four houses go back in the box');
  check(g.hotelsLeft === HOTEL_STOCK - 1, 'a hotel leaves the bank');
  check(!!g.mortgage(0, a), 'a built street cannot be mortgaged');
  check(!!g.canBuild(0, a), 'nothing goes above a hotel');

  // the bank running dry
  const h = new MonopolyGame([{ name: 'A' }, { name: 'B' }], { rng: mulberry(6) });
  h.cash[0] = 100000;
  h.housesLeft = 0;
  const [x, y] = GROUP_MEMBERS.copper;
  h.owner[x] = 0; h.owner[y] = 0;
  check(h.canBuild(0, x) === 'The bank has no houses left.', 'you cannot build houses the bank has not got');
}

// ─────────────────────────── full games

let finished = 0, turns = 0, busts = 0, auctions = 0, trades = 0;
const endings = {};

for (let n = 0; n < GAMES; n++) {
  const rng = mulberry(1000 + n);
  const size = 2 + Math.floor(rng() * 7);
  const players = Array.from({ length: size }, (_, i) => ({ name: `P${i + 1}`, isBot: true }));
  const endMode = ['last', 'firstbust', 'timed'][n % 3];
  const buyMode = ['buy', 'buyAuction', 'auction'][Math.floor(n / 3) % 3];
  const g = new MonopolyGame(players, {
    rng,
    settings: {
      endMode, buyMode, minutes: 45,
      freeParking: n % 4 === 0,
      doubleGo: n % 5 === 0,
      noJailRent: n % 7 === 0,
    },
  });
  // a timed game we force to expire partway, to exercise that path
  if (endMode === 'timed') g.endsAt = Date.now() + 1;

  let steps = 0;
  const cashAtStart = g.cash.reduce((a, b) => a + b, 0);
  while (g.phase !== 'over' && steps < 20000) {
    steps++;
    const seat = g.actorSeat();
    if (seat === null) break;
    const before = `${g.phase}/${seat}/${steps}`;
    if (g.phase === 'auction') auctions++;
    const a = act(g, seat);
    if (!a) {
      // nothing sensible left — the table must be able to move on regardless
      if (g.phase === 'debt') g.declareBankrupt(seat);
      else if (g.phase === 'end_turn') g.endTurn(seat);
      else if (g.phase === 'buy') g.pass(seat);
      else if (g.phase === 'auction') g.passBid(seat);
      else { check(false, `stuck in ${g.phase}`); break; }
      audit(g, before);
      continue;
    }
    const res = (() => {
      switch (a.type) {
        case 'roll': return g.roll(seat);
        case 'payFine': return g.payFine(seat);
        case 'useCard': return g.useJailCard(seat);
        case 'buy': return g.buy(seat);
        case 'pass': return g.pass(seat);
        case 'bid': return g.bid(seat, a.amount);
        case 'passBid': return g.passBid(seat);
        case 'build': return g.build(seat, a.pos);
        case 'sell': return g.sell(seat, a.pos);
        case 'mortgage': return g.mortgage(seat, a.pos);
        case 'unmortgage': return g.unmortgage(seat, a.pos);
        case 'bankrupt': return g.declareBankrupt(seat);
        case 'endTurn': return g.endTurn(seat);
        case 'propose': { trades++; return g.propose(seat, a.to, a.give, a.want); }
        default: return { error: 'unknown action ' + a.type };
      }
    })();
    check(!res || !res.error, `the bot only ever plays legal moves (got "${res && res.error}" for ${a.type} in ${g.phase})`);
    if (a.type === 'endTurn') turns++;
    // a bot holding an offer answers it straight away
    if (g.offer) { const o = g.offer; g.respond(o.to, judgeOffer(g, o.to, o)); }
    audit(g, before);
  }

  check(g.phase === 'over', `game ${n} finished (${steps} steps, ${size} players, ${endMode})`);
  if (g.phase === 'over') {
    finished++;
    endings[endMode] = (endings[endMode] || 0) + 1;
    const left = g.aliveSeats();
    busts += g.bust.filter(Boolean).length;
    if (endMode === 'last') check(left.length <= 1, 'last-standing runs until one is left');
    if (g.winner !== null) {
      check(!g.bust[g.winner], 'the winner is never a ruined player');
      for (const s of left) {
        check(g.netWorth(g.winner) >= g.netWorth(s), 'the winner is the richest player left');
      }
    }
  }
  check(g.cash.every((c) => c >= 0), 'every game ends with nobody in the red');
}

console.log(`Played ${finished}/${GAMES} games to a finish`);
console.log(`  ${turns} turns · ${busts} ruined players · ${auctions} auction decisions`);
console.log(`  end modes: ${Object.entries(endings).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(failures === 0 ? '\n✓ all invariants held\n' : `\n✗ ${failures} distinct failures\n`);
process.exit(failures === 0 ? 0 : 1);
