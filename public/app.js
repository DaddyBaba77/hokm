/* Hokm — client */

const $ = (id) => document.getElementById(id);
const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const RED = new Set(['H', 'D']);
const RANK_LABEL = { T: '10' };
const RANK_VALUE = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const VERSION = '1.10.0';
const TEAM_NAME = { A: 'Azure', B: 'Crimson' };
const POINTS_TO_WIN = 7;

const CREST = {
  A: '<path class="charge" d="M20 12.5l2.7 5.8 6.3.85-4.6 4.35 1.2 6.3-5.6-3.1-5.6 3.1 1.2-6.3-4.6-4.35 6.3-.85z"/>',
  B: '<path class="charge" d="M20 11.5l9 11h-5l-4-4.8-4 4.8h-5zM20 23l9 11h-5l-4-4.8-4 4.8h-5z"/>',
};
const crestSvg = (team) =>
  `<svg class="crest" viewBox="0 0 40 46" aria-hidden="true">
     <path class="shield" d="M20 2.5 37 8.2v15.6c0 10-8 17-17 20-9-3-17-10-17-20V8.2z"/>
     ${CREST[team]}
   </svg>`;

const EMOTES = [
  { id: 'hello', icon: '👋', text: 'Salaam!' },
  { id: 'wellplayed', icon: '👏', text: 'Well played!' },
  { id: 'nice', icon: '🔥', text: 'Damet garm!' },
  { id: 'oops', icon: '😅', text: 'Ey vay!' },
  { id: 'thanks', icon: '🙏', text: 'Merci!' },
  { id: 'hurry', icon: '⏳', text: 'Zood bash!' },
];
const EMOTE_BY_ID = Object.fromEntries(EMOTES.map((e) => [e.id, e]));
const suitOf = (c) => c.slice(-1);
const rankOf = (c) => c.slice(0, -1);

/* ───────────────────────── identity ───────────────────────── */

// Identity lives in localStorage so a refresh (or a dropped connection) puts you
// back in your seat. Open the page with ?test to get a per-TAB identity instead,
// which lets one browser sit four players at the same table.
const perTab = new URLSearchParams(location.search).has('test');
const bag = perTab ? sessionStorage : localStorage;

const store = {
  get id() {
    let v = bag.getItem('hokm.pid');
    if (!v) {
      v = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      bag.setItem('hokm.pid', v);
    }
    return v;
  },
  get name() { return bag.getItem('hokm.name') || ''; },
  set name(v) { bag.setItem('hokm.name', v); },
};

/* ───────────────────────── sound ───────────────────────── */

const sound = (() => {
  let ctx = null;
  let on = localStorage.getItem('hokm.sound') !== 'off';

  const ensure = () => {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  function tone(freq, dur, { type = 'sine', gain = 0.12, slide = 0, delay = 0 } = {}) {
    const c = ensure(); if (!c || !on) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, { gain = 0.07, hp = 900, delay = 0 } = {}) {
    const c = ensure(); if (!c || !on) return;
    const t0 = c.currentTime + delay;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  return {
    get on() { return on; },
    toggle() {
      on = !on;
      localStorage.setItem('hokm.sound', on ? 'on' : 'off');
      if (on) { ensure(); tone(660, 0.09, { type: 'triangle' }); }
      return on;
    },
    prime() { ensure(); },
    deal()     { noise(0.09, { gain: 0.05, hp: 1600 }); },
    play()     { noise(0.13, { gain: 0.085, hp: 700 }); tone(200, 0.09, { type: 'sine', gain: 0.05, slide: -90 }); },
    pickup()   { noise(0.07, { gain: 0.04, hp: 2200 }); },
    yourTurn() { tone(587, 0.13, { type: 'triangle', gain: 0.08 }); tone(880, 0.16, { type: 'triangle', gain: 0.06, delay: 0.09 }); },
    trickWin() { tone(784, 0.12, { type: 'triangle', gain: 0.09 }); tone(1175, 0.2, { type: 'triangle', gain: 0.07, delay: 0.09 }); },
    trickLose(){ tone(300, 0.18, { type: 'sine', gain: 0.06, slide: -70 }); },
    roundWin() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, { type: 'triangle', gain: 0.08, delay: i * 0.1 })); },
    gameWin()  { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.09, delay: i * 0.13 })); },
    illegal()  { tone(150, 0.16, { type: 'square', gain: 0.05 }); },
    emote()    { tone(700, 0.07, { type: 'triangle', gain: 0.06 }); tone(1000, 0.09, { type: 'triangle', gain: 0.05, delay: 0.06 }); },
    tick()     { tone(1400, 0.04, { type: 'square', gain: 0.03 }); },
    trump()    { tone(440, 0.18, { type: 'triangle', gain: 0.08 }); tone(660, 0.3, { type: 'triangle', gain: 0.07, delay: 0.12 }); },
    // snakes and ladders
    dice()     { for (let i = 0; i < 5; i++) noise(0.05, { gain: 0.05, hp: 1200, delay: i * 0.1 }); },
    hop()      { tone(520 + Math.random() * 90, 0.05, { type: 'triangle', gain: 0.045 }); },
    climb()    { [392, 494, 587, 740, 880].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.07, delay: i * 0.1 })); },
    hiss()     { noise(0.42, { gain: 0.05, hp: 3800 }); },
    // bazaar
    coin()     { [1046, 1568].forEach((f, i) => tone(f, 0.14, { type: 'triangle', gain: 0.07, delay: i * 0.05 })); },
    flip()     { noise(0.08, { gain: 0.055, hp: 2400 }); tone(420, 0.07, { type: 'triangle', gain: 0.05 }); },
    cash()     { for (let i = 0; i < 3; i++) noise(0.07, { gain: 0.045, hp: 2600, delay: i * 0.07 });
                 tone(880, 0.1, { type: 'triangle', gain: 0.05, delay: 0.04 });
                 tone(1320, 0.14, { type: 'triangle', gain: 0.04, delay: 0.12 }); },
    bite()     { tone(130, 0.2, { type: 'square', gain: 0.1, slide: -70 }); noise(0.16, { gain: 0.1, hp: 500 });
                 [520, 300].forEach((f, i) => tone(f, 0.1, { type: 'sawtooth', gain: 0.06, slide: -180, delay: i * 0.06 })); },
  };
})();

/* ───────────────────────── state ───────────────────────── */

