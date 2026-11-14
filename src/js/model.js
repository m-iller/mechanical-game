/* Gear Bench — model: constants, part catalogue, scene state, sizes, save and load.
   All files in src/js are plain scripts that share one global scope, loaded in the order index.html lists them. */
'use strict';

const M = 2, ALPHA = 20 * Math.PI / 180, INV_A = Math.tan(ALPHA) - ALPHA, TAU = Math.PI * 2;
const PM = Math.PI * M;                 // circular pitch of every module-2 tooth, mm
const CP = 8;                           // roller chain pitch, mm (ISO 05B)
const WR = 4.5, WO = 6, WL = 34;        // worm pitch radius, outer radius, length
const RB = 8;                           // rack body depth below the tooth roots
const CB = 12;                          // cam base circle radius
const GA = 14;                          // Geneva drive pin radius
const HUB = 7;                          // carrier hub radius
const RING_T = 4;                       // a ring gear's outer teeth: inner count + 2 * RING_T
const TOL = 0.05, COAX = 0.5, LP = 18, FW = 10, BASE = 6, MAXL = 16;
const RPM = Math.PI / 30;               // rad/s per rpm
// typical stage efficiencies, used only for the torque and power figures
const ETA = { gear: 0.98, inner: 0.985, fric: 0.90, bevel: 0.97, rack: 0.97, belt: 0.96, chain: 0.95, diff: 0.96 };
// a worm's efficiency from its lead angle γ and a 5° friction angle: tan γ / tan(γ + ρ). Up to four starts it also self-locks.
const wormEta = zw => { const g = Math.atan(zw * M / (2 * WR)); return Math.tan(g) / Math.tan(g + 5 * Math.PI / 180); };
const WORM_LOCK = 4;

/* grp: section in the "add" list. key/key2: the size the sliders edit. dir: has a direction in the plane.
   hz: turns about an axis lying in the layer. lin: slides instead of turning. tog: has an on/off state. */
