// Snakes and Ladders — rules engine. Pure state, no timers, no sockets.
//
// House rules in force:
//   * you must land exactly on 100; an overshoot bounces back off the end
//   * a six earns another roll, but three sixes running forfeits the whole turn
//   * the board is generated fresh for every game

export const SQUARES = 100;
export const COLS = 10;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const TOKEN_COLOURS = [
  '#ff5d5d', '#5fb2ff', '#63d788', '#ffd15c',
  '#c98bff', '#ff9c4d', '#4de0d0', '#ff7ac0',
];

/** Row/column of a square on the boustrophedon board, row 0 at the bottom. */
export function squareToCell(n) {
  const row = Math.floor((n - 1) / COLS);
  const within = (n - 1) % COLS;
  const col = row % 2 === 0 ? within : COLS - 1 - within;
  return { row, col };
}

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * Build a random board. Every square takes part in at most one snake or ladder,
 * so nothing chains, and there is always one nasty snake near the top to keep
 * the finish interesting.
 */
export function makeBoard(opts = {}) {
  const rng = opts.rng || Math.random;
  const ladderCount = opts.ladders ?? 8;
  const snakeCount = opts.snakes ?? 8;
  const minSpan = 6;
  const maxSpan = 34;

  const used = new Set([1, SQUARES]); // never start or end on the first or last square
  const ladders = {};
  const snakes = {};

  const free = (...squares) => squares.every((s) => s > 1 && s < SQUARES && !used.has(s));
  const claim = (...squares) => squares.forEach((s) => used.add(s));

  const tryLadder = () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const bottom = randInt(rng, 2, SQUARES - minSpan - 1);
      const top = bottom + randInt(rng, minSpan, maxSpan);
      if (top >= SQUARES) continue;
      if (squareToCell(bottom).row === squareToCell(top).row) continue; // must actually climb
      if (!free(bottom, top)) continue;
      ladders[bottom] = top;
      claim(bottom, top);
      return true;
    }
    return false;
  };

  const trySnake = (headLo = 12, headHi = SQUARES - 1) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const head = randInt(rng, headLo, headHi);
      const tail = head - randInt(rng, minSpan, maxSpan);
      if (tail < 2) continue;
      if (squareToCell(head).row === squareToCell(tail).row) continue;
      if (!free(head, tail)) continue;
      snakes[head] = tail;
      claim(head, tail);
      return true;
    }
    return false;
  };

  trySnake(SQUARES - 10, SQUARES - 1); // the heartbreaker near the finish
  for (let i = 0; i < ladderCount; i++) tryLadder();
  while (Object.keys(snakes).length < snakeCount) {
    if (!trySnake()) break;
  }

  return { ladders, snakes };
}

/** Where a roll takes you, before snakes and ladders are applied. */
export function stepTo(from, die) {
  const raw = from + die;
  if (raw <= SQUARES) return { landed: raw, bounced: false };
  return { landed: SQUARES - (raw - SQUARES), bounced: true };
}

export class SnakesGame {
  constructor(players, opts = {}) {
    this.players = players;
    this.rng = opts.rng || Math.random;
    this.board = makeBoard({ rng: this.rng, ...opts.board });
    this.positions = players.map(() => 0);
    this.turn = 0;
    this.phase = 'playing';
    this.winner = null;
    this.rolling = false;
    this.sixStreak = 0;
    this.turnStart = 0;
    this.lastMove = null;
    this.moveId = 0;
    this.roundNumber = 1;
    this.log = [];
    this.note(`${players[0].name} starts.`);
  }

  note(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  }

  get current() { return this.players[this.turn]; }

  nextSeat(from) {
    return (from + 1) % this.players.length;
  }

  /**
   * Take one roll for `seat`. Returns the move for the client to animate, or
   * { error } if it isn't that seat's turn.
   */
  roll(seat, forcedDie = null) {
    if (this.phase !== 'playing') return { error: 'The game is over.' };
    if (seat !== this.turn) return { error: 'Not your turn.' };

    const die = forcedDie || randInt(this.rng, 1, 6);
    const from = this.positions[seat];
    const name = this.players[seat].name;

    // third six running and the whole turn is thrown away
    if (die === 6 && this.sixStreak === 2) {
      this.sixStreak = 0;
      this.positions[seat] = this.turnStart;
      const move = {
        id: ++this.moveId,
        seat, die, from, landed: from, to: this.turnStart,
        kind: 'forfeit', bounced: false, again: false,
      };
      this.lastMove = move;
      this.note(`${name} rolled a third six — the whole turn is forfeit.`);
      this.turn = this.nextSeat(seat);
      this.turnStart = this.positions[this.turn];
      return { ok: true, move };
    }

    const { landed, bounced } = stepTo(from, die);
    let to = landed;
    let kind = 'move';
    if (this.board.ladders[landed]) { to = this.board.ladders[landed]; kind = 'ladder'; }
    else if (this.board.snakes[landed]) { to = this.board.snakes[landed]; kind = 'snake'; }

    this.positions[seat] = to;

    if (kind === 'ladder') this.note(`${name} rolled ${die} and climbed ${landed} → ${to}.`);
    else if (kind === 'snake') this.note(`${name} rolled ${die} and was bitten at ${landed}, down to ${to}.`);
    else if (bounced) this.note(`${name} rolled ${die}, overshot and bounced back to ${to}.`);
    else this.note(`${name} rolled ${die} to ${to}.`);

    let again = false;
    if (to === SQUARES) {
      this.phase = 'game_over';
      this.winner = seat;
      this.note(`${name} reaches 100 and wins!`);
    } else if (die === 6) {
      this.sixStreak += 1;
      again = true;
    } else {
      this.sixStreak = 0;
      this.turn = this.nextSeat(seat);
      this.turnStart = this.positions[this.turn];
    }

    const move = { id: ++this.moveId, seat, die, from, landed, to, kind, bounced, again };
    this.lastMove = move;
    return { ok: true, move };
  }

  publicState() {
    return {
      gameType: 'snakes',
      phase: this.phase,
      board: this.board,
      players: this.players.map((p, i) => ({
        seat: i,
        name: p.name,
        isBot: p.isBot,
        connected: p.connected !== false,
        colour: TOKEN_COLOURS[i % TOKEN_COLOURS.length],
        position: this.positions[i],
      })),
      positions: this.positions,
      turn: this.turn,
      turnDeadline: this.turnDeadline || null,
      turnTotal: this.turnTotal || null,
      sixStreak: this.sixStreak,
      lastMove: this.lastMove,
      winner: this.winner,
      log: this.log.slice(-12),
    };
  }

  viewFor(seat) {
    return { ...this.publicState(), seat: seat === null || seat === undefined ? null : seat };
  }
}