let socket = null;
let S = null;                       // latest room payload
let prev = null;                    // previous game view, for transition detection
const handCards = new Map();        // card -> element, persistent so layout animates
const boardCards = new Map();       // card -> element currently on the table
let collecting = false;
let dealtKey = '';
let drawShown = 0, drawKey = '', drawTimer = null;
let drag = null;
let ropeRaf = null;
let lastPlayedRect = null;          // where my card left from
let justScored = null;              // team that just took a point, for the pip pulse

/* ───────────────────────── helpers ───────────────────────── */

function cardEl(card, { back = false } = {}) {
  const el = document.createElement('div');
  if (back) { el.className = 'card back'; return el; }
  const r = rankOf(card), s = suitOf(card);
  el.className = 'card' + (RED.has(s) ? ' red' : '') + (RANK_VALUE[r] > 10 ? ' face-card' : '');
  el.dataset.card = card;
  const label = RANK_LABEL[r] || r;
  el.innerHTML =
    `<span class="corner tl">${label}<i>${SUIT_SYM[s]}</i></span>` +
    `<span class="center">${RANK_VALUE[r] > 10 ? label : SUIT_SYM[s]}</span>` +
    `<span class="corner br">${label}<i>${SUIT_SYM[s]}</i></span>`;
  return el;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function show(screen) {
  for (const s of ['home', 'lobby', 'table', 'snakes', 'monopoly']) $(s).classList.toggle('hidden', s !== screen);
}

/** Screen position for a seat, relative to where I'm sitting. */
function posFor(seat, mySeat) {
  const base = mySeat === null || mySeat === undefined ? 0 : mySeat;
  return ['bottom', 'left', 'top', 'right'][(seat - base + 4) % 4];
}

/** Centre of an element in board-local pixels. */
function boardPoint(el) {
  const b = $('board').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
}

function cardSize() {
  const cs = getComputedStyle(document.documentElement);
  return { w: parseFloat(cs.getPropertyValue('--cw')), h: parseFloat(cs.getPropertyValue('--ch')) };
}

/**
 * Where a played card rests: a tight cross in the middle of the table, pulled in
 * far enough that it never lands on top of anybody's portrait.
 */
function slotPoint(pos) {
  const b = $('board').getBoundingClientRect();
  const { w: cw, h: ch } = cardSize();
  const cx = b.width / 2, cy = b.height / 2;
  const gap = 10;

  const edge = (sel, side) => {
    const el = document.querySelector(sel);
    if (!el) return 110;
    const r = el.getBoundingClientRect();
    if (side === 'left') return r.right - b.left;          // how far in the left hero reaches
    if (side === 'top') return r.bottom - b.top;
    return b.bottom - r.top;                                // bottom hero, measured upward
  };

  const ry = Math.max(30, Math.min(
    ch * 0.9,
    cy - ch / 2 - gap - edge('.hero.pos-top', 'top'),
    cy - ch / 2 - gap - edge('.hero.pos-bottom', 'bottom')
  ));
  const rx = Math.max(cw * 0.62, Math.min(ry * 1.5, cx - cw / 2 - gap - edge('.hero.pos-left', 'left')));

  const f = { top: [0, -ry], bottom: [0, ry], left: [-rx, 0], right: [rx, 0] }[pos];
  return { x: cx + f[0], y: cy + f[1] };
}

/**
 * Where each team stacks the tricks it has won. Every trick a team takes goes to
 * the same place — beside one player of that team — so you can see the race to
 * seven without reading the scoreboard.
 */
const PILE_LABEL_H = 24;

function pilePoint(kind) {
  const b = $('board').getBoundingClientRect();
  const { w, h } = cardSize();
  const pw = w * 0.6, ph = h * 0.6;
  const block = ph + PILE_LABEL_H;
  const at = (left, top) => ({ pw, ph, left, top, x: left + pw / 2, y: top + ph / 2 });

  if (kind === 'mine') {
    // beside my own portrait
    const hero = document.querySelector('.hero.pos-bottom').getBoundingClientRect();
    return at(
      Math.min(b.width - pw - 10, hero.right - b.left + 16),
      Math.max(6, Math.min(b.height - block - 6, hero.top - b.top + hero.height / 2 - block / 2))
    );
  }
  // top-left corner: well clear of the left player's emote bubble
  return at(10, 8);
}

const myTeamOf = (g) => (g.seat === null ? 'A' : g.players[g.seat].team);

let pileShown = { A: 0, B: 0 };

function renderPiles(g, freshTeam = null) {
  const mine = myTeamOf(g);
  for (const team of ['A', 'B']) {
    const el = $(team === 'A' ? 'pileA' : 'pileB');
    const { left, top, pw, ph } = pilePoint(team === mine ? 'mine' : 'theirs');
    const n = pileShown[team];
    el.className = `pile ${team === 'A' ? 'a' : 'b'}${n ? '' : ' empty'}`;
    el.style.setProperty('--pw', `${pw}px`);
    el.style.setProperty('--ph', `${ph}px`);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.innerHTML =
      `<div class="pile-cards">` +
      Array.from({ length: n }, (_, i) =>
        `<i class="${freshTeam === team && i === n - 1 ? 'fresh' : ''}" style="transform:translate(${i * 2.6}px,${-i * 3.2}px) rotate(${i % 2 ? 1.6 : -1.6}deg)"></i>`
      ).join('') +
      `</div><b>${TEAM_NAME[team]} · ${n}/7</b>`;
  }
}

/** The four cards from the trick just played, in the order they were laid down. */
function renderLastTrick(g) {
  const panel = $('lastTrick');
  const lt = g.lastTrick;
  if (!lt || g.phase === 'hakem_draw' || g.phase === 'choosing_trump') {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  const box = $('ltCards');
  box.innerHTML = '';
  lt.plays.forEach((p) => {
    const el = cardEl(p.card);
    el.classList.toggle('win', p.seat === lt.winner);
    el.title = g.players[p.seat] ? g.players[p.seat].name : '';
    box.appendChild(el);
  });
  const who = g.players[lt.winner];
  $('ltWho').textContent = who ? `${who.seat === g.seat ? 'You' : who.name} took it` : '';
}

/** Which card takes the trick as it stands — same rule the server uses. */
function trickWinner(trick, trump) {
  const led = suitOf(trick[0].card);
  const trumps = trick.filter((p) => suitOf(p.card) === trump);
  const pool = trumps.length ? trumps : trick.filter((p) => suitOf(p.card) === led);
  return pool.reduce((a, p) => (RANK_VALUE[rankOf(p.card)] > RANK_VALUE[rankOf(a.card)] ? p : a), pool[0]);
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ───────────────────────── socket ───────────────────────── */

function connect() {
  if (socket) return socket;
  socket = io();
  socket.on('joined', ({ code }) => {
    history.replaceState(null, '', `?room=${code}${perTab ? '&test=1' : ''}`);
  });
  socket.on('errorMsg', (m) => { sound.illegal(); toast(m); });
  socket.on('emote', ({ seat, id }) => showBubble(seat, id));
  socket.on('state', (payload) => { S = payload; render(); });
  socket.on('disconnect', () => toast('Connection lost — reconnecting…'));
  if (window.Snakes) window.Snakes.init({ socket, sound, toast });
  if (window.Bazaar) window.Bazaar.init({ socket, sound, toast });
  return socket;
}

function nameOrPrompt() {
  const v = $('nameInput').value.trim();
  if (!v) { toast('Type a name first.'); $('nameInput').focus(); return null; }
  store.name = v;
  sound.prime();
  return v;
}

/* ───────────────────────── home ───────────────────────── */

$('nameInput').value = store.name;

let chosenGame = localStorage.getItem('hokm.game') || 'hokm';
function paintGamePick() {
  document.querySelectorAll('#gamePick .gp').forEach((b) => {
    b.classList.toggle('on', b.dataset.game === chosenGame);
  });
  const look = {
    hokm:     { main: 'HOKM', sub: 'حکم', wide: false,
                tag: 'Four players. Two teams. One trump suit.',
                create: 'Create a Hokm table', how: 'How Hokm works', rules: 'hokmRules' },
    snakes:   { main: 'SNAKES & LADDERS', sub: '', wide: true,
                tag: 'Two to eight players. Climb the ladders, mind the snakes.',
                create: 'Create a Snakes table', how: 'How Snakes & Ladders works', rules: 'snakeRules' },
    monopoly: { main: 'BAZAAR', sub: 'بازار', wide: false,
                tag: 'Two to eight traders. Buy the bazaar, and bleed the rest dry.',
                create: 'Create a Bazaar table', how: 'How Bazaar works', rules: 'bazaarRules' },
  }[chosenGame] || {};
  $('brandMain').textContent = look.main;
  $('brandSub').textContent = look.sub;
  $('brand').classList.toggle('wide', !!look.wide);
  $('tagline').textContent = look.tag;
  $('createBtn').textContent = look.create;
  document.querySelector('.rules summary').textContent = look.how;
  for (const id of ['hokmRules', 'snakeRules', 'bazaarRules']) {
    $(id).classList.toggle('hidden', id !== look.rules);
  }
}
document.querySelectorAll('#gamePick .gp').forEach((b) => {
  b.onclick = () => {
    chosenGame = b.dataset.game;
    localStorage.setItem('hokm.game', chosenGame);
    paintGamePick();
  };
});
paintGamePick();

$('createBtn').onclick = () => {
  const name = nameOrPrompt();
  if (!name) return;
  connect().emit('create', { name, playerId: store.id, gameType: chosenGame });
};

$('joinForm').onsubmit = (e) => {
  e.preventDefault();
  const name = nameOrPrompt();
  if (!name) return;
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) return toast('Table codes are 4 characters.');
  connect().emit('join', { code, name, playerId: store.id });
};

const urlCode = new URLSearchParams(location.search).get('room');
if (urlCode) {
  $('codeInput').value = urlCode.toUpperCase();
  if (store.name) connect().emit('join', { code: urlCode.toUpperCase(), name: store.name, playerId: store.id });
}

/* ───────────────────────── lobby ───────────────────────── */

$('copyBtn').onclick = async () => {
  const url = `${location.origin}/?room=${S.code}`; // never shares the ?test flag
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied — send it to your friends.');
  } catch {
    prompt('Copy this link:', url);
  }
};
$('randomBtn').onclick = () => socket.emit('randomizeTeams');
$('startBtn').onclick = () => { sound.prime(); socket.emit('start'); };
$('fillBtn').onclick = () => S.seats.forEach((s, i) => { if (!s) socket.emit('addBot', { seat: i }); });
$('leaveBtn').onclick = () => { location.href = location.origin; };

function renderLobby() {
  $('roomCode').textContent = S.code;
  const teams = S.hasTeams !== false;
  document.querySelector('.seatgrid').classList.toggle('no-teams', !teams);
  $('seatList').classList.toggle('wide', S.seats.length > 4);

  const list = $('seatList');
  list.innerHTML = '';
  S.seats.forEach((s, i) => {
    const div = document.createElement('div');
    const team = i % 2 === 0 ? 'a' : 'b';
    div.className = `seatcard ${teams ? team : 'plain'}${s && s.seat === S.mySeat ? ' me' : ''}`;
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = s ? s.name : 'Empty seat';
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = teams ? `Seat ${i + 1} · Team ${team.toUpperCase()}` : `Player ${i + 1}`;
    const row = document.createElement('div');
    row.className = 'row';

    if (!s) {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = S.mySeat === null ? 'Sit here' : 'Move here';
      b.onclick = () => socket.emit('takeSeat', { seat: i });
      const bot = document.createElement('button');
      bot.className = 'btn small ghost';
      bot.textContent = '+ Bot';
      bot.onclick = () => socket.emit('addBot', { seat: i });
      row.append(b, bot);
    } else if (s.isBot || s.seat === S.mySeat || S.isHost) {
      const b = document.createElement('button');
      b.className = 'btn small ghost';
      b.textContent = s.seat === S.mySeat ? 'Stand up' : 'Remove';
      b.onclick = () => socket.emit(s.seat === S.mySeat ? 'leaveSeat' : 'clearSeat', { seat: i });
      row.appendChild(b);
    }

    div.append(who, sub, row);
    list.appendChild(div);
  });

  const filled = S.seats.filter(Boolean).length;
  const min = S.minPlayers || 4;
  const seats = S.seats.length;
  $('startBtn').disabled = filled < min || !S.isHost;
  $('randomBtn').disabled = !S.isHost || filled < 2;
  $('randomBtn').textContent = teams ? 'Random teams' : 'Shuffle order';
  $('fillBtn').disabled = filled === seats;
  $('lobbyHint').textContent = !S.isHost
    ? `Waiting for the host to start ${S.gameName || 'the game'}.`
    : filled < min
      ? `${min - filled} more player${min - filled === 1 ? '' : 's'} needed — wait for friends or add bots.`
      : teams
        ? 'Seats 1 & 3 are Team A, seats 2 & 4 are Team B. Partners sit across.'
        : `${filled} players ready. Turn order runs down the list; up to ${seats} can play.`;

  renderSettings();
  renderPieces();
}

/* ─── choosing your piece (Bazaar only) ─── */

let pieceMeta = null;
function renderPieces() {
  const box = $('piecePick');
  const wanted = S.gameType === 'monopoly' && S.mySeat !== null;
  box.classList.toggle('hidden', !wanted);
  if (!wanted) return;
  if (!pieceMeta) {
    fetch('/bazaar-board.json')
      .then((r) => r.json())
      .then((m) => { pieceMeta = m.pieces || []; if (S) renderPieces(); })
      .catch(() => {});
    return;
  }
  const mine = S.seats[S.mySeat] ? S.seats[S.mySeat].piece : null;
  const taken = new Map();
  S.seats.forEach((seat, i) => { if (seat && seat.piece) taken.set(seat.piece, i); });

  const list = $('pieceList');
  const key = pieceMeta.map((p) => p.id + (taken.get(p.id) ?? '')).join('|') + '|' + mine;
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.innerHTML = '';
  for (const p of pieceMeta) {
    const holder = taken.get(p.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'piece' + (p.id === mine ? ' on' : '') + (holder !== undefined && holder !== S.mySeat ? ' taken' : '');
    b.style.setProperty('--piece', `url("pieces/${p.id}.webp")`);
    b.title = holder !== undefined && holder !== S.mySeat
      ? `${p.name} — taken by ${S.seats[holder].name}`
      : p.name;
    const cap = document.createElement('span');
    cap.className = 'piece-nm';
    cap.textContent = p.name;
    b.appendChild(cap);
    if (holder === undefined || holder === S.mySeat) {
      b.onclick = () => socket.emit('piece', { id: p.id });
    } else {
      b.disabled = true;
    }
    list.appendChild(b);
  }
}

/* ─── table settings, for the games that have any ─── */

function renderSettings() {
  const panel = $('tableSettings');
  const cfg = S.settings;
  panel.classList.toggle('hidden', !cfg);
  if (!cfg) return;

  for (const seg of panel.querySelectorAll('.seg')) {
    const key = seg.dataset.key;
    for (const b of seg.querySelectorAll('button')) {
      b.classList.toggle('on', String(cfg[key]) === b.dataset.val);
      b.disabled = !S.isHost;
    }
  }
  for (const box of panel.querySelectorAll('input[type=checkbox][data-key]')) {
    box.checked = !!cfg[box.dataset.key];
    box.disabled = !S.isHost;
  }
  $('setMinutesRow').classList.toggle('hidden', cfg.endMode !== 'timed');
  $('setHint').textContent = S.isHost
    ? 'Everyone at the table sees these as you change them.'
    : 'Only the host can change these.';
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('#tableSettings .seg button');
  if (!b || b.disabled) return;
  const key = b.parentElement.dataset.key;
  const raw = b.dataset.val;
  const val = /^\d+$/.test(raw) ? Number(raw) : raw;
  socket && socket.emit('settings', { [key]: val });
});
document.addEventListener('change', (e) => {
  const box = e.target.closest('#tableSettings input[type=checkbox][data-key]');
  if (!box || box.disabled) return;
  socket && socket.emit('settings', { [box.dataset.key]: box.checked });
});

/* ───────────────────────── heroes ───────────────────────── */

function renderHeroes(g) {
  g.players.forEach((p) => {
    const pos = posFor(p.seat, g.seat);
    const el = document.querySelector(`.hero.pos-${pos}`);
    const active = (g.phase === 'playing' && g.turn === p.seat && g.trick.length < 4)
      || (g.phase === 'choosing_trump' && g.hakem === p.seat);

    el.className = `hero pos-${pos} ${p.team === 'A' ? 'a' : 'b'}`
      + (active ? ' active' : '')
      + (!p.isBot && !p.connected ? ' away' : '');
    el.dataset.seat = p.seat;

    const initial = (p.name.trim()[0] || '?').toUpperCase();
    const tags = [];
    if (g.hakem === p.seat) tags.push('<span class="crown">HAKEM</span>');
    if (!p.connected && !p.isBot) tags.push('away');

    el.innerHTML =
      `<div class="portrait">
         <svg class="rope" viewBox="0 0 100 100" aria-hidden="true">
           <circle class="track" cx="50" cy="50" r="45"></circle>
           <circle class="burn"  cx="50" cy="50" r="45" stroke-dasharray="283" stroke-dashoffset="283"></circle>
         </svg>
         <div class="halo"></div>
         <div class="avatar">${escapeHtml(initial)}</div>
         <div class="clock"></div>
       </div>
       <div class="hname">${escapeHtml(p.seat === g.seat ? p.name + ' (you)' : p.name)}</div>
       <div class="htags">${tags.join(' · ')}</div>
       ${p.seat === g.seat ? '' :
         `<div class="fan">${'<i></i>'.repeat(Math.min(p.cards, 9))}${p.cards ? `<b>${p.cards}</b>` : ''}</div>`}`;

    const live = bubbles.get(p.seat); // a redraw must not swallow an emote mid-flight
    if (live) el.appendChild(live.el);
  });
}

const heroEl = (seat) => document.querySelector(`.hero[data-seat="${seat}"]`);

/* ───────── emotes ───────── */

const bubbles = new Map(); // seat -> { el, timers }

function showBubble(seat, id) {
  const emote = EMOTE_BY_ID[id];
  const hero = heroEl(seat);
  if (!emote || !hero) return;

  const old = bubbles.get(seat);
  if (old) { clearTimeout(old.hide); clearTimeout(old.kill); old.el.remove(); }

  const el = document.createElement('div');
  el.className = 'bubble';
  el.textContent = `${emote.icon} ${emote.text}`;
  hero.appendChild(el);
  sound.emote();

  const hide = setTimeout(() => el.classList.add('out'), 2400);
  const kill = setTimeout(() => { el.remove(); bubbles.delete(seat); }, 2750);
  bubbles.set(seat, { el, hide, kill });
}

let emoteCooling = false;
function sendEmote(id) {
  if (emoteCooling || !socket) return;
  socket.emit('emote', { id });
  emoteCooling = true;
  $('emoteBtn').classList.add('cooling');
  setTimeout(() => { emoteCooling = false; $('emoteBtn').classList.remove('cooling'); }, 2600);
}

function buildEmoteMenu() {
  const m = $('emoteMenu');
  m.innerHTML = EMOTES.map((e) => `<button data-id="${e.id}"><span>${e.icon}</span>${e.text}</button>`).join('');
  m.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { sendEmote(b.dataset.id); m.classList.add('hidden'); };
  });
}
buildEmoteMenu();

