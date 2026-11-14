/* Gear Bench — power balance of the drive trains.
   The kinematics is linear in the motor speed, so a train with a characteristic motor has one unknown: that motor's speed.
   solve() finds it where the motor's torque equals the load torques reduced to its shaft (core/loads.js), then walks every
   load's power back to its motor through the stage efficiencies. That gives the torque and power actually passing each part.
   With no loads on the bench the old estimate stays: all the motor power, less the losses, taken off at the chosen output. */
'use strict';

// a part loads the drive through a load law set by hand, or as the crank of a mechanism with the mean moment its cycle needs (p.mb)
const hasLoad = p => !!p.load || p.mb > 0 || !!autoLoad(p), lawOf = p => p.load ? loadOf(p.load) : p.mb > 0 ? () => p.mb : autoLoad(p);
const ownEta = p => p.load ? (p.load.eta == null ? 1 : p.load.eta) : p.type === 'generator' ? p.ge : p.type === 'hoist' ? HOIST_ETA : 1;
const isDyn = m => !!m.kind && m.kind !== 'speed';
const motorDir = m => Math.sign(isDyn(m) ? m.n : m.rpm) || 1;
let power = { has: false, src: new Map(), load: new Map(), flow: new Map() }, warnings = [];

/* Everything on the bench for the state it is in. The hydraulic network and the drive lean on each other: the pump's flow needs
   the shaft speed, the shaft's load needs the pump pressure. A few passes settle it; the last network solution is the next start. */
function solve() {
  tmmLoads(); hydSync(); ioSync();
  for (let pass = 0; pass < 5; pass++) { hydLoads(); solveDrive(); if (hydroStep() < 0.005) break; }
  elStep();
  tmmStep(); tmmAnalyze();
  warnings = runChecks({ parts, power });
}
function solveDrive() {
  const dyn = parts.filter(p => p.motor && isDyn(p.motor));
  for (const p of dyn) p.motor.rpm = p.motor.n;                 // a trial speed, only to read the ratios
  solveKin();
  const ops = new Map();
  if (dyn.length && !lockMsg) {
    for (const p of dyn) if (!p.motor.follow) {
      const mates = dyn.filter(q => q === p || q.motor.follow === p.id), kOf = o => p.w ? Math.abs(o.w / p.w) : 0;
      const srcs = mates.map(q => ({ q, k: kOf(q), s: sourceOf(q.motor) })).filter(x => x.k > 0 || x.q === p);
      const lead = srcs[0].s, c = solved.comp(p);
      const items = parts.filter(q => hasLoad(q) && solved.comp(outOf(q)) === c && outOf(q).w).map(q => ({ k: kOf(outOf(q)), eta: solved.eff.get(bodyOf(outOf(q))) || 1, M: lawOf(q) }));
      const all = { kind: lead.kind, ideal: lead.ideal, w0: Math.min(...srcs.map(x => x.s.w0 / (x.k || 1))), Mnom: srcs.reduce((s, x) => s + x.k * x.s.Mnom, 0), M: w => srcs.reduce((s, x) => s + x.k * x.s.M(x.k * w), 0) };
      const op = operatingPoint(all, reduceLoads(items));
      for (const x of srcs) ops.set(x.q.id, { ...op, w: op.w * x.k, share: op.M && all.M(op.w) ? x.k * x.s.M(x.k * op.w) / all.M(op.w) : 1 / srcs.length });
      p.motor.rpm = motorDir(p.motor) * op.w / W_RPM;
    }
    solveKin();
    for (const p of dyn) if (p.motor.follow) p.motor.rpm = p.w;
  }
  power = flows(ops);
}

function flows(ops) {
  const flow = new Map(), src = new Map(), load = new Map(), add = (v, P) => flow.set(v, (flow.get(v) || 0) + P);
  const loads = parts.filter(hasLoad);
  if (!lockMsg) for (const p of loads) {
    const o = outOf(p), w = Math.abs(o.w) * RPM, M = w ? lawOf(p)(w) : 0, eta = ownEta(p);
    let v = bodyOf(o), P = M * w; const fed = solved.hops.has(v), path = [];
    if (fed) { add(v, P); while (solved.prev.has(v)) { const { x, e } = solved.prev.get(v); P /= e.eta; path.push(e.eta); v = x; add(v, P); } }
    load.set(p.id, { w, M, P: M * w, Pout: M * w * eta, eta, fed, etaPath: path.reduce((a, b) => a * b, 1), Pmotor: fed ? P : 0, root: fed ? v : -1 });
  }
  for (const p of parts) if (p.motor) {
    const v = bodyOf(p), s = sourceOf(p.motor), w = Math.abs(p.w) * RPM, op = ops.get(p.id), same = parts.filter(q => q.motor && bodyOf(q) === v).length;
    const P = (flow.get(v) || 0) * (op && op.share != null && same > 1 ? op.share : 1 / same), stalled = !!(op && op.stalled);
    const M = w ? P / w : 0, avail = s.M(w);
    src.set(p.id, { w, M, P, Mnom: s.Mnom, ratio: s.Mnom ? M / s.Mnom : 0, avail, stalled, starts: op ? op.starts : true, slip: s.ideal || !s.w0 ? 0 : 1 - w / s.w0, s,
      feeds: loads.filter(q => load.get(q.id) && load.get(q.id).root === v).map(q => q.id) });
  }
  return { has: loads.length > 0, src, load, flow };
}

/* ---------- applicability checks ---------- */
addCheck('motor', ({ parts, power }) => {
  const out = [];
  for (const p of parts) if (p.motor) {
    const r = power.src.get(p.id); if (!r) continue;
    if (r.stalled) out.push({ level: 'error', code: 'w.stall', text: t('w.stall', { a: p.name }), ids: [p.id] });
    else if (r.ratio > 1.05) out.push({ level: 'warn', code: 'w.overload', text: t('w.overload', { a: p.name, k: fmtNum(r.ratio, 3) }), ids: [p.id] });
    if (!r.stalled && !r.starts) out.push({ level: 'warn', code: 'w.nostart', text: t('w.nostart', { a: p.name }), ids: [p.id] });
  }
  return out;
});
addCheck('load', ({ parts, power }) => parts.filter(p => p.load && power.load.get(p.id) && !power.load.get(p.id).w).map(p => ({ level: 'info', code: 'w.idleLoad', text: t('w.idleLoad', { a: p.label || p.name }), ids: [p.id] })));
// standard teeth with a 20° pressure angle are undercut below z_min = 2 / sin²α ≈ 17
addCheck('undercut', ({ parts }) => {
  const zmin = Math.floor(2 / Math.sin(ALPHA) ** 2), small = parts.filter(p => p.type === 'spur' && p.z < zmin);
  return small.length ? [{ level: 'info', code: 'w.undercut', text: t('w.undercut', { a: nameOf(small.map(p => p.id)), z: zmin }), ids: small.map(p => p.id) }] : [];
});
