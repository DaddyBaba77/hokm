// Ghahr Nakon — قهر نکن, "don't sulk". The old cross-and-dice race: four pieces
// each, a six to get out of the yard, and if somebody lands on you it is all the
// way back to the start. Rules engine only: pure state, no timers, no rendering.
//
// The game itself is traditional and centuries old; everything written here is
// our own, from the name down.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PIECES = 4;          // each player has four
export const HOME_SLOTS = 4;      // and four places to park them
export const LEG = 10;            // squares between one player's start and the next

/** The two boards: a cross for four, a hexagon for six. */
export const BOARDS = {
  cross: { id: 'cross', name: 'The cross', seats: 4, ring: 40 },
  hex:   { id: 'hex',   name: 'The hexagon', seats: 6, ring: 60 },
};

// Six colours nobody has to squint at. The two greens used to be a lime and a
// mint, which read as the same colour across a dark table.
export const TOKEN_COLOURS = [
  '#ff5d5d', '#b8f55a', '#2ec27e', '#ffd15c', '#c98bff', '#ff9c4d',
];

export const DEFAULT_SETTINGS = {
  board: 'cross',        // 'cross' (2–4) or 'hex' (2–6)
  threeTries: true,      // with everything in the yard you get three rolls to find a six
  mustCapture: false,    // if a move of yours would send somebody home, you have to take it
  sixMustExit: false,    // a six with a piece in the yard must bring it out
  exactHome: false,      // land in the home column exactly, or bounce back off the end
};

/** Where a piece is: in the yard, out on the ring, or parked at home. */
export const YARD = -1;
export const isYard = (d) => d === YARD;
export const isHome = (d, ring) => d >= ring;

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

export class GhahrGame {
  constructor(players, opts = {}) {
    this.rng = opts.rng || Math.random;
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
    const board = BOARDS[this.settings.board] || BOARDS.cross;
    this.board = board.id;
    this.ring = board.ring;
    this.seatsOnBoard = board.seats;

    this.players = players.map((p) => ({ ...p }));
    const n = this.players.length;
    if (n > board.seats) throw new Error(`${board.name} only seats ${board.seats}`);

    // Which quarter (or sixth) of the board each seat starts from. With fewer
    // players than the board holds, they are spread as far apart as they go.
    const step = Math.floor(board.seats / n);
    this.corner = this.players.map((_, i) => (i * step) % board.seats);

    this.pieces = this.players.map(() => Array(PIECES).fill(YARD));
    this.turn = 0;
    this.phase = 'roll';          // 'roll' | 'move' | 'game_over'
    this.die = null;
    this.tries = 0;               // rolls used this turn looking for a six
    this.moves = [];
    this.lastMove = null;
    this.lastRoll = null;
    this.moveId = 0;
    this.winner = null;
    this.finished = [];           // seats in the order they got everybody home
    this.log = [];
    this.note(`${this.players[0].name} starts. Roll a six to leave the yard.`);
  }

  note(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  }

  name(seat) { return this.players[seat] ? this.players[seat].name : `Seat ${seat + 1}`; }

  /** The square on the ring a piece of `seat` stands on at distance `d`. */
  square(seat, d) {
    if (d < 0 || d >= this.ring) return null;
    return (this.corner[seat] * LEG + d) % this.ring;
  }

  /** Which seat's start square this is, or null. */
  startOwner(sq) {
    const i = this.corner.findIndex((c) => (c * LEG) % this.ring === sq);
    return i === -1 ? null : i;
  }

  atSquare(sq) {
    for (let s = 0; s < this.players.length; s++) {
      for (let p = 0; p < PIECES; p++) {
        const d = this.pieces[s][p];
        if (d >= 0 && d < this.ring && this.square(s, d) === sq) return { seat: s, piece: p };
      }
    }
    return null;
  }

  homeCount(seat) { return this.pieces[seat].filter((d) => d >= this.ring).length; }
  yardCount(seat) { return this.pieces[seat].filter((d) => d === YARD).length; }
  allHome(seat) { return this.homeCount(seat) === PIECES; }

