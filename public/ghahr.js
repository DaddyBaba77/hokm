/* Ghahr Nakon — قهر نکن. The table screen.
 *
 * Two boards live here. The cross is laid out on the 11×11 grid everybody who
 * has played this game would recognise; the hexagon is worked out with a bit of
 * trigonometry. Both end up as the same three lists of points, so everything
 * downstream — squares, pieces, moves — is written once.
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
  let S = null, built = false, boardKey = '';
  let squares = [], homeCells = [], yardCells = [], tokens = [];
  let layout = null;
  let shown = [];                       // where each piece is drawn, which lags the state
  let queue = [], running = false, seenMove = 0, seenRoll = 0;
  let picking = null;                   // the piece the mouse is hovering over

  const sfx = (n) => { if (sound && sound[n]) sound[n](); };
  const send = (msg) => { if (socket) socket.emit('ghahr', msg); };

  /* ── the cross, square by square, clockwise from the left arm ── */
  const CROSS_RING = [
    [4,0],[4,1],[4,2],[4,3],[4,4],[3,4],[2,4],[1,4],[0,4],[0,5],
    [0,6],[1,6],[2,6],[3,6],[4,6],[4,7],[4,8],[4,9],[4,10],[5,10],
    [6,10],[6,9],[6,8],[6,7],[6,6],[7,6],[8,6],[9,6],[10,6],[10,5],
    [10,4],[9,4],[8,4],[7,4],[6,4],[6,3],[6,2],[6,1],[6,0],[5,0],
  ];
  const CROSS_HOME = [
    [[5,1],[5,2],[5,3],[5,4]],
    [[1,5],[2,5],[3,5],[4,5]],
    [[5,9],[5,8],[5,7],[5,6]],
    [[9,5],[8,5],[7,5],[6,5]],
  ];
  const CROSS_YARD = [
    [[1,1],[1,2],[2,1],[2,2]],
    [[1,8],[1,9],[2,8],[2,9]],
    [[8,8],[8,9],[9,8],[9,9]],
    [[8,1],[8,2],[9,1],[9,2]],
  ];

  const cell = (rc) => ({ x: ((rc[1] + 0.5) / 11) * 100, y: ((rc[0] + 0.5) / 11) * 100 });

  /** Both boards, reduced to the same three lists of points on a 0–100 square. */
  function makeLayout(board, ring) {
    if (board === 'cross') {
      return {
        unit: 100 / 11,
        padScale: 3.1,
        candle: 2.2,
        ring: CROSS_RING.map(cell),
        home: CROSS_HOME.map((col) => col.map(cell)),
        yard: CROSS_YARD.map((y) => y.map(cell)),
      };
    }
    // The hexagon: six sides of ten, a home column radiating in from each corner.
    // The radius is what it is because the yards have to sit outside the ring and
    // still land inside the board — a wider hexagon pushes them off the top.
    const R = 34, cx = 50, cy = 50;
    const vertex = (k) => {
      const a = (-90 + k * 60) * Math.PI / 180;
      return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    };
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const ringPts = [];
    for (let i = 0; i < ring; i++) {
      const side = Math.floor(i / 10);
      ringPts.push(lerp(vertex(side), vertex(side + 1), (i % 10) / 10));
    }
    const home = [], yard = [];
    for (let c = 0; c < 6; c++) {
      const v = vertex(c);
      home.push([0.76, 0.57, 0.38, 0.19].map((t) => ({
        x: cx + (v.x - cx) * t, y: cy + (v.y - cy) * t,
      })));
      // a little cluster of four just outside the corner
      const out = { x: cx + (v.x - cx) * 1.16, y: cy + (v.y - cy) * 1.16 };
      const a = (-90 + c * 60) * Math.PI / 180;
      const ox = Math.cos(a + Math.PI / 2) * 3.9, oy = Math.sin(a + Math.PI / 2) * 3.9;
      const ix = Math.cos(a) * 3.9, iy = Math.sin(a) * 3.9;
      yard.push([
        { x: out.x - ox - ix, y: out.y - oy - iy },
        { x: out.x + ox - ix, y: out.y + oy - iy },
        { x: out.x - ox + ix, y: out.y - oy + iy },
        { x: out.x + ox + ix, y: out.y + oy + iy },
      ]);
    }
    return { unit: 100 / 14, padScale: 2.5, candle: 2.4, ring: ringPts, home, yard };
  }

  /** Where a piece at distance `d` should be drawn. */
  function pointFor(corner, d, pieceIndex) {
    if (d === -1) return layout.yard[corner][pieceIndex];
    if (d >= S.ring) return layout.home[corner][d - S.ring];
    return layout.ring[(corner * S.leg + d) % S.ring];
  }

  /* ── building the board ── */

  function buildBoard() {
    const board = $('ghBoard');
    board.innerHTML = '';
    board.classList.toggle('hex', S.board === 'hex');
    layout = makeLayout(S.board, S.ring);
    squares = []; homeCells = []; yardCells = [];

    const place = (node, pt, scale = 1) => {
      node.style.left = pt.x + '%';
      node.style.top = pt.y + '%';
      node.style.setProperty('--u', (layout.unit * scale).toFixed(3) + '%');
      board.appendChild(node);
    };

    // No two candles gutter together. A cheap hash off the position gives every
    // square its own offset and its own speed, so the ring breathes unevenly.
    let flick = 0;
    const gutter = (node) => {
      const h = Math.sin(++flick * 12.9898) * 43758.5453;
      const f = h - Math.floor(h);
      node.style.setProperty('--fd', (-f * 7).toFixed(2) + 's');
      node.style.setProperty('--fs', (3.4 + f * 3.6).toFixed(2) + 's');
      node.style.setProperty('--fl', (0.74 + f * 0.34).toFixed(2));
    };

    // the yards first, so everything else sits over them
    for (let c = 0; c < layout.yard.length; c++) {
      const seat = S.corner.indexOf(c);
      const pad = el('div', 'gh-yardpad' + (seat === -1 ? ' idle' : ''));
      pad.style.setProperty('--c', seat === -1 ? 'rgba(255,255,255,.09)' : S.players[seat].colour);
      const mid = layout.yard[c].reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
      place(pad, mid, layout.padScale);
      const row = [];
      for (let p = 0; p < 4; p++) {
        const n = el('div', 'gh-sq gh-yard');
        n.style.setProperty('--c', seat === -1 ? 'rgba(255,255,255,.14)' : S.players[seat].colour);
        place(n, layout.yard[c][p]);
        gutter(n);
        row.push(n);
      }
      yardCells.push(row);
    }

    // the home columns
    for (let c = 0; c < layout.home.length; c++) {
      const seat = S.corner.indexOf(c);
      const row = [];
      for (let k = 0; k < layout.home[c].length; k++) {
        const n = el('div', 'gh-sq gh-home' + (seat === -1 ? ' idle' : ''));
        n.style.setProperty('--c', seat === -1 ? 'rgba(255,255,255,.12)' : S.players[seat].colour);
        place(n, layout.home[c][k]);
        gutter(n);
        row.push(n);
      }
      homeCells.push(row);
    }

    // and the ring
    for (let i = 0; i < S.ring; i++) {
      const corner = i % S.leg === 0 ? i / S.leg : -1;
      const seat = corner === -1 ? -1 : S.corner.indexOf(corner);
      const n = el('div', 'gh-sq gh-track' + (corner === -1 ? '' : ' gh-start'));
      if (corner !== -1) {
        n.style.setProperty('--c', seat === -1 ? 'rgba(255,255,255,.16)' : S.players[seat].colour);
        if (seat === -1) n.classList.add('idle');
      }
      n.dataset.sq = String(i);
      place(n, layout.ring[i]);
      gutter(n);
      squares.push(n);
    }

    // the candle the whole room is lit by
    const wick = el('div', 'gh-candle');
    wick.appendChild(el('i', 'gh-flame'));
    wick.style.setProperty('--u', (layout.unit * layout.candle).toFixed(3) + '%');
    wick.style.left = '50%';
    wick.style.top = '50%';
    board.appendChild(wick);

    const tok = el('div', 'gh-tokens');
    tok.id = 'ghTokens';
    board.appendChild(tok);
    tokens = [];
    built = true;
    boardKey = `${S.board}|${S.corner.join(',')}`;
  }

  function syncTokens() {
    const layerNode = $('ghTokens');
    if (!layerNode) return;
    const want = S.players.length * 4;
    if (tokens.length !== want) {
      layerNode.innerHTML = '';
      tokens = [];
      shown = [];
      S.players.forEach((p, seat) => {
        for (let i = 0; i < 4; i++) {
          const t = el('button', 'gh-piece');
          t.type = 'button';
          t.style.setProperty('--c', p.colour);
          t.style.setProperty('--u', (layout.unit * 0.86).toFixed(3) + '%');
          t.title = p.name;
          t.dataset.seat = String(seat);
          t.dataset.piece = String(i);
          t.addEventListener('click', () => onPieceClick(seat, i));
          layerNode.appendChild(t);
          tokens.push(t);
          shown.push(S.pieces[seat][i]);
        }
      });
    }
  }

  const tokenAt = (seat, piece) => tokens[seat * 4 + piece];

  /** Put every piece where `shown` says it is. */
  function placePieces(instant) {
    if (!layout) return;
    S.players.forEach((p, seat) => {
      for (let i = 0; i < 4; i++) {
        const t = tokenAt(seat, i);
        if (!t) continue;
        const pt = pointFor(S.corner[seat], shown[seat * 4 + i], i);
        t.style.transition = instant ? 'none' : '';
        t.style.left = pt.x + '%';
        t.style.top = pt.y + '%';
        if (instant) requestAnimationFrame(() => { t.style.transition = ''; });
      }
    });
  }

  /* ── animation ── */

  function enqueue(job) { queue.push(job); if (!running) drain(); }
  function drain() {
    if (!queue.length) { running = false; paint(); return; }
    running = true;
    queue.shift()(() => setTimeout(drain, 30));
  }

  const STEP_MS = 190;

  /** Walk a piece square by square so you can see where it went. */
  function animateMove(move, done) {
    const idx = move.seat * 4 + move.piece;
    const t = tokens[idx];
    if (!t) { done(); return; }
    const corner = S.corner[move.seat];

    if (move.kind === 'exit') {
      shown[idx] = move.to;
      t.classList.add('hop');
      placePieces(false);
      sfx('hop');
      setTimeout(() => { t.classList.remove('hop'); finish(); }, 480);
      return;
    }

    const path = [];
    for (let d = move.from + 1; d <= move.to; d++) path.push(d);
    // a bounce off the back of the home column walks in and then back out
    if (move.to < move.from) {
      path.length = 0;
      const last = S.ring + S.homeSlots - 1;
      for (let d = move.from + 1; d <= last; d++) path.push(d);
      for (let d = last - 1; d >= move.to; d--) path.push(d);
    }
    let k = 0;
    const hop = () => {
      if (k >= path.length) { finish(); return; }
      shown[idx] = path[k++];
      placePieces(false);
      sfx('hop');
      setTimeout(hop, Math.max(90, Math.min(STEP_MS, 1600 / Math.max(1, path.length))));
    };
    if (!path.length) { finish(); return; }
    hop();

    function finish() {
      shown[idx] = move.to;
      placePieces(false);
      if (move.sentHome) {
        const victim = move.sentHome.seat * 4 + move.sentHome.piece;
        const v = tokens[victim];
        if (v) {
          v.classList.add('knocked');
          setTimeout(() => v.classList.remove('knocked'), 600);
        }
        shown[victim] = -1;
        placePieces(false);
        sfx('illegal');
        showSulk(move.sentHome.seat);
      }
      if (move.kind === 'home') { t.classList.add('landed'); setTimeout(() => t.classList.remove('landed'), 600); }
      setTimeout(done, 340);
    }
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

  /* ── the die ── */

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function setDie(n) {
    const d = $('ghDie');
    if (!d) return;
    d.innerHTML = '';
    for (let k = 0; k < 9; k++) {
      const pip = el('i');
      if (!PIPS[n] || !PIPS[n].includes(k)) pip.style.visibility = 'hidden';
      d.appendChild(pip);
    }
    d.dataset.n = String(n || '');
  }

  function animateRoll(roll, done) {
    const box = $('ghDicebox');
    if (!box) { done(); return; }
    box.classList.remove('landed');
    box.classList.add('rolling');
    sfx('dice');
    let ticks = 0;
    const spin = setInterval(() => {
      setDie(1 + Math.floor(Math.random() * 6));
      if (++ticks > 7) {
        clearInterval(spin);
        setDie(roll.die);
        box.classList.remove('rolling');
        box.classList.add('landed');
        box.classList.toggle('six', roll.die === 6);
        setTimeout(done, 420);
      }
    }, 70);
  }

  /* ── picking a piece ── */

  const myMoves = () => (S && S.phase === 'move' && S.seat === S.turn ? S.moves : []);

  function onPieceClick(seat, piece) {
    if (running || queue.length) return;
    if (seat !== S.seat) return;
    const m = myMoves().find((x) => x.piece === piece);
    if (!m) {
      const any = myMoves().length;
      if (any) toastOnce('That one cannot go anywhere with this roll.');
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

  /* ── painting ── */

  function paint() {
    if (!S || !built) return;
    const busy = running || queue.length > 0;
    if (!busy) {
      S.players.forEach((p, seat) => {
        for (let i = 0; i < 4; i++) shown[seat * 4 + i] = S.pieces[seat][i];
      });
      placePieces(false);
    }

    // who is up
    const turnBox = $('ghTurn');
    const p = S.players[S.turn];
    turnBox.innerHTML = '';
    if (S.phase !== 'game_over' && p) {
      const dot = el('i');
      dot.style.background = p.colour;
      turnBox.appendChild(dot);
      turnBox.appendChild(el('b', 'gh-who', S.seat === S.turn ? 'Your turn' : p.name));
      turnBox.appendChild(el('span', 'gh-what',
        S.phase === 'roll' ? 'to roll' : 'to choose a piece'));
    }

    // the pieces you could move
    const mine = myMoves();
    const can = new Set(mine.map((m) => m.piece));
    tokens.forEach((t) => {
      const seat = Number(t.dataset.seat), i = Number(t.dataset.piece);
      const live = !busy && seat === S.seat && can.has(i);
      t.classList.toggle('canmove', live);
      t.classList.toggle('mine', seat === S.seat);
      t.classList.toggle('home', S.pieces[seat][i] >= S.ring);
      t.disabled = !live;
    });
    // and where they would land
    squares.forEach((n) => n.classList.remove('target', 'take'));
    homeCells.forEach((col) => col.forEach((n) => n.classList.remove('target')));
    if (!busy) {
      for (const m of mine) {
        if (m.to >= S.ring) {
          const cellNode = homeCells[S.corner[S.seat]] && homeCells[S.corner[S.seat]][m.to - S.ring];
          if (cellNode) cellNode.classList.add('target');
        } else {
          const sq = squares[(S.corner[S.seat] * S.leg + m.to) % S.ring];
          if (sq) sq.classList.add(m.kind === 'capture' ? 'take' : 'target');
        }
      }
    }

    paintPlayers();
    paintActions(busy);
    paintLog();

    const over = $('ghOver');
    if (S.phase === 'game_over') {
      $('ghOverTitle').textContent = S.winner !== null
        ? `${S.players[S.winner].name} gets everybody home` : 'Game over';
      const rows = S.players
        .map((q, i) => ({ q, i, home: S.pieces[i].filter((d) => d >= S.ring).length }))
        .sort((a, b) => b.home - a.home)
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
      mid.appendChild(el('div', 'gh-pname', p.name + (p.isBot ? ' (bot)' : '')));
      mid.appendChild(el('div', 'gh-psub',
        `${p.home} home · ${4 - p.home - p.yard} out · ${p.yard} in the yard`));
      row.appendChild(mid);
      const pips = el('div', 'gh-ppips');
      for (let k = 0; k < 4; k++) pips.appendChild(el('i', k < p.home ? 'on' : ''));
      row.appendChild(pips);
      box.appendChild(row);
    }
  }

  function paintActions(busy) {
    const box = $('ghActions');
    const key = [S.phase, S.turn, S.seat, busy, S.die, S.tries].join('|');
    if (box.dataset.at === key) return;
    box.dataset.at = key;
    box.innerHTML = '';
    if (S.seat === null || S.seat === undefined || S.phase === 'game_over') return;
    if (S.turn !== S.seat) {
      box.appendChild(el('p', 'gh-wait', `Waiting on ${S.players[S.turn].name}.`));
      return;
    }
    if (S.phase === 'roll') {
      const b = el('button', 'btn primary big', S.tries > 0 ? `Roll again (${3 - S.tries} left)` : 'Roll');
      b.disabled = busy;
      b.addEventListener('click', () => { sfx('dice'); send({ type: 'roll' }); });
      box.appendChild(b);
    } else {
      box.appendChild(el('p', 'gh-pick', `You rolled ${S.die} — pick a piece to move.`));
    }
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
    const first = !built || boardKey !== `${state.board}|${state.corner.join(',')}`;
    S = state;
    if (first) { buildBoard(); syncTokens(); placePieces(true); }
    syncTokens();

    if (S.lastRoll && S.lastRoll.id > seenRoll) {
      const roll = S.lastRoll;
      seenRoll = roll.id;
      enqueue((done) => animateRoll(roll, done));
    }
    if (S.lastMove && S.lastMove.id > seenMove) {
      const move = S.lastMove;
      seenMove = move.id;
      enqueue((done) => animateMove(move, done));
    }
    setDie(S.die || (S.lastRoll ? S.lastRoll.die : null));
    paint();
  }

  function reset() {
    built = false; boardKey = '';
    squares = []; homeCells = []; yardCells = []; tokens = []; shown = [];
    queue = []; running = false; seenMove = 0; seenRoll = 0;
    S = null; layout = null; picking = null;
    const b = $('ghBoard');
    if (b) b.innerHTML = '';
  }

  window.Ghahr = { init, render, reset };
})();