/** Sit the emote button just left of my own portrait, mirroring the trick pile. */
function placeEmoteButton() {
  const btn = $('emoteBtn');
  const hero = document.querySelector('.hero.pos-bottom');
  const b = $('board').getBoundingClientRect();
  if (!hero || !b.width) return;
  const h = hero.getBoundingClientRect();
  btn.style.left = `${Math.max(8, h.left - b.left - 56)}px`;
  btn.style.top = `${Math.min(b.height - 48, h.top - b.top + h.height / 2 - 20)}px`;
}

function openEmoteMenu() {
  const m = $('emoteMenu');
  m.classList.remove('hidden');
  const r = $('emoteBtn').getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - mr.width - 8, r.left + r.width / 2 - mr.width / 2))}px`;
  m.style.top = `${Math.max(8, r.top - mr.height - 10)}px`;
}

$('emoteBtn').onclick = (e) => {
  e.stopPropagation();
  sound.prime();
  const m = $('emoteMenu');
  m.classList.contains('hidden') ? openEmoteMenu() : m.classList.add('hidden');
};
document.addEventListener('click', (e) => {
  const m = $('emoteMenu');
  if (!m.classList.contains('hidden') && !m.contains(e.target) && e.target !== $('emoteBtn')) m.classList.add('hidden');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('emoteMenu').classList.add('hidden'); });

/* ───────── the burning rope on whoever is thinking ───────── */

const ROPE_LEN = 283;
const WARN_AT = 5; // seconds left before the clock turns red

let lastTickSecond = null;
function runRope(g) {
  cancelAnimationFrame(ropeRaf);
  document.querySelectorAll('.hero').forEach((h) => {
    h.classList.remove('urgent', 'ticking');
    const burn = h.querySelector('.burn');
    if (burn) burn.style.strokeDashoffset = ROPE_LEN;
    const clock = h.querySelector('.clock');
    if (clock) clock.textContent = '';
  });
  if (!g.turnDeadline) { lastTickSecond = null; return; }

  const seat = g.phase === 'choosing_trump' ? g.hakem : g.turn;
  const hero = heroEl(seat);
  if (!hero) return;
  const burn = hero.querySelector('.burn');
  const clock = hero.querySelector('.clock');
  const total = g.turnTotal || 60000;
  if (g.turnDeadline - Date.now() <= 0) return;
  hero.classList.add('ticking');

  const step = () => {
    const left = g.turnDeadline - Date.now();
    const frac = Math.max(0, Math.min(1, left / total));
    burn.style.strokeDashoffset = String(ROPE_LEN * (1 - frac));
    const secs = Math.max(0, Math.ceil(left / 1000));
    clock.textContent = secs;
    const urgent = secs <= WARN_AT;
    hero.classList.toggle('urgent', urgent);
    if (urgent && secs !== lastTickSecond && secs > 0) {
      lastTickSecond = secs;
      if (seat === g.seat) sound.tick();
    }
    if (left > 0) ropeRaf = requestAnimationFrame(step);
  };
  step();
}

/* ───────────────────────── hand ───────────────────────── */

function handLayout(n, i) {
  const zone = $('hand');
  const { w } = cardSize();
  const width = zone.clientWidth;
  const maxSpread = Math.min(width - w - 40, w * 0.78 * Math.max(1, n - 1));
  const spacing = n > 1 ? maxSpread / (n - 1) : 0;
  const mid = (n - 1) / 2;
  const t = i - mid;
  const degPer = n > 1 ? Math.min(4.2, 34 / (n - 1)) : 0;
  const rot = t * degPer;
  const x = width / 2 - w / 2 + t * spacing;
  const y = (1 - Math.cos((rot * Math.PI) / 180)) * 230;
  return { x, y, rot };
}

function applyHandLayout() {
  const cards = [...$('hand').children].filter((c) => !c.classList.contains('drag'));
  const n = $('hand').children.length;
  [...$('hand').children].forEach((el, i) => {
    const { x, y, rot } = handLayout(n, i);
    el.dataset.x = x; el.dataset.y = y; el.dataset.rot = rot;
    el.style.zIndex = String(10 + i);
    if (!el.classList.contains('drag')) {
      el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
    }
  });
  void cards;
}

function renderHand(g) {
  const zone = $('hand');
  const wanted = g.seat === null ? [] : g.hand;
  const wantedSet = new Set(wanted);

  // remove cards that left the hand
  for (const [card, el] of handCards) {
    if (!wantedSet.has(card)) { el.remove(); handCards.delete(card); }
  }
  // add new ones, in hand order
  wanted.forEach((card) => {
    let el = handCards.get(card);
    if (!el) {
      el = cardEl(card);
      attachHandInteractions(el, card);
      handCards.set(card, el);
    }
    zone.appendChild(el); // re-append keeps DOM order == hand order
  });

  const myTurn = g.phase === 'playing' && g.turn === g.seat && g.trick.length < 4;
  wanted.forEach((card) => {
    const el = handCards.get(card);
    const legal = g.legal.includes(card);
    el.style.opacity = ''; // clear the optimistic fade if a play was refused
    el.classList.toggle('playable', myTurn && legal);
    el.classList.toggle('dim', myTurn && !legal);
  });

  applyHandLayout();
}

function hoverLift(el, lift) {
  if (el.classList.contains('drag')) return;
  const { x, y, rot } = el.dataset;
  el.style.transform = lift
    ? `translate(${x}px, ${Number(y) - 46}px) rotate(0deg) scale(1.22)`
    : `translate(${x}px, ${y}px) rotate(${rot}deg)`;
}

function attachHandInteractions(el, card) {
  el.addEventListener('pointerenter', () => { if (el.classList.contains('playable')) hoverLift(el, true); });
  el.addEventListener('pointerleave', () => hoverLift(el, false));

  el.addEventListener('pointerdown', (e) => {
    if (!el.classList.contains('playable')) {
      if (el.classList.contains('dim')) {
        sound.illegal();
        el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
        const g = S && S.game;
        if (g && g.trick.length) toast(`You have to follow ${SUIT_NAME[suitOf(g.trick[0].card)]}.`);
      }
      return;
    }
    e.preventDefault();
    sound.pickup();
    el.setPointerCapture(e.pointerId);
    drag = { el, card, id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, ok: false };
    el.classList.add('drag');
    $('board').classList.add('dragging');
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    drag.moved = true;

    const zone = $('hand').getBoundingClientRect();
    const { w, h } = cardSize();
    const x = e.clientX - zone.left - w / 2;
    const y = e.clientY - zone.top - h / 2;
    el.style.transform = `translate(${x}px, ${y}px) rotate(0deg) scale(1.1)`;

    // dragging up out of the hand is the drop gesture
    drag.ok = e.clientY < zone.top + h * 0.35;
    $('board').classList.toggle('drag-ok', drag.ok);
  });

  const finish = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const { el: d, card: c, moved, ok } = drag;
    drag = null;
    d.classList.remove('drag');
    $('board').classList.remove('dragging', 'drag-ok');
    if (!moved || ok) {
      lastPlayedRect = d.getBoundingClientRect();
      socket.emit('play', { card: c });
      // optimistic: let it leave the fan immediately
      d.style.opacity = '0';
    } else {
      applyHandLayout();
    }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag.el.classList.remove('drag');
    $('board').classList.remove('dragging', 'drag-ok');
    drag = null;
    applyHandLayout();
  });
  void card;
}

/* ───────────────────────── the table ───────────────────────── */

function placeBoardCard(el, pos, spin) {
  const { x, y } = slotPoint(pos);
  const { w, h } = cardSize();
  el.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${spin}deg)`;
}

