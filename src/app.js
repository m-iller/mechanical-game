/* Gear Bench: a kinematic sandbox for mechanical drives. No dependencies. */
(() => {
const M = 2, ALPHA = 20 * Math.PI / 180, INV_A = Math.tan(ALPHA) - ALPHA, TAU = Math.PI * 2;
const PM = Math.PI * M;                 // circular pitch of every module-2 tooth, mm
const CP = 8;                           // roller chain pitch, mm (ISO 05B)
const WR = 4.5, WO = 6, WL = 34;        // worm pitch radius, outer radius, length
const RB = 8;                           // rack body depth below the tooth roots
const TOL = 0.05, COAX = 0.5, LP = 18, FW = 10, BASE = 6, MAXL = 8;
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), sheet = $('sheet');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const TYPES = {
  spur:     { n: 'Spur',      pre: 'G',  key: 'z',  lab: 'Teeth',        lim: [8, 80, 1],   def: 24 },
  planet:   { n: 'Planetary', pre: 'PG', key: 'zs', lab: 'Sun teeth',    lim: [8, 40, 1],   def: 12, lab2: 'Planet teeth', lim2: [8, 30] },
  bevel:    { n: 'Bevel',     pre: 'BG', key: 'z',  lab: 'Gear teeth',   lim: [12, 60, 1],  def: 24, lab2: 'Pinion teeth', lim2: [8, 40], dir: 'Shaft direction' },
  worm:     { n: 'Worm',      pre: 'WG', key: 'z',  lab: 'Wheel teeth',  lim: [20, 80, 1],  def: 30, lab2: 'Worm starts',  lim2: [1, 4],  dir: 'Worm axis' },
  pulley:   { n: 'Pulley',    pre: 'P',  key: 'd',  lab: 'Diameter, mm', lim: [16, 160, 2], def: 40 },
  sprocket: { n: 'Sprocket',  pre: 'S',  key: 'z',  lab: 'Teeth',        lim: [9, 60, 1],   def: 18 },
  rack:     { n: 'Rack',      pre: 'R',  key: 'z',  lab: 'Teeth',        lim: [8, 60, 1],   def: 24, dir: 'Direction' },
};

let gears = [], links = [], nextId = 1, selId = null, linkFrom = null;
let rpm = 60, running = !reduced, layerCount = 2, activeLayer = 0;
let theta = 0, jit = 0, locked = false, lockMsg = '', collide = new Set();
let newType = 'spur', viewMode = 'both';
const view = { cx: 0, cy: 0, scale: 3 };
let W = 300, H = 300, T = {};

/* ---------- part helpers ---------- */
const isP = g => g.type === 'planet', isB = g => g.type === 'bevel', isU = g => g.type === 'pulley';
const isS = g => g.type === 'sprocket', isW = g => g.type === 'worm', isR = g => g.type === 'rack';
const zr = g => g.zs + 2 * g.zp;
const kind = g => g.type === 'spur' || isP(g) ? 'gear' : isU(g) ? 'fric' : null;
const meshZ = g => isP(g) ? zr(g) + 8 : g.z;
const rackLen = g => g.z * PM;
const RO = g => isP(g) ? M * (zr(g) + 8) / 2 : isU(g) ? g.d / 2 : isS(g) ? g.z * CP / TAU : isR(g) ? 0 : M * g.z / 2;
const tipR = g => isR(g) ? rackLen(g) / 2 : RO(g) + (isB(g) ? 0.5 : isU(g) ? 1.5 : isS(g) ? 0.3 * CP : M);
const extR = g => isW(g) ? RO(g) + 2 * WO + 10 : tipR(g);
const halfW = g => isR(g) ? Math.abs(Math.cos(g.dir)) * rackLen(g) / 2 + Math.abs(Math.sin(g.dir)) * 6 : tipR(g);
const wormC = g => [g.x - Math.sin(g.dir) * (RO(g) + WR), g.y + Math.cos(g.dir) * (RO(g) + WR)];
const nPl = g => { const s = g.zs + g.zp; for (const n of [3, 4, 2]) if ((2 * s) % n === 0 && s * Math.sin(Math.PI / n) > g.zp + 2.2) return n; return 2; };
const top = g => isP(g) ? g.b.c : isW(g) ? g.b.g : g, bot = g => isP(g) ? g.b.s : isW(g) ? g.b.g : g, mb = g => isP(g) ? g.b.r : g;
const bodies = g => isP(g) ? [g.b.s, g.b.c, g.b.r] : isW(g) ? [g.b.w, g.b.g] : [g];
const driven = g => bodies(g).some(b => b.ratio != null);
const outB = g => isP(g) ? (g.held === 'c' ? g.b.r : g.b.c) : isW(g) ? g.b.g : g;
const angle = b => b.phase + (b.ratio || 0) * (theta + jit);
const LET = l => String.fromCharCode(65 + l);
const byId = id => gears.find(g => g.id === id);
const mod = (a, n) => ((a % n) + n) % n;

function make(o) {
  const g = { id: o.id, name: o.name, type: o.type || 'spur', x: o.x, y: o.y, layer: o.layer || 0, driver: !!o.driver, free: o.free || 0, ratio: null, phase: o.free || 0, mate: null, shaftL: null };
  g.label = g.name; g.g = g;
  const mk = (f, n) => ({ free: f || 0, phase: f || 0, ratio: null, held: false, label: `${g.name} ${n}`, g });
  if (isP(g)) { g.zs = o.zs; g.zp = o.zp; g.held = o.held || 'r'; g.b = { s: mk(o.fs, 'sun'), c: mk(o.fc, 'carrier'), r: mk(o.fr, 'ring') }; }
  else if (isW(g)) { g.z = o.z; g.zp = o.zp || 1; g.dir = o.dir || 0; g.b = { w: mk(o.fw, 'worm'), g: mk(o.fg, 'wheel') }; }
  else if (isU(g)) g.d = o.d;
  else { g.z = o.z; if (isB(g)) g.zp = o.zp; if (isB(g) || isR(g)) g.dir = o.dir || 0; }
  return g;
}
function addPart(type, props) {
  const id = nextId++, g = make({ id, name: TYPES[type].pre + id, type, ...props });
  gears.push(g); return g;
}

/* ---------- geometry ---------- */
const pathCache = new Map();
const cached = (key, build) => { if (!pathCache.has(key)) pathCache.set(key, build()); return pathCache.get(key); };
function outline(p, z, add, ded) {
  const r = M * z / 2, rb = r * Math.cos(ALPHA), ra = r + add, rf = r - ded;
  const base = Math.PI / (2 * z) + INV_A;
  const inv = q => { if (q <= rb) return 0; const t = Math.sqrt((q / rb) ** 2 - 1); return t - Math.atan(t); };
  const beta = q => Math.max(0, base - inv(q));
  const rs = Math.min(ra, Math.max(rb, rf)), N = 7;
  let prev = 0;
  for (let k = 0; k < z; k++) {
    const th = TAU * k / z, a0 = th - beta(rs);
    if (k === 0) p.moveTo(rf * Math.cos(a0), rf * Math.sin(a0)); else p.arc(0, 0, rf, prev, a0);
    for (let i = 0; i <= N; i++) { const q = rs + (ra - rs) * i / N, a = th - beta(q); p.lineTo(q * Math.cos(a), q * Math.sin(a)); }
    p.arc(0, 0, ra, th - beta(ra), th + beta(ra));
    for (let i = N; i >= 0; i--) { const q = rs + (ra - rs) * i / N, a = th + beta(q); p.lineTo(q * Math.cos(a), q * Math.sin(a)); }
    prev = th + beta(rs);
    p.lineTo(rf * Math.cos(prev), rf * Math.sin(prev));
  }
  p.arc(0, 0, rf, prev, TAU - beta(rs)); p.closePath();
}
function borePath(p, bore) {
  const kw = bore * 0.55, kh = bore * 0.3, d = Math.asin(kw / 2 / bore);
  p.moveTo(bore * Math.cos(d), bore * Math.sin(d));
  p.arc(0, 0, bore, d, TAU - d);
  p.lineTo(bore + kh, -kw / 2); p.lineTo(bore + kh, kw / 2); p.closePath();
}
function holes(p, hub, rim, n) {
  if (rim - hub <= 8) return;
  const rc = (hub + rim) / 2, hr = Math.min((rim - hub) / 2 * 0.86, Math.PI * rc / n * 0.72);
  for (let k = 0; k < n; k++) { const a = TAU * (k + 0.5) / n, x = rc * Math.cos(a), y = rc * Math.sin(a); p.moveTo(x + hr, y); p.arc(x, y, hr, 0, TAU); }
}
const spurPath = z => cached('s' + z, () => {
  const p = new Path2D(), r = M * z / 2, bore = Math.max(2.2, Math.min(r * 0.2, 6));
  outline(p, z, M, 1.25 * M); borePath(p, bore); holes(p, bore * 2.1, r - 3.45 * M, z >= 50 ? 6 : 5);
  return p;
});
const ringPath = z => cached('r' + z, () => { const p = new Path2D(); outline(p, z + 8, M, 1.25 * M); outline(p, z, 1.25 * M, M); return p; });
const bevelPath = z => cached('b' + z, () => {
  const rg = M * z / 2, fill = new Path2D(), lines = new Path2D();
  fill.moveTo(rg, 0); fill.arc(0, 0, rg, 0, TAU); borePath(fill, Math.max(2.2, Math.min(rg * 0.2, 5)));
  for (let k = 0; k < z; k++) { const a = TAU * k / z, c = Math.cos(a), s = Math.sin(a); lines.moveTo(rg * 2 / 3 * c, rg * 2 / 3 * s); lines.lineTo(rg * c, rg * s); }
  lines.moveTo(rg * 2 / 3, 0); lines.arc(0, 0, rg * 2 / 3, 0, TAU);
  lines.moveTo(rg * 0.4, 0); lines.arc(0, 0, rg * 0.4, 0, TAU);
  return { fill, lines };
});
const pulleyPath = d => cached('u' + d, () => {
  const r = d / 2, fill = new Path2D(), lines = new Path2D(), bore = Math.max(2.2, Math.min(r * 0.2, 6));
  fill.moveTo(r + 1.5, 0); fill.arc(0, 0, r + 1.5, 0, TAU); borePath(fill, bore); holes(fill, bore * 2.1, r - 3, 5);
  lines.moveTo(r, 0); lines.arc(0, 0, r, 0, TAU);
  return { fill, lines };
});
const sprocketPath = z => cached('k' + z, () => { // roller seats sit at phase + k * pitch
  const p = new Path2D(), r = z * CP / TAU, pt = TAU / z, rr = CP * 0.28, tip = r + 0.3 * CP;
  for (let k = 0; k < z; k++) {
    const a = k * pt;
    [[r - rr, a - 0.1 * pt], [r - rr, a + 0.1 * pt], [r + 0.4, a + 0.26 * pt], [tip, a + 0.42 * pt], [tip, a + 0.58 * pt], [r + 0.4, a + 0.74 * pt]]
      .forEach(([q, t], i) => { const x = q * Math.cos(t), y = q * Math.sin(t); if (k === 0 && i === 0) p.moveTo(x, y); else p.lineTo(x, y); });
  }
  p.closePath();
  const bore = Math.max(2.2, Math.min(r * 0.2, 6)); borePath(p, bore); holes(p, bore * 2.1, r - rr - 3, 5);
  return p;
});
function hull(p) {
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// A belt or chain loop around two wheels. Path position s starts at the back of wheel a and runs with increasing angle.
function loopGeo(a, b, crossed) {
  const ra = RO(a), rb = RO(b), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), q = crossed ? ra + rb : ra - rb;
  if (d < 1e-6 || Math.abs(q) >= d) return null;
  const phi = Math.atan2(dy, dx), beta = Math.acos(q / d), t = Math.sqrt(d * d - q * q);
  const wrapA = TAU - 2 * beta, wrapB = crossed ? TAU - 2 * beta : 2 * beta;
  return { ra, rb, phi, beta, t, d, crossed, wrapA, wrapB, L: ra * wrapA + rb * wrapB + 2 * t, sbm: ra * (Math.PI - beta) + t + rb * wrapB / 2 };
}
function loopPath(a, b, G) {
  const p = new Path2D();
  p.arc(a.x, a.y, G.ra, G.phi + Math.PI, G.phi + TAU - G.beta);
  if (G.crossed) p.arc(b.x, b.y, G.rb, G.phi + Math.PI - G.beta, G.phi - Math.PI + G.beta, true);
  else p.arc(b.x, b.y, G.rb, G.phi - G.beta, G.phi + G.beta);
  p.arc(a.x, a.y, G.ra, G.phi + G.beta, G.phi + Math.PI); p.closePath();
  return p;
}
const linkOk = L => { const a = byId(L.a), b = byId(L.b); return a && b && a !== b && a.type === b.type && a.layer === b.layer && (isU(a) || isS(a)); };
const prune = () => { links = links.filter(linkOk); if (linkFrom != null && !byId(linkFrom)) linkFrom = null; };

/* ---------- train solver ---------- */
function freeze() { jit = 0; gears.forEach(g => bodies(g).forEach(b => { b.free = angle(b); })); theta = 0; }
const adiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// Tooth phase of B that meshes with A at phase p. Each returns [phase, pitch].
const spurF = (A, B) => { const psi = Math.atan2(B.y - A.y, B.x - A.x), za = meshZ(A), pt = TAU / meshZ(B); return p => [psi + Math.PI - pt * (0.5 - (psi - p) * za / TAU), pt]; };
const chainF = (A, B) => {
  const G = loopGeo(A, B, false); if (!G) return null;
  const pp = G.L / Math.max(1, Math.round(G.L / CP));
  return p => [G.phi + ((p - G.phi - Math.PI) * A.z / TAU - G.sbm / pp) * TAU / B.z, TAU / B.z];
};
function solve() {
  prune();
  const all = [];
  gears.forEach(g => { g.mate = null; g.shaftL = null; bodies(g).forEach(b => { b.ratio = null; b.phase = b.free; b.held = false; all.push(b); }); if (isP(g)) g.b[g.held].held = true; });
  collide = new Set(); locked = false; lockMsg = '';
  const adj = new Map(all.map(b => [b, []]));
  const link = (a, b, k, fab, fba) => { adj.get(a).push({ o: b, k, f: fab }); adj.get(b).push({ o: a, k: 1 / k, f: fba }); };
  let hitPair = null;
  const rackMesh = (r, o) => {
    if (kind(o) !== 'gear') return;
    const u = [Math.cos(r.dir), Math.sin(r.dir)], dx = o.x - r.x, dy = o.y - r.y, ax = dx * u[0] + dy * u[1], pe = -dx * u[1] + dy * u[0], R = RO(o), th = r.dir - Math.PI / 2;
    if (Math.abs(pe - R) <= TOL * 2 && Math.abs(ax) <= rackLen(r) / 2)
      link(mb(o), r, R, p => [ax + (p - th) * R + PM / 2, PM], v => [th + (v - ax - PM / 2) / R, TAU / meshZ(o)]);
  };
  const bevelWorm = (bv, w) => {
    const [wx, wy] = wormC(w), vx = wx - bv.x, vy = wy - bv.y, d = Math.hypot(vx, vy);
    if (d > RO(bv) + WL / 2 + 2 && adiff(Math.atan2(vy, vx), bv.dir) < 0.02 && Math.abs(Math.sin(w.dir - bv.dir)) < 0.02) {
      link(bv, w.b.w, (Math.cos(w.dir - bv.dir) > 0 ? 1 : -1) * bv.z / bv.zp); bv.mate = w; bv.shaftL = d - WL / 2;
    }
  };
  for (let i = 0; i < gears.length; i++) for (let j = i + 1; j < gears.length; j++) {
    const a = gears[i], b = gears[j];
    if (a.layer !== b.layer) continue;
    if (isR(a) || isR(b)) { if (isR(a) && !isR(b)) rackMesh(a, b); else if (isR(b) && !isR(a)) rackMesh(b, a); continue; }
    const d = Math.hypot(a.x - b.x, a.y - b.y), s = RO(a) + RO(b), k = kind(a);
    if (d < s - TOL) { collide.add(a.id); collide.add(b.id); hitPair = hitPair || [a, b]; }
    else if (d <= s + TOL && k && k === kind(b)) {
      if (k === 'gear') link(mb(a), mb(b), -meshZ(a) / meshZ(b), spurF(a, b), spurF(b, a));
      else link(a, b, -RO(a) / RO(b)); // friction wheels
    }
    if (isB(a) && isB(b) && d > s + 2) {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (adiff(ang, a.dir) < 0.02 && adiff(ang + Math.PI, b.dir) < 0.02) { link(a, b, -(a.z * b.zp) / (a.zp * b.z)); a.mate = b; b.mate = a; a.shaftL = b.shaftL = d / 2; }
    }
    if (isB(a) && isW(b)) bevelWorm(a, b); else if (isW(a) && isB(b)) bevelWorm(b, a);
  }
  for (const L of links) {
    const a = byId(L.a), b = byId(L.b);
    if (isU(a)) { const G = loopGeo(a, b, L.crossed); if (G) link(a, b, (L.crossed ? -1 : 1) * G.ra / G.rb); }
    else if (loopGeo(a, b, false)) link(a, b, a.z / b.z, chainF(a, b), chainF(b, a));
  }
  // shafts: parts sharing a centre, coupled in layer order
  const stacks = [];
  for (const g of gears) { if (isR(g)) continue; const st = stacks.find(s => Math.hypot(s[0].x - g.x, s[0].y - g.y) < COAX); if (st) st.push(g); else stacks.push([g]); }
  for (const st of stacks) { st.sort((a, b) => a.layer - b.layer); for (let i = 0; i + 1 < st.length; i++) if (st[i].layer !== st[i + 1].layer) link(top(st[i]), bot(st[i + 1]), 1); }
  for (const g of gears) {
    if (isP(g)) {
      const zs = g.zs, R = zr(g);
      if (g.held === 'r') link(g.b.s, g.b.c, zs / (zs + R));
      else if (g.held === 'c') link(g.b.s, g.b.r, -zs / R);
      else link(g.b.r, g.b.c, R / (zs + R));
    } else if (isW(g)) { // one-way: the worm turns the wheel, the wheel cannot turn the worm
      adj.get(g.b.w).push({ o: g.b.g, k: g.zp / g.z });
      adj.get(g.b.g).push({ o: g.b.w, k: g.z / g.zp, lock: true });
    }
  }
  const drv = gears.find(g => g.driver);
  if (drv) {
    const st = isP(drv) ? (drv.held === 's' ? drv.b.c : drv.b.s) : isW(drv) ? drv.b.w : drv;
    st.ratio = 1; st.phase = st.free;
    const q = [st];
    while (q.length) {
      const a = q.shift();
      for (const e of adj.get(a)) {
        const b = e.o, ratio = a.ratio * e.k; let phase = b.free, pitch = 0;
        if (e.lock && b.ratio == null) { if (!locked) { locked = true; lockMsg = `Locked. ${a.g.name} is self-locking: its wheel cannot drive the worm.`; collide.add(a.g.id); } continue; }
        if (b.held) { if (!locked) { locked = true; lockMsg = `Locked. ${b.label} is held.`; } continue; }
        if (e.f) { [phase, pitch] = e.f(a.phase); phase += pitch * Math.round((b.free - phase) / pitch); }
        if (b.ratio == null) { b.ratio = ratio; b.phase = phase; q.push(b); }
        else {
          let bad = Math.abs(b.ratio - ratio) > 1e-9 * Math.max(1, Math.abs(ratio));
          if (!bad && e.f) { let er = (phase - b.phase) / pitch; er -= Math.round(er); bad = Math.abs(er) > 0.06; }
          if (bad && !locked) { locked = true; lockMsg = `Locked. The loop through ${a.label} and ${b.label} fights itself.`; collide.add(a.g.id); collide.add(b.g.id); }
        }
      }
    }
  }
  // carrier angle that lets the planets mesh with both sun and ring
  for (const g of gears) if (isP(g)) {
    const zs = g.zs, R = zr(g), st = TAU / (zs + R);
    const p0 = (TAU * (0.5 + g.zp / 2) + g.b.s.phase * zs + g.b.r.phase * R) / (zs + R);
    g.b.c.phase = p0 + st * Math.round((g.b.c.free - p0) / st);
  }
  if (!locked && hitPair && gears.some(g => collide.has(g.id) && driven(g))) { locked = true; lockMsg = `Locked. ${hitPair[0].name} and ${hitPair[1].name} overlap.`; }
}

/* ---------- snapping ---------- */
function circ2(a, Ra, b, Rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 1e-6 || d > Ra + Rb || d < Math.abs(Ra - Rb)) return [];
  const t = (Ra * Ra - Rb * Rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, Ra * Ra - t * t));
  const mx = a.x + dx * t / d, my = a.y + dy * t / d;
  return [{ x: mx - dy * h / d, y: my + dx * h / d }, { x: mx + dy * h / d, y: my - dx * h / d }];
}
function snap(g, x, y) {
  const S = Math.max(2 * M + 0.4, 10 / view.scale);
  if (isR(g)) { // slide the rack sideways until its pitch line touches a gear
    const u = [Math.cos(g.dir), Math.sin(g.dir)]; let best = null;
    for (const o of gears) if (o.layer === g.layer && kind(o) === 'gear') {
      const dx = o.x - x, dy = o.y - y, ax = dx * u[0] + dy * u[1], e = -dx * u[1] + dy * u[0] - RO(o);
      if (Math.abs(ax) <= rackLen(g) / 2 && Math.abs(e) < S && (best == null || Math.abs(e) < Math.abs(best))) best = e;
    }
    return best == null ? { x, y } : { x: x - u[1] * best, y: y + u[0] * best };
  }
  for (const o of gears) if (o !== g && !isR(o) && o.layer !== g.layer && Math.hypot(x - o.x, y - o.y) < Math.max(3, 8 / view.scale)) return { x: o.x, y: o.y };
  if (isB(g)) for (const o of gears) if (o !== g && o.layer === g.layer) {
    if (isB(o)) {
      const c = Math.cos(o.dir), s = Math.sin(o.dir), dx = x - o.x, dy = y - o.y, al = dx * c + dy * s, pe = -dx * s + dy * c;
      if (al > RO(o) + RO(g) + 3 && Math.abs(pe) < S) { g.dir = (o.dir + Math.PI) % TAU; return { x: o.x + c * al, y: o.y + s * al }; }
    } else if (isW(o)) {
      const [wx, wy] = wormC(o), c = Math.cos(o.dir), s = Math.sin(o.dir), dx = x - wx, dy = y - wy, al = dx * c + dy * s, pe = -dx * s + dy * c;
      if (Math.abs(al) > RO(g) + WL / 2 + 3 && Math.abs(pe) < S) { g.dir = mod(al > 0 ? o.dir + Math.PI : o.dir, TAU); return { x: wx + c * al, y: wy + s * al }; }
    }
  }
  const k = kind(g);
  if (!k) return { x, y };
  if (k === 'gear') for (const o of gears) if (isR(o) && o.layer === g.layer) {
    const u = [Math.cos(o.dir), Math.sin(o.dir)], dx = x - o.x, dy = y - o.y, ax = dx * u[0] + dy * u[1], pe = -dx * u[1] + dy * u[0], R = RO(g);
    if (Math.abs(ax) <= rackLen(o) / 2 && Math.abs(pe - R) < S) return { x: o.x + u[0] * ax - u[1] * R, y: o.y + u[1] * ax + u[0] * R };
  }
  const c = [];
  for (const o of gears) if (o !== g && o.layer === g.layer && kind(o) === k) {
    const s = RO(g) + RO(o), e = Math.abs(Math.hypot(x - o.x, y - o.y) - s);
    if (e < S) c.push({ o, s, e });
  }
  c.sort((a, b) => a.e - b.e);
  if (c.length >= 2) {
    let best = null;
    for (const p of circ2(c[0].o, c[0].s, c[1].o, c[1].s)) { const d = Math.hypot(p.x - x, p.y - y); if (!best || d < best.d) best = { p, d }; }
    if (best && best.d < S * 1.6) return best.p;
  }
  if (c.length) {
    const o = c[0].o; let dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
    return { x: o.x + dx / d * c[0].s, y: o.y + dy / d * c[0].s };
  }
  return { x, y };
}

