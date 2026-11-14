/* Gear Bench — the hydraulic drive on the bench. No DOM here.
   Parts of group hyd carry ports (points in the part's own frame); pipes join ports. Every port is a node of the network,
   a pipe is a resistance between two nodes, and several pipes on one port make a tee by themselves.
   hydroStep() builds the network for hydro/net.js from the parts as they stand and solves it from the last solution.
   Coupling with the mechanics:
     pump      flow = displacement × the speed its shaft has; its torque Δp·q/(2π·η_m) loads the drive (p.mb)
     motor     turns its shaft at the speed the flow gives; the torque asked of that shaft sets its pressure drop
     cylinder  a link between its two pins whose length is the closed length plus the extension s; the oil sets ds/dt,
               the load along the rod is the force F given on the part. End stops and a jammed linkage hold it still. */
'use strict';

const ETA_V = 0.95, ETA_M = 0.9;                 // typical volumetric and mechanical efficiency of a gear pump or motor
const CYL_L0 = p => p.st + 16;                   // pin to pin when fully in, mm
const rodD = p => p.dr || Math.round(p.d * 0.56);
const cylA1 = p => Math.PI * (p.d / 1000) ** 2 / 4, cylA2 = p => cylA1(p) - Math.PI * (rodD(p) / 1000) ** 2 / 4;
const PORTS = {
  htank: [['T', 0, 0]], hpump: [['S', -11, 0], ['P', 11, 0]], hmotor: [['A', -11, 0], ['B', 11, 0]], hrelief: [['P', -9, 0], ['T', 9, 0]],
  hvalve: [['P', -4, 9], ['T', 4, 9], ['A', -4, -9], ['B', 4, -9]], hthrottle: [['A', -9, 0], ['B', 9, 0]], hcheck: [['A', -9, 0], ['B', 9, 0]], hnode: [['', 0, 0]],
};
// ports of a part in its own frame: [name, x, y]
const portsOf = p => ty(p, 'generator', 'heater') ? [['E', p.d / 2 + 3, 0]] : p.type === 'hcyl' ? [['A', 5, 5.5], ['B', CYL_L0(p) - 8, 5.5]] : PORTS[p.type] || [];
function portPos(p, k) { const q = portsOf(p)[k], th = p.type === 'hcyl' ? linkTh(p) : isHyd(p) || T(p).grp === 'heat' ? p.dir || 0 : 0, c = Math.cos(th), s = Math.sin(th); return { x: p.x + c * q[1] - s * q[2], y: p.y + s * q[1] + c * q[2] }; }
// the polyline of a pipe on the bench, and its length in metres (a change of layer adds the distance between layers)
const pipePath = q => { const a = byId(q.a), b = byId(q.b); return a && b ? [portPos(a, q.pa), ...q.pts.map(v => ({ x: v[0], y: v[1] })), portPos(b, q.pb)] : []; };
function pipeLen(q) { const P = pipePath(q), a = byId(q.a), b = byId(q.b); let L = Math.abs(a.layer - b.layer) * LP; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); return L / 1000; }
function addPipe(a, pa, b, pb, opt = {}) { const q = { id: nextId++, a: a.id, pa, b: b.id, pb, pts: opt.pts || [], d: opt.d || 10, kind: opt.kind || 'pressure', fluid: opt.fluid || 'oil', mat: opt.mat || 'steel', ph: 0 }; pipes.push(q); return q; }
const portKey = (id, k) => id + ':' + k;

