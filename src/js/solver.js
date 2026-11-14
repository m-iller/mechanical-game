/* Gear Bench — kinematics.
   Every rigid group of parts (a shaft with what is keyed to it, a lone gear, a rack, a belt, a chain) is one unknown speed.
   Every contact is one linear equation between two or three of those speeds:
     external mesh   zA·ωA + zB·ωB − (zA + zB)·ωc = 0      ωc: the carrier the pair rides on, absent for fixed axes
     internal mesh   zR·ωR − zP·ωP − (zR − zP)·ωc = 0
     differential    ωa + ωb − 2·ωc = 0
   Motors and holds pin speeds to numbers. The equations go into an incremental Gauss-Jordan elimination one by one;
   the first one that contradicts the rest names the parts that jam. Speeds left with a free degree stay at rest.
   Tooth phases are a second system of the same shape, solved modulo one tooth pitch. */
'use strict';

class Lin {
  constructor(n) { this.n = n; this.rows = []; }
  // add Σ coef·x = rhs. Returns { dep: true, r } when the left side already follows from earlier rows; r is what is left of rhs.
  add(terms, rhs) {
    const n = this.n, v = new Float64Array(n); let r = rhs, sc = 0;
    for (const [i, c] of terms) v[i] += c;
    for (let j = 0; j < n; j++) sc = Math.max(sc, Math.abs(v[j]));
    for (const R of this.rows) { const f = v[R.p]; if (f) { for (let j = 0; j < n; j++) v[j] -= f * R.c[j]; r -= f * R.r; } }
    let p = -1, m = 1e-9 * (sc || 1);
    for (let j = 0; j < n; j++) if (Math.abs(v[j]) > m) { m = Math.abs(v[j]); p = j; }
    if (p < 0) return { dep: true, r, sc: sc || 1 };
    const inv = 1 / v[p]; for (let j = 0; j < n; j++) v[j] *= inv; r *= inv; v[p] = 1;
    for (const R of this.rows) { const f = R.c[p]; if (f) { for (let j = 0; j < n; j++) R.c[j] -= f * v[j]; R.r -= f * r; } }
    this.rows.push({ p, c: v, r }); return { dep: false };
  }
  // value of each unknown with the free ones at zero, and whether the value is forced
  values() {
    const val = new Float64Array(this.n), det = new Uint8Array(this.n);
    for (const R of this.rows) { let free = false; for (let j = 0; j < this.n; j++) if (j !== R.p && Math.abs(R.c[j]) > 1e-9) { free = true; break; } val[R.p] = R.r; det[R.p] = free ? 0 : 1; }
    return { val, det };
  }
}

const nameOf = ids => ids.map(id => (byId(id) || {}).name).filter(Boolean).join(', ');
let solved = { eff: new Map(), hops: new Map(), prev: new Map(), pin: 0 };   // per body: efficiency and distance from the nearest motor

