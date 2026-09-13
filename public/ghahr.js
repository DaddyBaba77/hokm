/* Ghahr Nakon — قهر نکن. The table screen.
 *
 * The board itself is a real three-dimensional scene and lives in ghahr3d.js,
 * which is loaded the first time somebody actually sits down at a Ghahr table —
 * no other game pays for it. Everything else — whose turn it is, the side
 * panel, the log, the queue that plays each thing that happened in the order it
 * happened — is here.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  let socket = null, sound = null, toast = null;
  let S = null, boardKey = '';
  let board = null, loading = null, failed = false;
  let queue = [], running = false, seenMove = 0, seenRoll = 0;
  let facedSeat = null;

  const sfx = (n) => { if (sound && sound[n]) sound[n](); };
  const send = (msg) => { if (socket) socket.emit('ghahr', msg); };

  /* ── loading the scene, once, on demand ── */

  function ensureBoard() {
    if (board || loading || failed) return loading;
    const host = $('ghBoard');
    if (!host) return null;
    host.classList.add('loading');
    loading = import('./ghahr3d.js')
      .then((mod) => mod.createBoard({
        host,
        onPick: (seat, piece) => tryMove(seat, piece),
        onDrop: (seat, piece) => tryMove(seat, piece),
        onRollClick: () => { if (canRoll()) { sfx('dice'); send({ type: 'roll' }); } },
      }))
      .then((b) => b.modelReady.then(() => b))
      .then((b) => {
        board = b;
        host.classList.remove('loading');
        if (S) {
          boardKey = `${S.board}|${S.corner.join(',')}`;
          board.build(S);
          board.setPieces(S.pieces, true);
          faceMe();
          paint();
        }
        return b;
      })
      .catch((err) => {
        failed = true;
        host.classList.remove('loading');
        host.appendChild(el('p', 'gh-nowebgl',
          'This browser cannot draw the 3D board. Try a different one, or another device.'));
        console.error('[ghahr] the 3D board would not load:', err);
        return null;
      });
    return loading;
  }

  const canRoll = () =>
    S && S.seat !== null && S.seat !== undefined && S.seat === S.turn &&
    S.phase === 'roll' && !busy();

  const busy = () => running || queue.length > 0 || !!(board && board.busy);
  // You may take hold of a piece while the die is still tumbling — only a piece
  // actually walking the board stops you. Otherwise the press falls through to
  // the camera and swings the table round instead.
  const settling = () => !!(board && board.walking);

  function faceMe() {
    if (!board || !S) return;
    const seat = S.seat === null || S.seat === undefined ? 0 : S.seat;
    if (facedSeat === seat) return;
    facedSeat = seat;
    board.faceSeat(S.corner[seat]);
  }

  /* ── the queue: one thing at a time, in the order it happened ── */

  function enqueue(job) { queue.push(job); if (!running) drain(); }
  function drain() {
    if (!queue.length) { running = false; paint(); return; }
    running = true;
    queue.shift()(() => setTimeout(drain, 30));
  }

  /** The counter that shows the steps as a piece walks them. */
  function showStep(k, total) {
    const box = $('ghStep');
    if (!box) return;
    if (!total) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = '';
    box.appendChild(el('b', null, String(k)));
    box.appendChild(el('span', null, `of ${total}`));
  }
  const hideStep = () => { const b = $('ghStep'); if (b) b.classList.add('hidden'); };

  /* ── moving ── */

  const myMoves = () => (S && S.phase === 'move' && S.seat === S.turn ? S.moves : []);

  function tryMove(seat, piece) {
    if (settling()) return;
    if (seat !== S.seat) return;
    const m = myMoves().find((x) => x.piece === piece);
    if (!m) {
      if (myMoves().length) toastOnce('That one cannot go anywhere with this roll.');
      return;
    }
    sfx('flip');
    send({ type: 'move', piece });
  }

  let lastToast = 0;
  function toastOnce(msg) {
    if (Date.now() - lastToast < 2500) return;
    lastToast = Date.now();
    if (toast) toast(msg);
  }

  /** Somebody has just been sent back to the yard. */
  function showSulk(seat) {
    const pop = $('ghSulk');
    if (!pop || !S.players[seat]) return;
    pop.innerHTML = '';
    pop.appendChild(el('b', null, `${S.players[seat].name} goes back to the yard`));
    pop.appendChild(el('span', null, 'قهر نکن — don’t sulk'));
    pop.style.setProperty('--c', S.players[seat].colour);
    pop.classList.remove('hidden');
    void pop.offsetWidth;
    pop.classList.add('in');
    setTimeout(() => {
      pop.classList.remove('in');
      setTimeout(() => pop.classList.add('hidden'), 300);
    }, 1800);
  }

  /* ── painting the panel ── */

  function paint() {
    if (!S) return;
    const b = busy();
    if (board && !b) board.setPieces(S.pieces, false);

    // who is up
    const turnBox = $('ghTurn');
    const p = S.players[S.turn];
    turnBox.innerHTML = '';
    if (S.phase !== 'game_over' && p) {
      const dot = el('i');
      dot.style.background = p.colour;
      turnBox.appendChild(dot);
      turnBox.appendChild(el('b', 'gh-who', S.seat === S.turn ? 'Your turn' : p.name));
      turnBox.appendChild(el('span', 'gh-what', S.phase === 'roll' ? 'to roll' : 'to choose a piece'));
    }
    const name = $('ghBoardName');
    if (name) name.textContent = S.board === 'hex' ? 'The hexagon' : 'The cross';

    // which pieces you may take hold of, and where they could land
    if (board) {
      const mine = settling() ? [] : myMoves();
      board.showMoves(mine, S.seat);
      board.setPickable(mine.map((m) => board.pieceMesh(S.seat, m.piece)).filter(Boolean));
    }

    paintPlayers();
    paintActions(b);
    paintLog();

    const over = $('ghOver');
    if (S.phase === 'game_over') {
      $('ghOverTitle').textContent = S.winner !== null
        ? `${S.players[S.winner].name} gets everybody home` : 'Game over';
      const rows = S.players
        .map((q, i) => ({ q, i, home: S.pieces[i].filter((d) => d >= S.ring).length }))
        .sort((a, b2) => b2.home - a.home)
        .map(({ q, home }) => `${q.name} — ${home} of 4 home`);
      $('ghOverBody').textContent = rows.join('\n');
      over.classList.remove('hidden');
    } else over.classList.add('hidden');
  }

  function paintPlayers() {
    const box = $('ghPlayers');
    const key = S.players.map((p) => [p.name, p.home, p.yard, p.connected].join(',')).join('|') + '|' + S.turn;
    if (box.dataset.at === key) return;
    box.dataset.at = key;
    box.innerHTML = '';
    for (const p of S.players) {
      const row = el('div', 'gh-p' + (p.seat === S.turn && S.phase !== 'game_over' ? ' turn' : '')
        + (p.seat === S.seat ? ' me' : ''));
      row.style.setProperty('--c', p.colour);
      row.appendChild(el('i', 'gh-pdot'));
      const mid = el('div', 'gh-pmid');
      mid.appendChild(el('div', 'gh-pname', p.name));   // bot names already say so
      mid.appendChild(el('div', 'gh-psub',
        `${p.home} home · ${4 - p.home - p.yard} out · ${p.yard} in the yard`));
      row.appendChild(mid);
      const pips = el('div', 'gh-ppips');
      for (let k = 0; k < 4; k++) pips.appendChild(el('i', k < p.home ? 'on' : ''));
      row.appendChild(pips);
      box.appendChild(row);
    }
  }

  function paintActions(b) {
    const box = $('ghActions');
    const key = [S.phase, S.turn, S.seat, b, S.die, S.tries, S.moves.length].join('|');
    if (box.dataset.at === key) return;
    box.dataset.at = key;
    box.innerHTML = '';
    if (S.seat === null || S.seat === undefined || S.phase === 'game_over') return;
    if (S.turn !== S.seat) {
      box.appendChild(el('p', 'gh-wait', `Waiting on ${S.players[S.turn].name}.`));
      return;
    }
    if (S.phase === 'roll') {
      const btn = el('button', 'btn primary big', S.tries > 0 ? `Roll again (${3 - S.tries} left)` : 'Roll');
      btn.disabled = b;
      btn.addEventListener('click', () => { sfx('dice'); send({ type: 'roll' }); });
      box.appendChild(btn);
      box.appendChild(el('p', 'gh-hint', 'or throw the die on the table'));
      return;
    }
    box.appendChild(el('p', 'gh-pick', `You rolled ${S.die} — drag a piece to where it lands.`));
    const auto = el('button', 'btn ghost', 'Move it for me');
    auto.disabled = b || !S.moves.length;
    auto.addEventListener('click', () => {
      const best = S.moves.find((m) => m.kind === 'capture')
        || S.moves.find((m) => m.kind === 'home')
        || S.moves[0];
      if (best) tryMove(S.seat, best.piece);
    });
    box.appendChild(auto);
    box.appendChild(el('p', 'gh-hint', 'or tap a piece and it walks itself'));
  }

  function paintLog() {
    const box = $('ghLog');
    const key = S.log.join('|');
    if (box.dataset.at === key) return;
    box.dataset.at = key;
    box.innerHTML = '';
    for (const line of S.log.slice(-8)) box.appendChild(el('p', null, line));
    box.scrollTop = box.scrollHeight;
  }

  /* ── entry points ── */

  function init(deps) {
    socket = deps.socket; sound = deps.sound; toast = deps.toast;
  }

  function render(state) {
    S = state;
    if (!board) { ensureBoard(); paint(); return; }

    const key = `${state.board}|${state.corner.join(',')}`;
    if (boardKey !== key) {
      boardKey = key;
      facedSeat = null;
      queue = []; running = false; seenMove = 0; seenRoll = 0;
      board.build(S);
      board.setPieces(S.pieces, true);
    }
    faceMe();

    if (S.lastRoll && S.lastRoll.id > seenRoll) {
      const roll = S.lastRoll;
      seenRoll = roll.id;
      enqueue((done) => { sfx('dice'); board.rollDie(roll.die, done); });
    }
    if (S.lastMove && S.lastMove.id > seenMove) {
      const move = S.lastMove;
      seenMove = move.id;
      enqueue((done) => {
        sfx('hop');
        board.walk(move, showStep, () => {
          hideStep();
          if (move.sentHome) { sfx('illegal'); showSulk(move.sentHome.seat); }
          done();
        });
      });
    }
    paint();
  }

  function reset() {
    boardKey = '';
    queue = []; running = false; seenMove = 0; seenRoll = 0;
    S = null; facedSeat = null;
    hideStep();
    if (board) { board.dispose(); board = null; }
    loading = null; failed = false;
    const host = $('ghBoard');
    if (host) host.innerHTML = '';
  }

  // handy when something on the board misbehaves and you are in the console
  window.Ghahr = { init, render, reset, board: () => board, state: () => S };
})();