let hyd = { ok: true, has: false, p: new Map(), pipe: new Map(), part: new Map(), pmax: 1e5, x: null, sig: '' };
function hydroNet() {
  const oil = pipes.filter(q => isHyd(byId(q.a)) && isHyd(byId(q.b)) && !isWire(q));   // wires and gas lines are not this network's business
  const hp = parts.filter(p => isHyd(p)), nodeOf = new Map(), used = new Set(oil.flatMap(q => [portKey(q.a, q.pa), portKey(q.b, q.pb)]));
  let n = 1; const fixed = { 0: 0 };                                         // node 0 is the tank
  const node = (p, k) => { const key = portKey(p.id, k); if (p.type === 'htank') return 0; if (!nodeOf.has(key)) nodeOf.set(key, n++); return nodeOf.get(key); };
  // a suction or tank port left open is taken to stand in the tank
  const toTank = (p, k) => used.has(portKey(p.id, k)) ? node(p, k) : 0;
  const elems = [], owner = [];
  const add = (e, own) => { elems.push(e); owner.push(own); };
  for (const q of oil) { const a = byId(q.a), b = byId(q.b); add({ k: 'pipe', a: node(a, q.pa), b: node(b, q.pb), d: q.d / 1000, L: Math.max(1e-3, pipeLen(q)), eps: ROUGH[q.mat] || ROUGH.steel, zeta: q.pts.length * ZETA.elbow, fluid: q.fluid }, { pipe: q }); }
  for (const p of hp) {
    const live = portsOf(p).some((_, k) => used.has(portKey(p.id, k))); if (!live) continue;
    if (p.type === 'hpump') add({ k: 'pump', a: toTank(p, 0), b: node(p, 1), Q: p.q * 1e-6 * Math.abs(p.w) / 60 * ETA_V }, { part: p });
    else if (p.type === 'hrelief') add({ k: 'relief', a: node(p, 0), b: toTank(p, 1), pset: p.pset * 1e5 }, { part: p });
    else if (p.type === 'hthrottle') add({ k: 'orifice', a: node(p, 0), b: node(p, 1), A: pipeArea(p.dn / 1000) }, { part: p });
    else if (p.type === 'hcheck') add({ k: 'check', a: node(p, 0), b: node(p, 1), A: pipeArea(p.dn / 1000), pcrack: 0.5e5 }, { part: p });
    else if (p.type === 'hvalve' && p.pos) { const A = pipeArea(p.dn / 1000), [w1, w2] = p.pos > 0 ? [2, 3] : [3, 2]; add({ k: 'orifice', a: node(p, 0), b: node(p, w1), A }, { part: p, path: 'in' }); add({ k: 'orifice', a: node(p, w2), b: toTank(p, 1), A }, { part: p, path: 'out' }); }
    else if (p.type === 'hcyl') add({ k: 'cyl', a: node(p, 0), b: node(p, 1), A1: cylA1(p), A2: cylA2(p), F: p.F || 0, stop: p.s <= 1e-6 ? -1 : p.s >= p.st - 1e-6 ? 1 : 0, jam: p.jam || 0 }, { part: p });
    else if (p.type === 'hmotor') add({ k: 'motor', a: node(p, 0), b: toTank(p, 1), q: p.q * 1e-6 / TAU / ETA_V, M: ((p.M || 0) + ((power.src.get(p.id) || {}).M || 0)) / ETA_M }, { part: p });
  }
  // a cylinder is held only against the stop it is standing on: it may always move away from it. Which way it wants to go is found by solving free first.
  return { nodes: n, fixed, elems, owner, nodeOf };
}
/* Solve the network. A cylinder on a stop is first tried free; if it would push further into the stop it is held, otherwise it leaves. */
function hydroStep() {
  const net = hydroNet(), prev = new Map(parts.filter(p => p.type === 'hpump').map(p => [p.id, p.mb || 0]));
  hyd = { ok: true, has: net.elems.length > 0, p: new Map(), pipe: new Map(), part: new Map(), pmax: 1e5, x: hyd.x, sig: hyd.sig, net };
  for (const p of parts) if (p.type === 'hpump') delete p.mb;
  if (!hyd.has) return 0;
  const sig = net.elems.map(e => e.k + e.a + '-' + e.b).join(), cyls = net.elems.filter(e => e.k === 'cyl'), want = cyls.map(e => e.stop);
  for (const e of cyls) e.stop = 0;
  let r = hydroSolve(net, sig === hyd.sig ? hyd.x : null);
  for (let pass = 0; pass < 3; pass++) {
    let again = false;
    cyls.forEach((e, i) => { const k = net.elems.indexOf(e), v = r.v[k], hold = (want[i] && v * want[i] > 1e-9) || (e.jam && v * e.jam > 1e-9); if (hold && !e.stop) { e.stop = 1; again = true; } });
    // a load that resists both ways: going in, the cylinder meets Fb instead of F; if it then wants out again, friction holds it
    cyls.forEach(e => { const k = net.elems.indexOf(e), p = net.owner[k].part, v = r.v[k]; if (e.stop || p.Fb == null) return; if (!e.back && v < -1e-9) { e.back = true; e.F = -p.Fb; again = true; } else if (e.back && v > 1e-9) { e.stop = 1; again = true; } });
    if (!again) break;
    r = hydroSolve(net, null);
  }
  hyd.ok = r.ok; hyd.x = r.x; hyd.sig = sig; hyd.sol = r;
  net.elems.forEach((e, i) => {
    const o = net.owner[i], Q = r.q[i], pa = r.p[e.a], pb = r.p[e.b]; hyd.pmax = Math.max(hyd.pmax, pa, pb);
    if (o.pipe) { const fl = FLUIDS[o.pipe.fluid] || FLUIDS.oil, L = pipeLoss(e, Q, FLUIDS.oil); hyd.pipe.set(o.pipe.id, { Q, v: L.v, Re: L.Re, lam: L.lam, regime: L.regime, dp: pa - pb, pa, pb, L: e.L, zeta: e.zeta, fast: tooFast(L.v, fl, o.pipe.kind), fl }); return; }
    const rec = hyd.part.get(o.part.id) || {}; hyd.part.set(o.part.id, rec);
    if (e.k === 'pump') { rec.Q = Q; rec.pS = pa; rec.pP = pb; rec.M = Math.max(0, pb - pa) * o.part.q * 1e-6 / TAU / ETA_M; rec.P = (pb - pa) * Q; if (rec.M > 1e-9) o.part.mb = rec.M; }
    else if (e.k === 'cyl') { rec.v = e.stop ? 0 : r.v[i]; rec.pA = pa; rec.pB = pb; rec.held = !!e.stop; rec.Q = e.A1 * rec.v;
      if (Math.abs(rec.v) < 1e-9 && Math.min(pa, pb) < 0) { rec.pA = Math.max(0, e.F / e.A1); rec.pB = Math.max(0, -e.F / e.A2); } }   // shut in on both sides, the split of pressure is not defined: show the load carried on one side
    else if (e.k === 'motor') { rec.w = r.v[i]; rec.dp = pa - pb; rec.Q = Q; }
    else if (o.path === 'out') rec.Qout = Q;
    else { rec.Q = Q; rec.dp = pa - pb; rec.pa = pa; rec.pb = pb; }
  });
  let moved = 0; for (const p of parts) if (p.type === 'hpump') { const a = prev.get(p.id), b = p.mb || 0; moved = Math.max(moved, Math.abs(a - b) / Math.max(a, b, 1e-6)); }
  return moved;
}
// the hydraulic motors' speeds, from the last solution, become speed sources for the drive
function hydLoads() {
  for (const p of parts) if (p.type === 'hmotor') { const r = hyd.part.get(p.id), n = r ? r.w * 30 / Math.PI : 0; p.motor = { kind: 'speed', rpm: Math.abs(n) < 1e-6 ? 0 : (p.motor && p.motor.rpm < 0 ? -1 : 1) * Math.abs(n), tq: 1, auto: true }; }
}
/* One step of time: every cylinder moves by what the oil gave it, within its stroke. Returns what to undo if the linkage cannot follow. */
function hydTick(dt) {
  const undo = []; let restep = false;
  for (const p of parts) if (p.type === 'hcyl') {
    const r = hyd.part.get(p.id), s0 = p.s, v = r && hyd.ok ? r.v : 0;
    p.s = Math.max(0, Math.min(p.st, p.s + v * dt * 1000)); p.len = CYL_L0(p) + p.s; undo.push([p, s0]);
    if ((s0 > 0 && s0 < p.st) !== (p.s > 0 && p.s < p.st) || (p.jam && v * p.jam < 0)) { restep = true; if (p.jam && v * p.jam < 0) delete p.jam; }
  }
  for (const q of pipes) { const r = hyd.pipe.get(q.id); if (r) q.ph = (q.ph || 0) + r.v * dt; }
  return { undo, restep };
}
// the linkage could not follow: put the cylinders back and hold them in the direction they were going
function hydJam(undo) { for (const [p, s0] of undo) { const r = hyd.part.get(p.id); if (r && Math.abs(r.v) > 1e-9 && p.s !== s0) p.jam = Math.sign(r.v); p.s = s0; p.len = CYL_L0(p) + p.s; } }
const hydSync = () => { for (const p of parts) if (p.type === 'hcyl') { p.s = Math.max(0, Math.min(p.st, p.s || 0)); p.len = CYL_L0(p) + p.s; } };