/* ---------- scene ---------- */
function example() {
  gears = []; links = []; nextId = 1; selId = null; linkFrom = null; theta = 0; layerCount = 2; activeLayer = 0; rpm = 60;
  const p1 = addPart('pulley', { d: 24, x: 0, y: 0, layer: 0, driver: true });
  const p2 = addPart('pulley', { d: 60, x: 80, y: 0, layer: 0 });
  const s3 = addPart('sprocket', { z: 12, x: 80, y: 0, layer: 1 });
  const s4 = addPart('sprocket', { z: 16, x: 80, y: 90, layer: 1 });
  addPart('spur', { z: 30, x: 80, y: 90, layer: 0 });
  addPart('rack', { z: 20, dir: Math.PI, x: 110, y: 120, layer: 0 });
  addPart('pulley', { d: 44, x: -34, y: 0, layer: 0 });
  addPart('bevel', { z: 16, zp: 10, dir: Math.PI / 2, x: -34, y: 0, layer: 1 });
  addPart('worm', { z: 30, zp: 1, dir: Math.PI / 2, x: 0.5, y: 85, layer: 1 });
  links.push({ a: p1.id, b: p2.id, crossed: false }, { a: s3.id, b: s4.id, crossed: false });
}
function serialize() {
  return { rpm, nextId, layerCount, links: links.map(L => ({ ...L })), gears: gears.map(g => {
    const o = { id: g.id, name: g.name, type: g.type, x: g.x, y: g.y, layer: g.layer, driver: g.driver };
    if (isP(g)) Object.assign(o, { zs: g.zs, zp: g.zp, held: g.held, fs: angle(g.b.s), fc: angle(g.b.c), fr: angle(g.b.r) });
    else if (isW(g)) Object.assign(o, { z: g.z, zp: g.zp, dir: g.dir, fw: angle(g.b.w), fg: angle(g.b.g) });
    else { o.free = angle(g); if (isU(g)) o.d = g.d; else o.z = g.z; if (isB(g)) o.zp = g.zp; if (isB(g) || isR(g)) o.dir = g.dir; }
    return o;
  }) };
}
function load(d) {
  gears = d.gears.filter(g => TYPES[g.type || 'spur']).map(make); links = (d.links || []).map(L => ({ a: L.a, b: L.b, crossed: !!L.crossed }));
  nextId = d.nextId; rpm = d.rpm; theta = 0; selId = null; linkFrom = null; activeLayer = 0;
  layerCount = Math.min(MAXL, Math.max(2, d.layerCount || 0, ...gears.map(g => g.layer + 1)));
}
const STORE = 'gear-bench-3';
function save() { try { localStorage.setItem(STORE, JSON.stringify(serialize())); } catch (e) {} }
function changed() { freeze(); solve(); ui(); }