// Speeds for the motor speeds as they stand in p.motor.rpm. solve() in power.js wraps this with the operating point and the power flow.
function solveKin() {
  place();
  links = links.filter(L => { L.ids = L.ids.filter(id => { const p = byId(id); return p && p.type === (L.kind === 'belt' ? 'pulley' : 'sprocket'); }); return L.ids.length >= 2; });
  if (outId != null && !byId(outId)) outId = null;
  collide = new Set(); meshes = []; lockMsg = ''; hintMsg = '';
  const lock = (key, ids, extra) => { if (!lockMsg) lockMsg = t(key, { a: nameOf(ids), ...extra }); ids.forEach(id => collide.add(id)); };

  /* ---- 1. nodes: one per rotating piece; rigid joins merge them, with a sign for shafts that face the other way ---- */
  const nodes = [], par = [], sg = [];
  const node = o => { o.ni = nodes.length; nodes.push(o); par.push(o.ni); sg.push(1); };
  for (const p of parts) { node(p); for (const k of ['o', 'a', 'b']) if (p[k]) node(p[k]); }
  for (const L of links) node(L);
  const find = i => { let s = 1; while (par[i] !== i) { s *= sg[i]; i = par[i]; } return [i, s]; };
  const join = (a, b, s = 1) => { const [ra, sa] = find(a.ni), [rb, sb] = find(b.ni); if (ra !== rb) { par[rb] = ra; sg[rb] = sa * sb * s; } };
  for (const s of parts) {
    if (isShaft(s)) for (const p of parts) {
      if (p === s || !isVert(p) || isShaft(p) || p.mount || !same(p, s) || !covers(s, p.layer)) continue;
      if (p.type === 'clutch') { if (s.l0 < p.layer || s.l1 === p.layer) join(s, p); if (s.l1 > p.layer) join(s, p.o); }
      else if (p.type === 'diff') { if (s.l0 < p.layer) join(s, p.a); if (s.l1 > p.layer) join(s, p.b); }
      else if (!p.loose) join(s, p);
    }
    if (s.type === 'hshaft') { // parts whose axis lies along this shaft
      const u = unit(s.dir);
      for (const p of parts) {
        if (p === s || !isHz(p) || p.layer !== s.layer || Math.abs(Math.sin(p.dir - s.dir)) > 0.03) continue;
        const dx = p.x - s.x, dy = p.y - s.y, al = dx * u[0] + dy * u[1], pe = -dx * u[1] + dy * u[0];
        const lim = s.len / 2 + (p.type === 'hshaft' ? p.len / 2 : p.type === 'worm' ? WL / 2 : 4);
        if (Math.abs(pe) < 1 && Math.abs(al) <= lim) join(s, p, Math.cos(p.dir - s.dir) > 0 ? 1 : -1);
      }
    }
  }
  const pins = new Map(); // gears sharing one carrier pin turn together
  for (const p of parts) if (p.mount && !p.loose) { const k = p.mount.c + '/' + p.mount.k; if (pins.has(k)) join(pins.get(k), p); else pins.set(k, p); }
  const varOf = new Map(); let nv = 0;
  const V = o => { const [r, s] = find(o.ni); if (!varOf.has(r)) varOf.set(r, nv++); return [varOf.get(r), s]; };
  nodes.forEach(V);

  /* ---- 2. equations ---- */
  const eqs = [], peqs = [];
  const eq = (terms, eta, ids, opt) => eqs.push({ terms, eta, ids, ...opt });
  // phase equation Σ c·θ ≡ K (mod 2π), written for the correction δ to each rest angle
  const peq = (terms, K, ids) => peqs.push({ terms: terms.map(([o, c]) => [o.ni, c]), rhs: wrap(K - terms.reduce((s, [o, c]) => s + c * o.free, 0)), ids });
  // which carrier, if any, turns the line of centres of a meshing pair
  const carrierOf = (a, b) => {
    const ca = a.mount && byId(a.mount.c), cb = b.mount && byId(b.mount.c);
    if (!ca && !cb) return null;
    if (ca && cb) return ca === cb ? ca : false;
    const c = ca || cb, other = ca ? b : a;
    return same(other, c) ? c : false;
  };
  const moving = p => !!(p.mount || p.motor);
  let hit = null;
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    let a = parts[i], b = parts[j];
    if (a.layer !== b.layer || isShaft(a) || isShaft(b) || a.type === 'hshaft' || b.type === 'hshaft' || isLink(a) || isLink(b)) continue;
    if (b.type === 'rack' || b.type === 'worm' || b.type === 'hbevel' || b.type === 'ring') [a, b] = [b, a];
    if (a.type === 'rack') {
      if (kind(b) !== 'gear' || b.mount) continue;
      const u = unit(a.dir), dx = b.x - a.x, dy = b.y - a.y, ax = dx * u[0] + dy * u[1], pe = -dx * u[1] + dy * u[0], R = RO(b), z = meshZ(b);
      if (Math.abs(pe - R) > TOL * 2 || Math.abs(ax) > rackLen(a) / 2) continue;
      eq([[a, 1], [b, -R]], ETA.rack, [a.id, b.id]);                        // rack travel in mm per radian of the gear
      peq([[a, 2 / M], [b, -z]], 2 * ax / M - z * (a.dir - Math.PI / 2) + Math.PI, [a.id, b.id]);
      meshes.push({ a, b, k: 'rack' });
    } else if (a.type === 'worm') {
      if (kind(b) !== 'gear' || b.mount) continue;
      const u = unit(a.dir), dx = b.x - a.x, dy = b.y - a.y, ax = dx * u[0] + dy * u[1], pe = -dx * u[1] + dy * u[0], z = meshZ(b);
      if (Math.abs(Math.abs(pe) - RO(b) - WR) > TOL * 4 || Math.abs(ax) > WL / 2 - 2) continue;
      const s = pe < 0 ? 1 : -1;                                             // the wheel turns the other way on the other side
      eq([[b, z], [a, -s * a.zw]], wormEta(a.zw), [a.id, b.id], a.zw <= WORM_LOCK ? { worm: a, wheel: b } : {});
      peq([[b, z], [a, -s * a.zw]], s * 2 * ax / M - Math.PI + z * Math.atan2(-pe * u[0], pe * u[1]), [a.id, b.id]);
      meshes.push({ a, b, k: 'worm' });
    } else if (a.type === 'hbevel') {
      if (b.type !== 'bevel' || b.mount) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (Math.abs(Math.hypot(dx, dy) - RO(b)) > TOL * 4 || adiff(Math.atan2(dy, dx), a.dir) > 0.03) continue;
      eq([[b, b.z], [a, -a.z]], ETA.bevel, [a.id, b.id]);
      meshes.push({ a, b, k: 'bevel' });
    } else if (isVert(a) && isVert(b)) {
      const d = dist(a, b);
      if (a.type === 'ring' && d < RI(a) && b.type !== 'ring') {             // b sits inside the ring
        if (b.type === 'carrier') continue;
        const gap = RI(a) - RO(b) - d;
        if (b.type === 'spur' && Math.abs(gap) <= TOL) {
          const c = carrierOf(a, b); if (c === false) continue;
          const zr = a.z, zp = b.z, psi = Math.atan2(b.y - a.y, b.x - a.x);
          eq([[a, zr], [b, -zp], ...(c ? [[c, -(zr - zp)]] : [])], ETA.inner, [a.id, b.id]);
          peq([[a, zr], [b, -zp], ...(c ? [[c, -(zr - zp)]] : [])], (zr - zp) * (psi - (c ? c.free : 0)), [a.id, b.id]);
          meshes.push({ a, b, k: 'inner' });
        } else if (gap < -TOL && (b.type === 'spur' ? true : d + RO(b) > RI(a) - M)) { collide.add(a.id); collide.add(b.id); hit = hit || [a, b]; }
        continue;
      }
      if (a.type === 'carrier' || b.type === 'carrier') continue;
      const s = RO(a) + RO(b), k = kind(a);
      if (d < s - TOL) { collide.add(a.id); collide.add(b.id); hit = hit || [a, b]; }
      else if (d <= s + TOL && k && k === kind(b)) {
        const c = carrierOf(a, b); if (c === false) continue;                // a passing contact, not a mesh
        const za = k === 'gear' ? meshZ(a) : RO(a), zb = k === 'gear' ? meshZ(b) : RO(b), psi = Math.atan2(b.y - a.y, b.x - a.x);
        eq([[a, za], [b, zb], ...(c ? [[c, -(za + zb)]] : [])], ETA[k], [a.id, b.id]);
        if (k === 'gear') peq([[a, za], [b, zb], ...(c ? [[c, -(za + zb)]] : [])], (za + zb) * (psi - (c ? c.free : 0)) + Math.PI * zb - Math.PI, [a.id, b.id]);
        meshes.push({ a, b, k });
      }
    }
  }
  for (const L of links) { // every wheel the belt or chain wraps moves at the belt's speed
    const ws = L.ids.map(byId), R = route(ws, L.kind === 'belt' && L.crossed); L.route = R;
    if (!R || ws.some(w => w.layer !== ws[0].layer)) { L.route = null; continue; }
    const pp = R.L / Math.max(1, Math.round(R.L / CP));
    for (const w of ws) {
      const o = R.on.get(w.id); if (!o) continue;
      if (L.kind === 'belt') eq([[w, RO(w) * o.s], [L, -1]], Math.sqrt(ETA.belt), [w.id]);
      else { eq([[w, w.z], [L, -1]], Math.sqrt(ETA.chain), [w.id]); peq([[w, w.z], [L, -TAU]], w.z * o.mid - TAU * o.sMid / pp, [w.id]); }
    }
  }
  for (const p of parts) {
    if (p.type === 'clutch' && p.on) eq([[p, 1], [p.o, -1]], 1, [p.id]);
    if (p.type === 'diff') eq([[p.a, 1], [p.b, 1], [p, -2]], ETA.diff, [p.id]);
  }

  /* ---- 3. speeds ---- */
  const lin = new Lin(nv), term = ([o, c]) => { const [v, s] = V(o); return [v, c * s]; };
  const fixed = new Map(); // body -> the part that pins it
  const pinTo = (o, val, p, key) => {
    const [v, s] = V(o), res = lin.add([[v, 1]], val * s);
    if (res.dep && Math.abs(res.r) > 1e-6) lock(key, [fixed.get(v) ? fixed.get(v).id : p.id, p.id]); else if (!res.dep) fixed.set(v, p);
  };
  // trains: bodies joined by any chain of contacts. In each train one motor with a characteristic leads; the others follow it.
  const cp = Array.from({ length: nv }, (_, i) => i), cf = i => { while (cp[i] !== i) i = cp[i] = cp[cp[i]]; return i; };
  for (const e of eqs) { const vs = e.terms.map(x => V(x[0])[0]); for (const v of vs) cp[cf(v)] = cf(vs[0]); }
  const comp = o => cf(V(o)[0]), leaders = new Map();
  for (const p of parts) if (p.motor) {
    delete p.motor.follow;
    if (isDyn(p.motor)) { const c = comp(p); if (leaders.has(c)) { p.motor.follow = leaders.get(c).id; continue; } leaders.set(c, p); }
    pinTo(p, p.motor.rpm, p, 'lock.motors');
  }
  for (const p of parts) if (p.held || (p.type === 'brake' && p.on)) pinTo(p, 0, p, 'lock.held');
  for (const e of eqs) { const res = lin.add(e.terms.map(term), 0); if (res.dep && Math.abs(res.r) > 1e-6 * res.sc) lock('lock.jam', e.ids); }
  let { val, det } = lin.values();
  // a differential with only its housing driven: nothing decides the split, so assume equal resistance on both shafts
  for (const p of parts) if (p.type === 'diff' && det[V(p)[0]] && !det[V(p.a)[0]] && !det[V(p.b)[0]]) { lin.add([term([p.a, 1]), term([p.b, -1])], 0); ({ val, det } = lin.values()); }
  const speed = o => { const [v, s] = V(o); return det[v] ? s * val[v] : 0; };
  for (const o of nodes) { o.w = Math.abs(speed(o)) < 1e-9 ? 0 : speed(o); o.und = !det[V(o)[0]]; }

  /* ---- 4. who is reached from a motor, how far, and through what losses ---- */
  const adj = Array.from({ length: nv }, () => []);
  for (const e of eqs) { const vs = e.terms.map(x => V(x[0])[0]); for (const x of vs) for (const y of vs) if (x !== y) adj[x].push({ y, e }); }
  const hops = new Map(), eff = new Map(), reached = new Set(), q = [];
  for (const p of parts) if (p.motor) { const v = V(p)[0]; if (!hops.has(v)) { hops.set(v, 0); eff.set(v, 1); q.push(v); } }
  const prev = new Map();   // the way back to the nearest motor: body -> { x: the body before it, e: the contact between them }
  for (let i = 0; i < q.length; i++) for (const { y, e } of adj[q[i]]) if (!hops.has(y)) { hops.set(y, hops.get(q[i]) + 1); eff.set(y, eff.get(q[i]) * e.eta); prev.set(y, { x: q[i], e }); q.push(y); }
  // the same walk, but a worm mesh only passes from worm to wheel: a worm cannot be driven by its wheel
  const dq = parts.filter(p => p.motor).map(p => V(p)[0]); dq.forEach(v => reached.add(v));
  for (let i = 0; i < dq.length; i++) for (const { y, e } of adj[dq[i]]) { if (e.worm && V(e.worm)[0] === y) continue; if (!reached.has(y)) { reached.add(y); dq.push(y); } }
  for (const e of eqs) if (e.worm && e.wheel.w && !reached.has(V(e.worm)[0])) lock('lock.worm', [e.worm.id, e.wheel.id]);
  solved = { eff, hops, prev, V, comp, pin: parts.reduce((s, p) => s + (p.motor ? p.motor.tq * Math.abs(p.w) * RPM : 0), 0) };
  // a part that hangs on the driven train but has a degree of freedom nobody controls
  const loose = parts.find(p => !isShaft(p) && p.und && hops.has(V(p)[0]) && !det[V(p)[0]]);
  if (loose) hintMsg = t('hint.free', { a: loose.name });

  /* ---- 5. tooth phases ---- */
  const plin = new Lin(nodes.length);
  for (const e of peqs) {
    const res = plin.add(e.terms, e.rhs);
    if (res.dep && Math.abs(wrap(res.r)) > 0.06 * TAU && e.ids.some(id => byId(id).w)) lock('lock.teeth', e.ids);
  }
  const ph = plin.values().val;
  for (const o of nodes) o.phase = o.free + ph[o.ni];
  place();

  if (!lockMsg && hit && (hit[0].w || hit[1].w || moving(hit[0]) || moving(hit[1]))) lock('lock.overlap', [hit[0].id, hit[1].id]);
  if (!lockMsg) for (const p of parts) if (p.type === 'ratchet' && p.w && Math.sign(p.w) === (p.on ? 1 : -1)) { lock(p.on ? 'lock.ratchet.cw' : 'lock.ratchet.ccw', [p.id]); break; }
}

