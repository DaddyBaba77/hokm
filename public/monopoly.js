/* Bazaar — the board, the pieces and the panels.
 *
 * The server owns every rule; this file only draws what it is told and sends
 * back what the player clicked. The board data itself comes from
 * /bazaar-board.json so the deeds on screen are the same objects the rules use.
 */
window.Bazaar = (function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const COIN = '◈';
  const money = (n) => COIN + Math.round(n).toLocaleString('en-US');

  let META = null;                  // { board, groups, rails, utils, railRent }
  let socket = null, sound = null, toast = null;
  const send = (msg) => { if (socket) socket.emit('act', msg); };
  const sfx = (name) => { if (sound && sound[name]) sound[name](); };
  let S = null;                     // latest game state
  let built = false;
  let cells = [];                   // one DOM node per space
  let tokens = [];                  // one DOM node per player
  let shown = [];                   // where each token is drawn right now
  let queue = [], running = false;
  let seenMove = 0, seenCard = 0, seenOffer = 0;
  let deedOpen = null;              // which deed card is on screen
  let deedFace = false;             // showing the painting rather than the rents
  let throwEnergy = 0.4;            // how hard the last throw was shaken, 0–1
  let peekSeat = null;              // whose hand the left rail is showing, null = yours
  let tradeWith = null;             // trade panel target

  // ─────────────────────────────────────────── geometry

  /** Which edge of the board a space sits on. */
  function sideOf(i) {
    if (i === 0 || i === 10 || i === 20 || i === 30) return 'corner';
    if (i < 10) return 'bottom';
    if (i < 20) return 'left';
    if (i < 30) return 'top';
    return 'right';
  }

  /** Grid cell (1-based row/column in the 11×11 frame). */
  function gridAt(i) {
    if (i === 0) return { r: 11, c: 11 };
    if (i < 10) return { r: 11, c: 11 - i };
    if (i === 10) return { r: 11, c: 1 };
    if (i < 20) return { r: 11 - (i - 10), c: 1 };
    if (i === 20) return { r: 1, c: 1 };
    if (i < 30) return { r: 1, c: 1 + (i - 20) };
    if (i === 30) return { r: 1, c: 11 };
    return { r: 1 + (i - 30), c: 11 };
  }

  // ─────────────────────────────────────────── building the board

  // What colour the one accent shape in each drawing is painted.
  const TINTS = {
    rail: '#9a7434', tax: '#7d8ea6', fortune: '#e07a2a', treasury: '#4f9bd0',
    go: '#1f7a45', jail: '#8a5a2b', parking: '#b8862a', gotojail: '#b8302a',
  };
  function tintFor(sp) {
    if (sp.type === 'street') return META.groups[sp.group].colour;
    if (sp.type === 'utility') return sp.i === 12 ? '#e6bd6d' : '#4aa3d6';
    if (sp.type === 'tax') return sp.tax === 200 ? '#7d8ea6' : '#b8302a';
    return TINTS[sp.type] || '#9a7434';
  }

  // Squares John has drawn himself: the picture is the whole tile, title
  // included, so nothing of ours goes on top of it.
  const PHOTOS = {
    0:  'tiles/go.jpg',
    10: 'tiles/dungeon.jpg',
    20: 'tiles/teahouse.jpg',
    30: 'tiles/gotojail.jpg',
  };

  // A painting of the real place for every street and every metro station.
  /**
   * John's painted cards, one per space. Each comes in two cuts: a tall one for
   * the top and bottom rails, a wide one for the left and right, so the picture
   * always fills the shape of the square it is sitting in.
   */
  const STREET_ART = {
    1:  'shoush',       3:  'narmak',
    5:  'rail-south',
    6:  'ekbatan',      8:  'kargar',      9:  'enghelab',
    11: 'baghegolha',   12: 'electric',    13: 'gisha',       14: 'azadi',
    15: 'rail-west',
    16: 'darkeh',       18: 'gheytarieh',  19: 'tajrish',
    21: 'valiasr',      23: 'vanak',       24: 'saadatabad',
    25: 'rail-north',
    26: 'pasdaran',     27: 'jordan',      28: 'water',       29: 'velenjak',
    31: 'niavaran',     32: 'farmanieh',   34: 'zafaranieh',
    35: 'rail-east',
    37: 'elahieh',      39: 'fereshteh',
    2: 'treasury', 17: 'treasury', 33: 'treasury',
    7: 'fortune',  22: 'fortune',  36: 'fortune',
    4: 'tax',      38: 'tax',
  };
  /** which cut a square wants: the side rails are wide, the others are tall */
  const artFor = (i) => {
    const slug = STREET_ART[i];
    if (!slug) return null;
    const side = sideOf(i);
    return `streets/${slug}-${side === 'left' || side === 'right' ? 'l' : 'p'}.webp`;
  };

  function makeCell(sp) {
    const side = sideOf(sp.i);
    const cell = el('div', `sq s-${side} t-${sp.type}`);
    cell.dataset.i = sp.i;
    const pos = gridAt(sp.i);
    cell.style.gridRow = pos.r;
    cell.style.gridColumn = pos.c;
    cell.style.setProperty('--c', tintFor(sp));

    if (PHOTOS[sp.i]) {
      cell.classList.add('has-photo');
      cell.style.setProperty('--photo', `url("${PHOTOS[sp.i]}")`);
      cell.title = sp.name;
      cell.appendChild(el('div', 'own'));
      return cell;
    }

    if (sp.type === 'street') {
      const band = el('div', 'band');
      band.appendChild(el('div', 'blds'));
      cell.appendChild(band);
    }

    // A square John painted a card for: the card is the face of the square, and
    // the name and the price sit on a strip of parchment across the bottom of it.
    const art = artFor(sp.i);
    if (art) {
      cell.classList.add('art');
      if (sp.type !== 'street') cell.classList.add('noband');
      cell.style.setProperty('--img', `url("${art}")`);
      cell.appendChild(el('div', 'pic'));
      const cap = el('div', 'cap');
      if (sp.price) cap.appendChild(el('div', 'ownmark'));
      const nm = el('div', 'nm');
      // the side rails are wide enough for one line; the tall squares may wrap
      if (side === 'left' || side === 'right') nm.appendChild(el('span', null, sp.name));
      else for (const word of sp.name.split(' ')) nm.appendChild(el('span', null, word));
      cap.appendChild(nm);
      // the price is a chip perched on the strip's right shoulder, out of the
      // flow so it never squeezes the name (the two decks need none — their
      // painting says what they are)
      if (sp.price) cap.appendChild(el('div', 'pr', money(sp.price)));
      else if (sp.tax) cap.appendChild(el('div', 'pr', money(sp.tax)));
      if (sp.price) cell.appendChild(el('div', 'ownband'));
      cell.appendChild(cap);
      cell.appendChild(el('div', 'own'));
      cell.appendChild(el('div', 'mortmark', 'MORTGAGED'));
      cell.title = sp.name;
      if (sp.price) cell.addEventListener('click', () => openDeed(sp.i));
      return cell;
    }

    const inner = el('div', 'sq-in');

    if (side === 'corner') {
      inner.classList.add('corner-in');
      const plate = el('div', 'plate');
      plate.innerHTML = window.BazaarArt ? window.BazaarArt.motif(sp.i) : '';
      inner.appendChild(plate);
      inner.appendChild(el('div', 'cn-fa', sp.fa));
      inner.appendChild(el('div', 'cn-name', sp.name));
      const note = { go: `Collect ${money(200)}`, jail: 'just visiting',
        parking: 'rest here', gotojail: 'straight there' }[sp.type];
      if (note) inner.appendChild(el('div', 'cn-note', note));
    } else {
      const txt = el('div', 'txt');
      if (sp.fa) txt.appendChild(el('div', 'fa', sp.fa));
      // Each word gets its own span so the name can be fitted to the square by
      // measurement rather than guesswork — see fitNames().
      const nm = el('div', 'nm');
      for (const word of sp.name.split(' ')) nm.appendChild(el('span', null, word));
      txt.appendChild(nm);
      inner.appendChild(txt);
      const plate = el('div', 'plate');
      const art = artFor(sp.i);
      if (art) {
        plate.classList.add('pic');
        plate.style.setProperty('--img', `url("${art}")`);
      } else {
        plate.innerHTML = window.BazaarArt ? window.BazaarArt.motif(sp.i) : '';
      }
      inner.appendChild(plate);
      if (sp.price) inner.appendChild(el('div', 'pr', money(sp.price)));
      else if (sp.tax) inner.appendChild(el('div', 'pr', `pay ${money(sp.tax)}`));
      else inner.appendChild(el('div', 'pr ghosted', sp.type === 'fortune' ? 'take a card' : 'take a card'));
    }

    cell.appendChild(inner);
    cell.appendChild(el('div', 'own'));
    cell.appendChild(el('div', 'mortmark', 'MORTGAGED'));
    if (sp.price) cell.addEventListener('click', () => openDeed(sp.i));
    return cell;
  }

  function centrePiece() {
    const c = el('div', 'mono-centre');
    c.innerHTML = '<div class="mc-art"></div>';
    return c;
  }

  // a proper six-sided cube, so a roll actually tumbles
  const FACES = [
    { n: 1, place: 'translateZ(var(--half))',                 show: [0, 0] },
    { n: 6, place: 'rotateY(180deg) translateZ(var(--half))', show: [0, 180] },
    { n: 3, place: 'rotateY(90deg) translateZ(var(--half))',  show: [0, -90] },
    { n: 4, place: 'rotateY(-90deg) translateZ(var(--half))', show: [0, 90] },
    { n: 2, place: 'rotateX(90deg) translateZ(var(--half))',  show: [-90, 0] },
    { n: 5, place: 'rotateX(-90deg) translateZ(var(--half))', show: [90, 0] },
  ];
  const PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  function buildDie(node) {
    node.innerHTML = '';
    for (const f of FACES) {
      const face = el('div', 'die-face');
      face.style.transform = f.place;
      for (let k = 0; k < 9; k++) {
        const pip = el('i');
        if (!PIPS[f.n].includes(k)) pip.style.visibility = 'hidden';
        face.appendChild(pip);
      }
      node.appendChild(face);
    }
    node.dataset.spin = '0';
  }
  function setDieFace(node, n, extra, energy = 0.4, ms = 800) {
    const f = FACES.find((x) => x.n === n) || FACES[0];
    const spins = Number(node.dataset.spin || 0) + 1;
    node.dataset.spin = spins;
    // the harder you shook it, the more it tumbles before it settles
    const turns = 360 * (2 + Math.round(energy * 5) + (extra % 2));
    node.style.transitionDuration = ms + 'ms';
    node.style.transform = `rotateX(${f.show[0] + turns}deg) rotateY(${f.show[1] + turns}deg)`;
  }

  function buildBoard() {
    const board = $('mBoard');
    board.innerHTML = '';
    cells = [];
    for (const sp of META.board) {
      const cell = makeCell(sp);
      cells[sp.i] = cell;
      board.appendChild(cell);
    }
    board.appendChild(centrePiece());
    const layer = el('div', 'mono-tokens');
    layer.id = 'mTokens';
    board.appendChild(layer);
    buildDie($('die1'));
    buildDie($('die2'));
    bindDice();
    bindView();
    applyView(false);
    built = true;
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
  }

  /** Cache the pixel centre of every square, and tell the CSS how deep an edge cell is. */
  let centres = [];
  let edgeW = 40, edgeH = 64;
  function measure() {
    if (!built) return;
    const board = $('mBoard');
    // offsetLeft/Top are layout pixels, so these stay correct however far the
    // board is zoomed in
    centres = cells.map((cell) => ({
      x: cell.offsetLeft + cell.offsetWidth / 2,
      y: cell.offsetTop + cell.offsetHeight / 2,
      w: cell.offsetWidth,
      h: cell.offsetHeight,
    }));
    const edge = centres[1];
    if (edge && edge.w) {
      edgeW = edge.w; edgeH = edge.h;
      boardSize = board.offsetWidth;
      board.style.setProperty('--ew', edge.w + 'px');
      board.style.setProperty('--ed', edge.h + 'px');
    }
    fitNames();
    if (!viewSet && boardSize) {
      viewSet = true;
      // a phone needs the whole board; a desktop can afford to start close in
      const v = viewBox();
      zoom = v.width < 560 ? 1 : DEFAULT_ZOOM;
      const mine = S && S.seat !== null && S.players[S.seat] ? S.players[S.seat].pos : 0;
      if (zoom > 1) centreOn(mine); else applyView(false);
    } else {
      applyView(false);
    }
    placeTokens(true);
  }

  /**
   * Set every street name as large as its square can actually take. Names are
   * allowed to wrap between words, never inside one — a "MIRDAM / AD" reads as
   * a mistake. Measured rather than estimated, so it holds for any font.
   */
  function fitNames() {
    const names = [];
    for (const cell of cells) {
      if (!cell) continue;
      const nm = cell.querySelector('.nm');
      if (nm) { nm.style.setProperty('--nms', '1'); names.push(nm); }
    }
    // one read pass, then one write pass, so the browser reflows once
    const fits = names.map((nm) => {
      let widest = 0;
      for (const word of nm.children) widest = Math.max(widest, word.offsetWidth);
      return widest > 0 ? Math.min(1, (nm.clientWidth * 0.96) / widest) : 1;
    });
    names.forEach((nm, i) => nm.style.setProperty('--nms', fits[i].toFixed(3)));
  }

  // ─────────────────────────────────────────── zoom and pan

  let zoom = 1, panX = 0, panY = 0, boardSize = 0, follow = true, viewSet = false;
  const MIN_ZOOM = 1, MAX_ZOOM = 3.6;
  // Nine squares and two corners can only be so wide at a given board size, so
  // the squares get their size from the zoom instead: the table opens reading
  // distance from your own piece, and Fit pulls back to the whole board.
  const DEFAULT_ZOOM = 1.65;

  function viewBox() {
    const v = $('mView');
    return v ? v.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
  }

  /** Keep the board covering the window; at fit size it just sits still. */
  function clampPan() {
    if (!boardSize) { panX = 0; panY = 0; return; }
    const v = viewBox();
    const w = boardSize * zoom;
    const slackX = v.width - w, slackY = v.height - w;
    panX = slackX >= 0 ? slackX / 2 : Math.min(0, Math.max(slackX, panX));
    panY = slackY >= 0 ? slackY / 2 : Math.min(0, Math.max(slackY, panY));
  }

  function applyView(smooth) {
    const board = $('mBoard'), v = $('mView');
    if (!board) return;
    clampPan();
    board.style.transition = smooth ? 'transform .28s cubic-bezier(.25,.9,.3,1)' : 'none';
    board.style.transform = `translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px) scale(${zoom})`;
    if (v) v.classList.toggle('zoomed', zoom > 1.001);
    const out = $('mZoomOut'), inn = $('mZoomIn');
    if (out) out.disabled = zoom <= MIN_ZOOM + 0.001;
    if (inn) inn.disabled = zoom >= MAX_ZOOM - 0.001;
  }

  /** Zoom about a point given in client coordinates. */
  function zoomAt(clientX, clientY, factor, smooth) {
    const v = viewBox();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (Math.abs(next - zoom) < 0.0005) return;
    const px = clientX - v.left, py = clientY - v.top;
    // hold whatever is under the pointer still
    panX = px - (px - panX) * (next / zoom);
    panY = py - (py - panY) * (next / zoom);
    zoom = next;
    applyView(smooth);
  }

  function setZoom(next, smooth) {
    const v = viewBox();
    zoomAt(v.left + v.width / 2, v.top + v.height / 2, next / zoom, smooth);
  }

  /** Put a square in the middle of the window. */
  function centreOn(square) {
    if (!boardSize || !centres[square]) return;
    const v = viewBox();
    panX = v.width / 2 - centres[square].x * zoom;
    panY = v.height / 2 - centres[square].y * zoom;
    applyView(false);
  }

  /** Slide a square into view, if we are zoomed in far enough to need it. */
  function ensureVisible(square) {
    if (!follow || zoom <= 1.001 || !centres[square]) return;
    const v = viewBox();
    const c = centres[square];
    const x = c.x * zoom + panX, y = c.y * zoom + panY;
    const m = Math.min(v.width, v.height) * 0.22;
    let dx = 0, dy = 0;
    if (x < m) dx = m - x; else if (x > v.width - m) dx = v.width - m - x;
    if (y < m) dy = m - y; else if (y > v.height - m) dy = v.height - m - y;
    if (dx || dy) { panX += dx; panY += dy; applyView(true); }
  }

  function bindView() {
    const v = $('mView');
    if (!v || v.dataset.bound) return;
    v.dataset.bound = '1';

    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016), false);
    }, { passive: false });

    const pointers = new Map();
    let pinchFrom = 0, last = null;
    v.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mono-zoom')) return;   // the controls are not the board
      // let the squares keep their clicks; only drag with the background or when zoomed
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { last = { x: e.clientX, y: e.clientY, moved: 0 }; }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchFrom = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    v.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const now = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchFrom > 0) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, now / pinchFrom, false);
          pinchFrom = now;
        }
        return;
      }
      if (!last || zoom <= 1.001) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last.moved += Math.abs(dx) + Math.abs(dy);
      if (last.moved > 4) {
        v.classList.add('dragging');
        v.setPointerCapture(e.pointerId);
        panX += dx; panY += dy;
        applyView(false);
      }
      last.x = e.clientX; last.y = e.clientY;
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchFrom = 0;
      if (pointers.size === 0) { v.classList.remove('dragging'); last = null; }
    };
    v.addEventListener('pointerup', release);
    v.addEventListener('pointercancel', release);
    // a drag across a square shouldn't also open its deed card
    v.addEventListener('click', (e) => {
      if (last && last.moved > 4) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    v.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, zoom > 1.5 ? 1 / zoom : 1.9, true));

    $('mZoomIn').addEventListener('click', () => setZoom(zoom * 1.35, true));
    $('mZoomOut').addEventListener('click', () => setZoom(zoom / 1.35, true));
    $('mZoomFit').addEventListener('click', () => { zoom = 1; panX = panY = 0; applyView(true); });
    $('mFollow').addEventListener('click', () => {
      follow = !follow;
      $('mFollow').classList.toggle('on', follow);
      if (follow && S) ensureVisible(S.players[S.turn] ? S.players[S.turn].pos : 0);
    });
    window.addEventListener('resize', () => applyView(false));
  }

  // ─────────────────────────────────────────── tokens

  const pieceImg = (id) => `url("pieces/${id}.webp")`;

  function syncTokens() {
    const layer = $('mTokens');
    if (!layer) return;
    if (tokens.length !== S.players.length) {
      layer.innerHTML = '';
      tokens = S.players.map((p) => {
        const t = el('div', 'tok');
        t.style.setProperty('--c', p.colour);
        t.style.setProperty('--piece', pieceImg(p.token || 'lion'));
        t.title = p.name;
        layer.appendChild(t);
        return t;
      });
      shown = S.players.map((p) => p.pos);
    }
    S.players.forEach((p, i) => {
      tokens[i].classList.toggle('bust', !!p.bust);
      tokens[i].classList.toggle('mine', S.seat === i);
      tokens[i].classList.toggle('turn', S.turn === i && S.phase !== 'over');
    });
  }

  /** Fan the tokens that share a square so none hides another. */
  function placeTokens(instant) {
    if (!centres.length || !tokens.length) return;
    const bySquare = {};
    shown.forEach((sq, i) => {
      if (S && S.players[i] && S.players[i].bust) return;
      (bySquare[sq] ||= []).push(i);
    });
    for (const [sqKey, list] of Object.entries(bySquare)) {
      const c = centres[Number(sqKey)];
      if (!c) continue;
      const n = list.length;
      const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
      // sized off a standard edge square, not this one, so the big corners
      // don't end up with pieces large enough to hide what they are standing on
      const unit = Math.min(edgeW, edgeH);
      const size = unit * (n > 4 ? 0.4 : 0.5);
      // pieces stand on the inner half of a square, the way they do on a real
      // board — which also keeps the name and price underneath readable
      const pull = unit * 0.26;
      const sq = Number(sqKey);
      const side = sideOf(sq);
      const inward = side === 'bottom' ? { x: 0, y: -pull }
        : side === 'top' ? { x: 0, y: pull }
        : side === 'left' ? { x: pull, y: 0 }
        : side === 'right' ? { x: -pull, y: 0 }
        : { x: sq === 0 ? -pull : sq === 10 ? pull : sq === 20 ? pull : -pull,
            y: sq === 0 ? -pull : sq === 10 ? -pull : sq === 20 ? pull : pull };
      list.forEach((seat, k) => {
        const col = k % cols, row = Math.floor(k / cols);
        const rows = Math.ceil(n / cols);
        const x = c.x + inward.x + (col - (cols - 1) / 2) * size * 1.05;
        const y = c.y + inward.y + (row - (rows - 1) / 2) * size * 1.05;
        const t = tokens[seat];
        t.style.width = size + 'px';
        t.style.height = size + 'px';
        t.style.setProperty('--r', size + 'px');   // rings and glow scale with it
        t.style.transition = instant ? 'none' : '';
        t.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
        if (instant) requestAnimationFrame(() => { t.style.transition = ''; });
      });
    }
    tokens.forEach((t, i) => {
      if (S && S.players[i] && S.players[i].bust) t.style.opacity = '0';
    });
  }

  // ─────────────────────────────────────────── money changing hands
  //
  // The same idea as a card leaving your hand in Hokm: the thing itself flies
  // across the table, so you see who paid whom rather than watching two numbers
  // quietly change.

  const NOTES = [500, 100, 50, 20, 10, 5, 1];

  /** Break an amount into at most a handful of notes, biggest first. */
  function billsFor(amount) {
    const out = [];
    let left = Math.max(0, Math.round(amount));
    for (const note of NOTES) {
      while (left >= note && out.length < 7) { out.push(note); left -= note; }
    }
    if (!out.length && amount > 0) out.push(1);
    return out;
  }

  /** Where on screen a player's money lives: their piece if you can see it, else their row. */
  function anchorFor(seat) {
    // the rail is only the right target while it is showing your own hand
    if (S && seat === S.seat && handSeat() === seat) {
      const hand = $('mNotes');
      if (hand) {
        const r = hand.getBoundingClientRect();
        if (r.width > 0) return { x: r.left + Math.min(r.width * 0.4, 90), y: r.top + r.height / 2 };
      }
    }
    const tok = tokens[seat];
    if (tok) {
      const r = tok.getBoundingClientRect();
      const v = $('mView') ? $('mView').getBoundingClientRect() : null;
      const onBoard = v && r.width > 0 &&
        r.left > v.left - 4 && r.right < v.right + 4 && r.top > v.top - 4 && r.bottom < v.bottom + 4;
      if (onBoard) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const row = $('mPlayers') ? $('mPlayers').children[seat] : null;
    if (row) {
      const r = row.getBoundingClientRect();
      return { x: r.left + r.width * 0.24, y: r.top + r.height / 2 };
    }
    return null;
  }

  /** The bank: the middle of the board, or the header if the board is scrolled away. */
  function bankAnchor() {
    const v = $('mView');
    if (v) { const r = v.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    const h = $('mBank');
    if (h) { const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom }; }
    return null;
  }

  function fxLayer() {
    let layer = $('moneyFx');
    if (!layer) {
      layer = el('div', 'money-fx');
      layer.id = 'moneyFx';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function cashPop(at, amount, up) {
    if (!at) return;
    const layer = fxLayer();
    const tag = el('div', 'cashpop ' + (up ? 'up' : 'down'), (up ? '+' : '−') + money(Math.abs(amount)));
    tag.style.left = (at.x + (up ? 26 : -26)) + 'px';
    tag.style.top = (at.y - 14) + 'px';
    layer.appendChild(tag);
    tag.animate(
      [{ transform: 'translate(-50%, -50%) scale(.7)', opacity: 0 },
       { transform: 'translate(-50%, -140%) scale(1)', opacity: 1, offset: .25 },
       { transform: 'translate(-50%, -320%) scale(1)', opacity: 0 }],
      { duration: 1300, easing: 'cubic-bezier(.2,.8,.3,1)' }
    ).onfinish = () => tag.remove();
  }

  /** Fly the notes from one place to another. */
  function flyMoney(from, to, amount) {
    if (!from || !to || amount <= 0) return;
    const layer = fxLayer();
    const bills = billsFor(amount);
    const spread = Math.min(40, 8 + bills.length * 4);
    bills.forEach((note, i) => {
      const bill = el('div', 'bill');
      bill.style.setProperty('--note', `url("money/${note}.webp")`);
      layer.appendChild(bill);
      const jitterX = (Math.random() - .5) * spread;
      const jitterY = (Math.random() - .5) * spread;
      // a shallow arc, so the notes sweep rather than slide
      const midX = (from.x + to.x) / 2 + (to.y - from.y) * 0.14;
      const midY = (from.y + to.y) / 2 - Math.abs(to.x - from.x) * 0.12 - 26;
      const spin = (Math.random() - .5) * 60;
      const anim = bill.animate([
        { transform: `translate(${from.x}px, ${from.y}px) translate(-50%,-50%) rotate(${spin * .4}deg) scale(.5)`, opacity: 0 },
        { transform: `translate(${from.x + jitterX}px, ${from.y + jitterY}px) translate(-50%,-50%) rotate(${spin * .6}deg) scale(1)`, opacity: 1, offset: .16 },
        { transform: `translate(${midX + jitterX}px, ${midY + jitterY}px) translate(-50%,-50%) rotate(${spin}deg) scale(1.06)`, opacity: 1, offset: .55 },
        { transform: `translate(${to.x}px, ${to.y}px) translate(-50%,-50%) rotate(${spin * 1.5}deg) scale(.42)`, opacity: 0 },
      ], { duration: 780 + i * 30, delay: i * 70, easing: 'cubic-bezier(.32,.72,.35,1)', fill: 'both' });
      anim.onfinish = () => bill.remove();
    });
    sfx('cash');
  }

  /**
   * Compare the cash on the table with the cash a moment ago and play whatever
   * moved. A single payer and a single payee is a transfer between them;
   * anything else is business with the bank.
   */
  let prevCash = null;
  function playMoneyMoves() {
    if (!S || !S.players) return;
    const now = S.players.map((p) => p.cash);
    if (!prevCash || prevCash.length !== now.length) { prevCash = now; return; }
    const deltas = now.map((c, i) => c - prevCash[i]);
    prevCash = now;
    if (!deltas.some((d) => d !== 0)) return;

    const down = deltas.map((d, i) => ({ d, i })).filter((x) => x.d < 0);
    const up = deltas.map((d, i) => ({ d, i })).filter((x) => x.d > 0);

    // Money you did not choose to spend — rent to another player, or a tax
    // square — you hand over yourself. Anything you pressed a priced button for
    // (buying, building, lifting a mortgage) just flies, as it always did.
    const me = S.seat;
    if (me !== null && me !== undefined && deltas[me] < 0) {
      const owed = -deltas[me];
      const toSeat = up.length === 1 && up[0].d === owed ? up[0].i : null;
      const here = META.board[S.players[me].pos];
      if (toSeat !== null || (here && here.tax)) {
        const flights = () => { runMoney(down, up); };
        enqueue((fin) => askToPay(owed, toSeat, () => { flights(); fin(); }));
        return;
      }
    }
    runMoney(down, up);
  }

  function runMoney(down, up) {
    if (down.length === 1 && up.length === 1 && Math.abs(down[0].d) === up[0].d) {
      const a = anchorFor(down[0].i), b = anchorFor(up[0].i);
      flyMoney(a, b, up[0].d);
      cashPop(a, down[0].d, false);
      cashPop(b, up[0].d, true);
      return;
    }
    const bank = bankAnchor();
    for (const { d, i } of down) {
      const a = anchorFor(i);
      flyMoney(a, bank, -d);
      cashPop(a, d, false);
    }
    for (const { d, i } of up) {
      const b = anchorFor(i);
      flyMoney(bank, b, d);
      cashPop(b, d, true);
    }
  }

  // ─────────────────────────────────────────── picking things up
  //
  // The same feel as a card leaving your hand in Hokm: it lifts off the table,
  // straightens up, throws a shadow, tilts with the swing of your hand, and the
  // place it can go lights up. Let go over that place and it lands with a thud;
  // let go anywhere else and it springs back where it came from.

  /**
   * Make `el` draggable onto one of `zones`.
   * opts: { zones: [{ node, accept(el) }], onDrop(zone), onCancel(), tag }
   */
  function liftable(el, opts) {
    let g = null;
    el.classList.add('liftable');

    const zoneUnder = (x, y) => {
      for (const z of opts.zones) {
        const r = z.node.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
      }
      return null;
    };

    el.addEventListener('pointerdown', (e) => {
      if (el.classList.contains('spent') || e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      g = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY,
        gx: e.clientX - (r.left + r.width / 2), gy: e.clientY - (r.top + r.height / 2),
        lastX: e.clientX, tilt: 0, moved: false, zone: null,
      };
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('lifting');
      sfx('flip');
    });

    el.addEventListener('pointermove', (e) => {
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) < 6) return;
      if (!g.moved) { g.moved = true; el.classList.add('dragging'); }
      // the tilt follows the swing of your hand, then eases back to flat
      const swing = e.clientX - g.lastX;
      g.lastX = e.clientX;
      g.tilt = Math.max(-14, Math.min(14, g.tilt * 0.72 + swing * 1.5));
      el.style.transform =
        `translate(${dx - g.gx}px, ${dy - g.gy}px) rotate(${g.tilt.toFixed(1)}deg) scale(1.1)`;
      const z = zoneUnder(e.clientX, e.clientY);
      if (z !== g.zone) {
        if (g.zone) g.zone.node.classList.remove('drop-ok');
        g.zone = z;
        if (z) { z.node.classList.add('drop-ok'); sfx('hop'); }
      }
    });

    const finish = (e) => {
      if (!g || g.id !== e.pointerId) return;
      const { moved, zone } = g;
      g = null;
      el.classList.remove('lifting', 'dragging');
      for (const z of opts.zones) z.node.classList.remove('drop-ok');
      if (zone && moved) {
        el.style.transform = '';
        // pointerup is followed by a click; that must not count as a second tap
        el.dataset.noclick = '1';
        setTimeout(() => { delete el.dataset.noclick; }, 0);
        opts.onDrop(zone, el);
      } else {
        // spring back
        el.classList.add('springing');
        el.style.transform = '';
        setTimeout(() => el.classList.remove('springing'), 260);
        if (opts.onCancel) opts.onCancel();
      }
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    // a plain click still works, for anyone who would rather not drag
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (el.dataset.noclick === '1' || !opts.onClick) return;
      opts.onClick(el);
    });
  }

  /** A fan of notes for `amount`, as one thing you can pick up. */
  function noteBundle(amount) {
    const wrap = el('div', 'bundle');
    const bills = billsFor(amount);
    const n = Math.min(bills.length, 7);
    bills.slice(0, n).forEach((v, k) => {
      const b = el('span', 'bnote');
      b.style.setProperty('--note', `url("money/${v}.webp")`);
      b.style.transform = `translate(${(k - (n - 1) / 2) * 22}px, ${-k * 5}px) rotate(${(k - (n - 1) / 2) * 3.6}deg)`;
      b.style.zIndex = String(n - k);   // the biggest note sits on top of the fan
      wrap.appendChild(b);
    });
    wrap.appendChild(el('b', 'bundle-amt', money(amount)));
    return wrap;
  }

  // ─────────────────────────────────────────── settling up

  /**
   * Hand money over yourself: the notes are counted out into a bundle, you drag
   * it across to whoever is owed, and press Pay. It settles itself if you are
   * away from the table, so nobody is ever left waiting on you.
   */
  function askToPay(amount, toSeat, done) {
    const mat = $('mPay');
    const drop = $('mPayDrop');
    const hand = $('mPayHand');
    const go = $('mPayGo');
    const auto = $('mPayAuto');
    const to = toSeat === null || toSeat === undefined ? null : S.players[toSeat];

    $('mPayTitle').textContent = to ? `You owe ${to.name}` : 'You owe the bank';
    $('mPaySub').textContent = money(amount);
    const who = $('mPayWho');
    who.innerHTML = '';
    if (to) {
      const chip = el('i', 'pz-chip');
      chip.style.setProperty('--c', to.colour);
      chip.style.setProperty('--piece', pieceImg(to.token || 'lion'));
      who.appendChild(chip);
      who.appendChild(el('span', null, to.name));
    } else {
      who.appendChild(el('i', 'pz-chip bank', '⌂'));
      who.appendChild(el('span', null, 'The bank'));
    }

    hand.innerHTML = '';
    drop.querySelectorAll('.bundle').forEach((n) => n.remove());
    drop.classList.remove('full');
    go.disabled = true;
    mat.classList.remove('hidden');
    void mat.offsetWidth;
    mat.classList.add('in');

    let settled = false, dropped = false;
    const bundle = noteBundle(amount);
    hand.appendChild(bundle);

    const land = () => {
      if (dropped) return;
      dropped = true;
      drop.appendChild(bundle);
      drop.classList.add('full');
      bundle.classList.add('landed');
      go.disabled = false;
      go.classList.add('ready');
      sfx('cash');
    };
    liftable(bundle, {
      zones: [{ node: drop }],
      onDrop: land,
      onClick: land,          // a tap works too
    });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      mat.classList.remove('in');
      go.classList.remove('ready');
      setTimeout(() => { mat.classList.add('hidden'); done(); }, 240);
    };
    auto.onclick = () => { land(); setTimeout(finish, 260); };
    go.onclick = () => { if (dropped) finish(); else { land(); setTimeout(finish, 260); } };
    // never hold the table up
    const timer = setTimeout(finish, 20000);
  }

  // ─────────────────────────────────────────── animation queue

  function enqueue(job) { queue.push(job); if (!running) drain(); }

  function drain() {
    if (!queue.length) { running = false; paint(); return; }
    running = true;
    const job = queue.shift();
    job(() => setTimeout(drain, 20));
  }

  // How long the piece rests on each square. Slow enough to follow with your eye,
  // and a long move is only a little quicker per square than a short one.
  const STEP_MS = 300;
  const STEP_MIN = 190;

  /** Pop the running count on a square as the piece passes over it. */
  function stepTick(i, n, total) {
    const cell = cells[i];
    if (!cell) return;
    const old = cell.querySelector('.stepno');
    if (old) old.remove();
    const tag = el('span', 'stepno' + (n === total ? ' last' : ''), String(n));
    cell.appendChild(tag);
    setTimeout(() => tag.remove(), n === total ? 1500 : 900);
  }

  /** The counter beside the dice: "3 of 7" while a piece is walking. */
  function stepCount(n, total) {
    const box = $('mDiceHint');
    if (!box) return;
    box.classList.toggle('counting', !!total);
    box.textContent = total ? `${n} of ${total}` : '';
    if (!total) diceHint();
  }

  function animateMove(move, done) {
    const seat = move.seat;
    if (!tokens[seat]) { done(); return; }
    if (move.jump || move.steps === undefined) {
      shown[seat] = move.to;
      tokens[seat].classList.add('leap');
      placeTokens(false);
      ensureVisible(move.to);
      sfx('hop');
      setTimeout(() => { tokens[seat].classList.remove('leap'); done(); }, 620);
      return;
    }
    const steps = [];
    let at = move.from;
    for (let k = 0; k < move.steps; k++) { at = (at + 1) % 40; steps.push(at); }
    const per = Math.max(STEP_MIN, Math.min(STEP_MS, 3000 / Math.max(1, steps.length)));
    let k = 0;
    const hop = () => {
      if (k >= steps.length) {
        if (steps.includes(0) && move.to !== 0) flashGo();
        setTimeout(() => { stepCount(0, 0); done(); }, 420);
        return;
      }
      shown[seat] = steps[k];
      if (steps[k] === 0) flashGo();
      placeTokens(false);
      ensureVisible(steps[k]);
      sfx('hop');
      k++;
      stepTick(steps[k - 1], k, steps.length);
      stepCount(k, steps.length);
      setTimeout(hop, per);
    };
    hop();
  }

  function flashGo() {
    const go = cells[0];
    if (!go) return;
    go.classList.remove('gopop');
    void go.offsetWidth;
    go.classList.add('gopop');
    sfx('coin');
  }

  // ─────────────────────────────────────────── shaking the dice
  //
  // Hold the dice down and shake the mouse (or your finger). The longer and
  // wilder the shake, the harder they tumble when you let go. The numbers still
  // come from the server — this only decides how they arrive.

  let shaking = false, charge = 0, lastPt = null, shakeRaf = 0, shakeT0 = 0;

  const canRoll = () =>
    S && S.seat !== null && S.seat !== undefined && S.seat === S.turn &&
    S.phase === 'roll' && !S.winner && !running && queue.length === 0;

  function diceHint() {
    const hint = $('mDiceHint'), box = $('mcDice');
    if (!hint || !box) return;
    if (hint.classList.contains('counting')) return;
    const ready = canRoll();
    box.classList.toggle('ready', ready);
    if (shaking) return;
    hint.textContent = ready
      ? (S.jailed && S.jailed[S.seat] ? 'shake for a double' : 'hold and shake')
      : '';
  }

  function shakeFrame() {
    if (!shaking) return;
    const held = (performance.now() - shakeT0) / 2600;       // holding alone builds a little
    const power = Math.min(1, charge + Math.min(0.35, held));
    const amp = 1.5 + power * 13;
    for (const id of ['die1', 'die2']) {
      const d = $(id);
      if (!d) continue;
      d.style.transitionDuration = '0ms';
      d.style.transform =
        `translate(${(Math.random() - .5) * amp}px, ${(Math.random() - .5) * amp}px)` +
        ` rotateX(${(Math.random() - .5) * amp * 4}deg) rotateY(${(Math.random() - .5) * amp * 4}deg)`;
    }
    const bar = $('mCharge');
    if (bar) bar.style.width = Math.round(power * 100) + '%';
    $('mcDice').style.setProperty('--glow', power.toFixed(2));
    shakeRaf = requestAnimationFrame(shakeFrame);
  }

  function startShake(e) {
    if (!canRoll() || shaking) return;
    shaking = true; charge = 0; lastPt = { x: e.clientX, y: e.clientY };
    shakeT0 = performance.now();
    const box = $('mcDice');
    box.classList.add('shaking');
    box.classList.remove('landed', 'dbl');
    try { box.setPointerCapture(e.pointerId); } catch (_) {}
    $('mDiceHint').classList.remove('counting');
    $('mDiceHint').textContent = 'shake!';
    sfx('dice');
    shakeFrame();
    e.preventDefault();
  }

  function moveShake(e) {
    if (!shaking || !lastPt) return;
    const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y;
    lastPt = { x: e.clientX, y: e.clientY };
    charge = Math.min(1, charge + Math.hypot(dx, dy) / 900);
  }

  function endShake() {
    if (!shaking) return;
    shaking = false;
    cancelAnimationFrame(shakeRaf);
    const held = (performance.now() - shakeT0) / 2600;
    throwEnergy = Math.max(0.18, Math.min(1, charge + Math.min(0.35, held)));
    const box = $('mcDice');
    box.classList.remove('shaking');
    box.style.removeProperty('--glow');
    const bar = $('mCharge');
    if (bar) bar.style.width = '0%';
    for (const id of ['die1', 'die2']) {
      const d = $(id);
      if (d) { d.style.transitionDuration = ''; d.style.transform = ''; }
    }
    $('mDiceHint').textContent = '';
    send({ type: 'roll' });
  }

  function bindDice() {
    const box = $('mcDice');
    if (!box || box.dataset.bound) return;
    box.dataset.bound = '1';
    box.addEventListener('pointerdown', startShake);
    box.addEventListener('pointermove', moveShake);
    box.addEventListener('pointerup', endShake);
    box.addEventListener('pointercancel', endShake);
    box.addEventListener('contextmenu', (e) => { if (canRoll()) e.preventDefault(); });
  }

  function animateDice(dice, done) {
    const box = $('mcDice');
    if (!box || !dice) { done(); return; }
    const energy = throwEnergy;              // how hard this one was shaken
    throwEnergy = 0.4;
    const ms = Math.round(760 + energy * 1100);
    box.style.setProperty('--rollms', ms + 'ms');
    box.style.setProperty('--rollamp', (1 + energy * 1.6).toFixed(2));
    box.classList.remove('landed');
    box.classList.add('rolling');
    sfx('dice');
    setDieFace($('die1'), dice.d1, 1, energy, ms);
    setDieFace($('die2'), dice.d2, 2, energy, ms);
    setTimeout(() => {
      box.classList.remove('rolling');
      box.classList.add('landed');
      box.classList.toggle('dbl', !!dice.double);
      setTimeout(done, 380);
    }, ms);
  }

  /**
   * A piece about to be picked up and put somewhere else — the guard taking you
   * in, a card's errand, a step backwards. Say what is about to happen and wait,
   * so the piece never just vanishes across the board unexplained.
   */
  function announceMove(move, done) {
    const pop = $('mNotice');
    const who = S.players[move.seat];
    const dest = META.board[move.to];
    const mine = move.seat === S.seat;
    const name = mine ? 'You' : who.name;
    const verb = mine ? '' : 's';
    // the picture of where they are going says it faster than any symbol
    let pic = PHOTOS[move.to] || (STREET_ART[move.to] ? `streets/${STREET_ART[move.to]}-p.webp` : null);
    let title = 'On the move', text = '';
    if (move.to === 10 && dest.type === 'jail') {
      pic = PHOTOS[10];
      title = mine ? 'Off to jail' : `${who.name} is taken in`;
      text = `${name} go${verb} straight to the dungeon \u2014 no salary on the way.`;
    } else if (move.back) {
      title = 'Back a few squares';
      text = `${name} step${verb} back to ${dest.name}.`;
    } else if (move.to === 0) {
      title = 'Straight to GO';
      text = `${name} go${verb} all the way round to GO and collect${mine ? '' : 's'} ${money(200)}.`;
    } else {
      title = `Off to ${dest.name}`;
      text = `${name} ${mine ? 'are' : 'is'} sent to ${dest.name}${dest.fa ? ` (${dest.fa})` : ''}.`;
    }
    const ic = $('mNoticeIcon');
    ic.textContent = '';
    ic.classList.toggle('blank', !pic);
    ic.style.setProperty('--img', pic ? `url("${pic}")` : 'none');
    $('mNoticeTitle').textContent = title;
    $('mNoticeText').textContent = text;
    pop.classList.toggle('jail', move.to === 10 && dest.type === 'jail');
    pop.classList.remove('hidden');
    void pop.offsetWidth;
    pop.classList.add('in');
    sfx('flip');

    const ok = $('mNoticeOk');
    ok.textContent = mine ? 'Next' : 'OK';
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      ok.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      pop.classList.remove('in');
      setTimeout(() => { pop.classList.add('hidden'); done(); }, 240);
    };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close(); };
    ok.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(close, mine ? 30000 : 7000);
  }

  /** A drawn card stays on the table until somebody says they have read it. */
  function animateCard(card, done) {
    const pop = $('mCard');
    $('mCardDeck').textContent = card.deck === 'fortune' ? 'FORTUNE' : 'TREASURY';
    $('mCardFa').textContent = card.deck === 'fortune' ? 'بخت' : 'خزانه';
    $('mCardText').textContent = card.text;
    $('mCardWho').textContent = S.players[card.seat] ? S.players[card.seat].name : '';
    pop.className = 'mono-card ' + card.deck;
    pop.classList.remove('hidden');
    void pop.offsetWidth;
    pop.classList.add('in');
    sfx('flip');

    const ok = $('mCardOk');
    let closed = false;
    // it is the drawer's card to dismiss; everyone else's clears itself
    const mine = card.seat === S.seat;
    ok.textContent = mine ? 'Next' : 'OK';
    ok.classList.toggle('waiting', !mine);
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      ok.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      pop.classList.remove('in');
      setTimeout(() => { pop.classList.add('hidden'); done(); }, 260);
    };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close(); };
    ok.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    // never leave the table stuck behind somebody who has walked away
    const timer = setTimeout(close, mine ? 30000 : 9000);
  }

  // ─────────────────────────────────────────── painting

  let ownAt = null;
  function paintCells() {
    // a new owner chip on the strip changes how much room the name has
    const ownKey = S.owner.join(',');
    const ownChanged = ownKey !== ownAt;
    ownAt = ownKey;
    for (const sp of META.board) {
      const cell = cells[sp.i];
      if (!cell || !sp.price) continue;
      const own = S.owner[sp.i];
      const strip = cell.querySelector('.own');
      const mark = cell.querySelector('.ownmark');
      if (own === null || own === undefined) {
        cell.classList.remove('owned');
        strip.style.background = '';
        cell.style.removeProperty('--owncol');
        if (mark && mark.dataset.at !== '') { mark.dataset.at = ''; mark.innerHTML = ''; }
        const bandEl = cell.querySelector('.ownband');
        if (bandEl && bandEl.dataset.at !== '') { bandEl.dataset.at = ''; bandEl.textContent = ''; }
      } else {
        cell.classList.add('owned');
        const p = S.players[own];
        const col = p ? p.colour : '#fff';
        strip.style.background = col;
        cell.style.setProperty('--owncol', col);
        // a little chip saying whose it is: their piece, in their colour
        if (mark && mark.dataset.at !== String(own)) {
          mark.dataset.at = String(own);
          mark.innerHTML = '';
          mark.style.setProperty('--c', col);
          const chip = el('i', 'om-chip');
          if (p && p.token) chip.style.setProperty('--piece', pieceImg(p.token));
          mark.appendChild(chip);
          mark.appendChild(el('span', 'om-name', p ? p.name : ''));
          mark.title = p ? `Held by ${p.name}` : '';
        }
        // a full-width sash of their colour against the property's own band,
        // so you can read the whole board's ownership at a glance
        const bandEl = cell.querySelector('.ownband');
        if (bandEl && bandEl.dataset.at !== String(own)) {
          bandEl.dataset.at = String(own);
          bandEl.style.setProperty('--c', col);
          bandEl.textContent = p ? p.name : '';
          bandEl.title = p ? `Held by ${p.name}` : '';
        }
      }
      cell.classList.toggle('mortgaged', !!S.mortgaged[sp.i]);
      if (sp.type === 'street') {
        const blds = cell.querySelector('.blds');
        const h = S.houses[sp.i];
        const want = h === 5 ? 'H' : String(h);
        if (blds.dataset.at !== want) {
          blds.dataset.at = want;
          blds.innerHTML = '';
          if (h === 5) blds.appendChild(el('span', 'hotel'));
          else for (let k = 0; k < h; k++) blds.appendChild(el('span', 'house'));
          if (h > 0) { blds.classList.remove('pop'); void blds.offsetWidth; blds.classList.add('pop'); }
        }
      }
    }
    if (ownChanged && built) fitNames();
  }

  let lastPlayerKey = null;
  function paintPlayers() {
    const key = S.players.map((p) => [p.name, p.cash, p.worth, p.owns.length, p.jailed, p.pardons, p.bust, p.connected].join(',')).join('|')
      + '|' + S.turn + '|' + S.phase;
    if (key === lastPlayerKey) return;
    lastPlayerKey = key;
    const box = $('mPlayers');
    box.innerHTML = '';
    for (const p of S.players) {
      const row = el('div', 'mp' + (p.seat === S.turn && S.phase !== 'over' ? ' turn' : '')
        + (p.bust ? ' bust' : '') + (p.seat === S.seat ? ' me' : '')
        + (handSeat() === p.seat ? ' peeking' : ''));
      row.style.setProperty('--c', p.colour);
      row.title = `Look through ${p.seat === S.seat ? 'your own' : p.name + "'s"} money and deeds`;
      row.addEventListener('click', () => {
        peekSeat = p.seat === S.seat ? null : p.seat;
        lastPlayerKey = null; lastDeedKey = null;
        const notes = $('mNotes');
        if (notes) delete notes.dataset.at;
        paint();
      });
      const chip = el('div', 'mp-chip');
      chip.style.setProperty('--piece', pieceImg(p.token || 'lion'));
      row.appendChild(chip);
      const mid = el('div', 'mp-mid');
      const nm = el('div', 'mp-name', p.name);
      if (!p.connected && !p.isBot) nm.appendChild(el('span', 'away', ' away'));
      mid.appendChild(nm);
      const sub = el('div', 'mp-sub');
      sub.textContent = p.bust ? 'ruined' : `${p.owns.length} deeds · worth ${money(p.worth)}`;
      mid.appendChild(sub);
      row.appendChild(mid);
      const right = el('div', 'mp-right');
      right.appendChild(el('b', null, p.bust ? '—' : money(p.cash)));
      if (p.jailed) right.appendChild(el('span', 'mp-jail', 'in jail'));
      if (p.pardons > 0) right.appendChild(el('span', 'mp-pardon', `${p.pardons} pardon${p.pardons > 1 ? 's' : ''}`));
      row.appendChild(right);
      if (p.seat !== S.seat && !p.bust && S.seat !== null && S.phase !== 'over') {
        // deals are struck on your own turn, so the button waits for it
        const myTurn = S.turn === S.seat && !S.offer;
        const t = el('button', 'mp-trade' + (myTurn ? '' : ' off'), 'Offer');
        t.disabled = !myTurn;
        t.title = S.offer ? 'There is already an offer on the table.'
          : myTurn ? `Open the deal table with ${p.name}` : 'You can only deal on your own turn.';
        if (myTurn) t.addEventListener('click', (e) => { e.stopPropagation(); openTrade(p.seat); });
        row.appendChild(t);
      }
      box.appendChild(row);
    }
  }

  function paintTurnCard() {
    const t = $('mTurn');
    if (!t) return;
    if (S.phase === 'over') {
      t.innerHTML = `<div class="mt-who">the bazaar closes</div><div class="mt-what">${S.winner !== null ? S.players[S.winner].name + ' wins' : 'no winner'}</div>`;
      return;
    }
    const p = S.players[S.turn];
    const phase = {
      roll: 'to roll', buy: 'deciding', auction: 'auction', debt: 'must raise cash', end_turn: 'finishing up',
    }[S.phase] || '';
    t.innerHTML = `<i style="background:${p.colour}"></i><span class="mt-who">${p.name}</span><span class="mt-what">${phase}</span>`;
  }

  function paintHud() {
    const pot = $('mPot');
    if (S.settings.freeParking) {
      pot.classList.remove('hidden');
      pot.textContent = `tea house pot ${money(S.pot)}`;
    } else pot.classList.add('hidden');

    const bank = $('mBank');
    bank.textContent = `${S.housesLeft} houses · ${S.hotelsLeft} hotels left`;

    const clock = $('mClock');
    if (S.endsAt) {
      const left = Math.max(0, S.endsAt - Date.now());
      const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
      clock.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      clock.classList.toggle('low', left < 120000);
      clock.classList.remove('hidden');
    } else {
      clock.textContent = S.settings.endMode === 'firstbust' ? 'first ruin ends it' : 'last one standing';
      clock.classList.remove('low', 'hidden');
    }
  }

  // ─────────────────────────────────────────── the action bar

  /**
   * A fingerprint of everything the action bar draws. The server broadcasts on
   * every tick, and rebuilding the buttons each time yanks them out from under
   * a finger that is already on the way down — so only redraw on a real change.
   */
  function actionKey() {
    const me = S.seat;
    if (me === null || me === undefined) return 'watch';
    const p = S.players[me];
    const a = S.auction;
    return [
      S.phase, S.actor, S.doubles, p.jailed, p.jailTurns, p.pardons, p.cash,
      S.pending ? S.pending.pos + ':' + S.pending.price : '',
      a ? a.pos + ':' + a.high + ':' + a.highSeat + ':' + a.turn : '',
      S.debt ? S.debt.seat + ':' + S.debt.amount : '',
      S.overReason || '',
    ].join('|');
  }

  let lastActionKey = null;
  function actionBar(force) {
    const key = actionKey();
    if (!force && key === lastActionKey) return;
    lastActionKey = key;
    const box = $('mActions');
    box.innerHTML = '';
    const me = S.seat;
    if (me === null || me === undefined) { box.appendChild(el('p', 'mhint', 'You are watching this one.')); return; }
    if (S.phase === 'over') { box.appendChild(el('p', 'mhint', S.overReason || '')); return; }
    const mine = S.actor === me;
    const btn = (label, cls, fn, sub) => {
      const b = el('button', 'btn ' + cls, label);
      if (sub) { b.appendChild(el('small', null, sub)); b.classList.add('with-sub'); }
      b.addEventListener('click', fn);
      box.appendChild(b);
      return b;
    };

    if (S.phase === 'auction') {
      box.appendChild(el('p', 'mhint dim', 'An auction is running.'));
      return;
    }

    if (S.phase === 'debt' && S.debt.seat === me) {
      const short = S.debt.amount - S.players[me].cash;
      box.appendChild(el('p', 'mhint warn', `You owe ${money(S.debt.amount)} for ${S.debt.why} and are ${money(short)} short.`));

      // the quickest ways out, right here, rather than hunting the deed list
      const ways = [];
      for (const i of S.players[me].owns) {
        const sp = META.board[i];
        if (sp.type === 'street' && S.houses[i] > 0 && !sellWhy(i)) {
          ways.push({ label: `Sell a ${S.houses[i] === 5 ? 'hotel' : 'house'} on ${sp.name}`, gain: Math.floor(sp.build / 2), act: { type: 'sell', pos: i } });
        }
        if (!S.mortgaged[i] && !mortgageWhy(i)) {
          ways.push({ label: `Mortgage ${sp.name}`, gain: sp.mortgage, act: { type: 'mortgage', pos: i } });
        }
      }
      ways.sort((a, b) => a.gain - b.gain);
      if (ways.length) {
        box.appendChild(el('p', 'mhint dim', 'Quickest ways to raise it:'));
        for (const w of ways.slice(0, 5)) {
          btn(w.label, 'ghost small raise', () => send(w.act), `+${money(w.gain)}`);
        }
      } else {
        box.appendChild(el('p', 'mhint dim', 'There is nothing left to sell or mortgage.'));
      }
      btn('Declare ruin', 'danger', () => {
        if (confirm('Give up everything you own and leave the game?')) send({ type: 'bankrupt' });
      });
      return;
    }

    if (!mine) {
      box.appendChild(el('p', 'mhint dim', `waiting on ${S.players[S.actor] ? S.players[S.actor].name : 'the table'}`));
      return;
    }

    if (S.phase === 'buy') {
      const sp = META.board[S.pending.pos];
      box.appendChild(el('p', 'mhint', `${sp.name} is unclaimed.`));
      const b = btn(`Buy for ${money(S.pending.price)}`, 'primary big', () => send({ type: 'buy' }));
      if (S.players[me].cash < S.pending.price) b.disabled = true;
      btn(S.settings.buyMode === 'buyAuction' ? 'Pass — send to auction' : 'Pass', 'ghost', () => send({ type: 'pass' }));
      return;
    }

    if (S.phase === 'roll') {
      if (S.players[me].jailed) {
        box.appendChild(el('p', 'mhint', `In jail — turn ${S.players[me].jailTurns + 1} of 3.`));
        btn('Roll for a double', 'primary big', () => { throwEnergy = 0.35; send({ type: 'roll' }); });
        if (S.players[me].pardons > 0) btn('Use a pardon', 'ghost', () => send({ type: 'useCard' }));
        const f = btn(`Pay the ${money(50)} fine`, 'ghost', () => send({ type: 'payFine' }));
        if (S.players[me].cash < 50) f.disabled = true;
        return;
      }
      btn('Roll', 'primary big', () => { throwEnergy = 0.35; send({ type: 'roll' }); },
          S.doubles > 0 ? `double — go again` : null);
      return;
    }

    if (S.phase === 'end_turn') {
      btn('End turn', 'primary big', () => send({ type: 'endTurn' }));
      box.appendChild(el('p', 'mhint dim', 'Build, mortgage or trade first if you like.'));
      return;
    }
  }

  // ─────────────────────────────────────────── the auction

  let lastAuctionKey = null;
  // ─────────────────────────────────────────── the auction
  //
  // A property under the hammer, at the size it deserves: the painting, the
  // standing bid, everybody's piece round the table, and a clock running down.
  // You can also set your bid before it reaches you, and it goes in for you.

  let prebid = null;          // a number to bid, 'pass', or null
  let prebidAt = null;        // which auction it was set for
  let bidSent = null;         // guard so a ready bid only goes in once
  let auTick = null;

  function resetPrebid() { prebid = null; prebidAt = null; bidSent = null; }

  function bidStep(sp, high) {
    void high;
    return Math.max(5, Math.round(sp.price * 0.08 / 5) * 5);
  }

  function paintAuction() {
    const box = $('mAuction');
    const a = S.auction;
    if (!a || S.phase !== 'auction') {
      if (!box.classList.contains('hidden')) resetPrebid();
      box.classList.add('hidden');
      lastAuctionKey = null;
      clearInterval(auTick); auTick = null;
      return;
    }
    const sp = META.board[a.pos];
    const me = S.seat;
    const mine = a.turn === me && me !== null && me !== undefined;
    const cash = me === null || me === undefined ? 0 : S.players[me].cash;

    // a new lot clears whatever you had readied for the last one
    if (prebidAt !== a.pos) resetPrebid();
    prebidAt = a.pos;

    // your readied bid goes in the moment the hammer reaches you
    if (mine && prebid !== null && bidSent !== a.high) {
      bidSent = a.high;
      if (prebid === 'pass') { prebid = null; send({ type: 'passBid' }); return; }
      if (prebid > a.high && prebid <= cash) {
        const amount = prebid;
        prebid = null;
        sfx('coin');
        send({ type: 'bid', amount });
        return;
      }
      prebid = null;                 // it was outbid while you waited
      toastOnce('Your ready bid was passed — the price went over it.');
    }

    box.classList.remove('hidden');
    const key = [a.pos, a.high, a.highSeat, a.turn, a.out.join(','), S.seat, prebid].join('|');
    if (key !== lastAuctionKey) {
      lastAuctionKey = key;
      drawAuction(box, a, sp, me, mine, cash);
    }
    auClock(a);
    if (!auTick) auTick = setInterval(() => { if (S && S.auction) auClock(S.auction); }, 200);
  }

  let lastToast = null;
  function toastOnce(msg) {
    if (lastToast === msg) return;
    lastToast = msg;
    setTimeout(() => { lastToast = null; }, 4000);
    if (toast) toast(msg);
  }

  /** The ring and the seconds, redrawn five times a second. */
  function auClock() {
    const ring = $('auRing');
    if (!ring) return;
    const total = S.turnTotal || 0;
    const left = S.turnDeadline ? Math.max(0, S.turnDeadline - Date.now()) : 0;
    const frac = total > 0 ? left / total : 0;
    ring.style.setProperty('--f', frac.toFixed(3));
    ring.classList.toggle('low', total > 0 && frac < 0.34);
    const secs = $('auSecs');
    if (secs) secs.textContent = total > 0 ? String(Math.ceil(left / 1000)) : '—';
  }

  function drawAuction(box, a, sp, me, mine, cash) {
    box.innerHTML = '';
    const colour = sp.type === 'street' ? META.groups[sp.group].colour
      : sp.type === 'rail' ? '#9a7434' : '#4aa3d6';
    box.style.setProperty('--c', a.highSeat === null ? colour : S.players[a.highSeat].colour);

    const strip = el('div', 'au-strip');
    strip.style.background = colour;
    box.appendChild(strip);

    const head = el('div', 'au-head');
    head.appendChild(el('div', 'au-kind', 'UNDER THE HAMMER'));
    const ring = el('div', 'au-ring');
    ring.id = 'auRing';
    const secs = el('b', null, '—');
    secs.id = 'auSecs';
    ring.appendChild(secs);
    head.appendChild(ring);
    box.appendChild(head);

    const body = el('div', 'au-body');

    const art = el('div', 'au-art');
    if (STREET_ART[a.pos]) art.style.setProperty('--img', `url("streets/${STREET_ART[a.pos]}-p.webp")`);
    const artband = el('span', 'au-artband');
    artband.style.background = colour;
    art.appendChild(artband);
    body.appendChild(art);

    const info = el('div', 'au-info');
    info.appendChild(el('div', 'au-name', sp.name));
    if (sp.fa) info.appendChild(el('div', 'au-fa', sp.fa));
    info.appendChild(el('div', 'au-list', `list price ${money(sp.price)}`));

    const high = el('div', 'au-high' + (a.highSeat === null ? ' none' : ''));
    if (a.highSeat === null) {
      high.appendChild(el('b', null, 'No bids yet'));
      high.appendChild(el('span', null, `opens at ${money(1)}`));
    } else {
      high.style.setProperty('--c', S.players[a.highSeat].colour);
      high.appendChild(el('b', null, money(a.high)));
      high.appendChild(el('span', null, `standing bid — ${S.players[a.highSeat].name}`));
    }
    info.appendChild(high);
    body.appendChild(info);
    box.appendChild(body);

    // everybody round the table
    const who = el('div', 'au-who');
    for (const p of S.players) {
      if (p.bust) continue;
      const out = a.out.includes(p.seat);
      const chip = el('div', 'au-bidder' + (out ? ' out' : '') + (a.turn === p.seat ? ' on' : '')
        + (a.highSeat === p.seat ? ' lead' : ''));
      chip.style.setProperty('--c', p.colour);
      const pic = el('i', 'au-pc');
      pic.style.setProperty('--piece', pieceImg(p.token || 'lion'));
      chip.appendChild(pic);
      chip.appendChild(el('span', null, p.name));
      if (a.highSeat === p.seat) chip.appendChild(el('b', null, money(a.high)));
      else if (out) chip.appendChild(el('b', null, 'out'));
      who.appendChild(chip);
    }
    box.appendChild(who);

    if (me === null || me === undefined) {
      box.appendChild(el('p', 'au-wait', 'The room is bidding.'));
      return;
    }
    if (a.out.includes(me)) {
      box.appendChild(el('p', 'au-wait', 'You are out of this one.'));
      return;
    }

    const step = bidStep(sp, a.high);
    const floor = a.high + 1;
    const start = Math.min(cash, a.high + step);

    const pad = el('div', 'au-pad');
    const amountBox = el('div', 'au-amount');
    const minus = el('button', 'au-pm', '−');
    const input = el('input', 'au-input');
    input.type = 'number'; input.min = floor; input.max = cash;
    input.value = mine ? start : (typeof prebid === 'number' ? prebid : start);
    const plus = el('button', 'au-pm', '+');
    const clampBid = (v) => Math.max(floor, Math.min(cash, Math.round(v) || floor));
    minus.addEventListener('click', () => { input.value = clampBid(Number(input.value) - step); });
    plus.addEventListener('click', () => { input.value = clampBid(Number(input.value) + step); });
    amountBox.appendChild(minus);
    amountBox.appendChild(input);
    amountBox.appendChild(plus);
    pad.appendChild(amountBox);

    const quick = el('div', 'au-quick');
    for (const s of [step, 50, 100, 250]) {
      const amount = a.high + s;
      const q = el('button', 'btn ghost', '+' + s);
      if (amount > cash) q.disabled = true;
      else q.addEventListener('click', () => { input.value = String(amount); });
      quick.appendChild(q);
    }
    const allin = el('button', 'btn ghost au-allin', 'All in');
    allin.addEventListener('click', () => { input.value = String(cash); });
    if (cash <= a.high) allin.disabled = true;
    quick.appendChild(allin);
    pad.appendChild(quick);
    box.appendChild(pad);

    const acts = el('div', 'au-acts');
    if (mine) {
      const go = el('button', 'btn primary big au-bid', 'Bid');
      const paint = () => { go.textContent = `Bid ${money(clampBid(Number(input.value)))}`; };
      input.addEventListener('input', paint);
      minus.addEventListener('click', paint);
      plus.addEventListener('click', paint);
      for (const q of quick.children) q.addEventListener('click', paint);
      paint();
      go.disabled = cash <= a.high;
      go.addEventListener('click', () => { sfx('coin'); send({ type: 'bid', amount: clampBid(Number(input.value)) }); });
      acts.appendChild(go);
      const out = el('button', 'btn ghost', 'Drop out');
      out.addEventListener('click', () => send({ type: 'passBid' }));
      acts.appendChild(out);
    } else {
      // set it now and it goes in the moment the hammer reaches you
      const ready = el('button', 'btn primary big au-ready'
        + (typeof prebid === 'number' ? ' set' : ''),
        typeof prebid === 'number' ? `Ready: ${money(prebid)} — tap to clear` : 'Ready this bid');
      ready.addEventListener('click', () => {
        if (typeof prebid === 'number') prebid = null;
        else { prebid = clampBid(Number(input.value)); sfx('flip'); }
        lastAuctionKey = null;
        paint();
      });
      if (cash <= a.high) ready.disabled = true;
      acts.appendChild(ready);
      const skip = el('button', 'btn ghost' + (prebid === 'pass' ? ' on' : ''),
        prebid === 'pass' ? 'Will drop out' : 'Drop out when it reaches me');
      skip.addEventListener('click', () => {
        prebid = prebid === 'pass' ? null : 'pass';
        lastAuctionKey = null;
        paint();
      });
      acts.appendChild(skip);
    }
    box.appendChild(acts);

    const foot = el('p', 'au-cash', mine
      ? `Your turn — you hold ${money(cash)}`
      : `${S.players[a.turn].name} is bidding — you hold ${money(cash)}`);
    box.appendChild(foot);
  }

  // ─────────────────────────────────────────── my deeds

  /** Whose hand the left rail is showing — yours unless you clicked somebody. */
  function handSeat() {
    if (peekSeat !== null && S && S.players[peekSeat] && !S.players[peekSeat].bust) return peekSeat;
    if (peekSeat !== null) peekSeat = null;
    return S ? S.seat : null;
  }

  /** Cash piled up the way you would hold it: biggest note on top. */
  function paintNotes() {
    const box = $('mNotes');
    const me = handSeat();
    const cash = me === null || me === undefined ? 0 : S.players[me].cash;
    const mine = me === S.seat;
    $('mHandTotal').textContent = money(cash);
    $('mCashLabel').firstChild.nodeValue = mine ? 'MONEY ' : `${S.players[me] ? S.players[me].name.toUpperCase() : ''} `;
    $('mHand').classList.toggle('peeking', !mine);
    const back = $('mPeekBack');
    if (back) back.classList.toggle('hidden', mine);
    if (box.dataset.at === String(me) + ':' + String(cash)) return;
    box.dataset.at = String(me) + ':' + String(cash);

    const counts = {};
    let left = Math.max(0, Math.round(cash));
    for (const note of NOTES) {
      const n = Math.floor(left / note);
      if (n > 0) { counts[note] = n; left -= n * note; }
    }
    box.innerHTML = '';
    box.classList.toggle('empty', cash <= 0);
    let i = 0;
    for (const note of NOTES) {
      const n = counts[note];
      if (!n) continue;
      const row = el('div', 'note-row');
      row.style.setProperty('--i', String(i));
      row.style.zIndex = String(40 - i);   // the top of the pile covers the rest
      i++;
      const img = el('span', 'note-img');
      img.style.setProperty('--note', `url("money/${note}.webp")`);
      row.appendChild(img);
      row.appendChild(el('span', 'note-x', n > 1 ? `${money(note)} \u00d7${n}` : money(note)));
      row.title = `${n} \u00d7 ${money(note)}`;
      box.appendChild(row);
    }
  }

  let lastDeedKey = null;
  function paintDeeds() {
    const me = handSeat();
    const key = me === null || me === undefined ? 'none'
      : me + '|' + S.players[me].owns.join(',') + '|' + S.houses.join('') + '|' + S.mortgaged.map((m) => (m ? 1 : 0)).join('');
    if (key === lastDeedKey) return;
    lastDeedKey = key;
    const box = $('mDeeds');
    const wasOpen = new Set([...box.querySelectorAll('.hd-group.open')].map((n) => n.dataset.g));
    box.innerHTML = '';
    if (me === null || me === undefined) {
      box.appendChild(el('p', 'hand-empty', 'You are watching this one.'));
      return;
    }
    const mine = S.players[me].owns;
    if (!mine.length) {
      box.appendChild(el('p', 'hand-empty', me === S.seat
        ? 'No deeds yet \u2014 buy the square you land on.'
        : `${S.players[me].name} holds no deeds yet.`));
      return;
    }

    const byGroup = {};
    for (const i of mine) {
      const sp = META.board[i];
      const key2 = sp.type === 'street' ? sp.group : sp.type;
      (byGroup[key2] ||= []).push(i);
    }
    for (const [gkey, list] of Object.entries(byGroup)) {
      const g = META.groups[gkey];
      const colour = g ? g.colour : gkey === 'rail' ? '#9a7434' : '#4aa3d6';
      const whole = g ? g.size : gkey === 'rail' ? 4 : 2;
      const wrap = el('div', 'hd-group' + (list.length === whole ? ' full' : ''));
      wrap.style.setProperty('--c', colour);
      wrap.dataset.g = gkey;
      if (wasOpen.has(gkey)) wrap.classList.add('open');

      // the label doubles as the way to open the pile on a touch screen
      const name = g ? g.name : gkey === 'rail' ? 'The Railways' : 'Utilities';
      const head = el('button', 'hd-gname', name);
      head.type = 'button';
      head.appendChild(el('i', '', `${list.length}/${whole}`));
      head.addEventListener('click', () => wrap.classList.toggle('open'));
      wrap.appendChild(head);

      const cards = el('div', 'hd-cards');
      list.sort((a, b) => a - b).forEach((i, n) => {
        const sp = META.board[i];
        const card = el('button', 'hd' + (S.mortgaged[i] ? ' mort' : ''));
        card.style.setProperty('--c', colour);
        card.style.setProperty('--i', String(n));
        card.style.zIndex = String(30 - n);  // first card on top, the rest behind it
        card.title = `${sp.name} \u2014 ${money(sp.price)}`;
        card.appendChild(el('span', 'hd-band'));
        const pic = el('span', 'hd-pic');
        if (STREET_ART[i]) pic.style.setProperty('--img', `url("streets/${STREET_ART[i]}-p.webp")`);
        else pic.innerHTML = window.BazaarArt ? window.BazaarArt.motif(i) : '';
        card.appendChild(pic);
        if (sp.type === 'street' && S.houses[i] > 0) {
          card.appendChild(el('span', 'hd-b', S.houses[i] === 5 ? 'HOTEL' : '\u2302'.repeat(S.houses[i])));
        }
        // the cards are narrow, so drop the part of the name the group already says
        const short = sp.name.replace(/\s+Railway$/, '').replace(/^Tehran\s+/, '');
        card.appendChild(el('span', 'hd-nm', short));
        card.addEventListener('click', () => openDeed(i));
        cards.appendChild(card);
      });
      wrap.appendChild(cards);
      box.appendChild(wrap);
    }
  }

  // ─────────────────────────────────────────── the deed card

  function openDeed(i) { deedOpen = i; deedFace = false; paintDeed(); $('mDeed').classList.remove('hidden'); }
  function closeDeed() { deedOpen = null; $('mDeed').classList.add('hidden'); }

  function paintDeed() {
    if (deedOpen === null || !S) return;
    const i = deedOpen, sp = META.board[i];
    const body = $('mDeedBody');
    body.innerHTML = '';
    const me = S.seat;
    const own = S.owner[i];

    const card = el('div', 'deedcard');
    if (sp.type === 'street') {
      const top = el('div', 'dc-top');
      top.style.background = META.groups[sp.group].colour;
      top.appendChild(el('div', 'dc-kind', 'TITLE DEED'));
      top.appendChild(el('div', 'dc-name', sp.name));
      card.appendChild(top);
      const tbl = el('table', 'dc-rent');
      const row = (a, b, cls) => {
        const tr = el('tr', cls);
        tr.appendChild(el('td', null, a));
        tr.appendChild(el('td', null, b));
        tbl.appendChild(tr);
      };
      const setOwned = own !== null && S.players[own] && META.groups[sp.group] &&
        S.players[own].owns.filter((x) => META.board[x].group === sp.group).length === META.groups[sp.group].size;
      row('Rent', money(sp.rent[0]), S.houses[i] === 0 && !setOwned ? 'on' : '');
      row('With colour set', money(sp.rent[0] * 2), S.houses[i] === 0 && setOwned ? 'on' : '');
      for (let h = 1; h <= 4; h++) row(`With ${h} house${h > 1 ? 's' : ''}`, money(sp.rent[h]), S.houses[i] === h ? 'on' : '');
      row('With a hotel', money(sp.rent[5]), S.houses[i] === 5 ? 'on' : '');
      card.appendChild(tbl);
      card.appendChild(el('div', 'dc-foot', `Houses cost ${money(sp.build)} each · a hotel is ${money(sp.build)} plus four houses · mortgage ${money(sp.mortgage)}`));
    } else if (sp.type === 'rail') {
      const top = el('div', 'dc-top rail');
      top.appendChild(el('div', 'dc-kind', 'RAILWAY'));
      top.appendChild(el('div', 'dc-name', sp.name));
      card.appendChild(top);
      const held = own === null ? 0 : S.players[own].owns.filter((x) => META.rails.includes(x)).length;
      const tbl = el('table', 'dc-rent');
      META.railRent.slice(1).forEach((r, k) => {
        const tr = el('tr', held === k + 1 ? 'on' : '');
        tr.appendChild(el('td', null, `${k + 1} held`));
        tr.appendChild(el('td', null, money(r)));
        tbl.appendChild(tr);
      });
      card.appendChild(tbl);
      card.appendChild(el('div', 'dc-foot', `Mortgage ${money(sp.mortgage)}`));
    } else if (sp.type === 'utility') {
      const top = el('div', 'dc-top util');
      top.appendChild(el('div', 'dc-kind', 'CHARTER'));
      top.appendChild(el('div', 'dc-name', sp.name));
      card.appendChild(top);
      card.appendChild(el('p', 'dc-note', 'If one is held, rent is four times the roll. If both are held, rent is ten times the roll.'));
      card.appendChild(el('div', 'dc-foot', `Mortgage ${money(sp.mortgage)}`));
    } else {
      card.appendChild(el('div', 'dc-top'));
      card.appendChild(el('p', 'dc-note', sp.name));
    }

    const status = el('p', 'dc-owner');
    status.textContent = own === null ? 'Unclaimed.' : `Held by ${S.players[own].name}${S.mortgaged[i] ? ' — mortgaged' : ''}.`;
    card.appendChild(status);

    // the other side of the card: the painting, with what it costs
    const art = artFor(i) || (STREET_ART[i] ? `streets/${STREET_ART[i]}-p.webp` : null);
    const face = el('div', 'deedface');
    if (art) {
      const pic = el('div', 'df-pic');
      pic.style.setProperty('--img', `url("streets/${STREET_ART[i]}-p.webp")`);
      face.appendChild(pic);
    }
    const bar = el('div', 'df-bar');
    if (sp.type === 'street') bar.style.setProperty('--c', META.groups[sp.group].colour);
    bar.appendChild(el('b', null, sp.name));
    bar.appendChild(el('span', null, money(sp.price)));
    face.appendChild(bar);

    const flip = el('div', 'deedflip' + (deedFace ? ' flipped' : ''));
    flip.appendChild(card);
    flip.appendChild(face);
    flip.title = 'Click to turn the card over';
    const hint = el('p', 'dc-turn', deedFace ? 'click the card for the rents' : 'click the card to see its face');
    flip.addEventListener('click', () => {
      deedFace = !deedFace;
      flip.classList.toggle('flipped', deedFace);
      hint.textContent = deedFace ? 'click the card for the rents' : 'click the card to see its face';
    });
    body.appendChild(flip);
    body.appendChild(hint);

    // what I can do with it
    const acts = el('div', 'dc-acts');
    const can = (label, cls, fn, why) => {
      const b = el('button', 'btn ' + cls, label);
      if (why) { b.disabled = true; b.title = why; }
      else b.addEventListener('click', () => { fn(); });
      acts.appendChild(b);
    };
    if (own === me && me !== null && S.phase !== 'over') {
      if (sp.type === 'street') {
        const h = S.houses[i];
        if (h < 5) can(h === 4 ? `Raise a hotel (${money(sp.build)})` : `Build a house (${money(sp.build)})`, 'primary', () => send({ type: 'build', pos: i }), buildWhy(i));
        if (h > 0) can(`Sell one back (${money(Math.floor(sp.build / 2))})`, 'ghost', () => send({ type: 'sell', pos: i }), sellWhy(i));
      }
      if (S.mortgaged[i]) can(`Lift the mortgage (${money(Math.round(sp.mortgage * 1.1))})`, 'ghost', () => send({ type: 'unmortgage', pos: i }), S.players[me].cash < Math.round(sp.mortgage * 1.1) ? 'Not enough cash.' : null);
      else can(`Mortgage for ${money(sp.mortgage)}`, 'ghost', () => send({ type: 'mortgage', pos: i }), mortgageWhy(i));
    }
    body.appendChild(acts);
  }

  // mirrors of the engine's guards, so a button can say why it is greyed out
  function groupOf(i) { return META.board[i].group; }
  function membersOf(g) { return META.board.filter((s) => s.group === g).map((s) => s.i); }
  function buildWhy(i) {
    const sp = META.board[i], me = S.seat;
    const mem = membersOf(sp.group);
    if (!mem.every((x) => S.owner[x] === me)) return 'You need the whole colour group first.';
    if (mem.some((x) => S.mortgaged[x])) return 'Lift the mortgage on the group first.';
    const lowest = Math.min(...mem.map((x) => S.houses[x]));
    if (S.houses[i] > lowest) return 'Build evenly across the group.';
    if (S.houses[i] === 4 ? S.hotelsLeft < 1 : S.housesLeft < 1) return 'The bank has none left.';
    if (S.players[me].cash < sp.build) return 'Not enough cash.';
    return null;
  }
  function sellWhy(i) {
    const mem = membersOf(META.board[i].group);
    const highest = Math.max(...mem.map((x) => S.houses[x]));
    if (S.houses[i] < highest) return 'Sell evenly across the group.';
    if (S.houses[i] === 5 && S.housesLeft < 4) return 'The bank has no houses to give back.';
    return null;
  }
  function mortgageWhy(i) {
    const sp = META.board[i];
    if (sp.type === 'street' && membersOf(sp.group).some((x) => S.houses[x] > 0)) return 'Sell the buildings on that group first.';
    return null;
  }

  // ─────────────────────────────────────────── trading

  // ─────────────────────────────────────────── the deal table
  //
  // Your belongings on one side, theirs on the other, and a tray underneath.
  // Drag a deed or a bundle of notes down into your lane to offer it, or into
  // theirs to ask for it. Nothing is sent until you press the button.

  let deal = null;   // { give: {cash, props:Set}, want: {cash, props:Set} }

  function openTrade(seat) {
    tradeWith = seat;
    deal = { give: { cash: 0, props: new Set() }, want: { cash: 0, props: new Set() } };
    paintTrade();
    $('mTrade').classList.remove('hidden');
  }
  function closeTrade() { tradeWith = null; deal = null; $('mTrade').classList.add('hidden'); }

  /** The stack of notes you hold, one draggable chip per denomination. */
  function dealNotes(box, seat, lane) {
    box.innerHTML = '';
    const counts = {};
    let left = Math.max(0, Math.round(S.players[seat].cash));
    for (const note of NOTES) {
      const n = Math.floor(left / note);
      if (n > 0) { counts[note] = n; left -= n * note; }
    }
    if (!Object.keys(counts).length) { box.appendChild(el('span', 'ds-none', 'no cash')); return; }
    for (const note of NOTES) {
      const n = counts[note];
      if (!n) continue;
      const chip = el('div', 'dn');
      chip.style.setProperty('--note', `url("money/${note}.webp")`);
      chip.dataset.note = String(note);
      chip.appendChild(el('b', 'dn-x', n > 1 ? '×' + n : ''));
      chip.title = `${n} × ${money(note)} — drag one down, or tap it`;
      const add = () => {
        const side = deal[lane];
        if (side.cash + note > S.players[seat].cash) { flashLane(lane); return; }
        side.cash += note;
        sfx('coin');
        paintTray();
      };
      liftable(chip, {
        zones: [{ node: $(lane === 'give' ? 'mTrayGive' : 'mTrayWant') }],
        onDrop: add,
        onClick: add,
      });
      box.appendChild(chip);
    }
  }

  /** Their deeds, as little cards you can pull into the tray. */
  function dealProps(box, seat, lane) {
    box.innerHTML = '';
    const owns = S.players[seat].owns;
    if (!owns.length) { box.appendChild(el('span', 'ds-none', 'no deeds')); return; }
    for (const i of owns.slice().sort((x, y) => x - y)) {
      const sp = META.board[i];
      const colour = sp.type === 'street' ? META.groups[sp.group].colour
        : sp.type === 'rail' ? '#9a7434' : '#4aa3d6';
      const card = el('div', 'dp' + (S.mortgaged[i] ? ' mort' : ''));
      card.style.setProperty('--c', colour);
      card.dataset.pos = String(i);
      card.appendChild(el('span', 'dp-band'));
      const pic = el('span', 'dp-pic');
      if (STREET_ART[i]) pic.style.setProperty('--img', `url("streets/${STREET_ART[i]}-p.webp")`);
      card.appendChild(pic);
      card.appendChild(el('span', 'dp-nm', sp.name.replace(/\s+Railway$/, '').replace(/^Tehran\s+/, '')));
      const blocked = sp.type === 'street' && membersOf(sp.group).some((x) => S.houses[x] > 0);
      if (blocked) {
        card.classList.add('off');
        card.title = 'Sell the buildings on that colour first.';
      } else {
        card.title = `${sp.name} — ${money(sp.price)}`;
        const add = () => {
          if (deal[lane].props.has(i)) return;
          deal[lane].props.add(i);
          sfx('flip');
          paintTray();
        };
        liftable(card, {
          zones: [{ node: $(lane === 'give' ? 'mTrayGive' : 'mTrayWant') }],
          onDrop: add,
          onClick: add,
        });
      }
      box.appendChild(card);
    }
  }

  function flashLane(lane) {
    const n = $(lane === 'give' ? 'mTrayGive' : 'mTrayWant');
    n.classList.remove('nope'); void n.offsetWidth; n.classList.add('nope');
  }

  function paintTray() {
    for (const lane of ['give', 'want']) {
      const seat = lane === 'give' ? S.seat : tradeWith;
      const items = $(lane === 'give' ? 'mTrayGiveItems' : 'mTrayWantItems');
      const sum = $(lane === 'give' ? 'mTrayGiveSum' : 'mTrayWantSum');
      const side = deal[lane];
      items.innerHTML = '';
      if (!side.cash && !side.props.size) {
        items.appendChild(el('span', 'tl-hint',
          lane === 'give' ? 'drag what you are offering here' : 'drag what you are asking for here'));
      }
      if (side.cash) {
        const b = el('div', 'ti cash');
        b.appendChild(noteBundle(side.cash));
        b.title = 'tap to take it back';
        b.addEventListener('click', () => { side.cash = 0; sfx('coin'); paintTray(); });
        items.appendChild(b);
      }
      for (const i of [...side.props].sort((x, y) => x - y)) {
        const sp = META.board[i];
        const colour = sp.type === 'street' ? META.groups[sp.group].colour
          : sp.type === 'rail' ? '#9a7434' : '#4aa3d6';
        const t = el('div', 'ti dp');
        t.style.setProperty('--c', colour);
        t.appendChild(el('span', 'dp-band'));
        const pic = el('span', 'dp-pic');
        if (STREET_ART[i]) pic.style.setProperty('--img', `url("streets/${STREET_ART[i]}-p.webp")`);
        t.appendChild(pic);
        t.appendChild(el('span', 'dp-nm', sp.name.replace(/\s+Railway$/, '').replace(/^Tehran\s+/, '')));
        t.title = 'tap to take it back';
        t.addEventListener('click', () => { side.props.delete(i); sfx('flip'); paintTray(); });
        items.appendChild(t);
      }
      const worth = side.cash + [...side.props].reduce((n, i) => n + (META.board[i].price || 0), 0);
      sum.textContent = worth ? money(worth) : '';
      void seat;
    }
    const empty = !deal.give.cash && !deal.give.props.size && !deal.want.cash && !deal.want.props.size;
    $('mDealSend').disabled = empty;
  }

  function paintTrade() {
    if (tradeWith === null || !S || S.seat === null || !deal) return;
    const me = S.seat, them = tradeWith;
    $('mTradeTitle').textContent = `Dealing with ${S.players[them].name}`;
    $('mDealMineName').textContent = `${S.players[me].name} — you`;
    $('mDealMineCash').textContent = money(S.players[me].cash);
    $('mDealThemName').textContent = S.players[them].name;
    $('mDealThemCash').textContent = money(S.players[them].cash);
    dealNotes($('mDealMineNotes'), me, 'give');
    dealProps($('mDealMineProps'), me, 'give');
    dealNotes($('mDealThemNotes'), them, 'want');
    dealProps($('mDealThemProps'), them, 'want');
    paintTray();
  }

  function bindDeal() {
    $('mDealClear').addEventListener('click', () => {
      deal = { give: { cash: 0, props: new Set() }, want: { cash: 0, props: new Set() } };
      paintTray();
    });
    $('mDealSend').addEventListener('click', () => {
      if (tradeWith === null || !deal) return;
      send({
        type: 'propose', to: tradeWith,
        give: { cash: deal.give.cash, props: [...deal.give.props] },
        want: { cash: deal.want.cash, props: [...deal.want.props] },
      });
      closeTrade();
    });
  }

  let lastOfferKey = null;
  /** One side of an offer, drawn the way it sat in the tray. */
  function offerPile(cash, props) {
    const pile = el('div', 'of-pile');
    if (!cash && !props.length) { pile.appendChild(el('span', 'of-none', 'nothing')); return pile; }
    if (cash) {
      const c = el('div', 'of-cash');
      c.appendChild(noteBundle(cash));
      pile.appendChild(c);
    }
    for (const i of props) {
      const sp = META.board[i];
      const colour = sp.type === 'street' ? META.groups[sp.group].colour
        : sp.type === 'rail' ? '#9a7434' : '#4aa3d6';
      const card = el('div', 'dp');
      card.style.setProperty('--c', colour);
      card.title = `${sp.name} — ${money(sp.price)}`;
      card.appendChild(el('span', 'dp-band'));
      const pic = el('span', 'dp-pic');
      if (STREET_ART[i]) pic.style.setProperty('--img', `url("streets/${STREET_ART[i]}-p.webp")`);
      card.appendChild(pic);
      card.appendChild(el('span', 'dp-nm', sp.name.replace(/\s+Railway$/, '').replace(/^Tehran\s+/, '')));
      pile.appendChild(card);
    }
    return pile;
  }

  /**
   * The offer on the table. Everybody sees it, laid out as the two piles that
   * would change hands — not a line of text you have to decode.
   */
  function paintOffer() {
    const box = $('mOffer');
    const o = S.offer;
    if (!o) { box.classList.add('hidden'); lastOfferKey = null; return; }
    if (o.at !== seenOffer) { seenOffer = o.at; sfx('flip'); lastOfferKey = null; }
    box.classList.remove('hidden');
    const key = [o.at, Math.round((o.expiresAt || 0) / 1000), S.seat].join('|');
    if (key === lastOfferKey) return;
    lastOfferKey = key;
    const from = S.players[o.from], to = S.players[o.to];
    box.innerHTML = '';

    const head = el('div', 'of-head');
    const chip = (p) => {
      const c = el('i', 'of-chip');
      c.style.setProperty('--c', p.colour);
      c.style.setProperty('--piece', pieceImg(p.token || 'lion'));
      return c;
    };
    head.appendChild(chip(from));
    head.appendChild(el('b', null, from.name));
    head.appendChild(el('span', 'of-arrow', 'offers'));
    head.appendChild(chip(to));
    head.appendChild(el('b', null, to.name));
    if (o.expiresAt) {
      const left = Math.max(0, Math.round((o.expiresAt - Date.now()) / 1000));
      head.appendChild(el('span', 'of-exp' + (left <= 10 ? ' low' : ''), `${left}s`));
    }
    box.appendChild(head);

    const sides = el('div', 'of-sides');
    const col = (label, cash, props) => {
      const c = el('div', 'of-col');
      c.appendChild(el('span', 'of-lab', label));
      c.appendChild(offerPile(cash, props));
      return c;
    };
    sides.appendChild(col(`${from.name} gives`, o.giveCash, o.giveProps));
    sides.appendChild(el('div', 'of-swap', '⇄'));
    sides.appendChild(col(`${from.name} wants`, o.wantCash, o.wantProps));
    box.appendChild(sides);

    const row = el('div', 'of-btns');
    if (o.to === S.seat) {
      const yes = el('button', 'btn primary', 'Accept');
      yes.addEventListener('click', () => send({ type: 'respond', accept: true }));
      const no = el('button', 'btn ghost', 'Decline');
      no.addEventListener('click', () => send({ type: 'respond', accept: false }));
      row.appendChild(yes); row.appendChild(no);
    } else if (o.from === S.seat) {
      const w = el('button', 'btn ghost', 'Withdraw');
      w.addEventListener('click', () => send({ type: 'withdraw' }));
      row.appendChild(w);
    } else {
      row.appendChild(el('span', 'of-wait', `waiting on ${to.name}`));
    }
    box.appendChild(row);
  }

  // ─────────────────────────────────────────── log

  function paintLog() {
    const box = $('mLog');
    box.innerHTML = '';
    for (const line of S.log.slice(-9)) box.appendChild(el('p', null, line));
    box.scrollTop = box.scrollHeight;
  }

  function paint() {
    if (!S || !built) return;
    syncTokens();
    paintCells();
    paintPlayers();
    paintTurnCard();
    paintHud();
    paintLog();
    paintOffer();
    paintAuction();
    playMoneyMoves();
    // while the board is still animating the last move, the buttons on screen
    // describe a moment that has already passed — so freeze them until it lands
    $('mActions').classList.toggle('busy', running || queue.length > 0);
    diceHint();
    if (!running && queue.length === 0) {
      // only trust the server's positions when nothing is waiting to be drawn
      S.players.forEach((p, i) => { shown[i] = p.pos; });
      placeTokens(false);
      actionBar();
      paintDeeds();
      paintNotes();
      if (deedOpen !== null) paintDeed();
    }
    const over = $('mOver');
    if (S.phase === 'over') {
      $('mOverTitle').textContent = S.winner !== null ? `${S.players[S.winner].name} wins` : 'The bazaar closes';
      const list = S.players.slice().sort((a, b) => b.worth - a.worth)
        .map((p) => `${p.name} — ${p.bust ? 'ruined' : money(p.worth)}`).join('\n');
      $('mOverBody').textContent = `${S.overReason || ''}\n\n${list}`;
      over.classList.remove('hidden');
    } else over.classList.add('hidden');
  }

  // ─────────────────────────────────────────── entry points

  let clockTimer = null;

  function render(state) {
    const first = !built;
    S = state;
    if (!META) return;                       // still loading the board
    if (first) buildBoard();

    // Everything that just happened, played back in the order it happened —
    // the card that sent you somewhere is read out before the piece moves, and
    // any other jump gets a word of explanation first.
    const jobs = [];
    if (S.lastMove && S.lastMove.id > seenMove) {
      const move = S.lastMove;
      const dice = S.dice;
      seenMove = move.id;
      if (dice && !move.jump) jobs.push({ at: move.id - 0.5, run: (d) => animateDice(dice, d) });
      jobs.push({ at: move.id, move, run: (d) => animateMove(move, d) });
    }
    if (S.lastCard && S.lastCard.at > seenCard) {
      const card = S.lastCard;
      seenCard = card.at;
      jobs.push({ at: card.at, card: true, run: (d) => animateCard(card, d) });
    }
    jobs.sort((a, b) => a.at - b.at);
    jobs.forEach((j, k) => {
      if (j.move && (j.move.jump || j.move.back) && !(k > 0 && jobs[k - 1].card)) {
        enqueue((d) => announceMove(j.move, d));
      }
      enqueue(j.run);
    });
    paint();

    clearInterval(clockTimer);
    if (S.endsAt && S.phase !== 'over') clockTimer = setInterval(paintHud, 1000);
  }

  function reset() {
    built = false; cells = []; tokens = []; shown = []; centres = [];
    queue = []; running = false; seenMove = 0; seenCard = 0; seenOffer = 0;
    zoom = 1; panX = 0; panY = 0; viewSet = false; prevCash = null;
    const fx = $('moneyFx');
    if (fx) fx.innerHTML = '';
    lastActionKey = null; lastDeedKey = null; lastPlayerKey = null;
    const notes = $('mNotes');
    if (notes) delete notes.dataset.at;
    lastAuctionKey = null; lastOfferKey = null;
    deedOpen = null; tradeWith = null;
    clearInterval(clockTimer);
    const b = $('mBoard');
    if (b) b.innerHTML = '';
  }

  function init(deps) {
    socket = deps.socket; sound = deps.sound; toast = deps.toast;
    fetch('/bazaar-board.json')
      .then((r) => r.json())
      .then((meta) => { META = meta; if (S) render(S); })
      .catch(() => {});
    // on a touch screen there is no hover, so the label opens the pile
    $('mCashLabel').addEventListener('click', () => $('mCashBox').classList.toggle('open'));
    $('mPeekBack').addEventListener('click', () => {
      peekSeat = null;
      lastPlayerKey = null; lastDeedKey = null;
      delete $('mNotes').dataset.at;
      paint();
    });
    $('mDeedClose').addEventListener('click', closeDeed);
    $('mDeed').addEventListener('click', (e) => { if (e.target.id === 'mDeed') closeDeed(); });
    $('mTradeClose').addEventListener('click', closeTrade);
    $('mTrade').addEventListener('click', (e) => { if (e.target.id === 'mTrade') closeTrade(); });
    bindDeal();
  }

  return { init, render, reset };
})();