const TYPES = {
  spur:     { pre: 'G',  grp: 'gears',  key: 'z',   lim: [6, 400, 1], def: 24 },
  ring:     { pre: 'RG', grp: 'gears',  key: 'z',   lim: [12, 500, 1], def: 42 },
  bevel:    { pre: 'BG', grp: 'gears',  key: 'z',   lim: [6, 300, 1], def: 24 },
  hbevel:   { pre: 'BH', grp: 'gears',  key: 'z',   lim: [6, 200, 1], def: 12, dir: 1, hz: 1 },
  worm:     { pre: 'W',  grp: 'gears',  key: 'zw',  lim: [1, 12, 1], def: 1,  dir: 1, hz: 1 },
  rack:     { pre: 'R',  grp: 'gears',  key: 'z',   lim: [4, 400, 1], def: 24, dir: 1, lin: 1 },
  pulley:   { pre: 'P',  grp: 'flex',   key: 'd',   lim: [8, 800, 1], def: 40 },
  sprocket: { pre: 'S',  grp: 'flex',   key: 'z',   lim: [6, 300, 1], def: 18 },
  fric:     { pre: 'FW', grp: 'flex',   key: 'd',   lim: [8, 800, 1], def: 40 },
  shaft:    { pre: 'V',  grp: 'shafts' },
  hshaft:   { pre: 'H',  grp: 'shafts', key: 'len', lim: [10, 1000, 1], def: 80, dir: 1, hz: 1 },
  carrier:  { pre: 'C',  grp: 'shafts', key: 'r',   lim: [6, 400, 1], def: 27, key2: 'n', lim2: [1, 12] },
  clutch:   { pre: 'CL', grp: 'shafts', key: 'd',   lim: [12, 400, 1], def: 36, tog: 1 },
  brake:    { pre: 'BR', grp: 'shafts', key: 'd',   lim: [12, 400, 1], def: 40, tog: 1 },
  diff:     { pre: 'D',  grp: 'shafts', key: 'z',   lim: [24, 300, 1], def: 40 },
  flywheel: { pre: 'F',  grp: 'shafts', key: 'd',   lim: [16, 800, 1], def: 70 },
  emotor:   { pre: 'M',  grp: 'io',     key: 'd',   lim: [16, 400, 1], def: 44 },   // electric motor: always a source
  machine:  { pre: 'X',  grp: 'io',     key: 'd',   lim: [16, 400, 1], def: 50 },   // black-box machine: always a load
  /* links of a mechanism (theory of mechanisms and machines). x, y is the first joint, dir the link's angle.
     Pairs between them are made when joints are dropped together: see domains/tmm/scene.js. */
  pivot:    { pre: 'O',  grp: 'tmm' },                                                            // frame: a fixed hinge
  guide:    { pre: 'N',  grp: 'tmm',    key: 'len', lim: [10, 2000, 1], def: 120, dir: 1 },         // frame: a fixed guide
  tcrank:   { pre: 'L',  grp: 'tmm',    key: 'len', lim: [2, 1000, 0.5], def: 20, dir: 1 },         // turns about its first joint; keyed to a shaft there, or its own motor
  trod:     { pre: 'L',  grp: 'tmm',    key: 'len', lim: [2, 2000, 0.5], def: 70, dir: 1 },
  trocker:  { pre: 'L',  grp: 'tmm',    key: 'len', lim: [2, 2000, 0.5], def: 50, dir: 1 },
  tslider:  { pre: 'L',  grp: 'tmm',    dir: 1 },
  tcoul:    { pre: 'L',  grp: 'tmm',    key: 'len', lim: [5, 2000, 0.5], def: 90, dir: 1 },         // slotted link: a stone slides along it
  tstone:   { pre: 'L',  grp: 'tmm',    dir: 1 },
  tplate:   { pre: 'L',  grp: 'tmm',    key: 'r',   lim: [4, 500, 1], def: 20, key2: 'n', lim2: [3, 8], dir: 1 },   // rigid link with n joints
  crank:    { pre: 'K',  grp: 'mech',   key: 'r',   lim: [3, 150, 1], def: 14, key2: 'l', lim2: [10, 600], dir: 1 },
  cam:      { pre: 'CM', grp: 'mech',   key: 'h',   lim: [1, 40, 1], def: 8,  dir: 1 },
  geneva:   { pre: 'GV', grp: 'mech',   key: 'z',   lim: [4, 24, 1], def: 4,  dir: 1 },
  ratchet:  { pre: 'RT', grp: 'mech',   key: 'z',   lim: [6, 200, 1], def: 16, tog: 1 },
};
const GROUPS = ['io', 'gears', 'flex', 'shafts', 'tmm', 'mech'];
// a small catalogue motor (0.37 kW, 4 poles) and a machine that takes a constant 2 N·m
const DEFAULTS = { emotor: { motor: { kind: 'induction', P: 370, n: 1320, ks: 2.2, km: 2.2, rpm: 1320, tq: 2.7 } }, machine: { load: { kind: 'const', tq: 2, n: 1000, eta: 0.9 } }, carrier: { n: 3 }, tplate: { n: 3 }, crank: { l: 40 }, ring: { loose: true }, clutch: { on: true }, brake: { on: true }, ratchet: { on: false } };
const PROPS = ['z', 'zw', 'd', 'r', 'n', 'l', 'h', 'len', 'l0', 'l1', 'dir', 'on', 'loose', 'held', 'label'];
const MOTOR_KEYS = ['kind', 'rpm', 'tq', 'P', 'n', 'ks', 'km'], LOAD_KEYS = ['kind', 'tq', 'n', 'eta', 'table'];
const pickKeys = (o, keys) => { const r = {}; for (const k of keys) if (o[k] != null) r[k] = Array.isArray(o[k]) ? o[k].map(x => Array.isArray(x) ? x.slice() : x) : o[k]; return r; };

/* ---------- scene state ---------- */
let parts = [], links = [], nextId = 1;
let pairs = [];                              // kinematic pairs between links: { id, type: 'R' | 'P' | 'F', a, ja, b, jb, turn }
let layerCount = 3, activeLayer = 0, hiddenLayers = new Set();
let lockedLayers = new Set(), layerNames = [], soloActive = false;   // soloActive: show the active layer alone
let sel = new Set(), outId = null, linkDraft = null;
let running = true, clock = 0, jit = 0;      // clock advances by RPM * seconds, so angle = phase + rpm * clock
let lockMsg = '', hintMsg = '', collide = new Set(), meshes = [];
let showDims = false, viewMode = 'both', schemeMode = true;   // schemeMode: the top view as a kinematic scheme (GOST 2.770-68) rather than drawn parts
const view = { cx: 0, cy: 0, scale: 3 };