function renderBoard(g) {
  if (collecting) return;
  const slots = $('slots');
  const present = new Set(g.trick.map((p) => p.card));

  for (const [card, el] of boardCards) {
    if (!present.has(card)) { el.remove(); boardCards.delete(card); }
  }

  g.trick.forEach((p) => {
    if (boardCards.has(p.card)) return;
    const el = cardEl(p.card);
    const pos = posFor(p.seat, g.seat);
    const spin = ((p.card.charCodeAt(0) * 7) % 13) - 6;
    el.dataset.spin = spin;
    el.dataset.pos = pos;
    slots.appendChild(el);
    boardCards.set(p.card, el);

    // fly in from wherever the card came from
    const { w, h } = cardSize();
    const b = $('board').getBoundingClientRect();
    let from;
    if (p.seat === g.seat && lastPlayedRect) {
      from = { x: lastPlayedRect.left + lastPlayedRect.width / 2 - b.left, y: lastPlayedRect.top + lastPlayedRect.height / 2 - b.top };
      lastPlayedRect = null;
    } else {
      const hero = heroEl(p.seat);
      from = hero ? boardPoint(hero) : slotPoint(pos);
    }
    el.style.transition = 'none';
    el.style.transform = `translate(${from.x - w / 2}px, ${from.y - h / 2}px) rotate(${spin * 2}deg) scale(.72)`;
    el.style.opacity = '0.4';
    requestAnimationFrame(() => {
      el.style.transition = '';
      el.style.opacity = '1';
      placeBoardCard(el, pos, spin);
    });
    sound.play();
  });

  // glow the card currently taking the trick, once all four are down
  if (g.trick.length === 4) {
    const best = trickWinner(g.trick, g.trump);
    boardCards.forEach((el, card) => el.classList.toggle('win', card === best.card));
  } else {
    boardCards.forEach((el) => el.classList.remove('win'));
  }
}

