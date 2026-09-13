// A bot for Ghahr Nakon. It plays the way a decent human plays: take the piece
// off somebody's head if you can, get out of the yard, get things home, and
// don't leave a piece sitting in front of an enemy's start.

import { PIECES, YARD } from './ghahr.js';

/** How badly a square wants to be left alone: 1 through 6 in front of a rival. */
function danger(g, seat, dist) {
  if (dist < 0 || dist >= g.ring) return 0;
  const sq = g.square(seat, dist);
  let worst = 0;
  for (let s = 0; s < g.players.length; s++) {
    if (s === seat) continue;
    for (let p = 0; p < PIECES; p++) {
      const d = g.pieces[s][p];
      if (d < 0 || d >= g.ring) continue;
      const theirs = g.square(s, d);
      const gap = (sq - theirs + g.ring) % g.ring;
      if (gap >= 1 && gap <= 6) worst = Math.max(worst, 7 - gap);
    }
    // a piece in their yard can come out on a six and take your start square
    if (g.yardCount(s) > 0) {
      const start = g.square(s, 0);
      if (start === sq) worst = Math.max(worst, 6);
    }
  }
  return worst;
}

/** What a move is worth. Bigger is better. */
export function scoreMove(g, seat, m) {
  let score = 0;
  if (m.kind === 'home') score += 60 + (m.to - g.ring) * 4;       // deeper is safer
  if (m.kind === 'exit') score += 45;
  if (m.capture) score += 80 + m.capture.piece;                    // knocking is always good
  // getting on with it
  score += (m.to - Math.max(0, m.from)) * 1.5;
  // and not standing somewhere obvious
  score -= danger(g, seat, m.to) * 6;
  score += danger(g, seat, m.from) * 4;                            // leaving a hot square is good
  // a piece almost home should finish rather than dawdle
  if (m.from >= 0 && m.from < g.ring && m.to >= g.ring) score += 25;
  return score;
}

/** The move this bot would make, or null when it has nothing to decide. */
export function pick(g, seat) {
  if (g.phase !== 'move' || g.turn !== seat) return null;
  const moves = g.moves;
  if (!moves.length) return null;
  let best = moves[0], bestScore = -Infinity;
  for (const m of moves) {
    const s = scoreMove(g, seat, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return { type: 'move', piece: best.piece };
}

/** What a bot should do right now: roll, or move a piece. */
export function act(g, seat) {
  if (g.phase === 'roll' && g.turn === seat) return { type: 'roll' };
  if (g.phase === 'move' && g.turn === seat) return pick(g, seat);
  return null;
}

export { YARD };
