// Bazaar — a property trading game. Rules engine only: pure state, no timers,
// no sockets, no rendering.
//
// The mechanics are the classic ones — 40 spaces, eight colour groups, even
// building, doubled rent on an unimproved monopoly, railroad tiers, utility
// multipliers, auctions, mortgages, jail on three doubles — but every name,
// card and piece of art in here is our own.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const SPACES = 40;
export const JAIL = 10;
export const GO_SALARY = 200;
export const START_CASH = 1500;
export const HOUSE_STOCK = 32;
export const HOTEL_STOCK = 12;
export const JAIL_FINE = 50;

export const TOKEN_COLOURS = [
  '#ff5d5d', '#5fb2ff', '#63d788', '#ffd15c',
  '#c98bff', '#ff9c4d', '#4de0d0', '#ff7ac0',
];

/**
 * The eight pieces. Ids and labels only — the renders live in the client.
 * Players pick one in the lobby; the order here is also the default by seat.
 */
export const PIECES = [
  { id: 'lion',        name: 'Persian Lion',  fa: 'شیر' },
  { id: 'azadi',       name: 'Azadi Tower',   fa: 'برج آزادی' },
  { id: 'teaglass',    name: 'Tea Glass',     fa: 'استکان' },
  { id: 'sedan',       name: 'Classic Sedan', fa: 'خودروی کلاسیک' },
  { id: 'pomegranate', name: 'Pomegranate',   fa: 'انار' },
  { id: 'rug',         name: 'Persian Rug',   fa: 'فرش' },
  { id: 'ewer',        name: 'Ewer',          fa: 'ابریق' },
  { id: 'cypress',     name: 'Cypress',       fa: 'سرو' },
];
export const TOKENS = PIECES.map((p) => p.id);
export const isPiece = (id) => TOKENS.includes(id);

// The colours are exactly as they were; only the labels have moved to Tehran.
export const GROUPS = {
  copper:    { name: 'The Old City',      colour: '#8a5a2b', build: 50,  size: 2 },
  saffron:   { name: 'The Neighbourhoods', colour: '#8ed6e8', build: 50,  size: 3 },
  indigo:    { name: 'Midtown',           colour: '#d2409a', build: 100, size: 3 },
  amber:     { name: 'The Hills',         colour: '#f2911f', build: 100, size: 3 },
  carmine:   { name: 'The Boulevards',    colour: '#e02a2a', build: 150, size: 3 },
  gold:      { name: 'New Tehran',        colour: '#f5d90a', build: 150, size: 3 },
  jade:      { name: 'The Heights',       colour: '#1f9755', build: 200, size: 3 },
  lapis:     { name: 'North Tehran',      colour: '#1d5fb0', build: 200, size: 2 },
};

const street = (i, name, fa, group, price, rents) => ({
  i, type: 'street', name, fa, group,
  price, mortgage: price / 2,
  rent: rents,                    // [bare, 1, 2, 3, 4, hotel]
  build: GROUPS[group].build,
});

const rail = (i, name, fa) => ({
  i, type: 'rail', name, fa, price: 200, mortgage: 100,
});

const util = (i, name, fa) => ({
  i, type: 'utility', name, fa, price: 150, mortgage: 75,
});

/**
 * The 40 spaces, clockwise from GO. The streets are real Tehran, laid out the
 * way the city actually prices itself: the old south at the cheap end, the
 * northern hills at the top.
 */