/* ---------- view ---------- */
function bandH() {
  if (viewMode === 'top') return 0; if (viewMode === 'side') return H;
  return Math.round(Math.max(96, Math.min(H * 0.45, (layerCount * LP + 26) * view.scale + 46)));
}
const topMid = () => { const b = bandH(); return b + (H - b) / 2; };
const baseY = () => bandH() - 26;
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / view.scale + view.cx, y: (sy - topMid()) / view.scale + view.cy });
function fit() {
  if (!gears.length) { view.cx = view.cy = 0; view.scale = 3; return; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const g of gears) {
    const c = Math.abs(Math.cos(g.dir || 0)), sn = Math.abs(Math.sin(g.dir || 0)), L = isR(g) ? rackLen(g) / 2 : 0;
    const rx = (isR(g) ? c * L + sn * 14 : extR(g)) + 10, ry = (isR(g) ? sn * L + c * 14 : extR(g)) + 10;
    x0 = Math.min(x0, g.x - rx); x1 = Math.max(x1, g.x + rx); y0 = Math.min(y0, g.y - ry); y1 = Math.max(y1, g.y + ry);
  }
  view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
  const sx = W / (x1 - x0);
  if (viewMode === 'side') view.scale = Math.min(sx, (H - 80) / (layerCount * LP + 30));
  else view.scale = Math.min(sx, (viewMode === 'top' ? H - 30 : H * 0.56) / (y1 - y0));
  view.scale = Math.max(0.5, Math.min(7, view.scale));
}
function zoomAt(sx, sy, f) {
  const side = sy < bandH(), w = toWorld(sx, sy);
  view.scale = Math.max(0.5, Math.min(12, view.scale * f));
  view.cx = w.x - (sx - W / 2) / view.scale;
  if (!side) view.cy = w.y - (sy - topMid()) / view.scale;
}
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['paper', 'panel', 'ink', 'muted', 'line', 'grid', 'grid-major', 'steel-a', 'steel-b', 'idle', 'shaft', 'brass', 'select', 'jam', 'mono']) T[k] = cs.getPropertyValue('--' + k).trim();
}
const hex = c => { c = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) || 0); };
const tone = l => { const A = hex(T['steel-a']), B = hex(T['steel-b']), t = layerCount > 1 ? l / (layerCount - 1) : 0; return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const fillOf = g => !driven(g) ? T.idle : tone(g.layer);
function resize() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  W = sheet.clientWidth; H = sheet.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}