/* ---------- picking ---------- */
// the port nearest to a point, within r: { p, k }
function portAt(w, r) { let best = null; for (const p of parts) if (shown(p)) portsOf(p).forEach((_, k) => { const q = portPos(p, k), d = Math.hypot(q.x - w.x, q.y - w.y); if (d < r && (!best || d < best.d)) best = { p, k, d }; }); return best; }
function pipeAt(w, r) {
  for (const q of pipes) { const P = pipePath(q); for (let i = 1; i < P.length; i++) { const ax = P[i - 1].x, ay = P[i - 1].y, dx = P[i].x - ax, dy = P[i].y - ay, L2 = dx * dx + dy * dy || 1, tt = Math.max(0, Math.min(1, ((w.x - ax) * dx + (w.y - ay) * dy) / L2)); if (Math.hypot(w.x - ax - dx * tt, w.y - ay - dy * tt) < r) return { q, i, x: ax + dx * tt, y: ay + dy * tt }; } }
  return null;
}
// ending a pipe on another pipe: a tee is put there and the old pipe is cut in two
function pipeTee(hit, layer) {
  const q = hit.q, j = addPart('hnode', { x: hit.x, y: hit.y, layer }), tail = { ...q, id: nextId++, a: j.id, pa: 0, pts: q.pts.slice(hit.i - 1), ph: 0 };
  q.pts = q.pts.slice(0, hit.i - 1); q.b = j.id; q.pb = 0; pipes.push(tail); return j;
}