/** Sweep the four cards into the winning team's pile. */
function collectTrick(g, lastTrick) {
  if (!boardCards.size) return;
  collecting = true;
  const winningTeam = g.players[lastTrick.winner].team;
  const target = pilePoint(winningTeam === myTeamOf(g) ? 'mine' : 'theirs');
  const { w, h } = cardSize();
  winningTeam === myTeamOf(g) ? sound.trickWin() : sound.trickLose();

  const els = [...boardCards.values()];
  boardCards.clear();
  els.forEach((el, i) => {
    setTimeout(() => {
      el.style.transform =
        `translate(${target.x - w / 2}px, ${target.y - h / 2}px) rotate(${(i - 1.5) * 14}deg) scale(.5)`;
      el.style.opacity = '0';
    }, 45 * i);
  });
  setTimeout(() => {
    els.forEach((el) => el.remove());
    collecting = false;
    const cur = S && S.game;
    if (cur) {
      pileShown = { ...cur.roundTricks };
      renderPiles(cur, winningTeam); // the pile gains its card as the trick lands
      renderLastTrick(cur);
      renderBoard(cur);
    }
  }, 600);
}

/** Cards flying out at the start of a round. */
function dealAnimation(g) {
  const b = $('board').getBoundingClientRect();
  const zone = $('hand').getBoundingClientRect();
  const deck = { x: b.width / 2, y: b.height / 2 };
  const { w, h } = cardSize();

  // my hand: from the middle of the table into the fan
  [...$('hand').children].forEach((el, i) => {
    const x = deck.x + b.left - zone.left - w / 2;
    const y = deck.y + b.top - zone.top - h / 2;
    el.classList.add('dealing');
    el.style.transition = 'none';
    el.style.transform = `translate(${x}px, ${y}px) rotate(${(i % 2 ? 1 : -1) * 24}deg) scale(.7)`;
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      el.style.transition = '';
      el.style.transitionDelay = `${i * 42}ms`;
      el.style.opacity = '1';
      el.style.transform = `translate(${el.dataset.x}px, ${el.dataset.y}px) rotate(${el.dataset.rot}deg)`;
      setTimeout(() => { el.style.transitionDelay = ''; el.classList.remove('dealing'); }, i * 42 + 520);
    });
    if (i < 8) setTimeout(() => sound.deal(), i * 42);
  });

  // opponents: a few backs thrown their way
  g.players.forEach((p) => {
    if (p.seat === g.seat) return;
    const hero = heroEl(p.seat);
    if (!hero) return;
    const to = boardPoint(hero);
    for (let k = 0; k < 3; k++) {
      const el = cardEl(null, { back: true });
      $('fx').appendChild(el);
      el.style.transition = 'none';
      el.style.transform = `translate(${deck.x - w / 2}px, ${deck.y - h / 2}px) scale(.6)`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.transitionDelay = `${k * 90 + 60}ms`;
        el.style.transform = `translate(${to.x - w / 2}px, ${to.y - h / 2}px) scale(.3)`;
        el.style.opacity = '0';
      });
      setTimeout(() => el.remove(), 900 + k * 90);
    }
  });
}

