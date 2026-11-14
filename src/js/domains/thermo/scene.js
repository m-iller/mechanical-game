/* Gear Bench — gas-turbine and steam plants on the bench. No DOM here.
   Blocks of group heat have an inlet and an outlet port; gas and steam lines are the same pipes as in the hydraulic drive.
     gas    compressor → combustor → turbine → stack.  The compressor sets the mass flow and the pressure ratio, the combustor
            the gas temperature. Pipe losses on the way lower the pressure the turbine gets; the exhaust line raises what it works against.
     steam  boiler → turbine → condenser → feed pump → boiler (Rankine). The boiler sets the mass flow.
   On the shaft: a compressor is a load of constant power (ṁ·w_c), a turbine a source of constant power (ṁ·w_t) up to its speed limit.
   The mass flow does not change with the shaft speed — a fair picture near the design point only. */
'use strict';

const TH_PORTS = [['in', -12, 0], ['out', 12, 0]], P_ATM = 1e5, T_ATM = 288.15, R_STEAM = 461.5;
const isHeat = p => T(p).grp === 'heat';
const GAS_OF = { tcomp: 'air', tburn: 'flue', tturb: 'flue', tboil: 'steam', tcond: 'water', tfeed: 'water' };
const gasOf = (p, k) => GAS_OF[p.type] || 'air';
// the pipe on a port and what is at its other end
function hopFrom(p, k) { const q = pipes.find(x => !isWire(x) && ((x.a === p.id && x.pa === k) || (x.b === p.id && x.pb === k))); if (!q) return null; const fwd = q.a === p.id && q.pa === k; return { q, fwd, p: byId(fwd ? q.b : q.a), k: fwd ? q.pb : q.pa }; }
// loss of a gas line carrying m kg/s at pressure p and temperature Tk; Rg is the gas constant
function gasLine(hop, m, p, Tk, Rg, hot) {
  const q = hop.q, rho = p / (Rg * Tk), fl = { rho, nu: 1.8e-5 * (Tk / 288) ** 0.7 / rho, vmax: { pressure: hot ? 40 : 25 } }, Qv = m / rho;
  const e = { d: q.d / 1000, L: Math.max(1e-3, pipeLen(q)), eps: ROUGH[q.mat] || ROUGH.steel, zeta: q.pts.length * ZETA.elbow }, L = pipeLoss(e, Qv, fl), sg = hop.fwd ? 1 : -1;
  return { gas: true, Q: sg * Qv, m, v: L.v, va: sg * Math.min(3, 0.3 + L.v / 25), Re: L.Re, lam: L.lam, regime: L.regime, dp: L.dp, pa: hop.fwd ? p : p - L.dp, pb: hop.fwd ? p - L.dp : p, L: e.L, zeta: e.zeta, fl, fast: tooFast(L.v, fl), T: Tk };
}
let thermo = { part: new Map(), pipe: new Map() };
function turbineMotor(tb, P) { tb.motor = { kind: 'power', P: Math.max(0, P), n: tb.nmax || 12000, rpm: (tb.motor && tb.motor.rpm < 0 ? -1 : 1) * (tb.nmax || 12000), tq: 1, auto: true }; if (tb.motor.rpm < 0) tb.motor.n = -tb.motor.n; }
function thermoStep() {
  thermo = { part: new Map(), pipe: new Map() };
  for (const p of parts) { if (p.type === 'tcomp') p.pc = 0; if (p.type === 'tturb') turbineMotor(p, 0); }
  for (const c of parts) if (c.type === 'tcomp') {
    const m = c.mf, a = AIR, g = FLUE, etaC = c.etaC || 0.85, T2 = T_ATM + (T_ATM * c.pr ** ((a.k - 1) / a.k) - T_ATM) / etaC, wc = a.cp * (T2 - T_ATM);
    c.pc = m * wc; const rec = { m, T1: T_ATM, T2, p1: P_ATM, p2: P_ATM * c.pr, wc, Pc: m * wc }; thermo.part.set(c.id, rec);
    let st = { p: rec.p2, T: T2, R: a.R, hot: false }, hop = hopFrom(c, 1);
    while (hop && hop.p) {
      const line = gasLine(hop, m, st.p, st.T, st.R, st.hot); thermo.pipe.set(hop.q.id, line); st.p -= line.dp;
      const n = hop.p;
      if (n.type === 'tburn' && hop.k === 0) { const T3 = n.T3 + 273.15, q = g.cp * (T3 - st.T); thermo.part.set(n.id, { m, Tin: st.T, T3, q, Q: m * q, pin: st.p }); rec.q = q; st = { p: st.p * 0.97, T: T3, R: g.R, hot: true }; hop = hopFrom(n, 1); }
      else if (n.type === 'tturb' && hop.k === 0) {
        const etaT = n.etaT || 0.88, out = hopFrom(n, 1), ex = (g.k - 1) / g.k; let p4 = P_ATM, T4 = 0, T4s = 0, exh = null;
        for (let it = 0; it < 2; it++) { T4s = st.T * (p4 / st.p) ** ex; T4 = st.T - etaT * (st.T - T4s); if (out) { exh = gasLine(out, m, P_ATM, T4, g.R, true); p4 = P_ATM + exh.dp; } }
        if (exh) { exh.pa = out.fwd ? p4 : P_ATM; exh.pb = out.fwd ? P_ATM : p4; thermo.pipe.set(out.q.id, exh); }
        const wt = g.cp * (st.T - T4); turbineMotor(n, m * wt);
        thermo.part.set(n.id, { m, T3: st.T, T4, p3: st.p, p4, wt, Pt: m * wt, h0: g.cp * (st.T - T4s), etaT });
        rec.wt = wt; rec.w = wt - wc; rec.eta = rec.q ? rec.w / rec.q : 0; rec.bwr = wc / wt; rec.P = m * rec.w; rec.turb = n.id; break;
      } else break;
    }
  }
  for (const b of parts) if (b.type === 'tboil') { // boiler → turbine → condenser → feed pump
    const h1 = hopFrom(b, 1), tb = h1 && h1.p && h1.p.type === 'tturb' ? h1.p : null, h2 = tb && hopFrom(tb, 1), cd = h2 && h2.p && h2.p.type === 'tcond' ? h2.p : null; if (!tb || !cd) continue;
    const m = b.mf, r = rankine({ pb: b.pb * 1e5, Tb: (b.Tb || 0) + 273.15, pc: cd.pk * 1e3, etaT: tb.etaT || 0.85, etaP: 0.8, m }), h3 = hopFrom(cd, 1), fp = h3 && h3.p && h3.p.type === 'tfeed' ? h3.p : null, h4 = fp && hopFrom(fp, 1);
    turbineMotor(tb, m * r.wt);
    thermo.part.set(b.id, { ...r, steam: true }); thermo.part.set(tb.id, { m, T3: r.T3, T4: r.Tc, p3: b.pb * 1e5, p4: cd.pk * 1e3, wt: r.wt, Pt: r.Pt, h0: r.wt / (tb.etaT || 0.85), etaT: tb.etaT || 0.85, x4: r.x4, steam: true });
    thermo.part.set(cd.id, { m, Q: r.Qc, T: r.Tc, x4: r.x4 }); if (fp) thermo.part.set(fp.id, { m, wp: r.wp, P: r.Pp });
    thermo.pipe.set(h1.q.id, gasLine(h1, m, b.pb * 1e5, r.T3, R_STEAM * 0.92, true)); thermo.pipe.set(h2.q.id, gasLine(h2, m, cd.pk * 1e3, r.Tc, R_STEAM / Math.max(0.5, r.x4), true));
    for (const [h, pp] of [[h3, cd.pk * 1e3], [h4, b.pb * 1e5]]) if (h) { const e = { d: h.q.d / 1000, L: Math.max(1e-3, pipeLen(h.q)), eps: ROUGH.steel, zeta: h.q.pts.length * ZETA.elbow }, Qv = m / 990, L = pipeLoss(e, Qv, FLUIDS.water), sg = h.fwd ? 1 : -1; thermo.pipe.set(h.q.id, { gas: true, Q: sg * Qv, m, v: L.v, va: sg * Math.min(3, 0.3 + L.v), Re: L.Re, lam: L.lam, regime: L.regime, dp: L.dp, pa: pp, pb: pp, L: e.L, zeta: e.zeta, fl: FLUIDS.water, fast: tooFast(L.v, FLUIDS.water), T: r.Tc }); }
  }
}
// hand the lines' records to the drawing, which keeps them with the hydraulic ones
function thermoPipes() { hyd.gas = thermo.pipe.size > 0; for (const [id, r] of thermo.pipe) { hyd.pipe.set(id, r); hyd.pmax = Math.max(hyd.pmax, r.pa, r.pb); } }
// the stage of a turbine at its mean diameter, for the speed the shaft has
function stageOfTurbine(tb) {
  const r = thermo.part.get(tb.id); if (!r || !r.h0) return null;
  const z = Math.max(1, Math.round(tb.zst || 1)), u = Math.abs(tb.w) * RPM * tb.dm / 2000, st = turbineStage({ u, h0: r.h0 / z, a1: (tb.a1 || 16) * Math.PI / 180, rho: tb.rho || 0 });
  return { ...st, u, z, h0: r.h0 / z };
}
addCheck('heat', () => {
  const out = [];
  for (const [id, r] of thermo.pipe) if (r.fast) { const q = pipes.find(x => x.id === id), a = byId(q.a), b = byId(q.b); out.push({ level: 'warn', code: 'w.pipeFast', text: t('w.pipeFast', { a: `${a.name}–${b.name}`, v: fmtNum(Math.abs(r.v), 3), m: r.fl.vmax.pressure }), ids: [a.id, b.id] }); }
  for (const p of parts) {
    if (p.type === 'tcomp' && !thermo.part.get(p.id).turb) out.push({ level: 'info', code: 'w.noTurbine', text: t('w.noTurbine', { a: p.name }), ids: [p.id] });
    if (p.type === 'tturb') {
      const r = thermo.part.get(p.id), st = stageOfTurbine(p); if (!r) { out.push({ level: 'info', code: 'w.noSteam', text: t('w.noSteam', { a: p.name }), ids: [p.id] }); continue; }
      if (r.steam && r.x4 < 0.86) out.push({ level: 'warn', code: 'w.wet', text: t('w.wet', { a: p.name, x: fmtNum(r.x4, 3) }), ids: [p.id] });
      if (st && st.u > 1 && Math.abs(st.x - st.xopt) > 0.3 * st.xopt) out.push({ level: 'warn', code: 'w.stageRatio', text: t('w.stageRatio', { a: p.name, x: fmtNum(st.x, 2), o: fmtNum(st.xopt, 2) }), ids: [p.id] });
      if (st && st.u > 450) out.push({ level: 'warn', code: 'w.bladeSpeed', text: t('w.bladeSpeed', { a: p.name, u: fmtNum(st.u, 3) }), ids: [p.id] });
    }
  }
  return out;
});