/* ---------- applicability ---------- */
addCheck('hydraulics', () => {
  const out = []; if (!hyd.has) return out;
  if (!hyd.ok) out.push({ level: 'error', code: 'w.hydDead', text: t('w.hydDead'), ids: parts.filter(p => p.type === 'hpump').map(p => p.id) });
  for (const q of pipes) {
    const r = hyd.pipe.get(q.id), a = byId(q.a), b = byId(q.b), name = `${a.name}–${b.name}`, fl = FLUIDS[q.fluid] || FLUIDS.oil;
    if (isWire(q)) continue;
    if (fl.phase !== 'liquid' && [a, b].some(p => isHyd(p) && p.type !== 'hnode')) out.push({ level: 'error', code: 'w.pipeGas', text: t('w.pipeGas', { a: name }), ids: [a.id, b.id] });
    if (r && hyd.ok && r.fast) out.push({ level: 'warn', code: 'w.pipeFast', text: t('w.pipeFast', { a: name, v: fmtNum(Math.abs(r.v), 3), m: fl.vmax[q.kind] || fl.vmax.pressure }), ids: [a.id, b.id] });
  }
  if (hyd.ok) for (const p of parts) {
    const r = hyd.part.get(p.id); if (!r) continue;
    if (p.type === 'hpump' && r.pS < -0.6e5) out.push({ level: 'warn', code: 'w.cavit', text: t('w.cavit', { a: p.name, p: fmtNum(r.pS / 1e5, 2) }), ids: [p.id] });
    if (p.type === 'hcyl' && Math.min(r.pA, r.pB) < -0.9e5) out.push({ level: 'warn', code: 'w.hydNeg', text: t('w.hydNeg', { a: p.name }), ids: [p.id] });
    if (p.type === 'hrelief' && r.Q > 1e-7) out.push({ level: 'info', code: 'w.relief', text: t('w.relief', { a: p.name, q: fmtNum(r.Q * 60000, 3) }), ids: [p.id] });
  }
  return out;
});