/* ---------- drawing ---------- */
const CHAIN = s => [9 / s, 3 / s, 1.5 / s, 3 / s];
function gridX(s, x0, x1, y0, y1, step, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 1 / s; ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  ctx.stroke();
}
// bevel pinion on its horizontal shaft, projected by P; face() says which side of the cone the viewer sees
function pinion(g, s, P, face, endVis, zax, fill, ink) {
  const rg = M * g.z / 2, rp = M * g.zp / 2, c = Math.cos(g.dir), sn = Math.sin(g.dir), pa = angle(g) * g.z / g.zp;
  const pt = (sd, rho, a) => P(g.x + c * sd - sn * rho * Math.cos(a), g.y + sn * sd + c * rho * Math.cos(a), zax + rho * Math.sin(a));
  const L = g.shaftL || rg + 18;
  const line = (A, B, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); };
  ctx.strokeStyle = T.shaft; ctx.lineCap = 'butt';
  line(pt(rg * 0.7, 0, 0), pt(L, 0, 0), 4.4);
  if (!g.shaftL) line(pt(L - 2.5, 0, 0), pt(L, 0, 0), 9);
  const pts = [], n = 28;
  for (let i = 0; i < n; i++) { const a = TAU * i / n; pts.push(pt(rg * 2 / 3, rp * 2 / 3, a), pt(rg, rp, a), pt(rg + 3, rp * 0.9, a)); }
  const h = hull(pts);
  ctx.beginPath(); h.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath();
  for (let j = 0; j < g.zp; j++) { const a = pa + TAU * j / g.zp; if (face(g.dir, a)) { const A = pt(rg * 2 / 3, rp * 2 / 3, a), B = pt(rg, rp, a); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } }
  ctx.lineWidth = 0.8 / s; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
  if (endVis) {
    ctx.beginPath(); for (let i = 0; i < n; i++) { const q = pt(rg + 3, rp * 0.9, TAU * i / n); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.2 / s; ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < n; i++) { const q = pt(rg + 3, 2.4, TAU * i / n); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.closePath();
    ctx.fillStyle = T.shaft; ctx.fill();
    const A = pt(rg + 3, 2.4, pa), B = pt(rg + 3, rp * 0.75, pa); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  }
}
function planetAngles(g) {
  const as = angle(g.b.s), ac = angle(g.b.c), n = nPl(g), orb = M * (g.zs + g.zp) / 2, out = [];
  for (let k = 0; k < n; k++) { const psi = ac + TAU * k / n; out.push({ x: g.x + orb * Math.cos(psi), y: g.y + orb * Math.sin(psi), a: psi + Math.PI - (TAU / g.zp) * (0.5 - (psi - as) * g.zs / TAU) }); }
  return out;
}
// axial position of the first worm thread ridge, measured along the worm axis from the mesh point
const wormRidge = g => mod(-(angle(g.b.g) + Math.PI / g.z - g.dir - Math.PI / 2) * RO(g), PM);

function drawLinkTop(L) {
  const a = byId(L.a), b = byId(L.b), G = loopGeo(a, b, isU(a) && L.crossed);
  if (!G) return;
  const p = loopPath(a, b, G);
  ctx.save(); ctx.lineJoin = 'round';
  if (isU(a)) {
    const pp = G.L / Math.max(1, Math.round(G.L / 9));
    ctx.strokeStyle = T.ink; ctx.lineWidth = 2.6; ctx.stroke(p);
    ctx.strokeStyle = T.paper; ctx.globalAlpha = 0.65; ctx.lineWidth = 1.1; ctx.setLineDash([pp * 0.3, pp * 0.7]); ctx.lineDashOffset = -mod(angle(a) * G.ra, pp); ctx.stroke(p);
  } else {
    const pp = G.L / Math.max(1, Math.round(G.L / CP)), u = (angle(a) - G.phi - Math.PI) * a.z / TAU;
    ctx.strokeStyle = T.ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 3.8; ctx.stroke(p);
    ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineWidth = 3.2; ctx.setLineDash([0.01, pp - 0.01]); ctx.lineDashOffset = -mod(u, 1) * pp; ctx.stroke(p);
    ctx.strokeStyle = T.paper; ctx.lineWidth = 1.2; ctx.stroke(p);
  }
  ctx.restore();
}