/* ───────────────────────── Hakem draw ───────────────────────── */

let drawRendered = 0;
const drawPerSeat = [0, 0, 0, 0];

/** Reveals the draw one card at a time; only ever appends the newest. */
function renderDraw(g) {
  const slots = $('slots');
  if (drawRendered > drawShown) {
    slots.innerHTML = '';
    drawRendered = 0;
    drawPerSeat.fill(0);
  }
  const { w, h } = cardSize();
  const b = $('board').getBoundingClientRect();

  for (let i = drawRendered; i < drawShown; i++) {
    const r = g.draw.reveals[i];
    const el = cardEl(r.card);
    const pos = posFor(r.seat, g.seat);
    const { x, y } = slotPoint(pos);
    const n = drawPerSeat[r.seat]++;
    el.style.transition = 'none';
    el.style.transform = `translate(${b.width / 2 - w / 2}px, ${b.height / 2 - h / 2}px) rotate(0deg) scale(.6)`;
    el.style.opacity = '0';
    el.style.zIndex = String(10 + i);
    slots.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = '';
      el.style.opacity = '1';
      el.style.transform = `translate(${x - w / 2 + n * 8}px, ${y - h / 2 + n * 12}px) rotate(${n * 3 - 4}deg)`;
    });
    if (rankOf(r.card) === 'A') setTimeout(() => el.classList.add('win'), 260);
  }
  drawRendered = drawShown;
}

