/* Ghahr Nakon — قهر نکن, in three dimensions.
 *
 * A dark room with one candle on the table. Everything you can see is lit by
 * that flame: the board glows where the light falls, the pieces throw shadows,
 * and when the flame gutters the whole room dims with it.
 *
 * This module owns the board and nothing else. The turn state, the side panel
 * and the log all live in ghahr.js, which drives this through a small API:
 *
 *   build(state)                  lay out a board for these players
 *   setPieces(pieces, instant)    put every piece where the state says it is
 *   showMoves(moves, mySeat)      light up where this roll could take you
 *   walk(move, onStep, done)      walk a piece square by square
 *   rollDie(value, done)          throw the die and land it on `value`
 *   faceSeat(corner)              sit the camera behind your own yard
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
export function makeLayout(board, ring) {
  if (board === 'cross') {
    return {
      unit: 100 / 11, padScale: 3.1, round: false, candle: 1.05,
      ring: CROSS_RING.map(cell),
      home: CROSS_HOME.map((col) => col.map(cell)),
      yard: CROSS_YARD.map((y) => y.map(cell)),
    };
  }
  // the hexagon: six sides of ten, a home column radiating in from each corner
  const R = 38, cx = 50, cy = 50;
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
    const out = { x: cx + (v.x - cx) * 1.13, y: cy + (v.y - cy) * 1.13 };
    const a = (-90 + c * 60) * Math.PI / 180;
    const ox = Math.cos(a + Math.PI / 2) * 3.1, oy = Math.sin(a + Math.PI / 2) * 3.1;
    const ix = Math.cos(a) * 3.1, iy = Math.sin(a) * 3.1;
    yard.push([
      { x: out.x - ox - ix, y: out.y - oy - iy },
      { x: out.x + ox - ix, y: out.y + oy - iy },
      { x: out.x - ox + ix, y: out.y - oy + iy },
      { x: out.x + ox + ix, y: out.y + oy + iy },
    ]);
  }
  return { unit: 100 / 14, padScale: 2.1, round: true, candle: 1.1, ring: ringPts, home, yard };
}

/* ── little helpers ── */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** The world point for a layout point. The board lies flat on x/z. */
const world = (p, y = 0) => new THREE.Vector3(p.x - 50, y, p.y - 50);

/**
 * A candle, as a number. Several sines that never line up, so it wanders
 * instead of pulsing, plus the odd deeper gutter where it nearly goes out.
 */
function flame(t) {
  const fast = Math.sin(t * 11.3) * 0.5 + Math.sin(t * 17.7) * 0.31 + Math.sin(t * 29.1) * 0.19;
  const slow = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 2.9 + 1.1) * 0.4;
  const gutter = Math.max(0, Math.sin(t * 0.83 + 2.2) - 0.72) * 2.4;  // rare, deep dips
  return clamp(0.74 + fast * 0.17 + slow * 0.07 - gutter, 0.22, 1.12);
}