/* ---------- reading the result ---------- */
const bodyOf = p => solved.V ? solved.V(p)[0] : -1;
const isDriven = p => !!(p.w || (p.o && p.o.w) || (p.a && (p.a.w || p.b.w)));
// the part's own output body: the upper half of a clutch, the upper shaft of a differential
const outOf = p => p.type === 'clutch' ? p.o : p.type === 'diff' ? p.b : p;
// speed in the unit a person reads: rpm, or mm/s for a rack
const speedOf = (p, o = outOf(p)) => p.type === 'rack' ? o.w * RPM : o.w;
/* Torque at a part if all the motor power, less the stage losses on the way, were taken off there.
   Returns N·m, or N for a rack. */
function torqueAt(p, o = outOf(p)) {
  const v = solved.V ? solved.V(o)[0] : -1; if (!o.w || !solved.eff.has(v)) return null;
  if (power.has) { const pf = power.flow.get(v) || 0, wf = Math.abs(o.w) * RPM; return p.type === 'rack' ? pf / wf * 1000 : pf / wf; }   // with loads on the bench: the power really passing through
  const pw = solved.pin * solved.eff.get(v), w = Math.abs(o.w) * RPM;
  return p.type === 'rack' ? pw / w * 1000 : pw / w;
}
function autoOut() { // the moving part farthest from any motor
  let best = null, bh = 0;
  for (const p of parts) { if (isShaft(p) || p.motor || !outOf(p).w) continue; const h = solved.hops.get(bodyOf(outOf(p))); if (h > bh) { bh = h; best = p; } }
  return best;
}
const outPart = () => { const p = outId != null ? byId(outId) : autoOut(); return p && !p.motor ? p : null; };