function syncDrawAnimation(g) {
  if (!g || g.phase !== 'hakem_draw' || !g.draw) {
    if (drawRendered) {
      // the draw is over — sweep those cards off before the deal
      $('slots').innerHTML = '';
      drawRendered = 0;
      drawPerSeat.fill(0);
      boardCards.clear();
    }
    clearInterval(drawTimer); drawTimer = null; drawKey = ''; drawShown = 0;
    return;
  }
  const key = g.draw.reveals.map((r) => r.card).join(',');
  if (key === drawKey) return;
  drawKey = key;
  drawShown = 0;
  drawRendered = 0;
  drawPerSeat.fill(0);
  $('slots').innerHTML = '';
  boardCards.clear();
  clearInterval(drawTimer);
  drawTimer = setInterval(() => {
    drawShown++;
    renderDraw(S.game);
    sound.deal();
    if (drawShown >= S.game.draw.reveals.length) {
      clearInterval(drawTimer); drawTimer = null;
      sound.trump();
      renderTable();
    }
  }, 260);
}

/* ───────────────────────── table render ───────────────────────── */

function renderBanners(g, scoredTeam = null) {
  const mine = myTeamOf(g);
  for (const team of ['A', 'B']) {
    const el = $(team === 'A' ? 'bannerA' : 'bannerB');
    const members = g.players.filter((p) => p.team === team).map((p) => p.name);
    const pts = g.scores[team];
    const other = g.scores[team === 'A' ? 'B' : 'A'];
    el.className =
      `banner ${team === 'A' ? 'a' : 'b'}` +
      (team === mine ? ' mine' : '') +
      (pts > other ? ' leading' : '');
    el.innerHTML =
      crestSvg(team) +
      `<div class="bmain">
         <div class="btop">
           <span class="bname">${TEAM_NAME[team].toUpperCase()}</span>
           ${team === mine ? '<span class="youtag">YOU</span>' : ''}
         </div>
         <div class="bmembers">${escapeHtml(members.join(' & '))}</div>
         <div class="pips">${Array.from({ length: POINTS_TO_WIN }, (_, i) =>
           `<i class="${i < pts ? 'on' : ''}${scoredTeam === team && i === pts - 1 ? ' just' : ''}"></i>`).join('')}</div>
       </div>
       <div class="bstats">
         <div class="stat pts"><b>${pts}</b><span>POINTS</span></div>
         <div class="stat trk${g.roundTricks[team] >= 5 ? ' hot' : ''}">
           <b>${g.roundTricks[team]}</b><i>/7</i><span>TRICKS</span>
         </div>
       </div>`;
  }
}