  /**
   * Every legal move for `seat` with `die`, before the house rules narrow it.
   * A move is { piece, from, to, kind, capture }.
   */
  legalMoves(seat, die) {
    const mine = this.pieces[seat];
    const out = [];
    const occupied = (d) => mine.some((x, p) => p !== undefined && x === d);

    for (let p = 0; p < PIECES; p++) {
      const from = mine[p];

      // out of the yard, on a six, if your own piece is not sitting on the start
      if (from === YARD) {
        if (die !== 6) continue;
        if (mine.some((x) => x === 0)) continue;
        const sq = this.square(seat, 0);
        const sitting = this.atSquare(sq);
        out.push({
          piece: p, from, to: 0, kind: 'exit',
          capture: sitting && sitting.seat !== seat ? sitting : null,
        });
        continue;
      }

      if (from >= this.ring) {
        // shuffling along inside the home column
        const target = from + die;
        const last = this.ring + HOME_SLOTS - 1;
        let to = target;
        if (target > last) {
          if (this.settings.exactHome) continue;
          to = 2 * last - target;                 // bounce off the back wall
          if (to < this.ring) continue;
        }
        if (mine.some((x) => x === to)) continue;
        out.push({ piece: p, from, to, kind: 'home', capture: null });
        continue;
      }

      // out on the ring
      const target = from + die;
      const last = this.ring + HOME_SLOTS - 1;
      if (target >= this.ring) {
        let to = target;
        if (target > last) {
          if (this.settings.exactHome) continue;
          to = 2 * last - target;
          if (to < this.ring) continue;
        }
        if (mine.some((x) => x === to)) continue;
        out.push({ piece: p, from, to, kind: 'home', capture: null });
        continue;
      }
      if (occupied(target)) continue;             // never two of yours on one square
      const sq = this.square(seat, target);
      const sitting = this.atSquare(sq);
      if (sitting && sitting.seat === seat) continue;
      out.push({
        piece: p, from, to: target, kind: sitting ? 'capture' : 'move',
        capture: sitting || null,
      });
    }

    return this.narrow(seat, die, this.dedupe(out));
  }

