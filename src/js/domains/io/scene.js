/* Gear Bench — sources and consumers beyond the electric motor and the black box. No DOM here.
   Sources   engine   piston engine: torque from its cycle (thermo/engine.js) times the throttle, shaped over speed by the 'ice' characteristic
             hand     a person on a crank: about 12 N·m up to 60 rpm
             weight   a mass on a rope round a drum: constant torque m·g·D/2
             spring   a wound spring: its torque, taken as constant (the unwinding is not followed)
   Consumers generator  takes M ∝ ω from the shaft when something is wired to it (a resistive load on a machine whose voltage follows speed);
                        electrical power P_el = η·M·ω goes down the wires, shared equally between the heaters on them
             heater     heats up by what it is given: electrically through a wire, and mechanically if it is set as a friction load on a shaft.
                        One thermal mass: m·c·dT/dt = P − k·(T − T₀)
             hoist      a drum lifting a mass: constant torque m·g·D/(2·η) */
'use strict';

const G0 = 9.81, T_AMB = 20, C_STEEL = 460, HOIST_ETA = 0.95;
const isSource = p => ty(p, 'emotor', 'engine', 'hand', 'weight', 'spring'), IO_ROUND = ['engine', 'generator', 'heater', 'hoist', 'hand', 'weight', 'spring'];
const engineOf = p => engineCycle({ D: p.eD / 1000, S: p.eS / 1000, eps: p.eps, cyl: p.cyl, kind: p.ekind || 'otto' });
const isWire = q => q.fluid === 'el';
const wiresOf = p => pipes.filter(q => isWire(q) && (q.a === p.id || q.b === p.id));
const wiredTo = (p, type) => wiresOf(p).map(q => byId(q.a === p.id ? q.b : q.a)).filter(o => o && o.type === type);
// torque laws of the consumers that are not set by hand
function autoLoad(p) {
  if (p.type === 'generator') { const wn = p.nn * W_RPM, Mn = p.Pn / (wn * p.ge), k = wiredTo(p, 'heater').length ? 1 : 0.03; return w => k * Mn * w / wn; }   // open circuit: only its own losses
  if (p.type === 'hoist') return () => (p.m || 0) * G0 * p.d / 2000 / HOIST_ETA;
  if (p.type === 'tcomp') return w => (p.pc || 0) / Math.max(w, 1);                                   // a compressor takes the power its flow needs
  return null;
}
// the sources' torques, from what they are
function ioSync() {
  for (const p of parts) {
    if (p.type === 'engine') { p.motor.kind = 'ice'; p.motor.tq = engineOf(p).Me * (p.thr == null ? 1 : p.thr); }
    else if (p.type === 'weight') { p.motor.kind = 'torque'; p.motor.tq = Math.max(1e-3, (p.m || 0) * G0 * p.d / 2000); }
    else if (p.type === 'spring') { p.motor.kind = 'torque'; p.motor.tq = Math.max(1e-3, p.M || 0); }
    if (p.type === 'heater' && p.T == null) p.T = T_AMB;
  }
}
let elec = { gen: new Map(), heat: new Map() };
// electrical power from generators to heaters, and heat from friction; fills the wires' records for drawing
function elStep() {
  elec = { gen: new Map(), heat: new Map() };
  for (const h of parts) if (h.type === 'heater') elec.heat.set(h.id, { Pel: 0, Pmech: (power.load.get(h.id) || {}).P || 0 });
  for (const g of parts) if (g.type === 'generator') {
    const L = power.load.get(g.id) || { P: 0, w: 0 }, hs = wiredTo(g, 'heater'), Pel = hs.length ? L.P * g.ge : 0;
    elec.gen.set(g.id, { Pm: L.P, Pel, ratio: Pel / g.Pn, w: L.w, M: L.M || 0, wired: hs.length > 0 });
    for (const h of hs) elec.heat.get(h.id).Pel += Pel / hs.length;
    for (const q of wiresOf(g)) { const o = byId(q.a === g.id ? q.b : q.a), on = o && o.type === 'heater', P = on ? Pel / hs.length : 0; hyd.pipe.set(q.id, { el: true, Q: (q.a === g.id ? 1 : -1) * P, v: (q.a === g.id ? 1 : -1) * Math.min(1.5, P / g.Pn), pa: 0, pb: 0 }); }
  }
  for (const [id, r] of elec.heat) { const h = byId(id); r.P = r.Pel + r.Pmech; r.Tss = T_AMB + r.P / h.hk; r.tau = h.hm * C_STEEL / h.hk; }
}
// one step of time: heaters warm up or cool down; wires' marks run
function ioTick(dt) {
  for (const [id, r] of elec.heat) { const h = byId(id); if (h) h.T = (h.T == null ? T_AMB : h.T) + (r.P - h.hk * (h.T - T_AMB)) / (h.hm * C_STEEL) * dt; }
}
// excess work of a piston engine's torque over its cycle, for the flywheel: ΔA = max − min of ∫(M − M_mean) dφ
function engineSwing(p) {
  const c = engineOf(p), tq = engineTorque(c, 360), h = 2 * TAU / 360; let E = 0, lo = 0, hi = 0;
  for (const M of tq.M) { E += (M - tq.mean) * h; lo = Math.min(lo, E); hi = Math.max(hi, E); }
  return { c, tq, dA: (hi - lo) * (p.thr == null ? 1 : p.thr) };
}
// which energy domain a port belongs to, and with what medium
function portDomain(p) { return isHyd(p) ? { domain: 'hyd', medium: 'oil' } : ty(p, 'generator', 'heater') ? { domain: 'el' } : T(p).grp === 'heat' ? { domain: 'th' } : null; }

addCheck('io', () => {
  const out = [];
  for (const [id, r] of elec.gen) { const g = byId(id); if (!r.wired) out.push({ level: 'info', code: 'w.genOpen', text: t('w.genOpen', { a: g.name }), ids: [id] }); else if (r.ratio > 1.1) out.push({ level: 'warn', code: 'w.genOver', text: t('w.genOver', { a: g.name, k: fmtNum(r.ratio, 3) }), ids: [id] }); }
  for (const [id, r] of elec.heat) if (r.Tss > 400) out.push({ level: 'warn', code: 'w.hot', text: t('w.hot', { a: byId(id).name, t: fmtNum(r.Tss, 3) }), ids: [id] });
  for (const p of parts) if (p.type === 'engine' && p.w) { const w = Math.abs(p.w) * RPM, J = crankJ(p), sw = engineSwing(p), d = J > 0 ? sw.dA / (J * w * w) : Infinity; if (d > 0.3) out.push({ level: 'warn', code: 'w.fluct', text: t('w.fluct', { a: p.name, d: isFinite(d) ? fmtNum(d, 2) : '∞' }), ids: [p.id] }); }
  for (const q of pipes) { // a line must join ports of its own kind
    const a = byId(q.a), b = byId(q.b), da = portDomain(a), db = portDomain(b);
    if (da && db && da.domain !== db.domain) out.push({ level: 'error', code: 'w.portDomain', text: t('w.portDomain', { a: `${a.name}–${b.name}` }), ids: [a.id, b.id] });
    else if (da && db && da.domain === 'el' !== isWire(q)) out.push({ level: 'error', code: 'w.portDomain', text: t('w.portDomain', { a: `${a.name}–${b.name}` }), ids: [a.id, b.id] });
  }
  return out;
});
