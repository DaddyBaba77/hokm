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

  const ICONS = {
    rail: '<svg viewBox="0 0 24 24" class="sq-ico"><path d="M5 3h14v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V3z"/><rect x="7.2" y="5.2" width="4" height="4" class="hole"/><rect x="12.8" y="5.2" width="4" height="4" class="hole"/><circle cx="9" cy="13.4" r="1.1" class="hole"/><circle cx="15" cy="13.4" r="1.1" class="hole"/><path d="M6 17.6l-2 3.4M18 17.6l2 3.4M8.6 18.6h6.8" class="ln"/></svg>',
    lamp: '<svg viewBox="0 0 24 24" class="sq-ico"><path d="M12 2.6l1.9 3.2 3.6.7-2.5 2.7.5 3.7L12 11.3l-3.5 1.6.5-3.7L6.5 6.5l3.6-.7z"/><path d="M12 12.6v5.2M8.4 21h7.2" class="ln"/><ellipse cx="12" cy="18.4" rx="3.4" ry="1.1" class="hole"/></svg>',
    water: '<svg viewBox="0 0 24 24" class="sq-ico"><path d="M12 2.4c3.6 4.6 6 7.7 6 10.6a6 6 0 0 1-12 0c0-2.9 2.4-6 6-10.6z"/><path d="M9.2 13.6a2.9 2.9 0 0 0 2.9 2.9" class="ln2"/></svg>',
    fortune: '<svg viewBox="0 0 24 24" class="sq-ico"><path d="M8.6 8.4a3.4 3.4 0 1 1 4.6 3.2c-.9.4-1.2 1-1.2 1.9v.6"/><circle cx="12" cy="18.4" r="1.5"/></svg>',
    treasury: '<svg viewBox="0 0 24 24" class="sq-ico"><path d="M3.4 9.2h17.2v9.6H3.4z"/><path d="M3.4 9.2l2.2-4h12.8l2.2 4" class="ln"/><rect x="10.2" y="8" width="3.6" height="5.2" class="hole"/><path d="M3.4 13.4h17.2" class="ln"/></svg>',
    tax: '<svg viewBox="0 0 24 24" class="sq-ico"><circle cx="12" cy="12" r="7.6"/><path d="M12 7.4v9.2M9.6 9.6h4a1.9 1.9 0 0 1 0 3.8h-3.2a1.9 1.9 0 0 0 0 3.8h4" class="ln2 on-gold"/></svg>',
    jewel: '<svg viewBox="0 0 24 24" class="sq-ico"><path d="M7.6 4h8.8l3.6 5-8 11-8-11z"/><path d="M4 9h16M9.2 9L12 20M14.8 9L12 20M7.6 4l1.6 5M16.4 4l-1.6 5" class="ln2 on-gold"/></svg>',
  };

  function makeCell(sp) {
    const side = sideOf(sp.i);
    const cell = el('div', `sq s-${side} t-${sp.type}`);
    cell.dataset.i = sp.i;
    const pos = gridAt(sp.i);
    cell.style.gridRow = pos.r;
    cell.style.gridColumn = pos.c;

    if (sp.type === 'street') {
      const band = el('div', 'band');
      band.style.setProperty('--c', META.groups[sp.group].colour);
      band.appendChild(el('div', 'blds'));
      cell.appendChild(band);
    }

    const inner = el('div', 'sq-in');
    if (side === 'corner') {
      inner.classList.add('corner-in');
      inner.appendChild(el('div', 'cn-name', sp.name));
      inner.appendChild(el('div', 'cn-fa', sp.fa));
      if (sp.type === 'go') inner.appendChild(el('div', 'cn-note', `Collect ${money(200)}`));
      if (sp.type === 'jail') inner.appendChild(el('div', 'cn-note', 'just visiting'));
      if (sp.type === 'parking') inner.appendChild(el('div', 'cn-note', 'rest here'));
      if (sp.type === 'gotojail') inner.appendChild(el('div', 'cn-note', 'straight there'));
    } else {
      const ico = sp.type === 'rail' ? ICONS.rail
        : sp.type === 'utility' ? (sp.i === 12 ? ICONS.lamp : ICONS.water)
        : sp.type === 'fortune' ? ICONS.fortune
        : sp.type === 'treasury' ? ICONS.treasury
        : sp.type === 'tax' ? (sp.tax === 200 ? ICONS.tax : ICONS.jewel)
        : null;
      if (ico) { const box = el('div', 'sq-icobox'); box.innerHTML = ico; inner.appendChild(box); }
      inner.appendChild(el('div', 'nm', sp.name));
      if (sp.price) inner.appendChild(el('div', 'pr', money(sp.price)));
      else if (sp.tax) inner.appendChild(el('div', 'pr', `pay ${money(sp.tax)}`));
      else inner.appendChild(el('div', 'fa', sp.fa));
    }
    cell.appendChild(inner);
    cell.appendChild(el('div', 'own'));
    cell.appendChild(el('div', 'mortmark', 'MORTGAGED'));
    if (sp.price) cell.addEventListener('click', () => openDeed(sp.i));
    return cell;
  }

  function centrePiece() {
    const c = el('div', 'mono-centre');
    c.innerHTML = `
      <div class="mc-art"></div>
      <div class="mc-deck treasury" id="mcTreasury">
        <div class="deck-card"><span class="deck-ico">${ICONS.treasury}</span><b>TREASURY</b><i>گنجینه</i></div>
      </div>
      <div class="mc-deck fortune" id="mcFortune">
        <div class="deck-card"><span class="deck-ico">${ICONS.fortune}</span><b>FORTUNE</b><i>فال</i></div>
      </div>
      <div class="mc-banner"><b>BAZAAR</b><i>بازار</i></div>
      <div class="mc-dice" id="mcDice">
        <div class="mono-die" id="die1"></div>
        <div class="mono-die" id="die2"></div>
      </div>
      <div class="mc-turn" id="mcTurn"></div>`;
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
  function setDieFace(node, n, extra) {
    const f = FACES.find((x) => x.n === n) || FACES[0];
    const spins = Number(node.dataset.spin || 0) + 1;
    node.dataset.spin = spins;
    const turns = 360 * (2 + (extra % 2));
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
    built = true;
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
  }

  /** Cache the pixel centre of every square, and tell the CSS how deep an edge cell is. */
  let centres = [];
  function measure() {
    if (!built) return;
    const board = $('mBoard');
    const base = board.getBoundingClientRect();
    centres = cells.map((cell) => {
      const r = cell.getBoundingClientRect();
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2, w: r.width, h: r.height };
    });
    const edge = centres[1];
    if (edge && edge.w) {
      board.style.setProperty('--ew', edge.w + 'px');
      board.style.setProperty('--ed', edge.h + 'px');
    }
    placeTokens(true);
  }

  // ─────────────────────────────────────────── tokens

  const TOKEN_ART = {
    lamp: 'M12 4.6l1.6 2.8 3.1.6-2.2 2.3.4 3.2L12 12.1l-2.9 1.4.4-3.2L7.3 8l3.1-.6z',
    teapot: 'M5.4 10.6h9.2v4.2a4 4 0 0 1-4 4H9.4a4 4 0 0 1-4-4zM14.6 11.8h2.2a2.4 2.4 0 0 1 0 4.8h-1M8 10.6l1.4-3h1.8l1.4 3',
    camel: 'M4.6 16.4V12c1.4 0 1.6-2.6 3.2-2.6S9.6 12 11 12s1.6-3 3.2-3 2.2 2.4 2.2 4v3.4M16.4 9.2c.4-1.4 1.2-2 2.2-2',
    dagger: 'M12 3.4l1.8 9.2h-3.6zM8.8 12.6h6.4v1.8H8.8zM12 14.4v6.2',
    lute: 'M9.6 19.4a4 4 0 1 0 4-4 4 4 0 0 0-4 4zM13.4 14.8l4.4-9.4',
    scales: 'M12 4.2v15.2M6 20.2h12M5 8.6h14M5 8.6L2.6 14h4.8zM19 8.6L16.6 14h4.8z',
    key: 'M8.4 15.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM11.6 12.2h8.2M17.4 12.2v3M19.8 12.2v3.6',
    cat: 'M6.6 9.4l-.8-4 3.6 2.2h5.2l3.6-2.2-.8 4M6.6 9.4a6 6 0 0 0 10.8 0M8.6 12.4h.01M15.4 12.4h.01',
  };

  function syncTokens() {
    const layer = $('mTokens');
    if (!layer) return;
    if (tokens.length !== S.players.length) {
      layer.innerHTML = '';
      tokens = S.players.map((p) => {
        const t = el('div', 'tok');
        t.style.setProperty('--c', p.colour);
        t.innerHTML = `<svg viewBox="0 0 24 24"><path d="${TOKEN_ART[p.token] || TOKEN_ART.lamp}"/></svg>`;
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
    for (const [sq, list] of Object.entries(bySquare)) {
      const c = centres[Number(sq)];
      if (!c) continue;
      const n = list.length;
      const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
      const size = Math.min(c.w, c.h) * (n > 4 ? 0.3 : 0.38);
      list.forEach((seat, k) => {
        const col = k % cols, row = Math.floor(k / cols);
        const rows = Math.ceil(n / cols);
        const x = c.x + (col - (cols - 1) / 2) * size * 1.05;
        const y = c.y + (row - (rows - 1) / 2) * size * 1.05 + Math.min(c.w, c.h) * 0.08;
        const t = tokens[seat];
        t.style.width = size + 'px';
        t.style.height = size + 'px';
        t.style.transition = instant ? 'none' : '';
        t.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
        if (instant) requestAnimationFrame(() => { t.style.transition = ''; });
      });
    }
    tokens.forEach((t, i) => {
      if (S && S.players[i] && S.players[i].bust) t.style.opacity = '0';
    });
  }

  // ─────────────────────────────────────────── animation queue

  function enqueue(job) { queue.push(job); if (!running) drain(); }

  function drain() {
    if (!queue.length) { running = false; paint(); return; }
    running = true;
    const job = queue.shift();
    job(() => setTimeout(drain, 20));
  }

  const STEP_MS = 150;

  function animateMove(move, done) {
    const seat = move.seat;
    if (!tokens[seat]) { done(); return; }
    if (move.jump || move.steps === undefined) {
      shown[seat] = move.to;
      tokens[seat].classList.add('leap');
      placeTokens(false);
      sfx('hop');
      setTimeout(() => { tokens[seat].classList.remove('leap'); done(); }, 520);
      return;
    }
    const steps = [];
    let at = move.from;
    for (let k = 0; k < move.steps; k++) { at = (at + 1) % 40; steps.push(at); }
    const per = Math.max(70, Math.min(STEP_MS, 1500 / Math.max(1, steps.length)));
    let k = 0;
    const hop = () => {
      if (k >= steps.length) {
        if (steps.includes(0) && move.to !== 0) flashGo();
        done();
        return;
      }
      shown[seat] = steps[k];
      if (steps[k] === 0) flashGo();
      placeTokens(false);
      sfx('hop');
      k++;
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

  function animateDice(dice, done) {
    const box = $('mcDice');
    if (!box || !dice) { done(); return; }
    box.classList.remove('landed');
    box.classList.add('rolling');
    sfx('dice');
    setDieFace($('die1'), dice.d1, 1);
    setDieFace($('die2'), dice.d2, 2);
    setTimeout(() => {
      box.classList.remove('rolling');
      box.classList.add('landed');
      if (dice.double) box.classList.add('dbl');
      else box.classList.remove('dbl');
      done();
    }, 820);
  }

  function animateCard(card, done) {
    const pop = $('mCard');
    $('mCardDeck').textContent = card.deck === 'fortune' ? 'FORTUNE' : 'TREASURY';
    $('mCardFa').textContent = card.deck === 'fortune' ? 'فال' : 'گنجینه';
    $('mCardText').textContent = card.text;
    $('mCardWho').textContent = S.players[card.seat] ? S.players[card.seat].name : '';
    pop.className = 'mono-card ' + card.deck;
    pop.classList.remove('hidden');
    void pop.offsetWidth;
    pop.classList.add('in');
    sfx('flip');
    setTimeout(() => {
      pop.classList.remove('in');
      setTimeout(() => { pop.classList.add('hidden'); done(); }, 260);
    }, 2400);
  }

  // ─────────────────────────────────────────── painting

  function paintCells() {
    for (const sp of META.board) {
      const cell = cells[sp.i];
      if (!cell || !sp.price) continue;
      const own = S.owner[sp.i];
      const strip = cell.querySelector('.own');
      if (own === null || own === undefined) {
        cell.classList.remove('owned');
        strip.style.background = '';
        cell.style.removeProperty('--owncol');
      } else {
        cell.classList.add('owned');
        const col = S.players[own] ? S.players[own].colour : '#fff';
        strip.style.background = col;
        cell.style.setProperty('--owncol', col);
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
      const row = el('div', 'mp' + (p.seat === S.turn && S.phase !== 'over' ? ' turn' : '') + (p.bust ? ' bust' : '') + (p.seat === S.seat ? ' me' : ''));
      row.style.setProperty('--c', p.colour);
      const chip = el('div', 'mp-chip');
      chip.innerHTML = `<svg viewBox="0 0 24 24"><path d="${TOKEN_ART[p.token] || TOKEN_ART.lamp}"/></svg>`;
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
      if (p.jailed) right.appendChild(el('span', 'mp-jail', 'in the dungeon'));
      if (p.pardons > 0) right.appendChild(el('span', 'mp-pardon', `${p.pardons} pardon${p.pardons > 1 ? 's' : ''}`));
      row.appendChild(right);
      if (p.seat !== S.seat && !p.bust && S.seat !== null && S.phase !== 'over') {
        const t = el('button', 'mp-trade', 'Offer');
        t.addEventListener('click', (e) => { e.stopPropagation(); openTrade(p.seat); });
        row.appendChild(t);
      }
      box.appendChild(row);
    }
  }

  function paintTurnCard() {
    const t = $('mcTurn');
    if (!t) return;
    if (S.phase === 'over') {
      t.innerHTML = `<div class="mt-who">the bazaar closes</div><div class="mt-what">${S.winner !== null ? S.players[S.winner].name + ' wins' : 'no winner'}</div>`;
      return;
    }
    const p = S.players[S.turn];
    const phase = {
      roll: 'to roll', buy: 'deciding', auction: 'auction', debt: 'must raise cash', end_turn: 'finishing up',
    }[S.phase] || '';
    t.innerHTML = `<div class="mt-who" style="color:${p.colour}">${p.name}</div><div class="mt-what">${phase}</div>`;
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
        box.appendChild(el('p', 'mhint', `In the dungeon — turn ${S.players[me].jailTurns + 1} of 3.`));
        btn('Roll for a double', 'primary big', () => send({ type: 'roll' }));
        if (S.players[me].pardons > 0) btn('Use a pardon', 'ghost', () => send({ type: 'useCard' }));
        const f = btn(`Pay the ${money(50)} fine`, 'ghost', () => send({ type: 'payFine' }));
        if (S.players[me].cash < 50) f.disabled = true;
        return;
      }
      btn('Roll', 'primary big', () => send({ type: 'roll' }), S.doubles > 0 ? `double — go again` : null);
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
  function paintAuction() {
    const box = $('mAuction');
    const a = S.auction;
    if (!a || S.phase !== 'auction') {
      box.classList.add('hidden');
      lastAuctionKey = null;
      return;
    }
    const key = [a.pos, a.high, a.highSeat, a.turn, a.out.join(','), S.seat].join('|');
    box.classList.remove('hidden');
    if (key === lastAuctionKey) return;
    lastAuctionKey = key;

    const sp = META.board[a.pos];
    const me = S.seat;
    const mine = a.turn === me && me !== null && me !== undefined;
    box.innerHTML = '';

    const strip = el('div', 'au-strip');
    strip.style.background = sp.type === 'street' ? META.groups[sp.group].colour : '#c9b48a';
    box.appendChild(strip);
    box.appendChild(el('div', 'au-kind', 'UP FOR AUCTION'));
    box.appendChild(el('div', 'au-name', sp.name));
    box.appendChild(el('div', 'au-list', `list price ${money(sp.price)}`));

    const high = el('div', 'au-high');
    if (a.highSeat === null) high.textContent = 'No bids yet';
    else {
      high.innerHTML = `<b>${money(a.high)}</b><span>from ${S.players[a.highSeat].name}</span>`;
      high.style.setProperty('--c', S.players[a.highSeat].colour);
    }
    box.appendChild(high);

    const who = el('div', 'au-who');
    for (const p of S.players) {
      if (p.bust) continue;
      const chip = el('span', 'au-chip' + (a.out.includes(p.seat) ? ' out' : '') + (a.turn === p.seat ? ' on' : ''), p.name);
      chip.style.setProperty('--c', p.colour);
      who.appendChild(chip);
    }
    box.appendChild(who);

    if (!mine) {
      box.appendChild(el('p', 'au-wait', `waiting on ${S.players[a.turn].name}`));
      return;
    }

    const cash = S.players[me].cash;
    const step = Math.max(5, Math.round(sp.price * 0.08 / 5) * 5);
    const row = el('div', 'au-row');
    const input = el('input', 'au-input');
    input.type = 'number';
    input.min = a.high + 1;
    input.max = cash;
    input.value = Math.min(cash, a.high + step);
    row.appendChild(input);
    const go = el('button', 'btn primary', 'Bid');
    go.addEventListener('click', () => send({ type: 'bid', amount: Number(input.value) }));
    row.appendChild(go);
    box.appendChild(row);

    const quick = el('div', 'au-quick');
    for (const s of [step, 50, 100]) {
      const amount = a.high + s;
      const q = el('button', 'btn ghost small', '+' + s);
      if (amount > cash) q.disabled = true;
      else q.addEventListener('click', () => send({ type: 'bid', amount }));
      quick.appendChild(q);
    }
    const out = el('button', 'btn ghost small', 'Drop out');
    out.addEventListener('click', () => send({ type: 'passBid' }));
    quick.appendChild(out);
    box.appendChild(quick);
    box.appendChild(el('p', 'au-cash', `you hold ${money(cash)}`));
  }

  // ─────────────────────────────────────────── my deeds

  let lastDeedKey = null;
  function paintDeeds() {
    const me = S.seat;
    const key = me === null || me === undefined ? 'none'
      : S.players[me].owns.join(',') + '|' + S.houses.join('') + '|' + S.mortgaged.map((m) => (m ? 1 : 0)).join('');
    if (key === lastDeedKey) return;
    lastDeedKey = key;
    const box = $('mDeeds');
    box.innerHTML = '';
    if (me === null || me === undefined) return;
    const mine = S.players[me].owns;
    if (!mine.length) { box.appendChild(el('p', 'mhint dim', 'You hold no deeds yet.')); return; }
    const byGroup = {};
    for (const i of mine) {
      const sp = META.board[i];
      const key = sp.type === 'street' ? sp.group : sp.type;
      (byGroup[key] ||= []).push(i);
    }
    for (const [key, list] of Object.entries(byGroup)) {
      const g = META.groups[key];
      const wrap = el('div', 'dg');
      const head = el('div', 'dg-head');
      head.style.setProperty('--c', g ? g.colour : '#c9b48a');
      const full = g && list.length === g.size;
      head.appendChild(el('span', 'dg-name', g ? g.name : key === 'rail' ? 'Caravanserais' : 'Utilities'));
      if (full) head.appendChild(el('span', 'dg-full', 'complete'));
      wrap.appendChild(head);
      for (const i of list) {
        const sp = META.board[i];
        const row = el('button', 'dr' + (S.mortgaged[i] ? ' mort' : ''));
        row.appendChild(el('span', 'dr-nm', sp.name));
        if (sp.type === 'street' && S.houses[i] > 0) {
          row.appendChild(el('span', 'dr-b', S.houses[i] === 5 ? 'hotel' : '⌂'.repeat(S.houses[i])));
        }
        if (S.mortgaged[i]) row.appendChild(el('span', 'dr-m', 'mortgaged'));
        row.addEventListener('click', () => openDeed(i));
        wrap.appendChild(row);
      }
      box.appendChild(wrap);
    }
  }

  // ─────────────────────────────────────────── the deed card

  function openDeed(i) { deedOpen = i; paintDeed(); $('mDeed').classList.remove('hidden'); }
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
      top.appendChild(el('div', 'dc-kind', 'CARAVANSERAI'));
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
    body.appendChild(card);

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

  function openTrade(seat) { tradeWith = seat; paintTrade(); $('mTrade').classList.remove('hidden'); }
  function closeTrade() { tradeWith = null; $('mTrade').classList.add('hidden'); }

  function paintTrade() {
    if (tradeWith === null || !S || S.seat === null) return;
    const me = S.seat, them = tradeWith;
    $('mTradeTitle').textContent = `Offer to ${S.players[them].name}`;
    const body = $('mTradeBody');
    body.innerHTML = '';

    const side = (label, seat, key) => {
      const col = el('div', 'tr-col');
      col.appendChild(el('h4', null, label));
      const cashRow = el('label', 'tr-cashrow');
      cashRow.appendChild(el('span', null, 'cash'));
      const cash = el('input', 'tr-cash');
      cash.type = 'number'; cash.min = 0; cash.max = S.players[seat].cash; cash.value = 0;
      cash.dataset.key = key;
      cashRow.appendChild(cash);
      col.appendChild(cashRow);
      col.appendChild(el('p', 'tr-holds', `holds ${money(S.players[seat].cash)}`));
      const list = el('div', 'tr-props');
      for (const i of S.players[seat].owns) {
        const sp = META.board[i];
        const lab = el('label', 'tr-p');
        const cb = el('input');
        cb.type = 'checkbox'; cb.value = i; cb.dataset.key = key;
        const blocked = sp.type === 'street' && membersOf(sp.group).some((x) => S.houses[x] > 0);
        if (blocked) { cb.disabled = true; lab.title = 'Sell the buildings on that group first.'; lab.classList.add('off'); }
        lab.appendChild(cb);
        const dot = el('i');
        dot.style.background = sp.type === 'street' ? META.groups[sp.group].colour : '#c9b48a';
        lab.appendChild(dot);
        lab.appendChild(el('span', null, sp.name));
        list.appendChild(lab);
      }
      col.appendChild(list);
      return col;
    };

    const grid = el('div', 'tr-grid');
    grid.appendChild(side('You give', me, 'give'));
    grid.appendChild(side('You get', them, 'want'));
    body.appendChild(grid);

    const go = el('button', 'btn primary big', 'Send the offer');
    go.addEventListener('click', () => {
      const grab = (key) => ({
        cash: Number(body.querySelector(`input.tr-cash[data-key="${key}"]`).value) || 0,
        props: [...body.querySelectorAll(`input[type=checkbox][data-key="${key}"]:checked`)].map((c) => Number(c.value)),
      });
      send({ type: 'propose', to: them, give: grab('give'), want: grab('want') });
      closeTrade();
    });
    body.appendChild(go);
  }

  let lastOfferKey = null;
  function paintOffer() {
    const box = $('mOffer');
    const o = S.offer;
    if (!o || S.seat === null) { box.classList.add('hidden'); lastOfferKey = null; return; }
    if (o.at !== seenOffer) { seenOffer = o.at; sfx('flip'); lastOfferKey = null; }
    box.classList.remove('hidden');
    const key = [o.at, Math.round((o.expiresAt || 0) / 1000)].join('|');
    if (key === lastOfferKey) return;
    lastOfferKey = key;
    const from = S.players[o.from], to = S.players[o.to];
    const names = (list) => list.map((i) => META.board[i].name).join(', ') || 'nothing';
    box.innerHTML = '';
    box.appendChild(el('h4', null, `${from.name} offers ${to.name}`));
    box.appendChild(el('p', 'tr-line', `${from.name} gives: ${o.giveCash ? money(o.giveCash) + (o.giveProps.length ? ' + ' : '') : ''}${o.giveProps.length ? names(o.giveProps) : (o.giveCash ? '' : 'nothing')}`));
    box.appendChild(el('p', 'tr-line', `${from.name} wants: ${o.wantCash ? money(o.wantCash) + (o.wantProps.length ? ' + ' : '') : ''}${o.wantProps.length ? names(o.wantProps) : (o.wantCash ? '' : 'nothing')}`));
    if (o.expiresAt) {
      const left = Math.max(0, Math.round((o.expiresAt - Date.now()) / 1000));
      box.appendChild(el('p', 'tr-exp', `lapses in ${left}s`));
    }
    const row = el('div', 'tr-btns');
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
    // while the board is still animating the last move, the buttons on screen
    // describe a moment that has already passed — so freeze them until it lands
    $('mActions').classList.toggle('busy', running || queue.length > 0);
    if (!running && queue.length === 0) {
      // only trust the server's positions when nothing is waiting to be drawn
      S.players.forEach((p, i) => { shown[i] = p.pos; });
      placeTokens(false);
      actionBar();
      paintDeeds();
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

    // dice, then the move, then any card — in the order they happened
    if (S.lastMove && S.lastMove.id > seenMove) {
      const move = S.lastMove;
      const dice = S.dice;
      seenMove = move.id;
      if (dice && !move.jump) enqueue((done) => animateDice(dice, done));
      enqueue((done) => animateMove(move, done));
    }
    if (S.lastCard && S.lastCard.at > seenCard) {
      const card = S.lastCard;
      seenCard = card.at;
      enqueue((done) => animateCard(card, done));
    }
    paint();

    clearInterval(clockTimer);
    if (S.endsAt && S.phase !== 'over') clockTimer = setInterval(paintHud, 1000);
  }

  function reset() {
    built = false; cells = []; tokens = []; shown = []; centres = [];
    queue = []; running = false; seenMove = 0; seenCard = 0; seenOffer = 0;
    lastActionKey = null; lastDeedKey = null; lastPlayerKey = null;
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
    $('mDeedClose').addEventListener('click', closeDeed);
    $('mDeed').addEventListener('click', (e) => { if (e.target.id === 'mDeed') closeDeed(); });
    $('mTradeClose').addEventListener('click', closeTrade);
    $('mTrade').addEventListener('click', (e) => { if (e.target.id === 'mTrade') closeTrade(); });
  }

  return { init, render, reset };
})();