  /**
   * Four pieces sitting in the yard are the same piece as far as anybody cares.
   * Collapse moves that cannot be told apart, so nobody is asked to choose
   * between four identical things.
   */
  dedupe(list) {
    const seen = new Set();
    return list.filter((m) => {
      const key = `${m.from}|${m.to}|${m.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** The house rules, applied to a list of otherwise-legal moves. */
  narrow(seat, die, list) {
    let moves = list;
    if (this.settings.sixMustExit && die === 6) {
      const exits = moves.filter((m) => m.kind === 'exit');
      if (exits.length) moves = exits;
    }
    if (this.settings.mustCapture) {
      const takes = moves.filter((m) => m.capture);
      if (takes.length) moves = takes;
    }
    return moves;
  }

  /** Roll for `seat`. Forced values are for the tests. */
  roll(seat, forced = null) {
    if (this.phase === 'game_over') return { error: 'The game is over.' };
    if (this.phase !== 'roll') return { error: 'Not the moment to roll.' };
    if (seat !== this.turn) return { error: 'Not your turn.' };

    const die = forced || randInt(this.rng, 1, 6);
    this.die = die;
    this.tries += 1;
    const moves = this.legalMoves(seat, die);
    this.moves = moves;
    this.lastRoll = { id: ++this.moveId, seat, die, moves: moves.length };
    this.note(`${this.name(seat)} rolls ${die}.`);

    if (moves.length === 0) {
      // three rolls to find a six, but only while you have somebody in the yard
      const stuck = this.settings.threeTries && this.yardCount(seat) > 0 && this.tries < 3;
      if (stuck) {
        this.note(`Nothing to move — ${this.name(seat)} rolls again.`);
        return { ok: true, again: true };
      }
      if (die === 6) {
        this.note(`A six, but nowhere to put it.`);
      } else {
        this.note(`${this.name(seat)} cannot move.`);
      }
      this._endTurn();
      return { ok: true, passed: true };
    }

    if (moves.length === 1) {
      // no decision to make, so the table makes it
      return this.move(seat, moves[0].piece);
    }

    this.phase = 'move';
    return { ok: true, choose: true };
  }

  /** Move one of your pieces, having rolled. */
  move(seat, piece) {
    if (this.phase === 'game_over') return { error: 'The game is over.' };
    if (seat !== this.turn) return { error: 'Not your turn.' };
    if (this.die === null) return { error: 'Roll first.' };
    const m = this.moves.find((x) => x.piece === piece);
    if (!m) return { error: 'That piece cannot go anywhere with this roll.' };

    this.pieces[seat][piece] = m.to;
    let sentHome = null;
    if (m.capture) {
      this.pieces[m.capture.seat][m.capture.piece] = YARD;
      sentHome = m.capture;
      this.note(`${this.name(seat)} knocks ${this.name(m.capture.seat)} back to the yard.`);
    } else if (m.kind === 'exit') {
      this.note(`${this.name(seat)} brings a piece out.`);
    } else if (m.kind === 'home') {
      this.note(`${this.name(seat)} moves a piece into the home column.`);
    }

    const move = {
      id: ++this.moveId, seat, piece, die: this.die,
      from: m.from, to: m.to, kind: m.kind, sentHome,
      square: m.to < this.ring ? this.square(seat, m.to) : null,
    };
    this.lastMove = move;
    this.moves = [];

    if (this.allHome(seat) && !this.finished.includes(seat)) {
      this.finished.push(seat);
      this.note(`${this.name(seat)} is all the way home!`);
      if (this.winner === null) {
        this.winner = seat;
        this.phase = 'game_over';
        this.note(`${this.name(seat)} wins. Nobody sulk.`);
        return { ok: true, move, over: true };
      }
    }

    // a six earns another roll
    if (this.die === 6) {
      this.phase = 'roll';
      this.tries = 0;
      this.die = null;
      this.note(`A six — ${this.name(seat)} goes again.`);
      return { ok: true, move, again: true };
    }

    this._endTurn();
    return { ok: true, move };
  }

  _endTurn() {
    this.die = null;
    this.moves = [];
    this.tries = 0;
    this.phase = 'roll';
    const n = this.players.length;
    let next = this.turn;
    for (let k = 0; k < n; k++) {
      next = (next + 1) % n;
      if (!this.allHome(next)) break;
    }
    this.turn = next;
  }

  /** Ranked by pieces home, then by how far along the rest are. */
  standings() {
    return this.players
      .map((p, i) => ({
        seat: i,
        name: p.name,
        home: this.homeCount(i),
        progress: this.pieces[i].reduce((n, d) => n + (d === YARD ? 0 : d + 1), 0),
      }))
      .sort((a, b) => b.home - a.home || b.progress - a.progress);
  }

  publicState() {
    return {
      gameType: 'ghahr',
      phase: this.phase,
      board: this.board,
      ring: this.ring,
      seatsOnBoard: this.seatsOnBoard,
      homeSlots: HOME_SLOTS,
      leg: LEG,
      settings: this.settings,
      corner: this.corner,
      pieces: this.pieces.map((row) => row.slice()),
      turn: this.turn,
      die: this.die,
      tries: this.tries,
      moves: this.moves.map((m) => ({ piece: m.piece, from: m.from, to: m.to, kind: m.kind })),
      lastMove: this.lastMove,
      lastRoll: this.lastRoll,
      winner: this.winner,
      finished: this.finished.slice(),
      turnDeadline: this.turnDeadline || null,
      turnTotal: this.turnTotal || null,
      players: this.players.map((p, i) => ({
        seat: i,
        name: p.name,
        isBot: p.isBot,
        connected: p.connected !== false,
        colour: TOKEN_COLOURS[this.corner[i] % TOKEN_COLOURS.length],
        corner: this.corner[i],
        home: this.homeCount(i),
        yard: this.yardCount(i),
      })),
      log: this.log.slice(-12),
    };
  }

  viewFor(seat) {
    return { ...this.publicState(), seat: seat === null || seat === undefined ? null : seat };
  }
}
