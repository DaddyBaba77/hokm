// Hokm (حکم) rules engine — pure state machine, no timers, no sockets.

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const RANK_VALUE = RANKS.reduce((m, r, i) => ((m[r] = i + 2), m), {});

export const suitOf = (card) => card[card.length - 1];
export const rankOf = (card) => card.slice(0, -1);
export const valueOf = (card) => RANK_VALUE[rankOf(card)];

export function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Seats 0 & 2 are team A; seats 1 & 3 are team B. Partners sit across.
export const teamOf = (seat) => (seat % 2 === 0 ? 'A' : 'B');
export const TEAM_NAME = { A: 'Azure', B: 'Crimson' };
export const partnerOf = (seat) => (seat + 2) % 4;
export const nextSeat = (seat) => (seat + 1) % 4; // clockwise

const isRedSuit = (s) => s === 'H' || s === 'D';

/**
 * Order the suits so their colours alternate — black, red, black, red — which
 * keeps neighbouring suits visually distinct in a fanned hand. Trump leads the
 * hand; after that each suit is picked to break the colour of the one before it.
 * With a void or two, perfect alternation isn't always possible; this gets as
 * close as the hand allows.
 */
export function suitDisplayOrder(present, trump) {
  const pool = SUITS.filter((s) => present.includes(s));
  if (pool.length < 2) return pool;

  // At most four suits, so just look at every arrangement and take the best one.
  const perms = (arr) =>
    arr.length <= 1 ? [arr] : arr.flatMap((s, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((r) => [s, ...r]));

  const clashes = (o) => o.reduce((n, s, i) => n + (i > 0 && isRedSuit(s) === isRedSuit(o[i - 1]) ? 1 : 0), 0);
  const anchored = trump && pool.includes(trump);

  let best = null, bestScore = Infinity;
  for (const o of perms(pool)) {
    if (anchored && o[0] !== trump) continue; // trump always sits at the left edge
    const score = clashes(o);
    if (score < bestScore) { bestScore = score; best = o; }
    if (score === 0) break;
  }
  return best || pool;
}

/** Sort a hand for display: suits in alternating colours, high cards first. */
export function sortHand(hand, trump) {
  const present = SUITS.filter((s) => hand.some((c) => suitOf(c) === s));
  const order = suitDisplayOrder(present, trump);
  const suitRank = (s) => {
    const i = order.indexOf(s);
    return i === -1 ? order.length : i;
  };
  return hand
    .slice()
    .sort((a, b) => suitRank(suitOf(a)) - suitRank(suitOf(b)) || valueOf(b) - valueOf(a));
}

/** Which cards in `hand` are legal given the current trick. */
export function legalCards(hand, trick) {
  if (trick.length === 0) return hand.slice();
  const led = suitOf(trick[0].card);
  const following = hand.filter((c) => suitOf(c) === led);
  return following.length > 0 ? following : hand.slice();
}

/** Index into `trick` of the winning play. */
export function trickWinnerIndex(trick, trump) {
  const led = suitOf(trick[0].card);
  const trumps = trick.filter((p) => suitOf(p.card) === trump);
  const pool = trumps.length > 0 ? trumps : trick.filter((p) => suitOf(p.card) === led);
  let best = pool[0];
  for (const p of pool) if (valueOf(p.card) > valueOf(best.card)) best = p;
  return trick.indexOf(best);
}

export const TRICKS_TO_WIN_ROUND = 7;
export const POINTS_TO_WIN_GAME = 7;

export class HokmGame {
  constructor(players, opts = {}) {
    // players: array of 4 objects { id, name, isBot }
    this.players = players;
    this.rng = opts.rng || Math.random;
    this.scores = { A: 0, B: 0 };
    this.hakem = null;
    this.dealer = null;
    this.trump = null;
    this.hands = [[], [], [], []];
    this.trick = []; // [{ seat, card }]
    this.lastTrick = null; // { plays, winner }
    this.leader = null;
    this.turn = null;
    this.roundTricks = { A: 0, B: 0 };
    this.trickNumber = 0;
    this.roundNumber = 0;
    this.playedThisRound = [];
    this.phase = 'idle';
    this.draw = null; // { reveals: [{seat, card}], hakem }
    this.roundResult = null;
    this.gameWinner = null;
    this.log = [];
  }

  note(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  }

  /** Draw cards one at a time until somebody turns up an Ace — that player is Hakem. */
  startHakemDraw() {
    const deck = shuffle(makeDeck(), this.rng);
    const reveals = [];
    let seat = Math.floor(this.rng() * 4);
    let hakem = null;
    let i = 0;
    while (hakem === null) {
      const card = deck[i++];
      reveals.push({ seat, card });
      if (rankOf(card) === 'A') hakem = seat;
      else seat = nextSeat(seat);
    }
    this.draw = { reveals, hakem };
    this.hakem = hakem;
    this.phase = 'hakem_draw';
    this.note(`${this.players[hakem].name} drew an Ace and is the Hakem.`);
    return this.draw;
  }

  /** Shuffle, deal the Hakem 5 cards, and wait for the trump call. */
  startRound() {
    this.roundNumber += 1;
    this.dealer = nextSeat(this.hakem); // the player to the Hakem's left deals
    this.trump = null;
    this.trick = [];
    this.lastTrick = null;
    this.roundTricks = { A: 0, B: 0 };
    this.trickNumber = 0;
    this.roundResult = null;
    this.hands = [[], [], [], []];
    this._deck = shuffle(makeDeck(), this.rng);
    this.hands[this.hakem] = this._deck.splice(0, 5);
    this.playedThisRound = [];
    this.turn = this.hakem;
    this.phase = 'choosing_trump';
    this.note(`Round ${this.roundNumber}: ${this.players[this.hakem].name} is choosing Hokm.`);
  }

  chooseTrump(seat, suit) {
    if (this.phase !== 'choosing_trump') return { error: 'Not the trump-calling phase.' };
    if (seat !== this.hakem) return { error: 'Only the Hakem calls Hokm.' };
    if (!SUITS.includes(suit)) return { error: 'Unknown suit.' };
    this.trump = suit;

    // The other three get 5, then everyone gets two packets of 4 → 13 each.
    for (const s of [1, 2, 3].map((o) => (this.hakem + o) % 4)) {
      this.hands[s].push(...this._deck.splice(0, 5));
    }
    for (let round = 0; round < 2; round++) {
      for (let o = 0; o < 4; o++) {
        const s = (this.hakem + o) % 4;
        this.hands[s].push(...this._deck.splice(0, 4));
      }
    }
    this.phase = 'playing';
    this.leader = this.hakem;
    this.turn = this.hakem;
    this.trickNumber = 1;
    this.note(`Hokm is ${SUIT_SYMBOL[suit]} ${SUIT_NAME[suit]}.`);
    return { ok: true };
  }

  playCard(seat, card) {
    if (this.phase !== 'playing') return { error: 'The game is not in play.' };
    if (this.trick.length >= 4) return { error: 'That trick is already complete.' };
    if (seat !== this.turn) return { error: 'Not your turn.' };
    const hand = this.hands[seat];
    if (!hand.includes(card)) return { error: 'You do not hold that card.' };
    const legal = legalCards(hand, this.trick);
    if (!legal.includes(card)) {
      return { error: `You must follow ${SUIT_NAME[suitOf(this.trick[0].card)]}.` };
    }
    hand.splice(hand.indexOf(card), 1);
    this.trick.push({ seat, card });
    (this.playedThisRound || (this.playedThisRound = [])).push(card);

    if (this.trick.length < 4) {
      this.turn = nextSeat(this.turn);
      return { ok: true, trickComplete: false };
    }
    return { ok: true, trickComplete: true };
  }

  /** Called once all four cards are down. Returns the resolution for animation. */
  resolveTrick() {
    const idx = trickWinnerIndex(this.trick, this.trump);
    const winner = this.trick[idx].seat;
    const team = teamOf(winner);
    this.roundTricks[team] += 1;
    this.lastTrick = { plays: this.trick.slice(), winner };
    this.trick = [];
    this.leader = winner;
    this.turn = winner;
    this.note(
      `${this.players[winner].name} takes trick ${this.trickNumber} ` +
        `(${this.roundTricks.A}–${this.roundTricks.B}).`
    );
    this.trickNumber += 1;

    let roundOver = false;
    if (this.roundTricks[team] >= TRICKS_TO_WIN_ROUND) {
      roundOver = true;
      this._endRound(team);
    }
    return { winner, roundOver };
  }

  _endRound(winningTeam) {
    const losingTeam = winningTeam === 'A' ? 'B' : 'A';
    const loserTricks = this.roundTricks[losingTeam];
    const hakemTeam = teamOf(this.hakem);

    let points = 1;
    let kind = 'normal';
    if (loserTricks === 0) {
      if (winningTeam === hakemTeam) {
        points = 2;
        kind = 'kot';
      } else {
        points = 3;
        kind = 'hakem_koti';
      }
    }
    this.scores[winningTeam] += points;

    const hakemHeld = winningTeam === hakemTeam;
    const previousHakem = this.hakem;
    if (!hakemHeld) this.hakem = nextSeat(this.hakem);

    this.roundResult = {
      winningTeam,
      losingTeam,
      tricks: { ...this.roundTricks },
      points,
      kind,
      hakemHeld,
      previousHakem,
      nextHakem: this.hakem,
      scores: { ...this.scores },
    };

    const label =
      kind === 'kot' ? 'KOT! ' : kind === 'hakem_koti' ? 'HAKEM KOTI! ' : '';
    this.note(
      `${label}${TEAM_NAME[winningTeam]} wins the round ${this.roundTricks[winningTeam]}–${loserTricks} ` +
        `for ${points} point${points > 1 ? 's' : ''}.`
    );

    if (this.scores[winningTeam] >= POINTS_TO_WIN_GAME) {
      this.gameWinner = winningTeam;
      this.phase = 'game_over';
      this.note(`${TEAM_NAME[winningTeam]} wins the game ${this.scores.A}–${this.scores.B}.`);
    } else {
      this.phase = 'round_over';
    }
  }

  /** Everything every player is allowed to see. */
  publicState() {
    return {
      phase: this.phase,
      players: this.players.map((p, i) => ({
        seat: i,
        name: p.name,
        isBot: p.isBot,
        connected: p.connected !== false,
        team: teamOf(i),
        cards: this.hands[i].length,
      })),
      scores: this.scores,
      roundTricks: this.roundTricks,
      hakem: this.hakem,
      dealer: this.dealer,
      trump: this.trump,
      turn: this.turn,
      turnDeadline: this.turnDeadline || null,
      turnTotal: this.turnTotal || null,
      leader: this.leader,
      trick: this.trick,
      lastTrick: this.lastTrick,
      trickNumber: this.trickNumber,
      roundNumber: this.roundNumber,
      draw: this.draw,
      roundResult: this.roundResult,
      gameWinner: this.gameWinner,
      log: this.log.slice(-12),
    };
  }

  /** The public state plus one seat's private hand. */
  viewFor(seat) {
    const state = this.publicState();
    if (seat === null || seat === undefined) return { ...state, seat: null, hand: [], legal: [] };
    const hand = sortHand(this.hands[seat], this.trump);
    const legal =
      this.phase === 'playing' && this.turn === seat && this.trick.length < 4
        ? legalCards(this.hands[seat], this.trick)
        : [];
    return { ...state, seat, hand, legal };
  }
}