/** A die face, drawn to a canvas: bone-coloured, with sunken pips. */
function dieFace(n) {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#f7ecd2');
  grad.addColorStop(1, '#d9c69c');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const spots = {
    1: [[2, 2]],
    2: [[1, 1], [3, 3]],
    3: [[1, 1], [2, 2], [3, 3]],
    4: [[1, 1], [1, 3], [3, 1], [3, 3]],
    5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
    6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
  }[n] || [];
  for (const [cx, cy] of spots) {
    const x = (cx / 4) * S, y = (cy / 4) * S, r = S * 0.085;
    g.beginPath();
    g.arc(x, y + r * 0.18, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(120,92,44,.35)';
    g.fill();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#2a1c0c';
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The turned pawn we use until a real model turns up. */
function carvedPawn() {
  const pts = [];
  const add = (x, y) => pts.push(new THREE.Vector2(x, y));
  add(0.00, 0.00); add(0.46, 0.00); add(0.46, 0.07); add(0.40, 0.12);
  add(0.26, 0.17); add(0.22, 0.26); add(0.24, 0.40); add(0.20, 0.54);
  add(0.15, 0.62); add(0.24, 0.66); add(0.26, 0.72); add(0.20, 0.79);
  add(0.10, 0.86); add(0.00, 0.90);
  const g = new THREE.LatheGeometry(pts, 28);
  g.computeVertexNormals();
  return g;
}

export function createBoard(opts) {
  const host = opts.host;
  const onPick = opts.onPick || (() => {});
  const onDrop = opts.onDrop || (() => {});
  const onRollClick = opts.onRollClick || (() => {});
  const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── the scene ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050403');
  scene.fog = new THREE.Fog('#050403', 210, 460);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 900);
  camera.position.set(0, 116, 122);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // Twenty-four dragons and a shadow pass: worth being careful on a phone.
  const small = Math.min(innerWidth, innerHeight) < 820;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'gh-canvas';
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 90;
  controls.maxDistance = 330;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = 1.24;          // never below the horizon
  controls.rotateSpeed = 0.7;
  controls.target.set(0, 0, 0);

  /* ── the room ── */
  const roomLight = new THREE.AmbientLight('#33230f', 0.7);
  scene.add(roomLight);
  // the faintest hint of a moon through a window, so nothing is pure black
  const fill = new THREE.DirectionalLight('#5d6f92', 0.3);
  fill.position.set(-60, 80, -40);
  scene.add(fill);

  const candleLight = new THREE.PointLight('#ffb257', 95, 0, 1.35);
  candleLight.position.set(0, 11, 0);
  candleLight.castShadow = true;
  candleLight.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024);
  candleLight.shadow.bias = -0.004;
  candleLight.shadow.camera.near = 1;
  candleLight.shadow.camera.far = 220;
  scene.add(candleLight);

  // the table the board sits on
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(128, 132, 5, 56),
    new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.92, metalness: 0.02 })
  );
  table.position.y = -5.2;
  table.receiveShadow = true;
  scene.add(table);

  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  /* ── shared materials and geometry ── */
  const tileGeoSquare = new THREE.BoxGeometry(1, 1, 1);
  const tileGeoRound = new THREE.CylinderGeometry(0.5, 0.46, 1, 24);
  const pawnGeo = carvedPawn();

  let state = null, layout = null;
  let tiles = [];              // { mesh, base, phase, kind }
  let homeTiles = [], yardTiles = [];
  let pieces = [];             // one mesh per player per piece
  let shown = [];              // the distance each piece is drawn at
  let pieceModel = null;       // the loaded GLB, if there is one
  let candle = null, flameMesh = null, halo = null;
  let die = null, dieIdle = 0, dieHome = null, tray = null;
  let ready = false;

  /* ── the piece model, if John has dropped one in ── */
  const modelReady = new Promise((resolve) => {
    new GLTFLoader().load(
      'models/piece.glb',
      (gltf) => {
        const src = gltf.scene;
        // Stand it on the floor and centre it, whatever units it was modelled
        // in and wherever its origin happens to sit.
        const box = new THREE.Box3().setFromObject(src);
        const size = new THREE.Vector3(), centre = new THREE.Vector3();
        box.getSize(size); box.getCenter(centre);
        src.position.set(-centre.x, -box.min.y, -centre.z);
        const wrap = new THREE.Group();
        wrap.add(src);
        wrap.userData.tall = size.y || 1;
        wrap.userData.span = Math.max(size.x, size.z) || 1;
        // A part called "plinth" (or base, or pedestal) is the thing it stands
        // on rather than the thing itself, and gets the darker stone.
        wrap.traverse((n) => {
          if (!n.isMesh) return;
          const name = `${n.name} ${n.parent ? n.parent.name : ''}`.toLowerCase();
          n.userData.plinth = /plinth|base|pedestal|stand/.test(name);
        });
        pieceModel = wrap;
        resolve(true);
      },
      undefined,
      () => resolve(false)                        // no model yet: the pawn will do
    );
  });

  /* ── building a board ── */

  function clearGroup(g) {
    for (let i = g.children.length - 1; i >= 0; i--) {
      const c = g.children[i];
      g.remove(c);
      c.traverse?.((n) => {
        if (n.geometry && n.geometry !== tileGeoSquare && n.geometry !== tileGeoRound && n.geometry !== pawnGeo) n.geometry.dispose?.();
        if (n.material && !Array.isArray(n.material) && n.material.userData.shared !== true) n.material.dispose?.();
      });
    }
  }

  function tile(pt, size, height, colour, emissive, round) {
    const m = new THREE.Mesh(
      round ? tileGeoRound : tileGeoSquare,
      new THREE.MeshStandardMaterial({
        color: colour, emissive: new THREE.Color(emissive),
        emissiveIntensity: 0.55, roughness: 0.72, metalness: 0.06,
      })
    );
    m.scale.set(size, height, size);
    m.position.copy(world(pt, height / 2));
    m.receiveShadow = true;
    m.castShadow = false;
    return m;
  }

  function build(s) {
    if (die) { camera.remove(die); die = null; }
    state = s;
    layout = makeLayout(s.board, s.ring);
    // how far apart consecutive squares on the ring actually are
    let gap = Infinity;
    for (let i = 0; i < layout.ring.length; i++) {
      const a = layout.ring[i], b = layout.ring[(i + 1) % layout.ring.length];
      gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y));
    }
    layout.gap = gap;
    layout.stone = Math.min(layout.unit * 0.9, gap * 0.9);
    layout.man = Math.min(layout.unit * 0.8, gap * 1.02);
    clearGroup(boardGroup);
    tiles = []; homeTiles = []; yardTiles = []; pieces = []; shown = [];

    const u = layout.unit;
    const round = layout.round;

    // the board itself — a slab under everything
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(104, 3, 104),
      new THREE.MeshStandardMaterial({ color: '#4a3624', roughness: 0.9, metalness: 0.04 })
    );
    slab.position.y = -1.5;
    slab.receiveShadow = true;
    boardGroup.add(slab);

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(108, 2.2, 108),
      new THREE.MeshStandardMaterial({ color: '#53381a', roughness: 0.6, metalness: 0.25 })
    );
    rim.position.y = -2.6;
    rim.receiveShadow = true;
    boardGroup.add(rim);

    let phase = 0;
    const nextPhase = () => {
      // a cheap hash, so no two tiles gutter together
      const h = Math.sin(++phase * 12.9898) * 43758.5453;
      return (h - Math.floor(h)) * 9;
    };

    // the yards
    for (let c = 0; c < layout.yard.length; c++) {
      const seat = s.corner.indexOf(c);
      const col = seat === -1 ? '#3a3128' : s.players[seat].colour;
      const mid = layout.yard[c].reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
      const pad = tile(mid, u * layout.padScale, 0.7, '#120c08', col, false);
      pad.material.emissiveIntensity = seat === -1 ? 0.02 : 0.05;
      boardGroup.add(pad);
      const row = [];
      for (let p = 0; p < 4; p++) {
        const n = tile(layout.yard[c][p], layout.stone * 0.82, 0.5, '#1a120b', col, true);
        n.material.emissiveIntensity = seat === -1 ? 0.05 : 0.24;
        n.position.y = 0.85;
        boardGroup.add(n);
        row.push(n);
        tiles.push({ mesh: n, base: seat === -1 ? 0.05 : 0.24, phase: nextPhase() });
      }
      yardTiles.push(row);
    }

    // the home columns
    for (let c = 0; c < layout.home.length; c++) {
      const seat = s.corner.indexOf(c);
      const col = seat === -1 ? '#3a3128' : s.players[seat].colour;
      const row = [];
      for (let k = 0; k < layout.home[c].length; k++) {
        const n = tile(layout.home[c][k], layout.stone * 0.96, 1.7, '#1d1409', col, round);
        const base = seat === -1 ? 0.06 : 0.66;
        n.material.emissiveIntensity = base;
        boardGroup.add(n);
        row.push(n);
        tiles.push({ mesh: n, base, phase: nextPhase() });
      }
      homeTiles.push(row);
    }

    // and the ring
    const ringTiles = [];
    for (let i = 0; i < s.ring; i++) {
      const corner = i % s.leg === 0 ? i / s.leg : -1;
      const seat = corner === -1 ? -1 : s.corner.indexOf(corner);
      const own = seat !== -1;
      const n = tile(
        layout.ring[i], layout.stone, 1.9,
        own ? '#241a0e' : '#231b12',
        own ? s.players[seat].colour : '#d2914a',
        round
      );
      const base = own ? 1.05 : 0.5;
      n.material.emissiveIntensity = base;
      n.userData.sq = i;
      boardGroup.add(n);
      ringTiles.push(n);
      tiles.push({ mesh: n, base, phase: nextPhase() });
    }
    boardGroup.userData.ringTiles = ringTiles;

    buildCandle(u * layout.candle);
    buildPieces(s);
    buildDie(u);
    ready = true;
  }

  function buildCandle(size) {
    candle = new THREE.Group();
    const wax = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.2, size * 0.23, size * 0.78, 20),
      new THREE.MeshStandardMaterial({
        color: '#f0e2c2', roughness: 0.55, metalness: 0,
        emissive: new THREE.Color('#ffb257'), emissiveIntensity: 0.22,
      })
    );
    wax.position.y = size * 0.39;
    wax.castShadow = true;
    wax.receiveShadow = true;
    candle.add(wax);

    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.42, size * 0.34, size * 0.09, 24),
      new THREE.MeshStandardMaterial({ color: '#6b4a1e', roughness: 0.38, metalness: 0.6 })
    );
    dish.position.y = size * 0.045;
    dish.receiveShadow = true;
    candle.add(dish);

    flameMesh = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.1, 14, 14),
      new THREE.MeshBasicMaterial({ color: '#ffd79a' })
    );
    flameMesh.scale.set(0.72, 1.7, 0.72);
    flameMesh.position.y = size * 0.92;
    candle.add(flameMesh);

    halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), color: '#ffab4d', transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(size * 3.4, size * 3.4, 1);
    halo.position.y = size * 0.92;
    candle.add(halo);

    candle.position.set(0, 0.4, 0);
    boardGroup.add(candle);
    candleLight.position.set(0, size * 0.95 + 0.4, 0);
  }

  function haloTexture() {
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,220,160,.95)');
    grad.addColorStop(0.3, 'rgba(255,160,70,.34)');
    grad.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  function buildPieces(s) {
    const square = layout.man;
    s.players.forEach((p, seat) => {
      const colour = new THREE.Color(p.colour);
      for (let i = 0; i < 4; i++) {
        const group = new THREE.Group();
        const mats = [];

        // the ring at its feet: whose piece this is, readable from straight above
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(square * 0.46, square * 0.5, square * 0.07, 24),
          new THREE.MeshStandardMaterial({
            color: colour, roughness: 0.4, metalness: 0.3,
            emissive: colour, emissiveIntensity: 0.5,
          })
        );
        ring.position.y = square * 0.035;
        ring.receiveShadow = true;
        ring.castShadow = false;
        group.add(ring);
        mats.push(ring.material);

        if (pieceModel) {
          const model = pieceModel.clone(true);
          // sized by how tall it should stand, then reined in if it is a wide
          // beast that would overhang its neighbours
          const byHeight = (square * 1.85) / pieceModel.userData.tall;
          const byWidth = (square * 0.92) / pieceModel.userData.span;
          model.scale.setScalar(Math.min(byHeight, byWidth));
          model.position.y = square * 0.06;
          model.traverse((n) => {
            if (!n.isMesh) return;
            // The model carries its baked occlusion in its vertex colours, so
            // multiplying by the player's colour keeps every fold and scale
            // instead of flooding the whole beast with flat paint.
            const plinth = n.userData.plinth;
            n.material = new THREE.MeshStandardMaterial({
              color: plinth ? new THREE.Color('#3a2c1f').lerp(colour, 0.22) : colour,
              vertexColors: !!(n.geometry.attributes && n.geometry.attributes.color),
              roughness: plinth ? 0.88 : 0.44,
              metalness: plinth ? 0.05 : 0.1,
              emissive: colour,
              emissiveIntensity: plinth ? 0.06 : 0.17,
            });
            n.castShadow = !plinth;
            n.receiveShadow = true;
            mats.push(n.material);
          });
          group.add(model);
        } else {
          const mat = new THREE.MeshStandardMaterial({
            color: colour, roughness: 0.42, metalness: 0.12,
            emissive: colour, emissiveIntensity: 0.12,
          });
          const pawn = new THREE.Mesh(pawnGeo, mat);
          pawn.scale.setScalar(square);
          pawn.castShadow = true;
          pawn.receiveShadow = true;
          group.add(pawn);
          mats.push(mat);
        }

        group.userData.seat = seat;
        group.userData.piece = i;
        group.userData.mats = mats;
        group.userData.baseGlow = mats.map((m) => m.emissiveIntensity);
        boardGroup.add(group);
        pieces.push(group);
        shown.push(s.pieces[seat][i]);
      }
    });
  }

  function buildDie(u) {
    const size = 5;
    const mats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({
      map: dieFace(n), roughness: 0.34, metalness: 0.05,
      emissiveMap: dieFace(n), emissive: new THREE.Color('#ffe9c4'), emissiveIntensity: 0.2,
    }));
    die = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
    die.castShadow = true;
    die.receiveShadow = true;
    die.userData.isDie = true;
    die.userData.size = size;
    camera.add(die);
    if (!scene.children.includes(camera)) scene.add(camera);
    // a little felt tray at your elbow, so the die has somewhere to be
    if (!tray) {
      tray = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 1.9, size * 2.0, size * 0.22, 28),
        new THREE.MeshStandardMaterial({
          color: '#241610', roughness: 0.96, metalness: 0,
          emissive: new THREE.Color('#ffab4d'), emissiveIntensity: 0.05,
        })
      );
      camera.add(tray);
    }
    seatDie();
    setDieValue(6);
  }

  /** Which way a value's face points, in the die's own axes. */
  const FACE_AXIS = {
    1: new THREE.Vector3(1, 0, 0), 6: new THREE.Vector3(-1, 0, 0),
    2: new THREE.Vector3(0, 1, 0), 5: new THREE.Vector3(0, -1, 0),
    3: new THREE.Vector3(0, 0, 1), 4: new THREE.Vector3(0, 0, -1),
  };
  const UP = new THREE.Vector3(0, 1, 0);
  // in camera space the face you read points at you, tipped back a little
  const READ = new THREE.Vector3(0, 0.42, 1).normalize();

  function quatShowing(value, spin = 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(FACE_AXIS[value] || UP, READ);
    const twist = new THREE.Quaternion().setFromAxisAngle(READ, spin);
    return twist.multiply(q);
  }

  function setDieValue(v) {
    if (die) die.quaternion.copy(quatShowing(v, 0.3));
  }

  /* ── where a piece belongs ── */

  function pointFor(corner, d, pieceIndex) {
    if (d === -1) return layout.yard[corner][pieceIndex];
    if (d >= state.ring) return layout.home[corner][d - state.ring];
    return layout.ring[(corner * state.leg + d) % state.ring];
  }

  /**
   * Which way a piece is looking. On the ring it faces the way it is walking,
   * in the home column it faces in, and in the yard it faces the board, so the
   * whole ring reads as a procession rather than a shelf of ornaments.
   */
  function headingFor(corner, d, pieceIndex) {
    const here = pointFor(corner, d, pieceIndex);
    let there;
    if (d === -1) {
      // waiting in the yard, looking out at whoever owns them
      there = { x: here.x + (here.x - 50), y: here.y + (here.y - 50) };
    } else if (d >= state.ring) {
      const k = d - state.ring;
      there = k + 1 < layout.home[corner].length
        ? layout.home[corner][k + 1]
        : { x: 50, y: 50 };
    } else {
      there = layout.ring[(corner * state.leg + d + 1) % state.ring];
    }
    const dx = there.x - here.x, dz = there.y - here.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
    return Math.atan2(dx, dz);
  }

  function restY(d) {
    if (d === -1) return 1.1;
    if (d >= state.ring) return 1.65;
    return 1.75;
  }

  function place(seat, i, d, instant) {
    const mesh = pieces[seat * 4 + i];
    if (!mesh) return;
    const corner = state.corner[seat];
    const p = pointFor(corner, d, i);
    const target = world(p, restY(d));
    face(mesh, headingFor(corner, d, i), instant);
    if (instant) mesh.position.copy(target);
    else mesh.userData.glide = { from: mesh.position.clone(), to: target, t0: performance.now(), ms: 170 };
  }

  /** Turn a piece towards a heading, the short way round. */
  function face(mesh, want, instant) {
    if (instant) { mesh.rotation.y = want; mesh.userData.turn = null; return; }
    let from = mesh.rotation.y;
    let delta = want - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) < 0.02) return;
    mesh.userData.turn = { from, to: from + delta, t0: performance.now(), ms: 220 };
  }

  function setPieces(rows, instant) {
    if (!ready) return;
    rows.forEach((row, seat) => row.forEach((d, i) => {
      shown[seat * 4 + i] = d;
      place(seat, i, d, instant);
    }));
  }

  /* ── lighting up where you could go ── */

  let litTiles = [];
  function showMoves(moves, mySeat) {
    for (const t of litTiles) t.mesh.material.emissive.setHex(t.wasEmissive), t.mesh.material.emissiveIntensity = t.wasIntensity;
    litTiles = [];
    if (!ready || mySeat === null || mySeat === undefined || !moves || !moves.length) return;
    const corner = state.corner[mySeat];
    for (const m of moves) {
      const list = m.to >= state.ring
        ? [homeTiles[corner][m.to - state.ring]]
        : [boardGroup.userData.ringTiles[(corner * state.leg + m.to) % state.ring]];
      for (const mesh of list) {
        if (!mesh) continue;
        litTiles.push({ mesh, wasEmissive: mesh.material.emissive.getHex(), wasIntensity: mesh.material.emissiveIntensity });
        mesh.material.emissive.set(m.kind === 'capture' ? '#ff6a3d' : '#ffe6a8');
        mesh.material.emissiveIntensity = 1.9;
      }
    }
  }

  /* ── the piece walking ── */

  let walking = null, hurry = false;
  const STEP_MS = 205;

  /**
   * Walk one piece from where it stands to where it is going, one square at a
   * time, calling back with the count as it goes so the table can show it.
   */
  function walk(move, onStep, done) {
    if (!ready) { done(); return; }
    const idx = move.seat * 4 + move.piece;
    const mesh = pieces[idx];
    if (!mesh) { done(); return; }
    const corner = state.corner[move.seat];

    // out of the yard is a single hop, not a walk
    if (move.kind === 'exit') {
      face(mesh, headingFor(corner, 0, move.piece), false);
      hop(mesh, world(pointFor(corner, 0, move.piece), restY(0)), 420, () => {
        shown[idx] = 0;
        finishWalk(move, done);
      });
      onStep && onStep(0, 0);
      return;
    }

    const path = [];
    const last = state.ring + 4 - 1;
    let over = false;
    for (let d = move.from + 1; d <= move.from + move.die; d++) {
      if (d > last) { over = true; break; }
      path.push(d);
    }
    if (over || path[path.length - 1] !== move.to) {
      // an overshoot that bounced off the back wall — walk in, then back out
      const fwd = [];
      for (let d = move.from + 1; d <= last; d++) fwd.push(d);
      const back = [];
      for (let d = last - 1; d >= move.to; d--) back.push(d);
      path.length = 0;
      path.push(...fwd, ...back);
    }
    const total = path.length;
    let k = 0;
    const stepOnce = () => {
      if (k >= total) { shown[idx] = move.to; finishWalk(move, done); return; }
      const d = path[k];
      shown[idx] = d;
      const to = world(pointFor(corner, d, move.piece), restY(d));
      face(mesh, headingFor(corner, d, move.piece), false);
      onStep && onStep(k + 1, total);
      hop(mesh, to, hurry ? 70 : STEP_MS, () => { k++; stepOnce(); });
    };
    walking = { mesh };
    stepOnce();
  }

  function finishWalk(move, done) {
    walking = null; hurry = false;
    if (move.sentHome) knock(move.sentHome.seat, move.sentHome.piece);
    setTimeout(done, 220);
  }

  /** A short arc from here to there. */
  function hop(mesh, to, ms, after) {
    const from = mesh.position.clone();
    const lift = Math.max(2.4, from.distanceTo(to) * 0.34);
    mesh.userData.glide = null;
    const t0 = performance.now();
    mesh.userData.arc = { from, to, lift, t0, ms, after };
  }

  /** Somebody has been landed on: fling them back to their yard. */
  function knock(seat, piece) {
    const idx = seat * 4 + piece;
    const mesh = pieces[idx];
    if (!mesh) return;
    shown[idx] = -1;
    const to = world(pointFor(state.corner[seat], -1, piece), restY(-1));
    const from = mesh.position.clone();
    mesh.userData.arc = {
      from, to, lift: Math.max(9, from.distanceTo(to) * 0.5),
      t0: performance.now(), ms: 620, spin: true,
    };
  }

  /* ── the die, thrown ── */

  function rollDie(value, done) {
    if (!die) { done(); return; }
    const size = die.userData.size;
    const start = die.position.clone();
    const home = dieHome || start;
    const away = home.clone();
    away.x -= size * 2.6;
    away.y += size * 3.4;
    away.z -= size * 3.2;                       // out over the board and back
    const land = home.clone();
    land.x += (Math.random() - 0.5) * size * 0.9;
    land.y += (Math.random() - 0.5) * size * 0.5;
    const q0 = die.quaternion.clone();
    const q1 = quatShowing(value, Math.random() * Math.PI * 2);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
    const turns = 2 + Math.floor(Math.random() * 3);
    die.userData.throw = {
      t0: performance.now(), ms: quiet ? 240 : 920,
      start, away, land, q0, q1, axis, turns, done,
    };
  }

  /* ── picking a piece up ── */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.8);
  let dragging = null, hovered = null;
  let pickable = [];            // meshes the local player may move right now

  function setPickable(list) {
    pickable = list;
    for (const m of pieces) {
      const on = list.includes(m);
      const mats = m.userData.mats || [];
      const base = m.userData.baseGlow || [];
      mats.forEach((mat, k) => { mat.emissiveIntensity = (base[k] || 0.1) + (on ? 0.55 : 0); });
    }
  }

  function pointerNdc(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function hit(e, list) {
    pointerNdc(e);
    ray.setFromCamera(ndc, camera);
    const found = ray.intersectObjects(list, true);
    if (!found.length) return null;
    let o = found[0].object;
    while (o && o.userData.seat === undefined && !o.userData.isDie && o.parent) o = o.parent;
    return o;
  }

  function onDown(e) {
    if (walking) { hurry = true; return; }
    const target = hit(e, [...pickable, ...(die ? [die] : [])]);
    if (!target) return;                       // empty table: let the camera have it
    // We listen in the capture phase so that taking hold of a piece happens
    // before OrbitControls sees the press — otherwise the camera swings round
    // while you think you are dragging a man.
    e.stopPropagation();
    if (target.userData.isDie) { e.preventDefault(); onRollClick(); return; }
    dragging = {
      mesh: target, moved: false,
      seat: target.userData.seat, piece: target.userData.piece,
      home: target.position.clone(),
      id: e.pointerId,
    };
    controls.enabled = false;
    try { host.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    e.stopPropagation();
    pointerNdc(e);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, p)) return;
    if (p.distanceTo(dragging.home) > 1.4) dragging.moved = true;
    dragging.mesh.position.set(p.x, restY(0) + 4.5, p.z);
    // which lit square is nearest the pointer?
    let best = null, bestD = Infinity;
    for (const t of litTiles) {
      const d = t.mesh.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = t; }
    }
    const near = best && bestD < layout.unit * 0.85 ? best : null;
    if (hovered !== near) {
      if (hovered) hovered.mesh.scale.y = hovered.baseY ?? hovered.mesh.scale.y;
      hovered = near;
      if (hovered) { hovered.baseY = hovered.mesh.scale.y; hovered.mesh.scale.y = hovered.baseY * 1.7; }
    }
    dragging.over = near;
  }

  function onUp(e) {
    if (!dragging) return;
    e.stopPropagation();
    const d = dragging;
    dragging = null;
    controls.enabled = true;
    if (hovered) { hovered.mesh.scale.y = hovered.baseY ?? hovered.mesh.scale.y; hovered = null; }
    if (!d.moved) { onPick(d.seat, d.piece); return; }         // a tap: walk it for me
    if (d.over) { onDrop(d.seat, d.piece, d.over.mesh); return; }
    d.mesh.position.copy(d.home);                              // nowhere legal: put it back
  }

  // Bound to the host rather than the canvas, and in the capture phase, so that
  // taking hold of a piece always beats the camera to the press — capture runs
  // outside-in, whatever order the listeners were added in.
  host.addEventListener('pointerdown', onDown, true);
  host.addEventListener('pointermove', onMove, true);
  host.addEventListener('pointerup', onUp, true);
  host.addEventListener('pointercancel', onUp, true);

  /** Sit the camera behind this corner's yard. */
  function faceSeat(corner) {
    if (!layout || corner === undefined || corner === null) return;
    const y = layout.yard[corner];
    const mid = y.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
    const dir = new THREE.Vector3(mid.x - 50, 0, mid.y - 50);
    if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
    dir.normalize();
    const dist = 122, height = 112;
    camera.position.set(dir.x * dist, height, dir.z * dist);
    controls.target.set(0, 0, 0);
    controls.update();

  }

  /* ── the loop ── */

  let raf = 0, alive = true, t = 0;

  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    seatDie();
  }

  /** Park the die at the near-right corner of whatever the camera can see. */
  function seatDie() {
    if (!die) return;
    const z = 80;
    const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * z;
    const halfW = halfH * camera.aspect;
    dieHome = new THREE.Vector3(halfW * 0.7, -halfH * 0.6, -z);
    if (!die.userData.throw) die.position.copy(dieHome);
    if (tray) {
      tray.position.set(dieHome.x, dieHome.y - die.userData.size * 0.6, dieHome.z);
      tray.rotation.set(camera.rotation.x * 0 + 0.34, 0, 0);
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    t = now / 1000;

    // the candle
    const f = quiet ? 0.88 : flame(t);
    candleLight.intensity = 58 + f * 46;
    if (!quiet) {
      candleLight.position.x = Math.sin(t * 5.1) * 0.5 * f;
      candleLight.position.z = Math.cos(t * 6.3) * 0.5 * f;
    }
    if (flameMesh) {
      flameMesh.scale.set(0.62 + f * 0.18, 1.3 + f * 0.7, 0.62 + f * 0.18);
      flameMesh.position.x = Math.sin(t * 7.7) * 0.16 * f;
      flameMesh.material.color.setRGB(1, 0.72 + f * 0.2, 0.4 + f * 0.3);
    }
    if (halo) {
      const k = 0.82 + f * 0.4;
      halo.scale.set(halo.userData.s0 = halo.userData.s0 || halo.scale.x, halo.scale.y, 1);
      halo.material.opacity = 0.5 + f * 0.45;
      halo.scale.setScalar((halo.userData.s0 || 30) * k);
    }

    // the board, guttering unevenly
    for (const tl of tiles) {
      const g = quiet ? 1 : flame(t * 0.85 + tl.phase);
      tl.mesh.material.emissiveIntensity = tl.base * (0.42 + g * 0.78);
    }
    for (const l of litTiles) {
      l.mesh.material.emissiveIntensity = 1.4 + Math.sin(t * 5) * 0.5;
    }

    // pieces in motion
    for (const m of pieces) stepMesh(m, now);
    if (die) stepDie(now);

    controls.update();
    renderer.render(scene, camera);
  }

  function stepMesh(m, now) {
    const t = m.userData.turn;
    if (t) {
      const k = clamp((now - t.t0) / t.ms, 0, 1);
      m.rotation.y = t.from + (t.to - t.from) * easeOut(k);
      if (k >= 1) m.userData.turn = null;
    }
    const g = m.userData.glide;
    if (g) {
      const k = clamp((now - g.t0) / g.ms, 0, 1);
      m.position.lerpVectors(g.from, g.to, easeOut(k));
      if (k >= 1) m.userData.glide = null;
    }
    const a = m.userData.arc;
    if (a) {
      const k = clamp((now - a.t0) / a.ms, 0, 1);
      const e = ease(k);
      m.position.lerpVectors(a.from, a.to, e);
      m.position.y += Math.sin(Math.PI * k) * a.lift;
      if (a.spin) { m.userData.turn = null; m.rotation.y = k * Math.PI * 4; }
      if (k >= 1) {
        m.userData.arc = null;
        m.rotation.y = 0;
        m.position.copy(a.to);
        a.after && a.after();
      }
    }
  }

  function stepDie(now) {
    const th = die.userData.throw;
    if (!th) {
      // it sits there breathing very slightly, so it never looks painted on
      if (dieHome) {
        dieIdle = Math.sin(now / 900) * 0.09;
        die.position.set(dieHome.x, dieHome.y + dieIdle, dieHome.z);
      }
      return;
    }
    const k = clamp((now - th.t0) / th.ms, 0, 1);
    const e = easeOut(k);
    const mid = th.away;
    // out, up, and down onto the table with a last bounce
    if (k < 0.45) {
      const kk = k / 0.45;
      die.position.lerpVectors(th.start, mid, ease(kk));
    } else {
      const kk = (k - 0.45) / 0.55;
      die.position.lerpVectors(mid, th.land, ease(kk));
      die.position.y += Math.abs(Math.sin(kk * Math.PI * 2.2)) * die.userData.size * 1.1 * (1 - kk);
    }
    const q = new THREE.Quaternion().slerpQuaternions(th.q0, th.q1, e);
    const wobble = new THREE.Quaternion().setFromAxisAngle(th.axis, Math.pow(1 - k, 1.6) * th.turns * Math.PI * 2);
    die.quaternion.copy(wobble.multiply(q));
    if (k >= 1) {
      die.userData.throw = null;
      die.position.copy(th.land);
      die.quaternion.copy(th.q1);
      th.done && th.done();
    }
  }

  raf = requestAnimationFrame(frame);

  function dispose() {
    alive = false;
    host.removeEventListener('pointerdown', onDown, true);
    host.removeEventListener('pointermove', onMove, true);
    host.removeEventListener('pointerup', onUp, true);
    host.removeEventListener('pointercancel', onUp, true);
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  /** Where a piece is on screen right now, for tests and for the pointer. */
  function screenOf(obj) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }

  return {
    modelReady, build, setPieces, showMoves, walk, rollDie, setDieValue,
    faceSeat, setPickable, dispose, screenOf,
    tileScreen: (sq) => screenOf(boardGroup.userData.ringTiles[sq]),
    pieceMesh: (seat, i) => pieces[seat * 4 + i],
    get busy() { return !!walking || !!(die && die.userData.throw); },
    get walking() { return !!walking; },
    hasModel: () => !!pieceModel,
  };
}