/* ---------- small helpers ---------- */
const ty = (p, ...names) => names.includes(p.type);
const T = p => TYPES[p.type];
const isShaft = p => p.type === 'shaft';
const isHz = p => !!T(p).hz, isLin = p => !!T(p).lin;
const isLink = p => T(p).grp === 'tmm';              // a link of a mechanism
const isVert = p => !isHz(p) && !isLin(p) && (!isLink(p) || p.type === 'tcrank');   // turns about a vertical axis
const kind = p => ty(p, 'spur', 'ring', 'diff') ? 'gear' : p.type === 'fric' ? 'fric' : null;
const byId = id => parts.find(p => p.id === id);
const mod = (a, n) => ((a % n) + n) % n;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const adiff = (a, b) => Math.abs(wrap(a - b));
const LET = l => String.fromCharCode(65 + l);
const angle = b => b.phase + (b.w || 0) * (clock + jit);
// where a belt (mm) or chain (pitches) has travelled to
const linkPos = L => L.phase + L.w * (clock + jit) / (L.kind === 'chain' ? TAU : 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a, b) => dist(a, b) < COAX;
const unit = a => [Math.cos(a), Math.sin(a)];
const selParts = () => parts.filter(p => sel.has(p.id));
const one = () => sel.size === 1 ? byId([...sel][0]) : null;

/* ---------- sizes ---------- */
const meshZ = p => p.type === 'ring' ? p.z + 2 * RING_T : p.z;   // teeth on the outside
const rackLen = p => p.z * PM;
const rodL = p => Math.max(p.l, 2.2 * p.r);
const gvc = p => GA / Math.sin(Math.PI / p.z), gvb = p => gvc(p) * Math.cos(Math.PI / p.z);
const RI = p => M * p.z / 2;                                      // a ring's inner pitch radius
// pitch or contact radius in the top view
const RO = p => {
  switch (p.type) {
    case 'ring': return M * meshZ(p) / 2;
    case 'pulley': case 'fric': case 'flywheel': case 'clutch': case 'brake': case 'emotor': case 'machine': return p.d / 2;
    case 'sprocket': return p.z * CP / TAU;
    case 'carrier': return HUB;
    case 'crank': return p.r + 4;
    case 'cam': return CB + p.h;
    case 'geneva': return GA + 3;
    case 'shaft': case 'pivot': case 'guide': case 'tcrank': case 'trod': case 'trocker': case 'tslider': case 'tcoul': case 'tstone': case 'tplate': return 3;
    case 'rack': case 'worm': case 'hshaft': return 0;
    default: return M * p.z / 2;
  }
};
const TIP = { spur: M, ring: M, diff: M, bevel: 0.5, pulley: 1.5, sprocket: 0.3 * CP, shaft: 2 };
// half-extent along and across the direction, for parts that are long rather than round
const boxOf = p => p.type === 'rack' ? [rackLen(p) / 2, RB + 2.25 * M] : p.type === 'worm' ? [WL / 2 + 9, WO] : p.type === 'hshaft' ? [p.len / 2, 4] : p.type === 'hbevel' ? [8, M * p.z / 2] : null;
const tipR = p => boxOf(p) ? boxOf(p)[0] : p.type === 'carrier' ? p.r + 5 : RO(p) + (TIP[p.type] || 0);
const reach = p => p.type === 'crank' ? p.r + rodL(p) + 16 : p.type === 'cam' ? CB + 2 * p.h + 30 : p.type === 'geneva' ? gvc(p) + gvb(p) + 4 : 0;
const pinAngle = (c, k) => angle(c) + TAU * k / c.n;
const pinPos = (c, k) => { const a = pinAngle(c, k); return { x: c.x + c.r * Math.cos(a), y: c.y + c.r * Math.sin(a) }; };
// side-view half width
const halfW = p => { const b = boxOf(p); return b ? Math.abs(Math.cos(p.dir)) * b[0] + Math.abs(Math.sin(p.dir)) * b[1] : tipR(p); };