function renderTable() {
  const g = S.game;
  renderBanners(g, justScored);
  justScored = null;

  const tc = $('trumpCard');
  tc.classList.toggle('empty', !g.trump);
  tc.classList.toggle('red', !!g.trump && RED.has(g.trump));
  $('trumpSuit').textContent = g.trump ? SUIT_SYM[g.trump] : '?';
  $('trumpName').textContent = g.trump ? SUIT_NAME[g.trump] : 'not called';
  $('zoneMark').textContent = g.trump ? SUIT_SYM[g.trump] : '';

  renderHeroes(g);
  if (!collecting) renderPiles(g);
  if (!collecting) renderLastTrick(g);
  placeEmoteButton();

  if (g.phase === 'hakem_draw') {
    renderDraw(g);
  } else {
    renderHand(g);
    renderBoard(g);
  }
  runRope(g);

  // banner
  const banner = $('banner');
  let msg = '';
  if (g.phase === 'choosing_trump' && g.seat !== g.hakem) msg = `${g.players[g.hakem].name} is calling the Hokm…`;
  banner.textContent = msg;
  banner.classList.toggle('hidden', !msg);

  // prompt
  let prompt = '';
  if (g.phase === 'hakem_draw') {
    prompt = drawShown >= g.draw.reveals.length
      ? `${g.players[g.hakem].name} drew the Ace — ${g.players[g.hakem].name} is the Hakem.`
      : 'Dealing one card at a time until somebody turns up an Ace…';
  } else if (g.phase === 'choosing_trump' && g.seat === g.hakem) {
    prompt = 'You are the Hakem — call the trump suit.';
  } else if (g.phase === 'playing') {
    if (g.trick.length === 4) prompt = 'Taking the trick…';
    else if (g.turn === g.seat && g.trick.length === 0) prompt = 'Your lead — drag a card up onto the table.';
    else if (g.turn === g.seat) {
      const led = suitOf(g.trick[0].card);
      prompt = g.hand.some((c) => suitOf(c) === led)
        ? `Your turn — follow ${SUIT_NAME[led]}.`
        : 'Your turn — you can play anything.';
    } else prompt = `Waiting for ${g.players[g.turn].name}…`;
  }
  $('prompt').textContent = prompt;

  // trump picker
  const wantTrump = g.phase === 'choosing_trump' && g.seat === g.hakem;
  $('trumpModal').classList.toggle('hidden', !wantTrump);
  if (wantTrump) {
    const h = $('trumpHand');
    h.innerHTML = '';
    const { w } = cardSize();
    const step = Math.min(w * 0.84, (h.clientWidth - w) / Math.max(1, g.hand.length - 1));
    g.hand.forEach((c, i) => {
      const el = cardEl(c);
      const t = i - (g.hand.length - 1) / 2;
      el.style.left = '50%';
      el.style.marginLeft = `${-w / 2}px`;
      el.style.transform = `translate(${t * step}px, ${Math.abs(t) * 5}px) rotate(${t * 4}deg)`;
      h.appendChild(el);
    });
  }

  // round result
  const showRound = g.phase === 'round_over' && g.roundResult;
  $('roundModal').classList.toggle('hidden', !showRound);
  if (showRound) {
    const r = g.roundResult;
    $('roundCrest').textContent = r.points;
    $('roundTitle').textContent =
      r.kind === 'kot' ? 'KOT!' : r.kind === 'hakem_koti' ? 'HAKEM KOTI!' : `${TEAM_NAME[r.winningTeam]} takes the round`;
    $('roundDetail').textContent =
      `${TEAM_NAME[r.winningTeam]} won ${r.tricks[r.winningTeam]}–${r.tricks[r.losingTeam]} for ${r.points} point${r.points > 1 ? 's' : ''}.` +
      ` ${r.hakemHeld ? `${g.players[r.nextHakem].name} stays Hakem.` : `The Hakem passes to ${g.players[r.nextHakem].name}.`}`;
    $('roundScores').innerHTML =
      `<div class="team-a"><small>${TEAM_NAME.A.toUpperCase()}</small>${r.scores.A}</div>` +
      `<div class="team-b"><small>${TEAM_NAME.B.toUpperCase()}</small>${r.scores.B}</div>`;
    $('roundNext').textContent = 'Next round dealing shortly…';
  }

  // game over
  const over = g.phase === 'game_over';
  $('gameModal').classList.toggle('hidden', !over);
  if (over) {
    const mine = g.seat !== null && g.players[g.seat].team === g.gameWinner;
    $('gameTitle').textContent = mine ? `${TEAM_NAME[g.gameWinner]} wins — that's you!` : `${TEAM_NAME[g.gameWinner]} wins`;
    $('gameDetail').textContent = `Final score ${g.scores.A}–${g.scores.B}.`;
    $('againBtn').classList.toggle('hidden', !S.isHost);
  }

  // log + chat
  const ll = $('logList');
  ll.innerHTML = [
    ...g.log.map((t) => `<div class="entry">${t}</div>`),
    ...S.chat.map((c) => `<div class="entry chat"><b>${escapeHtml(c.name)}:</b> ${escapeHtml(c.text)}</div>`),
  ].join('');
  ll.scrollTop = ll.scrollHeight;
}

/* ───────────────────────── transitions ───────────────────────── */

function detectTransitions(g) {
  if (!prev) { pileShown = { ...g.roundTricks }; return; }

  // a trick just got swept up — hold the pile at its old size until the cards land
  if (prev.trick.length === 4 && g.trick.length === 0 && g.lastTrick) {
    collectTrick(g, g.lastTrick);
  } else if (!collecting) {
    pileShown = { ...g.roundTricks };
  }
  // cards were just dealt
  const key = `${g.roundNumber}:${g.trump}`;
  if (g.phase === 'playing' && prev.phase === 'choosing_trump' && key !== dealtKey) {
    dealtKey = key;
    sound.trump();
    const tc = $('trumpCard');
    tc.classList.remove('pop'); void tc.offsetWidth; tc.classList.add('pop');
    requestAnimationFrame(() => dealAnimation(g));
  }
  // it became my turn
  if (g.phase === 'playing' && g.turn === g.seat && prev.turn !== g.seat && g.trick.length < 4) sound.yourTurn();
  if (g.phase === 'round_over' && prev.phase !== 'round_over') {
    sound.roundWin();
    justScored = g.roundResult && g.roundResult.winningTeam;
  }
  if (g.phase === 'game_over' && prev.phase !== 'game_over') sound.gameWin();
}

/* ───────────────────────── wiring ───────────────────────── */

for (const b of document.querySelectorAll('.suitbtn')) {
  b.onclick = () => socket.emit('chooseTrump', { suit: b.dataset.suit });
}
$('againBtn').onclick = () => socket.emit('newGame');
$('mAgain').onclick = () => socket.emit('newGame');
$('logBtn').onclick = () => $('logPanel').classList.remove('hidden');
$('logClose').onclick = () => $('logPanel').classList.add('hidden');
$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('chatInput').value.trim();
  if (!v) return;
  socket.emit('chat', { text: v });
  $('chatInput').value = '';
};
$('soundBtn').onclick = () => {
  const on = sound.toggle();
  $('soundBtn').classList.toggle('off', !on);
};
$('soundBtn').classList.toggle('off', !sound.on);
$('verTag').textContent = `v${VERSION}`;

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!S || !S.game) return;
    applyHandLayout();
    renderPiles(S.game);
    placeEmoteButton();
    $('emoteMenu').classList.add('hidden');
    boardCards.forEach((el) => placeBoardCard(el, el.dataset.pos, Number(el.dataset.spin)));
  }, 120);
});

/* ───────────────────────── render ───────────────────────── */

function render() {
  if (!S) return show('home');

  if (S.game && S.gameType === 'snakes') {
    show('snakes');
    window.Snakes.render(S);
    return;
  }

  if (S.game && S.gameType === 'monopoly') {
    show('monopoly');
    window.Bazaar.render(S.game);
    return;
  }

  if (!S.game) {
    show('lobby');
    renderLobby();
    if (window.Snakes) window.Snakes.reset();
    if (window.Bazaar) window.Bazaar.reset();
    prev = null;
    handCards.forEach((el) => el.remove());
    handCards.clear();
    boardCards.forEach((el) => el.remove());
    boardCards.clear();
    dealtKey = '';
    return;
  }
  show('table');
  syncDrawAnimation(S.game);
  detectTransitions(S.game);
  renderTable();
  prev = S.game;
}