export const BOARD = [
  { i: 0,  type: 'go',       name: 'GO',                fa: 'برو' },
  street(1, 'Shoush', 'شوش', 'copper', 60, [2, 10, 30, 90, 160, 250]),
  { i: 2,  type: 'treasury', name: 'Treasury',          fa: 'خزانه' },
  street(3, 'Narmak', 'نارمک', 'copper', 60, [4, 20, 60, 180, 320, 450]),
  { i: 4,  type: 'tax',      name: 'Income Tax',        fa: 'مالیات بر درآمد', tax: 200 },
  rail(5, 'South Railway', 'راه آهن جنوب'),
  street(6, 'Ekbatan', 'اکباتان', 'saffron', 100, [6, 30, 90, 270, 400, 550]),
  { i: 7,  type: 'fortune',  name: 'Fortune',           fa: 'بخت' },
  street(8, 'Kargar Shomali', 'کارگر شمالی', 'saffron', 100, [6, 30, 90, 270, 400, 550]),
  street(9, 'Enghelab', 'انقلاب', 'saffron', 120, [8, 40, 100, 300, 450, 600]),
  { i: 10, type: 'jail',     name: 'Jail',              fa: 'زندان' },
  street(11, 'Bagh-e Golha', 'باغ گل‌ها', 'indigo', 140, [10, 50, 150, 450, 625, 750]),
  util(12, 'Tehran Electric', 'برق تهران'),
  street(13, 'Gisha', 'گیشا', 'indigo', 140, [10, 50, 150, 450, 625, 750]),
  street(14, 'Azadi', 'آزادی', 'indigo', 160, [12, 60, 180, 500, 700, 900]),
  rail(15, 'West Railway', 'راه آهن غرب'),
  street(16, 'Darkeh', 'درکه', 'amber', 180, [14, 70, 200, 550, 750, 950]),
  { i: 17, type: 'treasury', name: 'Treasury',          fa: 'خزانه' },
  street(18, 'Gheytarieh', 'قیطریه', 'amber', 180, [14, 70, 200, 550, 750, 950]),
  street(19, 'Tajrish', 'تجریش', 'amber', 200, [16, 80, 220, 600, 800, 1000]),
  { i: 20, type: 'parking',  name: 'Tea House',         fa: 'چای‌خانه' },
  street(21, 'Vali-Asr', 'ولیعصر', 'carmine', 220, [18, 90, 250, 700, 875, 1050]),
  { i: 22, type: 'fortune',  name: 'Fortune',           fa: 'بخت' },
  street(23, 'Vanak', 'ونک', 'carmine', 220, [18, 90, 250, 700, 875, 1050]),
  street(24, "Sa'adat Abad", 'سعادت‌آباد', 'carmine', 240, [20, 100, 300, 750, 925, 1100]),
  rail(25, 'North Railway', 'راه آهن شمال'),
  street(26, 'Pasdaran', 'پاسداران', 'gold', 260, [22, 110, 330, 800, 975, 1150]),
  street(27, 'Jordan', 'جردن', 'gold', 260, [22, 110, 330, 800, 975, 1150]),
  util(28, 'Tehran Water', 'آب تهران'),
  street(29, 'Velenjak', 'ولنجک', 'gold', 280, [24, 120, 360, 850, 1025, 1200]),
  { i: 30, type: 'gotojail', name: 'Go to Jail',        fa: 'برو به زندان' },
  street(31, 'Niavaran', 'نیاوران', 'jade', 300, [26, 130, 390, 900, 1100, 1275]),
  street(32, 'Farmanieh', 'فرمانیه', 'jade', 300, [26, 130, 390, 900, 1100, 1275]),
  { i: 33, type: 'treasury', name: 'Treasury',          fa: 'خزانه' },
  street(34, 'Zafaranieh', 'زعفرانیه', 'jade', 320, [28, 150, 450, 1000, 1200, 1400]),
  rail(35, 'East Railway', 'راه آهن شرق'),
  { i: 36, type: 'fortune',  name: 'Fortune',           fa: 'بخت' },
  street(37, 'Elahieh', 'الهیه', 'lapis', 350, [35, 175, 500, 1100, 1300, 1500]),
  { i: 38, type: 'tax',      name: 'Luxury Tax',        fa: 'مالیات تجمل', tax: 100 },
  street(39, 'Fereshteh', 'فرشته', 'lapis', 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const RAILS = BOARD.filter((s) => s.type === 'rail').map((s) => s.i);
export const UTILS = BOARD.filter((s) => s.type === 'utility').map((s) => s.i);
export const RAIL_RENT = [0, 25, 50, 100, 200];
export const BUYABLE = BOARD.filter((s) => s.price).map((s) => s.i);

const groupMembers = {};
for (const s of BOARD) if (s.type === 'street') (groupMembers[s.group] ||= []).push(s.i);
export const GROUP_MEMBERS = groupMembers;

// ─────────────────────────────────────────── the two decks
//
// Same mechanics as the classic decks, our own wording.

export const FORTUNE = [
  { id: 'f1',  text: 'The road home is clear. Advance to GO.',                             act: { type: 'move', to: 0 } },
  { id: 'f2',  text: 'Fereshteh is calling. Advance there.',                      act: { type: 'move', to: 39 } },
  { id: 'f3',  text: 'Take Jordan all the way up. Advance there.',      act: { type: 'move', to: 27 } },
  { id: 'f4',  text: 'A shopkeeper on Gisha wants a word. Advance there.',          act: { type: 'move', to: 13 } },
  { id: 'f5',  text: 'Catch the next train and pay the line twice the usual fare.', act: { type: 'nearest', kind: 'rail', multiply: 2 } },
  { id: 'f6',  text: 'The engine is already at the platform. Ride to the nearest railway and pay twice the usual fare.',         act: { type: 'nearest', kind: 'rail', multiply: 2 } },
  { id: 'f7',  text: 'Go to the nearest utility. If it is owned, pay the owner ten times your roll.', act: { type: 'nearest', kind: 'utility', multiply: 10 } },
  { id: 'f8',  text: 'Your share of the season’s trade — collect 50.',                act: { type: 'cash', amount: 50 } },
  { id: 'f9',  text: 'A magistrate owes you a favour. Keep this card until you need it.',  act: { type: 'jailFree' }, keep: true },
  { id: 'f10', text: 'You take a wrong turn in the alleys. Go back three spaces.',         act: { type: 'moveBack', n: 3 } },
  { id: 'f11', text: 'The guard has been watching you. Go straight to jail.',       act: { type: 'jail' } },
  { id: 'f12', text: 'The winter rains come in. Pay 25 for every house and 100 for every hotel you own.', act: { type: 'repairs', house: 25, hotel: 100 } },
  { id: 'f13', text: 'You are fined 15 for blocking the thoroughfare.',                    act: { type: 'cash', amount: -15 } },
  { id: 'f14', text: 'Ride the South Railway down to the end of the line.',                    act: { type: 'move', to: 5 } },
  { id: 'f15', text: 'You are named head of the guild and must stand the feast — pay every player 50.', act: { type: 'each', amount: -50 } },
  { id: 'f16', text: 'An old loan is repaid at last — collect 150.',                       act: { type: 'cash', amount: 150 } },
];

export const TREASURY = [
  { id: 't1',  text: 'The morning call brings you home. Advance to GO.',                   act: { type: 'move', to: 0 } },
  { id: 't2',  text: 'The money changer miscounts in your favour — collect 200.',          act: { type: 'cash', amount: 200 } },
  { id: 't3',  text: 'The physician’s fee — pay 50.',                                 act: { type: 'cash', amount: -50 } },
  { id: 't4',  text: 'You sell your share in a caravan — collect 50.',                     act: { type: 'cash', amount: 50 } },
  { id: 't5',  text: 'A clerk finds an error in your sentence. Keep this card until you need it.', act: { type: 'jailFree' }, keep: true },
  { id: 't6',  text: 'The night watch takes you in. Go to jail.',                   act: { type: 'jail' } },
  { id: 't7',  text: 'Your pilgrimage fund matures — collect 100.',                        act: { type: 'cash', amount: 100 } },
  { id: 't8',  text: 'The toll gate overcharged you — collect 20 back.',                   act: { type: 'cash', amount: 20 } },
  { id: 't9',  text: 'It is your name day. Collect 10 from every player.',                 act: { type: 'each', amount: 10 } },
  { id: 't10', text: 'An endowment comes due — collect 100.',                              act: { type: 'cash', amount: 100 } },
  { id: 't11', text: 'A night at the infirmary — pay 100.',                                act: { type: 'cash', amount: -100 } },
  { id: 't12', text: 'Fees for the scribe’s school — pay 50.',                        act: { type: 'cash', amount: -50 } },
  { id: 't13', text: 'You settle a dispute between two traders — collect 25.',             act: { type: 'cash', amount: 25 } },
  { id: 't14', text: 'The lane outside your door is repaved. Pay 40 a house and 115 a hotel.', act: { type: 'repairs', house: 40, hotel: 115 } },
  { id: 't15', text: 'Your ghazal wins the evening’s contest — collect 10.',           act: { type: 'cash', amount: 10 } },
  { id: 't16', text: 'An uncle you barely knew leaves you 100.',                           act: { type: 'cash', amount: 100 } },
];

export const DEFAULT_SETTINGS = {
  buyMode: 'buy',      // 'buy' = buy or pass · 'buyAuction' = pass sends it to auction · 'auction' = everything is auctioned
  endMode: 'timed',    // 'timed' | 'last' | 'firstbust'
  minutes: 45,
  freeParking: false,  // the jackpot house rule
  doubleGo: false,     // landing exactly on GO pays double
  noJailRent: false,   // an owner in the dungeon collects nothing
  tripleDouble: false, // three doubles in a row sends you to jail
  startCash: START_CASH,
};

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

export function shuffled(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class MonopolyGame {
  constructor(players, opts = {}) {
    this.players = players;
    this.rng = opts.rng || Math.random;
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };

    const n = players.length;
    this.cash = Array(n).fill(this.settings.startCash);
    this.pos = Array(n).fill(0);
    this.jailed = Array(n).fill(false);
    this.jailTurns = Array(n).fill(0);
    this.jailFree = Array(n).fill(0);
    this.bust = Array(n).fill(false);

    this.owner = Array(SPACES).fill(null);
    this.houses = Array(SPACES).fill(0);        // 0-4 houses, 5 = a hotel
    this.mortgaged = Array(SPACES).fill(false);
    this.housesLeft = HOUSE_STOCK;
    this.hotelsLeft = HOTEL_STOCK;

    this.fortune = shuffled(FORTUNE.map((c) => c.id), this.rng);
    this.treasury = shuffled(TREASURY.map((c) => c.id), this.rng);
    this.heldCards = {};                         // cardId -> seat holding it

    this.turn = 0;
    this.doubles = 0;
    this.phase = 'roll';                         // roll | buy | auction | debt | end_turn | over
    this.pending = null;                         // { type:'buy', pos } etc
    this.auction = null;
    this.debt = null;
    this.offer = null;                           // one open trade at a time
    this.offersThisTurn = 0;
    this.pot = 0;                                // the tea house jackpot
    this.dice = null;
    this.lastCard = null;
    this.moveId = 0;
    this.lastMove = null;
    this.winner = null;
    this.overReason = null;
    this.startedAt = Date.now();
    this.endsAt = this.settings.endMode === 'timed'
      ? this.startedAt + this.settings.minutes * 60000
      : null;
    this.log = [];
    this.note(`${players[0].name} opens the bazaar.`);
  }

  note(text) {
    this.log.push(text);
    if (this.log.length > 120) this.log.shift();
  }

  // ─────────────────────────── helpers

  get current() { return this.players[this.turn]; }
  name(seat) { return this.players[seat]?.name ?? '?'; }
  space(i) { return BOARD[i]; }
  alive(seat) { return !this.bust[seat]; }
  aliveSeats() { return this.players.map((_, i) => i).filter((i) => !this.bust[i]); }

  ownsGroup(seat, group) {
    return GROUP_MEMBERS[group].every((i) => this.owner[i] === seat);
  }

  countOwned(list, seat) {
    return list.filter((i) => this.owner[i] === seat).length;
  }

  /** Everything `seat` holds a deed to. */
  holdings(seat) {
    return BUYABLE.filter((i) => this.owner[i] === seat);
  }

  netWorth(seat) {
    let total = this.cash[seat];
    for (const i of this.holdings(seat)) {
      const s = BOARD[i];
      total += this.mortgaged[i] ? s.mortgage : s.price;
      if (s.type === 'street' && this.houses[i] > 0) {
        const built = this.houses[i] === 5 ? 5 : this.houses[i];
        total += built * s.build;
      }
    }
    return total;
  }

  /** What a landing player owes on `pos`, given the dice they rolled. */
  rentAt(pos, diceTotal, forcedMultiplier = null) {
    const s = BOARD[pos];
    const own = this.owner[pos];
    if (own === null || this.mortgaged[pos]) return 0;
    if (this.settings.noJailRent && this.jailed[own]) return 0;

    if (s.type === 'street') {
      const h = this.houses[pos];
      if (h > 0) return s.rent[h];
      return this.ownsGroup(own, s.group) ? s.rent[0] * 2 : s.rent[0];
    }
    if (s.type === 'rail') {
      const n = this.countOwned(RAILS, own);
      const base = RAIL_RENT[n] || 0;
      return forcedMultiplier ? base * forcedMultiplier : base;
    }
    if (s.type === 'utility') {
      if (forcedMultiplier) return diceTotal * forcedMultiplier;
      const n = this.countOwned(UTILS, own);
      return diceTotal * (n === 2 ? 10 : 4);
    }
    return 0;
  }

  // ─────────────────────────── money

  pay(seat, amount) {
    this.cash[seat] -= amount;
  }

  /**
   * Move money from `seat` to `to` (a seat, or null for the bank). If they
   * haven't got it, the game stops and asks them to raise it; `after` says what
   * should happen once the debt is settled.
   */
  charge(seat, amount, to = null, why = '', after = null) {
    if (amount <= 0) return { ok: true };
    if (this.cash[seat] >= amount) {
      this.cash[seat] -= amount;
      if (to === null) {
        if (this.settings.freeParking) this.pot += amount;
      } else {
        this.cash[to] += amount;
      }
      return { ok: true };
    }
    this.debt = { seat, amount, to, why, after: after || { kind: 'action', meta: {} } };
    this.phase = 'debt';
    this.note(`${this.name(seat)} owes ${amount} and must raise it.`);
    return { ok: false, debt: true };
  }

  collect(seat, amount) {
    this.cash[seat] += amount;
  }

  // ─────────────────────────── the turn

  /** Roll for `seat`. Optionally forced, which the tests use. */
  roll(seat, forced = null) {
    if (this.phase !== 'roll') return { error: 'Not the moment to roll.' };
    if (seat !== this.turn) return { error: 'Not your turn.' };
    if (this.bust[seat]) return { error: 'You are out of the game.' };

    const d1 = forced ? forced[0] : randInt(this.rng, 1, 6);
    const d2 = forced ? forced[1] : randInt(this.rng, 1, 6);
    const total = d1 + d2;
    const isDouble = d1 === d2;
    this.dice = { d1, d2, double: isDouble };

    if (this.jailed[seat]) return this._rollInJail(seat, d1, d2, isDouble);

    if (isDouble) {
      this.doubles += 1;
      // off by default: the only ways to the dungeon are the corner and a card
      if (this.settings.tripleDouble && this.doubles === 3) {
        this.note(`${this.name(seat)} rolls a third double — straight to jail.`);
        this._sendToJail(seat);
        this._endTurn();
        return { ok: true };
      }
    } else {
      this.doubles = 0;
    }

    return this._advanceBy(seat, total, { double: isDouble });
  }

  _rollInJail(seat, d1, d2, isDouble) {
    const who = this.name(seat);
    if (isDouble) {
      this.jailed[seat] = false;
      this.jailTurns[seat] = 0;
      this.doubles = 0;                       // a double out of the dungeon earns no extra roll
      this.note(`${who} rolls a double and walks free.`);
      return this._advanceBy(seat, d1 + d2, { double: false, fromJail: true });
    }
    this.jailTurns[seat] += 1;
    if (this.jailTurns[seat] >= 3) {
      this.note(`${who} serves the third turn, pays the ${JAIL_FINE} fine and leaves.`);
      const res = this.charge(seat, JAIL_FINE, null, 'jail fine', { kind: 'jailMove', seat, steps: d1 + d2 });
      this.jailed[seat] = false;
      this.jailTurns[seat] = 0;
      if (!res.ok) return { ok: true };
      return this._advanceBy(seat, d1 + d2, { double: false, fromJail: true });
    }
    this.note(`${who} stays in jail.`);
    this._endTurn();
    return { ok: true };
  }

  /** Pay the fine and get out now. */
  payFine(seat) {
    if (seat !== this.turn || !this.jailed[seat]) return { error: 'You are not in jail.' };
    if (this.phase !== 'roll') return { error: 'Not the moment.' };
    const res = this.charge(seat, JAIL_FINE, null, 'jail fine', { kind: 'roll' });
    if (!res.ok) return { ok: true };
    this.jailed[seat] = false;
    this.jailTurns[seat] = 0;
    this.note(`${this.name(seat)} pays the ${JAIL_FINE} fine and walks out.`);
    return { ok: true };
  }

  /** Spend a kept pardon. */
  useJailCard(seat) {
    if (seat !== this.turn || !this.jailed[seat]) return { error: 'You are not in jail.' };
    if (this.jailFree[seat] < 1) return { error: 'You have no pardon to use.' };
    this.jailFree[seat] -= 1;
    // hand the card back to the bottom of whichever deck it came from
    for (const [id, holder] of Object.entries(this.heldCards)) {
      if (holder === seat) {
        delete this.heldCards[id];
        (id.startsWith('f') ? this.fortune : this.treasury).push(id);
        break;
      }
    }
    this.jailed[seat] = false;
    this.jailTurns[seat] = 0;
    this.note(`${this.name(seat)} produces a pardon and walks out.`);
    return { ok: true };
  }

  _sendToJail(seat) {
    this.pos[seat] = JAIL;
    this.jailed[seat] = true;
    this.jailTurns[seat] = 0;
    this.doubles = 0;
    this.lastMove = { id: ++this.moveId, seat, from: this.pos[seat], to: JAIL, jump: true };
  }

  _advanceBy(seat, steps, meta = {}) {
    const from = this.pos[seat];
    let to = (from + steps) % SPACES;
    if (from + steps >= SPACES) this._passGo(seat, to);
    this.pos[seat] = to;
    this.lastMove = { id: ++this.moveId, seat, from, to, steps, jump: false };
    return this._land(seat, { ...meta, diceTotal: steps });
  }

  _moveTo(seat, to, { collectGo = true, backwards = false } = {}) {
    const from = this.pos[seat];
    if (collectGo && !backwards && to <= from) this._passGo(seat, to);
    this.pos[seat] = to;
    this.lastMove = { id: ++this.moveId, seat, from, to, jump: !backwards, back: backwards };
  }

  _passGo(seat, landedOn) {
    const exact = landedOn === 0 && this.settings.doubleGo;
    const amount = exact ? GO_SALARY * 2 : GO_SALARY;
    this.collect(seat, amount);
    this.note(`${this.name(seat)} passes GO and collects ${amount}.`);
  }

  /** Resolve whatever square the player is now standing on. */
  _land(seat, meta = {}) {
    const pos = this.pos[seat];
    const s = BOARD[pos];
    const who = this.name(seat);
    const diceTotal = meta.diceTotal ?? (this.dice ? this.dice.d1 + this.dice.d2 : 0);

    switch (s.type) {
      case 'go':
      case 'jail':
        this.note(`${who} rests at ${s.name}.`);
        break;

      case 'parking':
        if (this.settings.freeParking && this.pot > 0) {
          this.collect(seat, this.pot);
          this.note(`${who} takes the ${this.pot} left on the tea house table.`);
          this.pot = 0;
        } else {
          this.note(`${who} stops for tea.`);
        }
        break;

      case 'gotojail':
        this.note(`${who} is marched off to jail.`);
        this._sendToJail(seat);
        this._endTurn();
        return { ok: true };

      case 'tax': {
        this.note(`${who} pays the ${s.name.toLowerCase()} of ${s.tax}.`);
        const res = this.charge(seat, s.tax, null, s.name, { kind: 'action', meta });
        if (!res.ok) return { ok: true };
        break;
      }

      case 'fortune':
      case 'treasury':
        return this._drawCard(seat, s.type, meta);

      case 'street':
      case 'rail':
      case 'utility': {
        const own = this.owner[pos];
        if (own === null) return this._offerPurchase(seat, pos, meta);
        if (own === seat) { this.note(`${who} is on their own ${s.name}.`); break; }
        if (this.mortgaged[pos]) { this.note(`${s.name} is mortgaged — nothing to pay.`); break; }
        const rent = this.rentAt(pos, diceTotal, meta.multiply || null);
        if (rent === 0) { this.note(`${who} owes nothing on ${s.name}.`); break; }
        this.note(`${who} pays ${this.name(own)} ${rent} for ${s.name}.`);
        const res = this.charge(seat, rent, own, `rent on ${s.name}`, { kind: 'action', meta });
        if (!res.ok) return { ok: true };
        break;
      }
      default:
        break;
    }

    this._afterAction(meta);
    return { ok: true };
  }

  _offerPurchase(seat, pos, meta = {}) {
    const s = BOARD[pos];
    if (this.settings.buyMode === 'auction') {
      this.note(`${s.name} goes straight to auction.`);
      return this._startAuction(pos, meta);
    }
    this.phase = 'buy';
    this.pending = { type: 'buy', seat, pos, price: s.price, meta };
    return { ok: true };
  }

  /** Take the deed at the printed price. */
  buy(seat) {
    if (this.phase !== 'buy' || !this.pending || this.pending.seat !== seat) return { error: 'Nothing to buy.' };
    const { pos, meta } = this.pending;
    const s = BOARD[pos];
    if (this.cash[seat] < s.price) return { error: 'You cannot afford it.' };
    this.cash[seat] -= s.price;
    this.owner[pos] = seat;
    this.note(`${this.name(seat)} buys ${s.name} for ${s.price}.`);
    this.pending = null;
    this.phase = 'roll';
    this._afterAction(meta || {});
    return { ok: true };
  }

  /** Decline it — which may or may not send it to auction. */
  pass(seat) {
    if (this.phase !== 'buy' || !this.pending || this.pending.seat !== seat) return { error: 'Nothing to decline.' };
    const { pos, meta } = this.pending;
    this.pending = null;
    this.phase = 'roll';
    if (this.settings.buyMode === 'buyAuction') {
      this.note(`${this.name(seat)} passes on ${BOARD[pos].name} — it goes to auction.`);
      return this._startAuction(pos, meta);
    }
    this.note(`${this.name(seat)} passes on ${BOARD[pos].name}.`);
    this._afterAction(meta || {});
    return { ok: true };
  }

  // ─────────────────────────── auctions

  _startAuction(pos, meta = {}) {
    const bidders = this.aliveSeats();
    if (bidders.length === 0) { this._afterAction(meta); return { ok: true }; }
    this.phase = 'auction';
    this.auction = { pos, high: 0, highSeat: null, out: [], turn: this.turn, meta };
    if (!bidders.includes(this.auction.turn)) this.auction.turn = bidders[0];
    this.note(`${BOARD[pos].name} is up for auction.`);
    // whoever cannot afford a bid at all is out before we begin
    const first = this._nextBidder(this.auction.turn, true);
    if (first === null) return this._closeAuction();
    this.auction.turn = first;
    return { ok: true };
  }

  /**
   * Who bids next after `from`. The standing high bidder is never asked again
   * (there is nobody to outbid), and anyone who cannot beat the high bid is
   * dropped so a table of skint players can't stall.
   * @param includeFrom start the search at `from` itself.
   */
  _nextBidder(from, includeFrom = false) {
    const a = this.auction;
    const seats = this.aliveSeats();
    if (!seats.length) return null;
    let idx = seats.indexOf(from);
    if (idx === -1) idx = 0;
    const steps = includeFrom ? seats.length : seats.length;
    for (let k = includeFrom ? 0 : 1; k <= steps; k++) {
      const s = seats[(idx + k) % seats.length];
      if (a.out.includes(s)) continue;
      if (s === a.highSeat) continue;
      if (this.cash[s] <= a.high) { a.out.push(s); continue; }
      return s;
    }
    return null;
  }

  bid(seat, amount) {
    const a = this.auction;
    if (this.phase !== 'auction' || !a) return { error: 'No auction running.' };
    if (a.turn !== seat) return { error: 'Not your bid.' };
    amount = Math.floor(Number(amount) || 0);
    if (amount <= a.high) return { error: `You must beat ${a.high}.` };
    if (amount > this.cash[seat]) return { error: 'You cannot cover that bid.' };
    a.high = amount;
    a.highSeat = seat;
    this.note(`${this.name(seat)} bids ${amount}.`);
    const next = this._nextBidder(seat);
    if (next === null) return this._closeAuction();
    a.turn = next;
    return { ok: true };
  }

  passBid(seat) {
    const a = this.auction;
    if (this.phase !== 'auction' || !a) return { error: 'No auction running.' };
    if (a.turn !== seat) return { error: 'Not your bid.' };
    if (!a.out.includes(seat)) a.out.push(seat);
    this.note(`${this.name(seat)} drops out.`);
    const next = this._nextBidder(seat);
    if (next === null) return this._closeAuction();
    a.turn = next;
    return { ok: true };
  }

  _closeAuction() {
    const a = this.auction;
    const { pos, high, highSeat, meta } = a;
    this.auction = null;
    this.phase = 'roll';
    if (highSeat === null || high <= 0) {
      this.note(`Nobody bids — ${BOARD[pos].name} stays with the bank.`);
    } else {
      this.cash[highSeat] -= high;
      this.owner[pos] = highSeat;
      this.note(`${this.name(highSeat)} takes ${BOARD[pos].name} at auction for ${high}.`);
    }
    this._afterAction(meta || {});
    return { ok: true };
  }

  // ─────────────────────────── cards

  _drawCard(seat, deckName, meta) {
    const deck = deckName === 'fortune' ? this.fortune : this.treasury;
    const source = deckName === 'fortune' ? FORTUNE : TREASURY;
    if (deck.length === 0) {
      const back = source.map((c) => c.id).filter((id) => !this.heldCards[id]);
      deck.push(...shuffled(back, this.rng));
    }
    const id = deck.shift();
    const card = source.find((c) => c.id === id);
    this.lastCard = { deck: deckName, id, text: card.text, seat, at: ++this.moveId };
    this.note(`${this.name(seat)} draws: ${card.text}`);
    if (!card.keep) deck.push(id);
    return this._applyCard(seat, card, meta);
  }

  _applyCard(seat, card, meta = {}) {
    const a = card.act;
    switch (a.type) {
      case 'move':
        this._moveTo(seat, a.to, { collectGo: true });
        return this._land(seat, meta);

      case 'moveBack': {
        const to = (this.pos[seat] - a.n + SPACES) % SPACES;
        this._moveTo(seat, to, { backwards: true });
        return this._land(seat, meta);
      }

      case 'nearest': {
        const list = a.kind === 'rail' ? RAILS : UTILS;
        const from = this.pos[seat];
        let to = list.find((i) => i > from);
        if (to === undefined) to = list[0];
        this._moveTo(seat, to, { collectGo: true });
        return this._land(seat, { ...meta, multiply: a.multiply });
      }

      case 'jail':
        this._sendToJail(seat);
        this._endTurn();
        return { ok: true };

      case 'jailFree':
        this.jailFree[seat] += 1;
        this.heldCards[card.id] = seat;
        break;

      case 'cash': {
        if (a.amount >= 0) this.collect(seat, a.amount);
        else {
          const res = this.charge(seat, -a.amount, null, 'a card', { kind: 'action', meta });
          if (!res.ok) return { ok: true };
        }
        break;
      }

      case 'each': {
        const others = this.aliveSeats().filter((s) => s !== seat);
        if (a.amount >= 0) {
          // A player short of the money hands over what they have; the bank
          // covers the rest rather than opening a second debt mid-card.
          for (const o of others) {
            const take = Math.min(this.cash[o], a.amount);
            this.cash[o] -= take;
            this.cash[seat] += a.amount;
          }
        } else {
          const each = -a.amount;
          const total = each * others.length;
          if (this.cash[seat] < total) {
            const res = this.charge(seat, total, null, 'a card', { kind: 'payEach', seat, each, others, meta });
            return { ok: true };
          }
          this.cash[seat] -= total;
          for (const o of others) this.cash[o] += each;
        }
        break;
      }

      case 'repairs': {
        let owed = 0;
        for (const i of this.holdings(seat)) {
          if (this.houses[i] === 5) owed += a.hotel;
          else owed += this.houses[i] * a.house;
        }
        if (owed > 0) {
          this.note(`${this.name(seat)} owes ${owed} in repairs.`);
          const res = this.charge(seat, owed, null, 'repairs', { kind: 'action', meta });
          if (!res.ok) return { ok: true };
        }
        break;
      }
      default:
        break;
    }
    this._afterAction(meta);
    return { ok: true };
  }

  // ─────────────────────────── building

  /** Can `seat` put another house on `pos` right now? */
  canBuild(seat, pos) {
    const s = BOARD[pos];
    if (!s || s.type !== 'street') return 'Only streets can be built on.';
    if (this.owner[pos] !== seat) return 'You do not own it.';
    if (!this.ownsGroup(seat, s.group)) return 'You need the whole colour group first.';
    if (GROUP_MEMBERS[s.group].some((i) => this.mortgaged[i])) return 'Lift the mortgage on the group first.';
    if (this.houses[pos] >= 5) return 'It already has a hotel.';
    const lowest = Math.min(...GROUP_MEMBERS[s.group].map((i) => this.houses[i]));
    if (this.houses[pos] > lowest) return 'Build evenly across the group.';
    if (this.houses[pos] === 4) {
      if (this.hotelsLeft < 1) return 'The bank has no hotels left.';
    } else if (this.housesLeft < 1) return 'The bank has no houses left.';
    if (this.cash[seat] < s.build) return 'Not enough cash.';
    return null;
  }

  build(seat, pos) {
    const why = this.canBuild(seat, pos);
    if (why) return { error: why };
    const s = BOARD[pos];
    this.cash[seat] -= s.build;
    if (this.houses[pos] === 4) {
      this.houses[pos] = 5;
      this.housesLeft += 4;               // the four houses go back in the box
      this.hotelsLeft -= 1;
      this.note(`${this.name(seat)} raises a hotel on ${s.name}.`);
    } else {
      this.houses[pos] += 1;
      this.housesLeft -= 1;
      this.note(`${this.name(seat)} builds on ${s.name}.`);
    }
    return { ok: true };
  }

  canSell(seat, pos) {
    const s = BOARD[pos];
    if (!s || s.type !== 'street') return 'Nothing to sell there.';
    if (this.owner[pos] !== seat) return 'You do not own it.';
    if (this.houses[pos] === 0) return 'There is nothing built on it.';
    const highest = Math.max(...GROUP_MEMBERS[s.group].map((i) => this.houses[i]));
    if (this.houses[pos] < highest) return 'Sell evenly across the group.';
    if (this.houses[pos] === 5 && this.housesLeft < 4) return 'The bank has no houses to give back.';
    return null;
  }

  sell(seat, pos) {
    const why = this.canSell(seat, pos);
    if (why) return { error: why };
    const s = BOARD[pos];
    const back = Math.floor(s.build / 2);
    if (this.houses[pos] === 5) {
      this.houses[pos] = 4;
      this.hotelsLeft += 1;
      this.housesLeft -= 4;
      this.note(`${this.name(seat)} sells the hotel on ${s.name} back for ${back}.`);
    } else {
      this.houses[pos] -= 1;
      this.housesLeft += 1;
      this.note(`${this.name(seat)} sells a house on ${s.name} back for ${back}.`);
    }
    this.cash[seat] += back;
    this._settleDebt();
    return { ok: true };
  }

  mortgage(seat, pos) {
    const s = BOARD[pos];
    if (!s || !s.price) return { error: 'That cannot be mortgaged.' };
    if (this.owner[pos] !== seat) return { error: 'You do not own it.' };
    if (this.mortgaged[pos]) return { error: 'Already mortgaged.' };
    if (s.type === 'street' && GROUP_MEMBERS[s.group].some((i) => this.houses[i] > 0)) {
      return { error: 'Sell the buildings on that group first.' };
    }
    this.mortgaged[pos] = true;
    this.cash[seat] += s.mortgage;
    this.note(`${this.name(seat)} mortgages ${s.name} for ${s.mortgage}.`);
    this._settleDebt();
    return { ok: true };
  }

  /** Lifting a mortgage costs the loan plus ten per cent. */
  unmortgage(seat, pos) {
    const s = BOARD[pos];
    if (!s || !s.price) return { error: 'Nothing to lift.' };
    if (this.owner[pos] !== seat) return { error: 'You do not own it.' };
    if (!this.mortgaged[pos]) return { error: 'It is not mortgaged.' };
    const cost = Math.round(s.mortgage * 1.1);
    if (this.cash[seat] < cost) return { error: `That costs ${cost}.` };
    this.cash[seat] -= cost;
    this.mortgaged[pos] = false;
    this.note(`${this.name(seat)} lifts the mortgage on ${s.name} for ${cost}.`);
    return { ok: true };
  }

  // ─────────────────────────── debt and bankruptcy

  /** Called after any cash comes in — can the standing debt be settled now? */
  _settleDebt() {
    const d = this.debt;
    if (!d || this.phase !== 'debt') return;
    if (this.cash[d.seat] < d.amount) return;
    this.cash[d.seat] -= d.amount;
    if (d.to === null) {
      if (this.settings.freeParking) this.pot += d.amount;
    } else {
      this.cash[d.to] += d.amount;
    }
    this.note(`${this.name(d.seat)} settles ${d.amount}.`);
    this.debt = null;
    this.phase = 'roll';

    const after = d.after || { kind: 'action', meta: {} };
    switch (after.kind) {
      case 'roll':
        return;                                   // they still owe themselves a roll
      case 'jailMove':
        this._advanceBy(after.seat, after.steps, { double: false, fromJail: true });
        return;
      case 'payEach': {
        // charge() handed it to the bank; it was meant for the other players
        if (this.settings.freeParking) this.pot -= d.amount;
        for (const o of after.others) if (!this.bust[o]) this.cash[o] += after.each;
        this._afterAction(after.meta || {});
        return;
      }
      default:
        this._afterAction(after.meta || {});
    }
  }

  /** Everything they have, valued for the "can they possibly pay?" test. */
  _liquidatable(seat) {
    let raise = this.cash[seat];
    for (const i of this.holdings(seat)) {
      const s = BOARD[i];
      if (!this.mortgaged[i]) raise += s.mortgage;
      if (s.type === 'street' && this.houses[i] > 0) {
        const built = this.houses[i] === 5 ? 5 : this.houses[i];
        raise += built * Math.floor(s.build / 2);
      }
    }
    return raise;
  }

  declareBankrupt(seat) {
    const d = this.debt;
    if (!d || d.seat !== seat) return { error: 'You owe nothing.' };
    const to = d.to;
    this.note(`${this.name(seat)} is ruined.`);

    // buildings go back to the bank at half value, and the cash follows the debt
    for (const i of this.holdings(seat)) {
      const s = BOARD[i];
      if (s.type === 'street' && this.houses[i] > 0) {
        const built = this.houses[i] === 5 ? 5 : this.houses[i];
        if (this.houses[i] === 5) { this.hotelsLeft += 1; } else { this.housesLeft += this.houses[i]; }
        this.cash[seat] += built * Math.floor(s.build / 2);
        this.houses[i] = 0;
      }
    }

    if (to === null) {
      for (const i of this.holdings(seat)) { this.owner[i] = null; this.mortgaged[i] = false; }
      if (this.settings.freeParking) this.pot += Math.max(0, this.cash[seat]);
    } else {
      for (const i of this.holdings(seat)) this.owner[i] = to;
      this.cash[to] += Math.max(0, this.cash[seat]);
      this.note(`${this.name(to)} takes everything they had.`);
    }

    this.cash[seat] = 0;
    this.bust[seat] = true;
    this.jailed[seat] = false;
    this.jailFree[seat] = 0;
    this.debt = null;
    this.pending = null;

    if (this._checkEnd(true)) return { ok: true };
    this.phase = 'roll';
    if (this.turn === seat) this._endTurn();
    return { ok: true };
  }

  // ─────────────────────────── trades

  propose(from, to, give, want) {
    if (this.phase === 'over') return { error: 'The game is over.' };
    // Deals are struck on your own turn, the way they are at a real table —
    // otherwise offers arrive over the top of whatever somebody else is doing.
    if (from !== this.turn) return { error: 'You can only deal on your own turn.' };
    if (from === to) return { error: 'You cannot trade with yourself.' };
    if (this.bust[from] || this.bust[to]) return { error: 'That player is out.' };
    if (this.offer) return { error: 'There is already an offer on the table.' };
    const clean = (list, owner) => (list || []).map(Number).filter(
      (i) => BOARD[i] && BOARD[i].price && this.owner[i] === owner
    );
    const giveProps = clean(give.props, from);
    const wantProps = clean(want.props, to);
    const giveCash = Math.max(0, Math.floor(Number(give.cash) || 0));
    const wantCash = Math.max(0, Math.floor(Number(want.cash) || 0));
    if (giveCash > this.cash[from]) return { error: 'You do not have that much.' };
    if (wantCash > this.cash[to]) return { error: 'They do not have that much.' };
    if (!giveProps.length && !wantProps.length && !giveCash && !wantCash) return { error: 'An empty offer.' };
    const built = [...giveProps, ...wantProps].find(
      (i) => BOARD[i].type === 'street' && GROUP_MEMBERS[BOARD[i].group].some((j) => this.houses[j] > 0)
    );
    if (built !== undefined) return { error: 'Sell the buildings on that group before trading it.' };

    this.offersThisTurn += 1;
    this.offer = { from, to, giveProps, wantProps, giveCash, wantCash, at: ++this.moveId };
    this.note(`${this.name(from)} puts an offer to ${this.name(to)}.`);
    return { ok: true };
  }

  respond(seat, accept) {
    const o = this.offer;
    if (!o) return { error: 'No offer on the table.' };
    if (o.to !== seat) return { error: 'That offer is not yours to answer.' };
    if (!accept) {
      this.note(`${this.name(seat)} declines.`);
      this.offer = null;
      return { ok: true };
    }
    if (o.giveCash > this.cash[o.from] || o.wantCash > this.cash[o.to]) {
      this.offer = null;
      return { error: 'The cash is no longer there.' };
    }
    for (const i of o.giveProps) this.owner[i] = o.to;
    for (const i of o.wantProps) this.owner[i] = o.from;
    this.cash[o.from] += o.wantCash - o.giveCash;
    this.cash[o.to] += o.giveCash - o.wantCash;
    this.note(`${this.name(o.from)} and ${this.name(o.to)} shake on it.`);
    this.offer = null;
    this._settleDebt();
    return { ok: true };
  }

  withdraw(seat) {
    if (!this.offer || this.offer.from !== seat) return { error: 'Nothing to withdraw.' };
    this.offer = null;
    return { ok: true };
  }

  // ─────────────────────────── turn plumbing

  _afterAction(meta = {}) {
    if (this.phase === 'debt' || this.phase === 'auction' || this.phase === 'buy' || this.phase === 'over') return;
    if (meta.double && !this.jailed[this.turn]) {
      this.phase = 'roll';                 // a double earns another go
      return;
    }
    this.phase = 'end_turn';
  }

  endTurn(seat) {
    if (this.phase !== 'end_turn') return { error: 'Not yet.' };
    if (seat !== this.turn) return { error: 'Not your turn.' };
    this._endTurn();
    return { ok: true };
  }

  _endTurn() {
    this.doubles = 0;
    this.dice = null;
    this.offersThisTurn = 0;
    if (this._checkEnd(false)) return;
    const seats = this.aliveSeats();
    if (seats.length === 0) { this.phase = 'over'; return; }
    let next = this.turn;
    for (let k = 0; k < this.players.length; k++) {
      next = (next + 1) % this.players.length;
      if (!this.bust[next]) break;
    }
    this.turn = next;
    this.phase = 'roll';
  }

  /** @param bust true when this check follows someone going bankrupt. */
  _checkEnd(bust) {
    if (this.phase === 'over') return true;
    const left = this.aliveSeats();
    if (left.length <= 1) {
      this._finish(left[0] ?? null, 'Everyone else is ruined.');
      return true;
    }
    if (bust && this.settings.endMode === 'firstbust') {
      this._finish(this._richest(), 'The first ruin ends it — the richest wins.');
      return true;
    }
    if (this.settings.endMode === 'timed' && this.endsAt && Date.now() >= this.endsAt) {
      this._finish(this._richest(), 'Time is up — the richest wins.');
      return true;
    }
    return false;
  }

  _richest() {
    const left = this.aliveSeats();
    if (!left.length) return null;
    return left.reduce((best, s) => (this.netWorth(s) > this.netWorth(best) ? s : best), left[0]);
  }

  /** The clock ran out between turns. */
  timeUp() {
    if (this.phase === 'over') return;
    this._finish(this._richest(), 'Time is up — the richest wins.');
  }

  _finish(winner, why) {
    this.phase = 'over';
    this.winner = winner;
    this.overReason = why;
    this.debt = null;
    this.auction = null;
    this.offer = null;
    this.pending = null;
    if (winner !== null) this.note(`${this.name(winner)} wins. ${why}`);
    else this.note(why);
  }

  /** Whose move the table is actually waiting on, whatever the phase. */
  actorSeat() {
    if (this.phase === 'over') return null;
    if (this.phase === 'auction' && this.auction) return this.auction.turn;
    if (this.phase === 'debt' && this.debt) return this.debt.seat;
    return this.turn;
  }

  // ─────────────────────────── state out

  publicState() {
    return {
      gameType: 'monopoly',
      phase: this.phase,
      settings: this.settings,
      turn: this.turn,
      actor: this.actorSeat(),
      dice: this.dice,
      doubles: this.doubles,
      pot: this.pot,
      housesLeft: this.housesLeft,
      hotelsLeft: this.hotelsLeft,
      endsAt: this.endsAt,
      turnDeadline: this.turnDeadline || null,
      turnTotal: this.turnTotal || null,
      owner: this.owner,
      houses: this.houses,
      mortgaged: this.mortgaged,
      lastMove: this.lastMove,
      lastCard: this.lastCard,
      pending: this.pending && this.pending.type === 'buy'
        ? { type: 'buy', seat: this.pending.seat, pos: this.pending.pos, price: this.pending.price }
        : null,
      auction: this.auction
        ? { pos: this.auction.pos, high: this.auction.high, highSeat: this.auction.highSeat, turn: this.auction.turn, out: this.auction.out }
        : null,
      debt: this.debt ? { seat: this.debt.seat, amount: this.debt.amount, to: this.debt.to, why: this.debt.why } : null,
      offer: this.offer,
      winner: this.winner,
      overReason: this.overReason,
      players: this.players.map((p, i) => ({
        seat: i,
        name: p.name,
        isBot: p.isBot,
        connected: p.connected !== false,
        colour: TOKEN_COLOURS[i % TOKEN_COLOURS.length],
        token: p.piece && TOKENS.includes(p.piece) ? p.piece : TOKENS[i % TOKENS.length],
        cash: this.cash[i],
        pos: this.pos[i],
        jailed: this.jailed[i],
        jailTurns: this.jailTurns[i],
        pardons: this.jailFree[i],
        bust: this.bust[i],
        worth: this.netWorth(i),
        owns: this.holdings(i),
      })),
      log: this.log.slice(-14),
    };
  }

  viewFor(seat) {
    return { ...this.publicState(), seat: seat === null || seat === undefined ? null : seat };
  }
}