/* ---------- making parts ---------- */
function make(o) {
  const p = { id: o.id, name: o.name, type: o.type, x: o.x, y: o.y, layer: o.layer || 0, free: o.free || 0, phase: o.free || 0, w: 0 };
  for (const k of PROPS) if (o[k] != null) p[k] = o[k];
  if (T(p).dir && p.dir == null) p.dir = 0;
  if (o.motor) p.motor = { kind: 'speed', tq: 2, ...pickKeys(o.motor, MOTOR_KEYS) };
  if (o.load) p.load = { kind: 'const', tq: 1, n: 1000, eta: 1, ...pickKeys(o.load, LOAD_KEYS) };
  if (o.mount) p.mount = { c: o.mount.c, k: o.mount.k };
  if (isShaft(p)) { p.l0 = o.l0 != null ? o.l0 : p.layer; p.l1 = o.l1 != null ? o.l1 : p.l0; p.layer = p.l0; }
  const sub = f => ({ free: f || 0, phase: f || 0, w: 0 });
  if (p.type === 'clutch') p.o = sub(o.fo);                         // the main body is the lower half, o the upper
  if (p.type === 'diff') { p.a = sub(o.fa); p.b = sub(o.fb); }      // the main body is the housing, a and b the half shafts
  return p;
}
function addPart(type, props) {
  const id = nextId++, t = TYPES[type];
  const p = make({ id, name: t.pre + id, type, ...(t.key ? { [t.key]: t.def } : {}), ...DEFAULTS[type], ...props });
  parts.push(p); return p;
}
function addLink(kindOf, ids, crossed) { const L = { id: nextId++, kind: kindOf, ids: [...ids], crossed: !!crossed, free: 0, phase: 0, w: 0 }; links.push(L); return L; }
function removeParts(ids) {
  const gone = new Set(ids);
  parts = parts.filter(p => !gone.has(p.id));
  for (const p of parts) if (p.mount && gone.has(p.mount.c)) delete p.mount;
  pairs = pairs.filter(q => !gone.has(q.a) && !gone.has(q.b));
  for (const L of links) L.ids = L.ids.filter(id => !gone.has(id));
  links = links.filter(L => L.ids.length >= 2);
  for (const id of gone) sel.delete(id);
  if (gone.has(outId)) outId = null;
}
// mounted parts ride on their carrier's pins
function place() {
  for (const p of parts) if (p.mount) {
    const c = byId(p.mount.c);
    if (!c || p.mount.k >= c.n) { delete p.mount; continue; }
    const q = pinPos(c, p.mount.k); p.x = q.x; p.y = q.y;
  }
}
// bake the current motion into the rest angles, so editing never makes anything jump
function freeze() {
  jit = 0;
  for (const p of parts) { p.free = angle(p); for (const k of ['o', 'a', 'b']) if (p[k]) p[k].free = angle(p[k]); if (p.type === 'tcrank') p.dir = wrap(p.dir + (p.w || 0) * clock); }
  for (const L of links) L.free = linkPos(L);
  place(); clock = 0; rest();
}
// put every body at its rest angle
function rest() {
  for (const p of parts) { p.phase = p.free; for (const k of ['o', 'a', 'b']) if (p[k]) p[k].phase = p[k].free; }
  for (const L of links) L.phase = L.free;
  place();
}

/* ---------- shafts ---------- */
const covers = (s, l) => s.l0 <= l && l <= s.l1;
const shaftsAt = p => parts.filter(s => isShaft(s) && s !== p && same(s, p));
// parts a vertical shaft carries
const onShaft = s => parts.filter(p => p !== s && isVert(p) && !isShaft(p) && !p.mount && same(p, s) && covers(s, p.layer));
/* When a part lands on the centre of another part on a different layer, join them with a shaft:
   stretch a shaft that is already there, or make a new one. */
function autoShaft(p) {
  const free = q => ty(q, 'carrier', 'ring');   // a carrier and a ring turn about the sun's axis without being keyed to it
  if (!isVert(p) || isShaft(p) || p.mount || free(p)) return;
  const mates = parts.filter(q => q !== p && isVert(q) && !isShaft(q) && !q.mount && !free(q) && same(q, p) && q.layer !== p.layer);
  if (!mates.length) return;
  const here = shaftsAt(p);
  if (here.some(s => covers(s, p.layer))) return;
  const near = mates.sort((a, b) => Math.abs(a.layer - p.layer) - Math.abs(b.layer - p.layer))[0];
  const split = ty(near, 'clutch', 'diff') || ty(p, 'clutch', 'diff');   // these join two separate shafts
  const s = !split && here.find(q => covers(q, near.layer));
  if (s) { s.l0 = Math.min(s.l0, p.layer); s.l1 = Math.max(s.l1, p.layer); s.layer = s.l0; }
  else addPart('shaft', { x: p.x, y: p.y, l0: Math.min(p.layer, near.layer), l1: Math.max(p.layer, near.layer) });
}

