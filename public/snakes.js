/* Snakes and Ladders — board, tokens and animation. */
(function () {
  'use strict';

  const SQUARES = 100;
  const COLS = 10;
  const U = 100;              // one cell in viewBox units
  const SIDE = COLS * U;      // 1000
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  let socket = null, sound = null, toast = null;

  /* ── geometry ───────────────────────────────────────────────────────────── */

  function cell(n) {
    const row = Math.floor((n - 1) / COLS);
    const within = (n - 1) % COLS;
    const col = row % 2 === 0 ? within : COLS - 1 - within;
    return { row, col };
  }
  /** Centre of a square in viewBox coordinates (row 0 is the bottom row). */
  function centre(n) {
    const { row, col } = cell(n);
    return { x: col * U + U / 2, y: (COLS - 1 - row) * U + U / 2 };
  }

  const el = (name, attrs = {}) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const rotAbout = (x, y, a, cx, cy) => [
    cx + x * Math.cos(a) - y * Math.sin(a),
    cy + x * Math.sin(a) + y * Math.cos(a),
  ];
  const poly = (pts) => 'M ' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ' Z';

  /** A smooth curve through points, so the snakes slither rather than zig-zag. */
  function spline(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  /* ── drawing ────────────────────────────────────────────────────────────── */

  /**
   * Eight snakes drawn from life rather than from a pattern book: each one uses
   * the markings of a real species — crossbands, saddles, a dorsal stripe, a
   * diamondback's rattle — built up as layered strokes along the body.
   */
  const SPECIES = [
    { name: 'California Mountain Kingsnake', base: '#efe6d2', dark: '#2a231a', viper: false,
      marks: [ { kind: 'band', c: '#161310', thick: 26, spacing: 62, start: 30, edge: null },
               { kind: 'band', c: '#ab2f25', thick: 20, spacing: 62, start: 61, edge: '#161310' } ] },
    { name: 'Eastern Garter Snake', base: '#3a4430', dark: '#1c2114', viper: false,
      stripe: { c: '#ddc95f', w: 8 }, flank: { c: '#96a165', w: 3.6 },
      marks: [ { kind: 'fleck', c: '#171b10', thick: 9, spacing: 26, start: 20 } ] },
    { name: 'Corn Snake', base: '#d9843f', dark: '#7c3d16', viper: false,
      marks: [ { kind: 'saddle', c: '#9d2418', thick: 30, spacing: 54, start: 34, edge: '#2b170e' } ] },
    { name: 'Northern Pacific Rattlesnake', base: '#a1917a', dark: '#4c4436', viper: true, rattle: true,
      marks: [ { kind: 'diamond', c: '#4f4636', thick: 34, spacing: 58, start: 36, edge: '#d6cbb0' } ] },
    { name: 'Rough Green Snake', base: '#4ba63e', dark: '#2b6725', viper: false,
      stripe: { c: '#9fe07e', w: 4 } },
    { name: 'Copperhead', base: '#cfa57f', dark: '#7b5133', viper: true,
      marks: [ { kind: 'hourglass', c: '#8a5333', thick: 24, spacing: 56, start: 32, edge: '#5d3720' } ] },
    { name: 'Black Racer', base: '#26282d', dark: '#0d0e11', viper: false,
      stripe: { c: '#464c57', w: 5 } },
    { name: 'San Francisco Garter Snake', base: '#2c748f', dark: '#163f4d', viper: false,
      stripe: { c: '#bb3a2b', w: 9 }, flank: { c: '#efd977', w: 3.6 },
      marks: [ { kind: 'fleck', c: '#10333f', thick: 8, spacing: 24, start: 18 } ] },
  ];

  /** Local frame of the body at a distance along it. */
  function atDist(path, total, dist, wMax) {
    const d = Math.max(0, Math.min(total, dist));
    const p = path.getPointAtLength(d);
    const q = path.getPointAtLength(Math.min(total, d + 2));
    const r = path.getPointAtLength(Math.max(0, d - 2));
    const tx = q.x - r.x, ty = q.y - r.y, m = Math.hypot(tx, ty) || 1;
    return { x: p.x, y: p.y, nx: -ty / m, ny: tx / m, w: widthAt(d / total, wMax) };
  }

  // how wide a marking is across the body, as it runs from its front to its back edge
  const PROFILE = {
    band:      () => 1.08,
    fleck:     () => 0.42,
    saddle:    (u) => 0.26 + 0.52 * Math.sin(u * Math.PI),
    diamond:   (u) => 0.05 + 0.95 * Math.sin(u * Math.PI),
    hourglass: (u) => 1.02 - 0.72 * Math.sin(u * Math.PI),
  };

  /** One marking, laid across the body and following its curve. */
  function markPath(path, total, dist, mark, wMax) {
    const prof = PROFILE[mark.kind] || PROFILE.band;
    const steps = 6;
    const L = [], Rt = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const s2 = atDist(path, total, dist - mark.thick / 2 + mark.thick * u, wMax);
      const w = s2.w * prof(u);
      L.push([s2.x + s2.nx * w, s2.y + s2.ny * w]);
      Rt.push([s2.x - s2.nx * w, s2.y - s2.ny * w]);
    }
    return 'M ' + L.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L ')
         + ' L ' + Rt.reverse().map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L ') + ' Z';
  }

  /** Overlapping scales, defined once and reused by every snake. */
  function ensureScaleTexture(svg) {
    if (svg.querySelector('#scaleTex')) return;
    const defs = el('defs');
    const pat = el('pattern', { id: 'scaleTex', width: 15, height: 12, patternUnits: 'userSpaceOnUse' });
    pat.appendChild(el('path', { d: 'M-7.5,12 a7.5,6.4 0 0 1 15,0 M7.5,12 a7.5,6.4 0 0 1 15,0', class: 'scale-row' }));
    pat.appendChild(el('path', { d: 'M0,6 a7.5,6.4 0 0 1 15,0 M-15,6 a7.5,6.4 0 0 1 15,0', class: 'scale-row' }));
    defs.appendChild(pat);
    svg.appendChild(defs);
  }

  /** Head outline — vipers get the broad wedge, colubrids a narrower snout. */
  function skullPath(R, rx, ry, viper) {
    const prof = viper
      ? [[rx, 0.2], [rx * 0.58, 0.66], [rx * 0.05, 1], [-rx * 0.5, 0.98], [-rx, 0.5]]
      : [[rx, 0.22], [rx * 0.6, 0.6], [rx * 0.02, 0.9], [-rx * 0.58, 0.84], [-rx, 0.42]];
    const top = prof.map(([x, f]) => R(x, -ry * f));
    const bot = prof.slice().reverse().map(([x, f]) => R(x, ry * f));
    return [...top, ...bot];
  }

  function drawLadder(svg, bottom, top, i) {
    const a = centre(bottom), b = centre(top);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;                 // perpendicular
    const w = 15;                            // half the rail spacing

    const g = el('g', { class: 'sl-ladder' });
    for (const s of [-1, 1]) {
      g.appendChild(el('line', {
        x1: a.x + px * w * s, y1: a.y + py * w * s,
        x2: b.x + px * w * s, y2: b.y + py * w * s,
        class: 'rail',
      }));
    }
    const rungs = Math.max(3, Math.round(len / 46));
    for (let k = 1; k < rungs; k++) {
      const t = k / rungs;
      const cx = a.x + dx * t, cy = a.y + dy * t;
      g.appendChild(el('line', {
        x1: cx + px * w, y1: cy + py * w, x2: cx - px * w, y2: cy - py * w, class: 'rung',
      }));
    }
    g.dataset.from = bottom;
    svg.appendChild(g);
    return { g, a, b };
  }

  /** Body thickness along the snake: a slight neck, full girth, tapering to the tail. */
  function widthAt(f, wMax) {
    const neck = Math.min(1, 0.70 + f * 4.5);
    const taper = 1 - 0.86 * Math.pow(f, 1.8);
    return wMax * neck * taper;
  }

  function drawSnake(svg, head, tail, i) {
    const sp = SPECIES[i % SPECIES.length];
    const skin = sp.base, dark = sp.dark;
    const h = centre(head), t = centre(tail);
    const dx = t.x - h.x, dy = t.y - h.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;

    const waves = Math.max(2, Math.round(len / 150));
    const amp = Math.min(58, 26 + len * 0.07);
    const pts = [];
    const steps = waves * 2 + 2;
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const off = k === 0 || k === steps ? 0 : Math.sin(f * Math.PI * waves) * amp;
      pts.push([h.x + dx * f + px * off, h.y + dy * f + py * off]);
    }

    const g = el('g', { class: 'sl-snake' });
    g.dataset.head = head;
    g.appendChild(el('title')).textContent = `${sp.name} — ${head} down to ${tail}`;
    const d = spline(pts);

    // the centreline: invisible, but it is what a swallowed token travels along
    const body = el('path', { d, class: 'snake-spine' });
    g.appendChild(body);

    // a real snake tapers, so the body is a filled outline rather than a stroke
    const total = body.getTotalLength();
    const N = 110;
    const wMax = 25;
    const left = [], right = [];
    for (let k = 0; k <= N; k++) {
      const f = k / N;
      const p = body.getPointAtLength(total * f);
      const q = body.getPointAtLength(total * Math.min(1, f + 0.004));
      const r = body.getPointAtLength(total * Math.max(0, f - 0.004));
      const tx = q.x - r.x, ty = q.y - r.y;
      const m = Math.hypot(tx, ty) || 1;
      const nx = -ty / m, ny = tx / m;
      const w = widthAt(f, wMax);
      left.push([p.x + nx * w, p.y + ny * w]);
      right.push([p.x - nx * w, p.y - ny * w]);
    }
    const shape = 'M ' + left.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')
                + ' L ' + right.reverse().map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ' Z';

    const clipId = `snakeclip${head}`;
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('path', { d: shape }));
    g.appendChild(clip);

    g.appendChild(el('path', { d: shape, class: 'snake-skin', fill: skin, stroke: dark }));

    // markings, scales and shading, all clipped to the body outline
    ensureScaleTexture(svg);
    const marks = el('g', { 'clip-path': `url(#${clipId})` });

    for (const mk of sp.marks || []) {
      for (let dist = mk.start; dist < total - 6; dist += mk.spacing) {
        const d2 = markPath(body, total, dist, mk, wMax);
        if (mk.edge) marks.appendChild(el('path', { d: d2, fill: mk.edge, stroke: mk.edge, 'stroke-width': 6, class: 'mark-edge' }));
        marks.appendChild(el('path', { d: d2, fill: mk.c, class: 'mark-fill' }));
      }
    }

    if (sp.stripe) marks.appendChild(el('path', { d, class: 'snake-stripe', stroke: sp.stripe.c, 'stroke-width': sp.stripe.w }));
    if (sp.flank) {
      for (const side of [-1, 1]) {
        const shifted = spline(pts.map(([x, y], k) => {
          const n = pts[Math.min(k + 1, pts.length - 1)], q = pts[Math.max(k - 1, 0)];
          const ux = n[0] - q[0], uy = n[1] - q[1], m = Math.hypot(ux, uy) || 1;
          return [x + (-uy / m) * 10 * side, y + (ux / m) * 10 * side];
        }));
        marks.appendChild(el('path', { d: shifted, class: 'snake-stripe', stroke: sp.flank.c, 'stroke-width': sp.flank.w }));
      }
    }

    marks.appendChild(el('path', { d: shape, class: 'snake-scaletex' }));       // scale texture
    marks.appendChild(el('path', { d: shape, class: 'snake-edgeshade' }));      // rounded edges
    marks.appendChild(el('path', { d, class: 'snake-spinelight' }));            // light along the back
    g.appendChild(marks);

    if (sp.rattle) {
      const end = pts[pts.length - 1], prev = pts[pts.length - 2];
      const ang0 = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      for (let k = 0; k < 4; k++) {
        const off = 10 + k * 11;
        const cx = end[0] + Math.cos(ang0) * off, cy = end[1] + Math.sin(ang0) * off;
        g.appendChild(el('ellipse', {
          cx, cy, rx: 8 - k * 1.3, ry: 6.4 - k * 0.9, class: 'rattle',
          transform: `rotate(${(ang0 * 180) / Math.PI} ${cx} ${cy})`,
        }));
      }
    }

    /* ── the head ── */
    const ang = Math.atan2(pts[1][1] - h.y, pts[1][0] - h.x) + Math.PI;
    const R = (x, y) => rotAbout(x, y, ang, h.x, h.y);
    const L = sp.viper ? 52 : 56;            // snout to neck
    const W = sp.viper ? 21 : 15;            // half width at the widest
    const originStyle = `transform-origin:${h.x.toFixed(1)}px ${h.y.toFixed(1)}px`;
    const headG = el('g', { class: 'snake-head', style: originStyle });

    // the dark inside of the mouth, revealed only when the jaws open
    headG.appendChild(el('path', {
      d: poly([R(2, -W * 0.8), R(L * 0.92, -W * 0.3), R(L * 0.92, W * 0.3), R(2, W * 0.8)]),
      class: 'gape',
    }));

    const jawPts = (sgn) => [R(4, sgn * 3), R(L * 0.55, sgn * W * 0.95), R(L * 0.98, sgn * 5), R(L * 0.9, sgn * 1)];
    for (const [cls, sgn, fill] of [['jaw-lower', 1, dark], ['jaw-upper', -1, skin]]) {
      const jaw = el('g', { class: `jaw ${cls}`, style: originStyle });
      jaw.appendChild(el('path', { d: poly(jawPts(sgn)), fill, stroke: dark, 'stroke-width': 1.5 }));
      jaw.appendChild(el('path', { d: poly([R(L * 0.74, sgn * 9), R(L * 0.83, sgn * 3), R(L * 0.86, sgn * 11)]), class: 'fang' }));
      headG.appendChild(jaw);
    }

    headG.appendChild(el('path', {
      d: `M ${R(L * 0.9, 0)[0]},${R(L * 0.9, 0)[1]} L ${R(L + 30, 0)[0]},${R(L + 30, 0)[1]}`
       + ` M ${R(L + 30, 0)[0]},${R(L + 30, 0)[1]} L ${R(L + 48, -11)[0]},${R(L + 48, -11)[1]}`
       + ` M ${R(L + 30, 0)[0]},${R(L + 30, 0)[1]} L ${R(L + 48, 11)[0]},${R(L + 48, 11)[1]}`,
      class: 'tongue',
    }));

    // skull: a lance for vipers, a narrower oval for the rest
    const prof = sp.viper
      ? [[-10, 0.42], [4, 0.92], [20, 1.0], [34, 0.78], [46, 0.42], [L, 0.13]]
      : [[-10, 0.5], [4, 0.86], [20, 1.0], [34, 0.88], [46, 0.58], [L, 0.17]];
    const top = prof.map(([x, f]) => R(x, -W * f));
    const bot = prof.slice().reverse().map(([x, f]) => R(x, W * f));
    headG.appendChild(el('path', { d: poly([...top, ...bot]), class: 'skull', fill: skin, stroke: dark }));

    headG.appendChild(el('path', {
      d: poly([R(2, -W * 0.52), R(20, -W * 0.62), R(40, -W * 0.34), R(38, -W * 0.1), R(16, -W * 0.2), R(0, -W * 0.16)]),
      class: 'head-gloss',
    }));

    // the closed mouth line, so a resting snake reads as jaws shut
    headG.appendChild(el('path', {
      d: `M ${R(2, W * 0.5)[0]},${R(2, W * 0.5)[1]} Q ${R(28, W * 0.72)[0]},${R(28, W * 0.72)[1]} ${R(L * 0.95, W * 0.16)[0]},${R(L * 0.95, W * 0.16)[1]}`,
      class: 'mouthline', stroke: dark,
    }));
    if (sp.bands && sp.bands.length) {
      headG.appendChild(el('path', {
        d: poly([R(-4, -W * 0.72), R(16, -W * 0.9), R(16, W * 0.9), R(-4, W * 0.72)]),
        fill: sp.bands[0].c, opacity: .8, 'clip-path': 'none',
      }));
    }

    // eyes: small, set high on the head, amber with a slit pupil on the vipers
    for (const side of [-1, 1]) {
      const [ex, ey] = R(16, side * W * 0.74);
      headG.appendChild(el('circle', { cx: ex, cy: ey, r: sp.viper ? 5.4 : 5, class: 'eye-ball' }));
      if (sp.viper) {
        headG.appendChild(el('ellipse', {
          cx: ex, cy: ey, rx: 1.5, ry: 4, class: 'pupil',
          transform: `rotate(${(ang * 180) / Math.PI + 90} ${ex} ${ey})`,
        }));
      } else {
        headG.appendChild(el('circle', { cx: ex, cy: ey, r: 2.7, class: 'pupil' }));
      }
      const [gx, gy] = R(14.4, side * W * 0.74 - 1.4);
      headG.appendChild(el('circle', { cx: gx, cy: gy, r: 1.2, class: 'glint' }));
      const [nx2, ny2] = R(L * 0.8, side * W * 0.3);
      headG.appendChild(el('circle', { cx: nx2, cy: ny2, r: 1.5, class: 'nostril' }));
      if (sp.viper) {
        const [hx, hy] = R(L * 0.58, side * W * 0.62);
        headG.appendChild(el('circle', { cx: hx, cy: hy, r: 2.1, class: 'pit' }));
      }
    }
    g.appendChild(headG);
    svg.appendChild(g);
    return { g, body, headG, species: sp.name };
  }

  /* ── the board ──────────────────────────────────────────────────────────── */

  let boardKey = '';
  const snakeEls = new Map();   // head square -> { g, body, headG }
  const ladderEls = new Map();  // bottom square -> { g, a, b }

  function buildBoard(board) {
    const key = JSON.stringify(board);
    if (key === boardKey) return;
    boardKey = key;
    snakeEls.clear();
    ladderEls.clear();

    const grid = $('slGrid');
    grid.innerHTML = '';
    for (let row = COLS - 1; row >= 0; row--) {
      for (let c = 0; c < COLS; c++) {
        // the numbering snakes: odd rows run right to left
        const n = row * COLS + (row % 2 === 0 ? c : COLS - 1 - c) + 1;
        const d = document.createElement('div');
        d.className = 'sl-cell' + ((row + c) % 2 ? ' alt' : '') + (n === SQUARES ? ' finish' : '');
        d.dataset.n = n;
        d.innerHTML = `<span>${n}</span>`;
        grid.appendChild(d);
      }
    }

    const svg = $('slArt');
    svg.setAttribute('viewBox', `0 0 ${SIDE} ${SIDE}`);
    svg.innerHTML = '';
    Object.entries(board.ladders).forEach(([from, to], i) => {
      ladderEls.set(Number(from), drawLadder(svg, Number(from), Number(to), i));
    });
    Object.entries(board.snakes).forEach(([head, tail], i) => {
      snakeEls.set(Number(head), drawSnake(svg, Number(head), Number(tail), i));
    });
  }

  /* ── tokens ─────────────────────────────────────────────────────────────── */

  const tokens = new Map(); // seat -> element
  let shown = [];           // what the tokens currently display

  function tokenXY(seat, square, players) {
    const board = $('slBoard').getBoundingClientRect();
    const scale = board.width / SIDE;
    if (square < 1) {
      // waiting to start: lined up along the bottom edge, inside the frame
      const row = seat < 4 ? 0 : 1;
      return { x: (44 + (seat % 4) * 48) * scale, y: (912 + row * 46) * scale };
    }
    const sharing = players.filter((q) => shown[q.seat] === square).map((q) => q.seat);
    const idx = Math.max(0, sharing.indexOf(seat));
    const n = Math.max(1, sharing.length);
    const p = centre(square);
    if (n === 1) return { x: p.x * scale, y: p.y * scale };
    const a = (idx / n) * Math.PI * 2 - Math.PI / 2;
    const r = 20;
    return { x: (p.x + Math.cos(a) * r) * scale, y: (p.y + Math.sin(a) * r) * scale };
  }

  function placeToken(seat, square, players, instant) {
    const t = tokens.get(seat);
    if (!t) return;
    const { x, y } = tokenXY(seat, square, players);
    if (instant) t.style.transition = 'none';
    t.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    if (instant) { void t.offsetWidth; t.style.transition = ''; }
  }

  function syncTokens(g) {
    const layer = $('slTokens');
    for (const [seat, node] of tokens) {
      if (!g.players[seat]) { node.remove(); tokens.delete(seat); }
    }
    g.players.forEach((p) => {
      let t = tokens.get(p.seat);
      if (!t) {
        t = document.createElement('div');
        t.className = 'sl-token';
        t.innerHTML = `<span>${(p.name.trim()[0] || '?').toUpperCase()}</span>`;
        layer.appendChild(t);
        tokens.set(p.seat, t);
      }
      t.style.setProperty('--tcol', p.colour);
      t.classList.toggle('me', p.seat === g.seat);
      t.classList.toggle('active', p.seat === g.turn && g.phase === 'playing');
      t.title = p.name;
    });
  }

  /* ── animation ──────────────────────────────────────────────────────────── */

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let queue = [];
  let running = false;
  let seenMove = 0;
  let liveState = null;

  async function hopAlong(seat, squares, players) {
    for (const sq of squares) {
      shown[seat] = sq;
      placeToken(seat, sq, players);
      const t = tokens.get(seat);
      if (t) { t.classList.add('hop'); setTimeout(() => t.classList.remove('hop'), 150); }
      sound && sound.hop && sound.hop();
      await wait(145);
    }
  }

  async function travelPath(seat, pathEl, from01, to01, ms, players) {
    const t = tokens.get(seat);
    const board = $('slBoard').getBoundingClientRect();
    const scale = board.width / SIDE;
    const total = pathEl.getTotalLength();
    const t0 = performance.now();
    t.style.transition = 'none';
    await new Promise((done) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const f = from01 + (to01 - from01) * k;
        const pt = pathEl.getPointAtLength(total * f);
        t.style.transform = `translate(${pt.x * scale}px, ${pt.y * scale}px) translate(-50%, -50%)`;
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    t.style.transition = '';
    void t.offsetWidth;
  }

  async function playMove(move, g) {
    const players = g.players;
    const board = $('slBoard');

    // the die tumbles, then settles on what was rolled
    const die = $('slDie');
    die.classList.add('rolling');
    sound && sound.dice && sound.dice();
    await wait(620);
    die.classList.remove('rolling');
    setDieFace(die, move.die);
    die.classList.add('landed');
    setTimeout(() => die.classList.remove('landed'), 400);
    await wait(260);

    if (move.kind === 'forfeit') {
      const t = tokens.get(move.seat);
      if (t) { t.classList.add('puff'); setTimeout(() => t.classList.remove('puff'), 600); }
      shown[move.seat] = move.to;
      placeToken(move.seat, move.to, players);
      toast && toast('Three sixes — turn forfeited!');
      await wait(700);
      return;
    }

    // hop square by square, bouncing off 100 if the roll overshot
    const path = [];
    if (move.bounced) {
      for (let n = move.from + 1; n <= SQUARES; n++) path.push(n);
      for (let n = SQUARES - 1; n >= move.landed; n--) path.push(n);
    } else {
      for (let n = move.from + 1; n <= move.landed; n++) path.push(n);
    }
    await hopAlong(move.seat, path, players);

    if (move.kind === 'ladder') {
      const L = ladderEls.get(move.landed);
      if (L) L.g.classList.add('lit');
      sound && sound.climb && sound.climb();
      const t = tokens.get(move.seat);
      if (t) t.classList.add('climbing');
      shown[move.seat] = move.to;
      placeToken(move.seat, move.to, players);
      await wait(760);
      if (t) t.classList.remove('climbing');
      if (L) setTimeout(() => L.g.classList.remove('lit'), 500);
      return;
    }

    if (move.kind === 'snake') {
      const S = snakeEls.get(move.landed);
      const t = tokens.get(move.seat);
      // the bite
      if (S) S.g.classList.add('biting');
      sound && sound.hiss && sound.hiss();
      await wait(240);
      if (S) S.g.classList.add('chomp');
      sound && sound.bite && sound.bite();
      board.classList.add('shake');
      if (t) t.classList.add('bitten');
      await wait(360);
      board.classList.remove('shake');
      if (S) S.g.classList.remove('chomp');

      // dragged down the body to the tail
      if (S && t) {
        t.classList.add('swallowed');
        await travelPath(move.seat, S.body, 0, 1, 1000, players);
        t.classList.remove('swallowed');
      }
      if (t) t.classList.remove('bitten');
      if (S) S.g.classList.remove('biting');
      shown[move.seat] = move.to;
      placeToken(move.seat, move.to, players, true);
      await wait(220);
      return;
    }

    shown[move.seat] = move.to;
    placeToken(move.seat, move.to, players);
    await wait(160);
  }

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) {
      const { move, g } = queue.shift();
      try { await playMove(move, g); } catch (err) { console.error('[snakes]', err); }
      paint(liveState, true);
    }
    running = false;
    paint(liveState, true);
  }

  /* ── dice face ──────────────────────────────────────────────────────────── */

  const PIPS = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  };
  function setDieFace(node, n) {
    node.innerHTML = (PIPS[n] || PIPS[1])
      .map(([c, r]) => `<i style="grid-column:${c + 1};grid-row:${r + 1}"></i>`).join('');
    node.dataset.face = n;
  }

  /* ── render ─────────────────────────────────────────────────────────────── */

  function paint(S, quiet) {
    if (!S || !S.game) return;
    const g = S.game;
    buildBoard(g.board);
    syncTokens(g);

    if (shown.length !== g.players.length) shown = g.positions.slice();
    if (!running) {
      g.players.forEach((p) => {
        if (shown[p.seat] !== p.position) {
          shown[p.seat] = p.position;
          placeToken(p.seat, p.position, g.players, true);
        }
      });
    }
    g.players.forEach((p) => placeToken(p.seat, shown[p.seat], g.players, quiet !== true));

    // side panel
    const list = $('slPlayers');
    list.innerHTML = g.players.map((p) => `
      <div class="sl-player${p.seat === g.turn ? ' turn' : ''}${p.seat === g.seat ? ' me' : ''}${p.seat === g.winner ? ' won' : ''}">
        <i style="--tcol:${p.colour}">${escapeHtml((p.name.trim()[0] || '?').toUpperCase())}</i>
        <span class="nm">${escapeHtml(p.name)}${p.seat === g.seat ? ' (you)' : ''}</span>
        <b>${p.position}</b>
      </div>`).join('');

    const myTurn = g.phase === 'playing' && g.turn === g.seat && !running;
    const btn = $('slRoll');
    btn.disabled = !myTurn;
    btn.textContent = myTurn ? (g.sixStreak > 0 ? 'Roll again' : 'Roll') : 'Roll';

    const who = g.players[g.turn];
    $('slTurn').textContent =
      g.phase === 'game_over'
        ? `${g.players[g.winner].name} wins!`
        : myTurn ? 'Your turn — roll the die'
        : who ? `${who.name}'s turn…` : '';

    $('slStreak').textContent = g.sixStreak > 0 ? `${g.sixStreak} six${g.sixStreak > 1 ? 'es' : ''} in a row` : '';

    const over = g.phase === 'game_over';
    $('slOver').classList.toggle('hidden', !over || running);
    if (over) {
      const mine = g.seat !== null && g.winner === g.seat;
      $('slOverTitle').textContent = mine ? 'You win!' : `${g.players[g.winner].name} wins`;
      $('slOverBody').textContent = mine
        ? 'First to 100 — nobody bitten at the last moment.'
        : `${g.players[g.winner].name} reached 100 first.`;
      $('slAgain').classList.toggle('hidden', !S.isHost);
    }

    const ll = $('logList');
    if (ll) {
      ll.innerHTML = [
        ...g.log.map((t) => `<div class="entry">${escapeHtml(t)}</div>`),
        ...S.chat.map((c) => `<div class="entry chat"><b>${escapeHtml(c.name)}:</b> ${escapeHtml(c.text)}</div>`),
      ].join('');
      ll.scrollTop = ll.scrollHeight;
    }
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── public surface ─────────────────────────────────────────────────────── */

  window.Snakes = {
    init(deps) {
      socket = deps.socket; sound = deps.sound; toast = deps.toast;
      $('slRoll').onclick = () => { if (socket) socket.emit('roll'); };
      $('slAgain').onclick = () => { if (socket) socket.emit('newGame'); };
      setDieFace($('slDie'), 1);
      window.addEventListener('resize', () => { if (liveState) paint(liveState, true); });
    },
    render(S) {
      liveState = S;
      const g = S.game;
      if (g && g.lastMove && g.lastMove.id > seenMove) {
        seenMove = g.lastMove.id;
        queue.push({ move: g.lastMove, g });
        paint(S, true);
        drain();
        return;
      }
      paint(S);
    },
    reset() {
      queue = []; running = false; seenMove = 0; boardKey = ''; shown = [];
      tokens.forEach((t) => t.remove());
      tokens.clear();
    },
  };
})();