function drawTop(dpr, s, bh) {
  const mid = bh + (H - bh) / 2;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.rect(0, bh, W, H - bh); ctx.clip();
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - view.cx * s), dpr * (mid - view.cy * s));
  const a = toWorld(0, bh), b = toWorld(W, H);
  const rows = (step, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1 / s; ctx.beginPath(); for (let y = Math.ceil(a.y / step) * step; y <= b.y; y += step) { ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); } ctx.stroke(); };
  if (s * 10 >= 7) { gridX(s, a.x, b.x, a.y, b.y, 10, T.grid); rows(10, T.grid); }
  gridX(s, a.x, b.x, a.y, b.y, 50, T['grid-major']); rows(50, T['grid-major']);
  const shadow = on => { if (on) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10 * dpr; ctx.shadowOffsetY = 3 * dpr; } else ctx.shadowColor = 'transparent'; };
  const gearAt = (x, y, ang, p, fill, ink, lw, sh) => { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); shadow(sh); ctx.fillStyle = fill; ctx.fill(p, 'evenodd'); shadow(false); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(p); ctx.restore(); };
  const detail = (x, y, ang, p, ink) => { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = ink; ctx.lineWidth = 0.8 / s; ctx.globalAlpha = 0.6; ctx.stroke(p); ctx.restore(); };
  const part = g => {
    const bad = collide.has(g.id), ink = bad ? T.jam : T.ink, lw = (bad ? 2 : 1.2) / s, fill = fillOf(g), sh = g.layer > 0, main = g.driver ? T.brass : fill;
    if (isR(g)) {
      const L = rackLen(g), o = mod(angle(g), PM), yr = -1.25 * M, yb = yr - RB, p = new Path2D();
      p.moveTo(-L / 2 - PM, yb); p.lineTo(-L / 2 - PM, yr);
      for (let c = o - PM * Math.ceil((L / 2 + PM) / PM); c < L / 2 + PM; c += PM) { p.lineTo(c - 2.48, yr); p.lineTo(c - 0.84, M); p.lineTo(c + 0.84, M); p.lineTo(c + 2.48, yr); }
      p.lineTo(L / 2 + PM, yr); p.lineTo(L / 2 + PM, yb); p.closePath();
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.dir);
      ctx.save(); ctx.beginPath(); ctx.rect(-L / 2, yb - 1, L, RB + 2.25 * M + 2); ctx.clip();
      ctx.fillStyle = fill; ctx.fill(p); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(p); ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(-L / 2, yb); ctx.lineTo(-L / 2, yr); ctx.moveTo(L / 2, yb); ctx.lineTo(L / 2, yr); ctx.stroke();
      ctx.fillStyle = T.shaft; ctx.fillRect(-L / 2 - 2, yb - 2.5, 8, 5); ctx.fillRect(L / 2 - 6, yb - 2.5, 8, 5);
      ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8 / s; ctx.setLineDash(CHAIN(s)); ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
      ctx.restore(); return;
    }
    ctx.fillStyle = T.shaft; ctx.beginPath(); ctx.arc(g.x, g.y, 2.6, 0, TAU); ctx.fill();
    if (isP(g)) {
      gearAt(g.x, g.y, angle(g.b.r), ringPath(zr(g)), fill, ink, lw, sh);
      gearAt(g.x, g.y, angle(g.b.s), spurPath(g.zs), main, ink, lw, false);
      const pl = planetAngles(g);
      for (const q of pl) gearAt(q.x, q.y, q.a, spurPath(g.zp), fill, ink, lw, false);
      ctx.strokeStyle = T.shaft; ctx.globalAlpha = 0.6; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      for (const q of pl) { ctx.moveTo(g.x, g.y); ctx.lineTo(q.x, q.y); } ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      ctx.fillStyle = T.shaft; for (const q of pl) { ctx.beginPath(); ctx.arc(q.x, q.y, 1.8, 0, TAU); ctx.fill(); }
    } else if (isB(g)) {
      const bp = bevelPath(g.z);
      gearAt(g.x, g.y, angle(g), bp.fill, main, ink, lw, sh); detail(g.x, g.y, angle(g), bp.lines, ink);
      pinion(g, s, (x, y) => [x, y], (d, a) => Math.sin(a) > 0, false, 0, fill, ink);
    } else if (isU(g)) {
      const pp = pulleyPath(g.d);
      gearAt(g.x, g.y, angle(g), pp.fill, main, ink, lw, sh); detail(g.x, g.y, 0, pp.lines, ink);
    } else if (isS(g)) gearAt(g.x, g.y, angle(g), sprocketPath(g.z), main, ink, lw, sh);
    else if (isW(g)) {
      gearAt(g.x, g.y, angle(g.b.g), spurPath(g.z), fill, ink, lw, sh);
      const [wx, wy] = wormC(g), sl = 1.1 * g.zp, o = wormRidge(g);
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(g.dir);
      ctx.fillStyle = T.shaft; ctx.fillRect(-WL / 2 - 9, -2.2, WL + 18, 4.4); ctx.fillRect(-WL / 2 - 9, -4, 4, 8); ctx.fillRect(WL / 2 + 5, -4, 4, 8);
      shadow(sh); ctx.fillStyle = main; ctx.fillRect(-WL / 2, -WO, WL, 2 * WO); shadow(false);
      ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.strokeRect(-WL / 2, -WO, WL, 2 * WO);
      ctx.beginPath(); ctx.rect(-WL / 2, -WO, WL, 2 * WO); ctx.clip();
      ctx.beginPath(); for (let j = -4; j <= 4; j++) { const c = o + j * PM; ctx.moveTo(c - sl, -WO); ctx.lineTo(c + sl, WO); }
      ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7; ctx.stroke();
      ctx.restore();
    } else gearAt(g.x, g.y, angle(g), spurPath(g.z), main, ink, lw, sh);
    if (!isU(g)) {
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8 / s; ctx.setLineDash(CHAIN(s));
      ctx.beginPath(); ctx.arc(g.x, g.y, RO(g), 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  };
  for (let l = 0; l < layerCount; l++) {
    for (const g of gears) if (g.layer === l) part(g);
    for (const L of links) if (byId(L.a).layer === l) drawLinkTop(L);
  }
  const sel = byId(selId);
  if (sel) {
    ctx.strokeStyle = T.select;
    if (isR(sel)) { ctx.save(); ctx.translate(sel.x, sel.y); ctx.rotate(sel.dir); ctx.lineWidth = 2 / s; ctx.strokeRect(-rackLen(sel) / 2 - 2, -1.25 * M - RB - 2, rackLen(sel) + 4, RB + 2.25 * M + 4); ctx.restore(); }
    else {
      const ra = tipR(sel), e = ra + 5;
      ctx.lineWidth = 2 / s; ctx.beginPath(); ctx.arc(sel.x, sel.y, ra + 1.6, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.9 / s; ctx.setLineDash(CHAIN(s));
      ctx.beginPath(); ctx.moveTo(sel.x - e, sel.y); ctx.lineTo(sel.x + e, sel.y); ctx.moveTo(sel.x, sel.y - e); ctx.lineTo(sel.x, sel.y + e); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `500 12px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const g of [...gears].sort((p, q) => p.layer - q.layer)) {
    const cx = (g.x - view.cx) * s + W / 2, cy = (g.y - view.cy) * s + mid, off = tipR(g) * s + 13, rk = isR(g) ? (RB + 1.25 * M) * s + 12 : 0;
    const sx = cx + Math.sin(g.dir || 0) * rk, sy = isR(g) ? cy - Math.cos(g.dir) * rk : cy + (g.layer ? -off + 8 - (g.layer - 1) * 14 : off);
    const t = `${g.name} ${sizeText(g)}  ${speedText(g, true)}`.trim();
    ctx.strokeStyle = T.paper; ctx.lineWidth = 4; ctx.strokeText(t, sx, sy);
    ctx.fillStyle = collide.has(g.id) ? T.jam : g.driver ? T.brass : T.ink; ctx.fillText(t, sx, sy);
  }
  ctx.restore();
}

function drawSide(dpr, s, bh) {
  const by = bh - 26;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.rect(0, 0, W, bh); ctx.clip();
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - view.cx * s), dpr * by); // world here is (x, -z)
  const x0 = view.cx - W / 2 / s, x1 = view.cx + W / 2 / s, yTop = -by / s;
  if (s * 10 >= 7) gridX(s, x0, x1, yTop, BASE, 10, T.grid);
  gridX(s, x0, x1, yTop, BASE, 50, T['grid-major']);
  ctx.strokeStyle = T.line; ctx.lineWidth = 0.8 / s; ctx.setLineDash(CHAIN(s)); ctx.beginPath();
  for (let l = 0; l < layerCount; l++) { ctx.moveTo(x0, -l * LP); ctx.lineTo(x1, -l * LP); } ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = T.ink; ctx.lineWidth = 1.4 / s; ctx.beginPath(); ctx.moveTo(x0, BASE); ctx.lineTo(x1, BASE); ctx.stroke();
  ctx.lineWidth = 0.7 / s; ctx.globalAlpha = 0.5; ctx.beginPath();
  for (let x = Math.floor(x0 / 5) * 5; x <= x1; x += 5) { ctx.moveTo(x, BASE); ctx.lineTo(x - 3, BASE + 3); } ctx.stroke(); ctx.globalAlpha = 1;

  const rect = (x, r, z0, z1, fill, ink) => { ctx.fillStyle = fill; ctx.fillRect(x - r, -z1, 2 * r, z1 - z0); ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.strokeRect(x - r, -z1, 2 * r, z1 - z0); };
  const teeth = (x, r, z, ang, z0, z1, ink) => {
    ctx.beginPath(); for (let j = 0; j < z; j++) { const a = ang + TAU * j / z; if (Math.sin(a) > 0) { const X = x + r * Math.cos(a); ctx.moveTo(X, -z0); ctx.lineTo(X, -z1); } }
    ctx.strokeStyle = ink; ctx.lineWidth = 0.8 / s; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
  };
  for (const g of [...gears].sort((p, q) => p.y - q.y || p.layer - q.layer)) {
    const zb = g.layer * LP, bad = collide.has(g.id), ink = bad ? T.jam : T.ink, fill = fillOf(g), main = g.driver ? T.brass : fill;
    const ztop = isB(g) ? zb + 3 + M * g.zp / 6 : zb + FW;
    if (!isR(g)) { ctx.fillStyle = T.shaft; ctx.fillRect(g.x - 2.2, -(ztop + 3), 4.4, ztop + 3 + BASE); }
    if (isP(g)) {
      const R = zr(g), ro = tipR(g), ri = M * R / 2 - M, orb = M * (g.zs + g.zp) / 2;
      ctx.fillStyle = T.idle; ctx.fillRect(g.x - ri, -(zb + FW), 2 * ri, FW);
      const items = planetAngles(g).map(q => ({ x: q.x, y: q.y, r: M * g.zp / 2 + M, z: g.zp, a: q.a, f: fill, pl: true }));
      items.push({ x: g.x, y: g.y, r: M * g.zs / 2 + M, z: g.zs, a: angle(g.b.s), f: main });
      items.sort((p, q) => p.y - q.y);
      for (const it of items) { rect(it.x, it.r, zb + 1, zb + FW - 1, it.f, ink); teeth(it.x, it.r, it.z, it.a, zb + 1, zb + FW - 1, ink); }
      for (const sd of [-1, 1]) { // ring rim shown in section
        const xa = sd < 0 ? g.x - ro : g.x + ri, w = ro - ri;
        ctx.fillStyle = fill; ctx.fillRect(xa, -(zb + FW), w, FW);
        ctx.save(); ctx.beginPath(); ctx.rect(xa, -(zb + FW), w, FW); ctx.clip();
        ctx.strokeStyle = ink; ctx.lineWidth = 0.7 / s; ctx.globalAlpha = 0.6; ctx.beginPath();
        for (let k = -FW; k < w + FW; k += 2) { ctx.moveTo(xa + k, -zb); ctx.lineTo(xa + k + FW, -(zb + FW)); } ctx.stroke(); ctx.restore();
        ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.strokeRect(xa, -(zb + FW), w, FW);
      }
      ctx.beginPath(); ctx.moveTo(g.x - ro, -(zb + FW)); ctx.lineTo(g.x + ro, -(zb + FW)); ctx.moveTo(g.x - ro, -zb); ctx.lineTo(g.x + ro, -zb); ctx.stroke();
      ctx.fillStyle = T.shaft;
      for (const it of items) if (it.pl) ctx.fillRect(it.x - 1.2, -(zb + FW + 1.5), 2.4, 2.5);
      ctx.fillRect(g.x - orb - 3, -(zb + FW + 4), 2 * orb + 6, 2.5);
    } else if (isB(g)) {
      const rg = M * g.z / 2, rp = M * g.zp / 2, front = Math.sin(g.dir) >= 0;
      const pin = () => pinion(g, s, (x, y, z) => [x, -z], (d, a) => Math.cos(d) * Math.cos(a) > 0, Math.sin(g.dir) > 0.05, zb + 3 + rp, fill, ink);
      if (!front) pin();
      ctx.beginPath(); ctx.moveTo(g.x - rg, -zb); ctx.lineTo(g.x + rg, -zb); ctx.lineTo(g.x + rg, -(zb + 3)); ctx.lineTo(g.x + rg * 2 / 3, -(zb + 3 + rp / 3)); ctx.lineTo(g.x - rg * 2 / 3, -(zb + 3 + rp / 3)); ctx.lineTo(g.x - rg, -(zb + 3)); ctx.closePath();
      ctx.fillStyle = main; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.stroke();
      const ang = angle(g); ctx.beginPath();
      for (let j = 0; j < g.z; j++) { const a = ang + TAU * j / g.z; if (Math.sin(a) > 0) { const c = Math.cos(a); ctx.moveTo(g.x + rg * c, -(zb + 3)); ctx.lineTo(g.x + rg * 2 / 3 * c, -(zb + 3 + rp / 3)); } }
      ctx.lineWidth = 0.8 / s; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
      if (front) pin();
    } else if (isU(g)) {
      const r = g.d / 2;
      rect(g.x, r + 1.5, zb, zb + FW, main, ink); teeth(g.x, r, 6, angle(g), zb + 1.5, zb + FW - 1.5, ink);
      ctx.beginPath(); for (const z of [zb + 1.5, zb + FW - 1.5]) { ctx.moveTo(g.x - r - 1.5, -z); ctx.lineTo(g.x + r + 1.5, -z); } ctx.stroke();
    } else if (isS(g)) {
      rect(g.x, 5, zb + 1, zb + FW - 1, main, ink); rect(g.x, tipR(g), zb + 3.5, zb + 6.5, main, ink); teeth(g.x, tipR(g), g.z, angle(g), zb + 3.5, zb + 6.5, ink);
    } else if (isR(g)) rect(g.x, halfW(g), zb + 1, zb + FW - 1, fill, ink);
    else if (isW(g)) {
      const c = Math.cos(g.dir), wx = wormC(g)[0], hx = Math.abs(c) * WL / 2 + Math.abs(Math.sin(g.dir)) * WO, zc = zb + FW / 2;
      const worm = () => {
        ctx.fillStyle = T.shaft; ctx.fillRect(wx - hx - 8 * Math.abs(c), -(zc + 2.2), 2 * hx + 16 * Math.abs(c), 4.4);
        rect(wx, hx, zc - WO, zc + WO, main, ink);
        if (Math.abs(c) > 0.3) {
          const o = wormRidge(g); ctx.beginPath();
          for (let j = -4; j <= 4; j++) { const a = o + j * PM; if (Math.abs(a) < WL / 2) { ctx.moveTo(wx + c * a, -(zc - WO)); ctx.lineTo(wx + c * a, -(zc + WO)); } }
          ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
        }
      };
      const wheel = () => { rect(g.x, tipR(g), zb, zb + FW, fill, ink); teeth(g.x, tipR(g), g.z, angle(g.b.g), zb, zb + FW, ink); };
      if (c > 0) { wheel(); worm(); } else { worm(); wheel(); }
    } else { rect(g.x, tipR(g), zb, zb + FW, main, ink); teeth(g.x, tipR(g), g.z, angle(g), zb, zb + FW, ink); }
    if (g.id === selId) { const r = halfW(g) + 1.5; ctx.strokeStyle = T.select; ctx.lineWidth = 2 / s; ctx.strokeRect(g.x - r, -(ztop + 1.5), 2 * r, ztop - zb + 3); }
  }
  for (const L of links) { // belts and chains seen edge-on
    const a = byId(L.a), b = byId(L.b), zb = a.layer * LP, xa = Math.min(a.x - RO(a), b.x - RO(b)), xb = Math.max(a.x + RO(a), b.x + RO(b));
    const z0 = isU(a) ? zb + 2.2 : zb + 3.2, z1 = isU(a) ? zb + FW - 2.2 : zb + 6.8;
    ctx.fillStyle = T.ink; ctx.globalAlpha = isU(a) ? 0.85 : 0.5; ctx.fillRect(xa, -z1, xb - xa, z1 - z0); ctx.globalAlpha = 1;
    if (isS(a)) { ctx.strokeStyle = T.ink; ctx.lineWidth = 1.2; ctx.setLineDash([CP * 0.5, CP * 0.5]); ctx.beginPath(); ctx.moveTo(xa, -(z0 + z1) / 2); ctx.lineTo(xb, -(z0 + z1) / 2); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `500 12px ${T.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let l = 0; l < layerCount; l++) { const y = by - (l * LP + FW / 2) * s; ctx.strokeStyle = T.paper; ctx.lineWidth = 4; ctx.strokeText(LET(l), 10, y); ctx.fillStyle = l === activeLayer ? T.ink : T.muted; ctx.fillText(LET(l), 10, y); }
  ctx.restore();
}

function draw(ts) {
  const dpr = cv.width / W, s = view.scale, bh = bandH();
  jit = locked && running && !reduced && rpm !== 0 ? 0.01 * Math.sin(ts * 0.035) : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = T.paper; ctx.fillRect(0, 0, W, H);
  if (bh > 0) drawSide(dpr, s, bh);
  if (bh < H) drawTop(dpr, s, bh);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (bh > 0 && bh < H) { ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, bh); ctx.lineTo(W, bh); ctx.stroke(); }
  ctx.font = `500 11px ${T.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = T.muted;
  if (bh > 0) ctx.fillText('SIDE VIEW', W - 10, 16);
  if (bh < H) ctx.fillText('TOP VIEW', W - 10, bh + 16);
  jit = 0;
}

/* ---------- panel ---------- */
const fmtRatio = r => { r = Math.abs(r); return r <= 1 ? `${(1 / r).toFixed(2)} : 1` : `1 : ${r.toFixed(2)}`; };
const nStr = (b, k = 1) => b.held ? 'held' : b.ratio == null ? 'not driven' : (n => `${Math.abs(n).toFixed(2)} rpm ${n > 0 ? 'cw' : n < 0 ? 'ccw' : ''}`)(rpm * b.ratio * k);
const mmps = g => rpm * g.ratio * Math.PI / 30; // rack speed; a rack's "angle" is its travel in mm
const sizeText = g => isP(g) ? `${g.zs}/${g.zp}/${zr(g)}` : isB(g) || isW(g) ? `z${g.z}/${g.zp}` : isU(g) ? `⌀${g.d}` : `z${g.z}`;
function speedText(g, arrows) {
  const b = outB(g); if (b.ratio == null) return arrows ? '' : 'idle';
  if (isR(g)) return `${Math.abs(mmps(g)).toFixed(1)} mm/s`;
  const n = rpm * b.ratio;
  return arrows ? `${Math.abs(n).toFixed(1)} rpm ${n === 0 ? '' : n > 0 ? '↻' : '↺'}` : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)} rpm`;
}
const press = (el, on) => (typeof el === 'string' ? $(el) : el).setAttribute('aria-pressed', on);
const el = (tag, text, props) => Object.assign(document.createElement(tag), { textContent: text }, props);
function specRows(g) {
  const rows = [], b = outB(g), on = b.ratio != null, deg = a => `${(a * 180 / Math.PI).toFixed(0)}°`;
  const common = () => rows.push(['Ratio to motor', on ? fmtRatio(b.ratio) : '–'], ['Torque', on ? `× ${(1 / Math.abs(b.ratio)).toFixed(2)}` : '–']);
  const rim = d => on ? `${(Math.PI * d * Math.abs(rpm * b.ratio) / 60).toFixed(1)} mm/s` : '–';
  if (isP(g)) {
    const R = zr(g), zs = g.zs;
    rows.push(['Ring teeth (in / out)', `${R} / ${R + 8}`], ['Planets', `${nPl(g)} × z${g.zp}`], ['Sun n', nStr(g.b.s)], ['Carrier n', nStr(g.b.c)], ['Ring n', nStr(g.b.r)],
      ['Stage ratio', g.held === 'r' ? fmtRatio(zs / (zs + R)) : g.held === 'c' ? fmtRatio(zs / R) + ' rev' : fmtRatio(R / (zs + R))]);
  } else if (isW(g)) {
    rows.push(['Stage ratio i', `${(g.z / g.zp).toFixed(g.z % g.zp ? 2 : 0)} : 1`], ['Centre distance a', `${RO(g) + WR} mm`], ['Worm n', nStr(g.b.w)], ['Wheel n', nStr(g.b.g)], ['Self-locking', 'yes']); common();
  } else if (isR(g)) {
    rows.push(['Length', `${rackLen(g).toFixed(1)} mm`], ['Linear speed', on ? `${Math.abs(mmps(g)).toFixed(1)} mm/s` : 'not driven'], ['Travel per motor rev', on ? `${(Math.abs(g.ratio) * TAU).toFixed(1)} mm` : '–']);
  } else if (isU(g)) {
    rows.push(['Diameter d', `${g.d} mm`], ['Speed n', nStr(g)], ['Belt speed', rim(g.d)]);
    for (const L of links) if (L.a === g.id || L.b === g.id) { const a = byId(L.a), o = byId(L.a === g.id ? L.b : L.a), G = loopGeo(a, byId(L.b), L.crossed); rows.push([`Belt to ${o.name}`, G ? `L ${G.L.toFixed(0)} mm, wrap ${deg(L.a === g.id ? G.wrapA : G.wrapB)}` : 'too close to cross']); }
    common();
  } else if (isS(g)) {
    rows.push(['Pitch p', `${CP} mm (05B)`], ['Pitch diameter d', `${(CP / Math.sin(Math.PI / g.z)).toFixed(2)} mm`], ['Speed n', nStr(g)], ['Chain speed', rim(2 * RO(g))]);
    for (const L of links) if (L.a === g.id || L.b === g.id) { const o = byId(L.a === g.id ? L.b : L.a), G = loopGeo(byId(L.a), byId(L.b), false); if (G) rows.push([`Chain to ${o.name}`, `${Math.round(G.L / CP)} links, a ${G.d.toFixed(0)} mm`]); }
    common();
  } else {
    const d = M * g.z; rows.push(['Pitch diameter d', `${d} mm`]);
    if (isB(g)) rows.push(['Pitch cone angle δ', `${(Math.atan(g.z / g.zp) * 180 / Math.PI).toFixed(1)}°`], ['Gear n', nStr(g)], ['Pinion n', nStr(g, g.z / g.zp)], ['Cross-shaft', g.mate ? 'joined to ' + g.mate.name : 'open end']);
    else rows.push(['Tip diameter da', `${d + 2 * M} mm`], ['Speed n', nStr(g)], ['Pitch-line speed', rim(d)]);
    common();
  }
  return rows;
}
function ui() {
  const drv = gears.find(g => g.driver), sel = byId(selId), from = byId(linkFrom);
  $('motor-on').textContent = drv ? drv.name + (isP(drv) ? (drv.held === 's' ? ' carrier' : ' sun') : isW(drv) ? ' worm' : '') : 'none';
  $('motor-rpm').value = rpm; $('rpm-out').textContent = `${rpm} rpm`;
  $('run').textContent = running ? 'Pause' : 'Run';
  const turning = gears.filter(driven).length;
  $('status').className = 'status' + (from ? '' : locked ? ' locked' : !running || rpm === 0 ? ' paused' : '');
  $('status-text').textContent = from ? `Click another ${from.type} on layer ${LET(from.layer)} to link ${from.name}. Esc cancels.` : !gears.length ? 'Empty bench. Add a part.' : locked ? lockMsg : !running ? 'Paused' : rpm === 0 ? 'Motor stopped' : `Running · ${turning} of ${gears.length} parts turning`;
  for (const b of $('types').children) press(b, b.dataset.type === newType);
  const nt = TYPES[newType], nz = $('new-z');
  nz.min = nt.lim[0]; nz.max = nt.lim[1]; nz.step = nt.lim[2]; $('new-z-out').textContent = nz.value; $('new-z-lab').textContent = nt.lab;
  $('new-layer').textContent = 'on layer ' + LET(activeLayer);
  $('layer-count').textContent = `${layerCount} layers`; $('add-layer').disabled = layerCount >= MAXL;
  for (const m of ['both', 'top', 'side']) press('vm-' + m, viewMode === m);
  $('sel-name').textContent = sel ? `${sel.name} · ${TYPES[sel.type].n.toLowerCase()}` : 'none';
  $('sel-empty').hidden = !!sel; $('sel-body').hidden = !sel;
  if (sel) {
    const t = TYPES[sel.type], sz = $('sel-z'), sz2 = $('sel-z2');
    sz.min = t.lim[0]; sz.max = t.lim[1]; sz.step = t.lim[2]; sz.value = sel[t.key]; $('sel-z-out').textContent = sel[t.key]; $('sel-z-lab').textContent = t.lab;
    $('row-z2').hidden = !t.lab2;
    if (t.lab2) { sz2.min = t.lim2[0]; sz2.max = t.lim2[1]; sz2.value = sel.zp; $('sel-z2-out').textContent = sel.zp; $('sel-z2-lab').textContent = t.lab2; }
    $('row-dir').hidden = !t.dir;
    if (t.dir) { const d = Math.round(mod(sel.dir * 180 / Math.PI, 360)) % 360; $('sel-dir').value = d; $('sel-dir-out').textContent = d + '°'; $('sel-dir-lab').textContent = t.dir; }
    $('row-held').hidden = !isP(sel);
    if (isP(sel)) for (const h of ['r', 'c', 's']) press('held-' + h, sel.held === h);
    const belt = isU(sel);
    $('row-link').hidden = !(belt || isS(sel));
    if (belt || isS(sel)) {
      $('link-lab').textContent = belt ? 'Belts' : 'Chains';
      $('link-add').textContent = linkFrom === sel.id ? 'Cancel' : belt ? 'Link belt' : 'Link chain';
      const box = $('links'); box.textContent = '';
      for (const L of links) if (L.a === sel.id || L.b === sel.id) {
        const row = el('div'), o = byId(L.a === sel.id ? L.b : L.a);
        row.append(el('span', `to ${o.name}`));
        if (belt) { const c = el('button', 'Crossed', { onclick: () => { L.crossed = !L.crossed; changed(); save(); } }); press(c, L.crossed); row.append(c); }
        row.append(el('button', 'Unlink', { onclick: () => { links = links.filter(q => q !== L); changed(); save(); } }));
        box.append(row);
      }
    }
    const seg = $('layer-seg'); seg.textContent = '';
    for (let l = 0; l < layerCount; l++) { const b = el('button', LET(l), { onclick: () => setLayer(l) }); press(b, sel.layer === l); b.setAttribute('aria-label', 'Layer ' + LET(l)); seg.appendChild(b); }
    const dl = $('specs'); dl.textContent = '';
    for (const [k, v] of specRows(sel)) dl.append(el('dt', k), el('dd', v));
    $('make-driver').disabled = sel.driver || isR(sel);
  }
  const tr = $('train'); tr.textContent = '';
  for (const g of gears) {
    const b = el('button', '', { onclick: () => select(g) });
    b.className = (g.id === selId ? 'sel ' : '') + (collide.has(g.id) ? 'bad' : g.driver ? 'drv' : '');
    for (const t of [g.name, isR(g) ? `rack ${g.z}` : sizeText(g), LET(g.layer), speedText(g, false)]) b.appendChild(el('span', t));
    tr.appendChild(b);
  }
}
function select(g) { selId = g ? g.id : null; if (g) activeLayer = g.layer; ui(); }

/* ---------- pointer input ---------- */
const pts = new Map(); let drag = null, pan = null, pinch = null;
const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function hitTop(g, w) {
  const local = (ox, oy) => { const c = Math.cos(g.dir), s = Math.sin(g.dir), dx = w.x - ox, dy = w.y - oy; return [dx * c + dy * s, -dx * s + dy * c]; };
  if (isR(g)) { const [lx, ly] = local(g.x, g.y); return Math.abs(lx) <= rackLen(g) / 2 && ly >= -1.25 * M - RB - 1 && ly <= M + 1; }
  if (Math.hypot(w.x - g.x, w.y - g.y) < tipR(g)) return true;
  if (isW(g)) { const [lx, ly] = local(...wormC(g)); return Math.abs(lx) <= WL / 2 + 9 && Math.abs(ly) <= WO + 1; }
  return false;
}
function hit(p) {
  if (p.y < bandH()) {
    const x = (p.x - W / 2) / view.scale + view.cx, z = (baseY() - p.y) / view.scale;
    return [...gears].sort((a, b) => b.y - a.y || b.layer - a.layer).find(g => { const zb = g.layer * LP; return Math.abs(x - g.x) < halfW(g) && z > zb - 1 && z < zb + (isB(g) ? 3 + M * g.zp : FW) + 1; });
  }
  const w = toWorld(p.x, p.y);
  return [...gears].sort((a, b) => b.layer - a.layer).find(g => hitTop(g, w));
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, p);
  if (pts.size === 2) {
    drag = pan = null; const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.scale, w: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), side: (a.y + b.y) / 2 < bandH() }; return;
  }
  const side = p.y < bandH(), g = hit(p);
  if (linkFrom != null) {
    const from = byId(linkFrom); linkFrom = null;
    if (g && from && g !== from && g.type === from.type && g.layer === from.layer && !links.some(L => (L.a === g.id && L.b === from.id) || (L.a === from.id && L.b === g.id))) {
      links.push({ a: from.id, b: g.id, crossed: false }); changed(); save(); return;
    }
  }
  if (g && !side) { const w = toWorld(p.x, p.y); drag = { g, dx: w.x - g.x, dy: w.y - g.y }; cv.classList.add('dragging'); select(g); }
  else { if (g) select(g); else ui(); pan = { sx: p.x, sy: p.y, cx: view.cx, cy: view.cy, moved: false, side, onPart: !!g }; }
});
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const p = pos(e); pts.set(e.pointerId, p);
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.scale = Math.max(0.5, Math.min(12, pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
    view.cx = pinch.w.x - (mx - W / 2) / view.scale; if (!pinch.side) view.cy = pinch.w.y - (my - topMid()) / view.scale;
  } else if (drag) {
    const w = toWorld(p.x, p.y), s = snap(drag.g, w.x - drag.dx, w.y - drag.dy);
    drag.g.x = s.x; drag.g.y = s.y; changed();
  } else if (pan) {
    if (Math.hypot(p.x - pan.sx, p.y - pan.sy) > 4) pan.moved = true;
    view.cx = pan.cx - (p.x - pan.sx) / view.scale; if (!pan.side) view.cy = pan.cy - (p.y - pan.sy) / view.scale;
  }
});
const up = e => {
  pts.delete(e.pointerId);
  if (pan && !pan.moved && !pan.onPart && selId != null) select(null);
  if (drag) save();
  drag = pan = null; if (pts.size < 2) pinch = null; cv.classList.remove('dragging');
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

/* ---------- controls ---------- */
const selected = () => byId(selId);
for (const [type, t] of Object.entries(TYPES)) {
  const b = el('button', t.n, { onclick: () => { newType = type; $('new-z').max = t.lim[1]; $('new-z').min = t.lim[0]; $('new-z').value = t.def; ui(); } });
  b.dataset.type = type; $('types').appendChild(b);
}
$('motor-rpm').addEventListener('input', e => { rpm = +e.target.value; ui(); save(); });
$('run').onclick = () => { running = !running; ui(); };
$('reverse').onclick = () => { rpm = -rpm; ui(); save(); };
$('new-z').addEventListener('input', e => $('new-z-out').textContent = e.target.value);
$('add').onclick = () => {
  const v = +$('new-z').value, props = { [TYPES[newType].key]: v, ...({ planet: { zp: 15, held: 'r' }, bevel: { zp: 12, dir: 0 }, worm: { zp: 1, dir: 0 }, rack: { dir: 0 } }[newType] || {}) };
  const g = addPart(newType, { ...props, x: 0, y: 0, layer: activeLayer, driver: newType !== 'rack' && !gears.some(q => q.driver) });
  const c = toWorld(W / 2, topMid());
  for (let k = 0; k < 600; k++) {
    const a = k * 2.399963, d = Math.sqrt(k) * 9, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (gears.every(o => o === g || Math.hypot(o.x - x, o.y - y) > extR(g) + extR(o) + 5)) { g.x = x; g.y = y; break; }
  }
  selId = g.id; changed(); save();
};
$('add-layer').onclick = () => { if (layerCount < MAXL) { layerCount++; activeLayer = layerCount - 1; ui(); save(); } };
function retooth(apply) { // change a size, then slide the part so it stays in contact with its neighbour
  const g = selected(); if (!g) return;
  const k = kind(g), near = k && gears.filter(o => o !== g && o.layer === g.layer && kind(o) === k && Math.abs(Math.hypot(o.x - g.x, o.y - g.y) - RO(g) - RO(o)) <= TOL).sort((p, q) => driven(q) - driven(p))[0];
  apply(g);
  if (near) { const dx = g.x - near.x, dy = g.y - near.y, d = Math.hypot(dx, dy) || 1, s = RO(g) + RO(near); g.x = near.x + dx / d * s; g.y = near.y + dy / d * s; }
  changed(); save();
}
$('sel-z').addEventListener('input', e => retooth(g => { g[TYPES[g.type].key] = +e.target.value; }));
$('sel-z2').addEventListener('input', e => retooth(g => { g.zp = +e.target.value; }));
$('sel-dir').addEventListener('input', e => { const g = selected(); if (g && TYPES[g.type].dir) { g.dir = +e.target.value * Math.PI / 180; changed(); save(); } });
for (const h of ['r', 'c', 's']) $('held-' + h).onclick = () => { const g = selected(); if (g && isP(g)) { freeze(); g.held = h; solve(); ui(); save(); } };
$('link-add').onclick = () => { linkFrom = linkFrom === selId ? null : selId; ui(); };
function setLayer(l) { const g = selected(); if (g && g.layer !== l) { g.layer = l; activeLayer = l; changed(); save(); } }
$('make-driver').onclick = () => { const g = selected(); if (!g || isR(g)) return; freeze(); gears.forEach(q => q.driver = q === g); solve(); ui(); save(); };
function removeSel() {
  const g = selected(); if (!g) return;
  freeze(); gears = gears.filter(q => q !== g);
  if (g.driver) { const n = gears.find(q => !isR(q)); if (n) n.driver = true; }
  selId = null; solve(); ui(); save();
}
$('remove').onclick = removeSel;
addEventListener('keydown', e => {
  if (e.key === 'Escape' && linkFrom != null) { linkFrom = null; ui(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selId != null && !/INPUT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); removeSel(); }
});
$('example').onclick = () => { example(); solve(); fit(); ui(); save(); };
$('fit').onclick = fit;
$('zoom-in').onclick = () => zoomAt(W / 2, topMid(), 1.3);
$('zoom-out').onclick = () => zoomAt(W / 2, topMid(), 1 / 1.3);
for (const m of ['both', 'top', 'side']) $('vm-' + m).onclick = () => { viewMode = m; fit(); ui(); };

/* ---------- boot ---------- */
function start(d) {
  d = d || {};
  let ok = false;
  try { const src = d.gears ? d : JSON.parse(localStorage.getItem(STORE) || 'null'); if (src && Array.isArray(src.gears) && src.gears.length) { load(src); ok = true; } } catch (e) {}
  if (!ok) example();
  readTokens(); resize(); solve(); fit(); ui();
  new ResizeObserver(resize).observe(sheet);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTokens);
  new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(readTokens);
  let last = performance.now();
  const frame = ts => {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
    if (running && !locked) theta += rpm * Math.PI / 30 * dt;
    draw(ts); requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
window.__bench = { state: () => ({ locked, lockMsg, parts: gears.map(g => ({ name: g.name, ratio: outB(g).ratio })) }) };
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => serialize());
if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
})();