/* ---------- layers ---------- */
function addLayer() { if (layerCount < MAXL) { layerCount++; activeLayer = layerCount - 1; } }
function deleteLayer(l) {
  if (layerCount <= 1) return;
  removeParts(parts.filter(p => !isShaft(p) && p.layer === l).map(p => p.id));
  removeParts(parts.filter(p => isShaft(p) && p.l0 === l && p.l1 === l).map(p => p.id));
  for (const p of parts) {
    if (isShaft(p)) { if (p.l0 > l) p.l0--; if (p.l1 >= l) p.l1--; p.layer = p.l0; }
    else if (p.layer > l) p.layer--;
  }
  layerCount--; activeLayer = Math.min(activeLayer, layerCount - 1);
  const drop = set => new Set([...set].filter(h => h !== l).map(h => h > l ? h - 1 : h));
  hiddenLayers = drop(hiddenLayers); lockedLayers = drop(lockedLayers); layerNames.splice(l, 1);
}
function moveLayer(l, d) { // swap layer l with its neighbour
  const m = l + d; if (m < 0 || m >= layerCount) return;
  const sw = x => x === l ? m : x === m ? l : x;
  for (const p of parts) {
    if (isShaft(p)) { const a = sw(p.l0), b = sw(p.l1); p.l0 = Math.min(a, b); p.l1 = Math.max(a, b); p.layer = p.l0; }
    else p.layer = sw(p.layer);
  }
  hiddenLayers = new Set([...hiddenLayers].map(sw)); lockedLayers = new Set([...lockedLayers].map(sw));
  const nm = layerNames[l]; layerNames[l] = layerNames[m]; layerNames[m] = nm;
  activeLayer = sw(activeLayer);
}
const layerShown = l => soloActive ? l === activeLayer : !hiddenLayers.has(l);
const layerLabel = l => layerNames[l] ? `${LET(l)} ${layerNames[l]}` : LET(l);
/* Only the active layer takes clicks: parts on other layers are drawn faded and let the pointer through.
   A shaft belongs to every layer it passes. A locked layer shows its parts but does not let them be picked or moved. */
const onActive = p => isShaft(p) ? covers(p, activeLayer) : p.layer === activeLayer;
const canPick = p => onActive(p) && layerShown(activeLayer) && !lockedLayers.has(activeLayer);
const shown = p => isShaft(p) ? [...Array(p.l1 - p.l0 + 1)].some((_, i) => layerShown(p.l0 + i)) : layerShown(p.layer);

// an empty bench with n layers
function resetScene(n = 3) {
  parts = []; links = []; pairs = []; nextId = 1; sel = new Set(); linkDraft = null; outId = null; clock = 0;
  layerCount = n; activeLayer = 0; hiddenLayers = new Set(); lockedLayers = new Set(); layerNames = []; soloActive = false;
}

/* ---------- save and load ---------- */
function serialize() {
  return { v: SCENE_V, nextId, outId, showDims, solo: soloActive, scheme: schemeMode,
    layers: [...Array(layerCount)].map((_, l) => ({ name: layerNames[l] || '', visible: !hiddenLayers.has(l), locked: lockedLayers.has(l) })),
    links: links.map(L => ({ id: L.id, kind: L.kind, ids: L.ids, crossed: L.crossed, free: linkPos(L) })),
    pairs: pairs.map(q => ({ ...q })),
    parts: parts.map(p => {
      const o = { id: p.id, name: p.name, type: p.type, x: p.x, y: p.y, layer: p.layer, free: angle(p) };
      for (const k of PROPS) if (p[k] != null) o[k] = p[k];
      if (p.type === 'tcrank') o.dir = wrap(p.dir + (p.w || 0) * (clock + jit));   // a crank is saved where it stands
      if (p.motor) o.motor = pickKeys(p.motor, MOTOR_KEYS);
      if (p.load) o.load = pickKeys(p.load, LOAD_KEYS);
      if (p.mount) o.mount = { ...p.mount };
      if (p.o) o.fo = angle(p.o);
      if (p.a) { o.fa = angle(p.a); o.fb = angle(p.b); }
      return o;
    }) };
}
function load(d) {
  d = migrate(d); if (!d) throw new Error('unreadable scene');
  const ls = d.layers || [];
  parts = d.parts.filter(o => TYPES[o.type]).map(make);
  links = (d.links || []).map(L => ({ id: L.id, kind: L.kind, ids: L.ids.slice(), crossed: !!L.crossed, free: L.free || 0, phase: L.free || 0, w: 0 }));
  pairs = (d.pairs || []).filter(q => byId(q.a) && byId(q.b)).map(q => ({ ...q }));
  nextId = d.nextId; outId = d.outId != null ? d.outId : null; showDims = !!d.showDims;
  layerCount = Math.min(MAXL, Math.max(1, ls.length, ...parts.map(p => (isShaft(p) ? p.l1 : p.layer) + 1)));
  const flag = k => new Set(ls.map((L, l) => L[k] ? l : -1).filter(l => l >= 0));
  hiddenLayers = new Set(ls.map((L, l) => L.visible === false ? l : -1).filter(l => l >= 0)); lockedLayers = flag('locked');
  layerNames = ls.map(L => L.name || ''); soloActive = !!d.solo; schemeMode = d.scheme !== false; sel = new Set(); linkDraft = null; activeLayer = 0; clock = 0;
}
const STORE = 'gear-bench-5';
function save() { try { localStorage.setItem(STORE, JSON.stringify(serialize())); } catch (e) {} }
