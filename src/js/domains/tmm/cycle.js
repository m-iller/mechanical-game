/* Gear Bench — a mechanism over one turn of its crank: positions, their rates, forces, flywheel.
   The crank is stepped through a full turn in CYC_N steps and the links are solved at each (scene.js gives the mechanism).
   Rates are central differences over the crank angle φ: v = q′·ω, a = q″·ω² (constant crank speed).
   Forces are kinetostatics: for every moving link, Σ F = m·a and Σ M = J·ε with the reactions of its pairs as unknowns,
   plus the balancing moment on the crank. It is the textbook method (d'Alembert), solved as one linear system.
   Not in the model: gravity, friction in pairs, elastic links. Lengths in the scene are mm; forces come out in N, moments in N·m. */
'use strict';

const CYC_N = 180;
const cycCache = new Map();                        // crank id -> { key, cyc }
const linkCentre = p => BAR.includes(p.type) ? [p.len / 2, 0] : p.type === 'tplate' ? [p.r, 0] : [0, 0];
const linkJ = p => (p.m || 0) * (BAR.includes(p.type) ? (p.len / 1000) ** 2 / 12 : p.type === 'tplate' ? (p.r / 1000) ** 2 / 2 : 0);   // about the centre of mass, kg·m²
const crankOf = p => { const g = tmmInfo.of.get(p.id); return g ? g.ids.map(byId).find(q => q && q.type === 'tcrank') : null; };

function tmmCycle(crank) {
  const sign = crank.w < 0 ? -1 : 1, r3 = v => Math.round(v * 1000) / 1000;
  const key = JSON.stringify([crank.id, sign, parts.filter(isLink).map(p => [p.id, p.type, p.len, p.r, p.n, p.F, p.fw, p.m, linkFixed(p) ? [r3(p.x), r3(p.y), p === crank ? 0 : r3(linkTh(p))] : 0]), pairs.map(q => [q.type, q.a, q.ja, q.b, q.jb, q.turn])]);
  const hit = cycCache.get(crank.id); if (hit && hit.key === key && hit.cyc.ok) return hit.cyc;
  const mech = tmmMech(), entry = mech.links.find(l => l.id === crank.id), cyc = { ok: false, N: CYC_N, sign, Q: [], mech, crank, moving: mech.moving };
  if (!entry || !mech.moving.length || !mech.pairs.length) { cycCache.set(crank.id, { key, cyc }); return cyc; }
  const lk = linkage(mech), th0 = entry.pose[2]; let q = mech.q0.slice();
  cyc.th0 = th0; cyc.at = lk.at; cyc.pose = lk.pose;
  for (let k = 0; k < CYC_N; k++) {
    entry.pose[2] = th0 + sign * k * TAU / CYC_N;
    const r = solveNL(lk.eqs, q, { tol: 1e-10, max: 40 }); if (r.res > 1e-4) { cyc.failAt = k; break; }
    q = r.x; cyc.Q.push(q.slice());
  }
  entry.pose[2] = th0; cyc.ok = cyc.Q.length === CYC_N; cyc.entry = entry;
  cycCache.set(crank.id, { key, cyc }); return cyc;
}
// which sample the crank is at now, as a fraction index
const cycIndex = cyc => mod((linkTh(cyc.crank) - cyc.th0) * cyc.sign / TAU, 1) * cyc.N;
// value, first and second derivative over the crank angle of a function of the sample index
function cycD(cyc, k, f) { const N = cyc.N, h = TAU / N, a = f(mod(k - 1, N)), b = f(k), c = f(mod(k + 1, N)); return [b, (c - a) / (2 * h), (c - 2 * b + a) / (h * h)]; }
// world position of a point of a link at sample k (the crank and the frame included)
function cycPoint(cyc, k, id, local) {
  if (id === cyc.crank.id) { const th = cyc.th0 + cyc.sign * k * TAU / cyc.N, c = Math.cos(th), s = Math.sin(th); return [cyc.crank.x + c * local[0] - s * local[1], cyc.crank.y + s * local[0] + c * local[1]]; }
  return cyc.at(cyc.Q[k], id, local);
}
const cycAngle = (cyc, k, id) => id === cyc.crank.id ? cyc.th0 + cyc.sign * k * TAU / cyc.N : cyc.pose(cyc.Q[k], id)[2];
// the rail a slider rides on, and its travel along it at sample k
const railOf = p => { const q = pairs.find(x => x.type === 'P' && x.b === p.id); return q ? byId(q.a) : null; };
function cycTravel(cyc, k, p) { const r = railOf(p), P = cycPoint(cyc, k, p.id, [0, 0]); if (!r) return P[0]; const th = cycAngle(cyc, k, r.id), o = cycPoint(cyc, k, r.id, [0, 0]); return (P[0] - o[0]) * Math.cos(th) + (P[1] - o[1]) * Math.sin(th); }

/* The resisting force on a slider at sample k, N, along its rail (negative: against the rail's direction).
   F acts while the slider moves forward along the rail, over the last fw part of the stroke (fw = 1: the whole forward stroke). */
function cycResist(cyc, k, p, span) {
  if (!p.F) return 0;
  const [s, d1] = cycD(cyc, k, i => cycTravel(cyc, i, p)), fw = p.fw == null ? 1 : p.fw;
  return d1 > 1e-9 && s >= span.max - fw * (span.max - span.min) - 1e-9 ? -p.F : 0;
}
const cycSpan = (cyc, f) => { let min = Infinity, max = -Infinity; for (let k = 0; k < cyc.N; k++) { const v = f(k); if (v < min) min = v; if (v > max) max = v; } return { min, max }; };

/* Kinetostatics at sample k for crank speed w (rad/s). Returns { Mb, R } — the balancing moment on the crank in the
   direction of its rotation (N·m) and the reaction in each pair (N), or null when the chain is not statically determinate. */
function cycForces(cyc, k, w) {
  const bodies = [cyc.crank, ...cyc.moving], row = new Map(bodies.map((p, i) => [p.id, 3 * i])), prs = cyc.mech.pairs.filter(q => row.has(q.a) || row.has(q.b));
  let nu = 0; const col = prs.map(q => { const c = nu; nu += q.type === 'F' ? 3 : 2; return c; }), cBase = nu, cMb = nu + 2; nu += 3;
  if (nu !== 3 * bodies.length) return null;
  const A = [...Array(nu)].map(() => new Array(nu).fill(0)), rhs = new Array(nu).fill(0), mm = 1e-3;
  const force = (id, sgn, c, fx, fy, P) => { const r = row.get(id); if (r == null) return; A[r][c] += sgn * fx; A[r + 1][c] += sgn * fy; A[r + 2][c] += sgn * (P[0] * fy - P[1] * fx) * mm; };
  const couple = (id, sgn, c) => { const r = row.get(id); if (r != null) A[r + 2][c] += sgn; };
  prs.forEach((q, i) => {
    const P = cycPoint(cyc, k, q.b, q.pb), c = col[i];
    if (q.type === 'P') { const th = cycAngle(cyc, k, q.a), n = [-Math.sin(th), Math.cos(th)]; force(q.b, 1, c, n[0], n[1], P); force(q.a, -1, c, n[0], n[1], P); couple(q.b, 1, c + 1); couple(q.a, -1, c + 1); }
    else { force(q.b, 1, c, 1, 0, P); force(q.a, -1, c, 1, 0, P); force(q.b, 1, c + 1, 0, 1, P); force(q.a, -1, c + 1, 0, 1, P); if (q.type === 'F') { couple(q.b, 1, c + 2); couple(q.a, -1, c + 2); } }
  });
  force(cyc.crank.id, 1, cBase, 1, 0, [cyc.crank.x, cyc.crank.y]); force(cyc.crank.id, 1, cBase + 1, 0, 1, [cyc.crank.x, cyc.crank.y]); couple(cyc.crank.id, 1, cMb);
  for (const p of bodies) { // known loads: inertia of each link and the resistance on sliders, moved to the right-hand side
    const r = row.get(p.id), cl = linkCentre(p), m = p.m || 0, J = linkJ(p);
    const X = cycD(cyc, k, i => cycPoint(cyc, i, p.id, cl)[0]), Y = cycD(cyc, k, i => cycPoint(cyc, i, p.id, cl)[1]), TH = cycD(cyc, k, i => cycAngle(cyc, i, p.id));
    let fx = -m * X[2] * mm * w * w, fy = -m * Y[2] * mm * w * w, mz = -J * TH[2] * w * w;
    mz += (X[0] * fy - Y[0] * fx) * mm;
    if (SLIDES.includes(p.type) && p.F) { const rl = railOf(p), th = rl ? cycAngle(cyc, k, rl.id) : 0, f = cycResist(cyc, k, p, cyc.span.get(p.id)), P = cycPoint(cyc, k, p.id, [0, 0]), ex2 = f * Math.cos(th), ey2 = f * Math.sin(th); fx += ex2; fy += ey2; mz += (P[0] * ey2 - P[1] * ex2) * mm; }
    rhs[r] -= fx; rhs[r + 1] -= fy; rhs[r + 2] -= mz;
  }
  const x = linSolve(A, rhs); if (!x) return null;
  return { Mb: x[cMb] * cyc.sign, R: prs.map((q, i) => q.type === 'P' ? Math.abs(x[col[i]]) : Math.hypot(x[col[i]], x[col[i] + 1])), base: Math.hypot(x[cBase], x[cBase + 1]), prs };
}
/* The whole turn at crank speed w: the moment the crank needs at each step, its mean and peak,
   and the flywheel sum — excess work ΔA between the mean driving moment and the need, δ = ΔA / (J·ω²). */
function cycDynamics(cyc, w) {
  if (!cyc.ok) return null;
  cyc.span = new Map(cyc.moving.filter(p => SLIDES.includes(p.type)).map(p => [p.id, cycSpan(cyc, k => cycTravel(cyc, k, p))]));
  const Mb = [], h = TAU / cyc.N, R = new Map(), base = [];   // R: reaction in each pair over the turn, by pair id; base: the crank's hinge on the frame
  for (let k = 0; k < cyc.N; k++) { const f = cycForces(cyc, k, w); if (!f) return null; Mb.push(f.Mb); base.push(f.base); f.prs.forEach((q, i) => { if (!R.has(q.id)) R.set(q.id, []); R.get(q.id).push(f.R[i]); }); }
  const mean = Mb.reduce((a, b) => a + b, 0) / cyc.N; let E = 0, lo = 0, hi = 0;
  for (let k = 0; k < cyc.N; k++) { E += (mean - (Mb[k] + Mb[(k + 1) % cyc.N]) / 2) * h; lo = Math.min(lo, E); hi = Math.max(hi, E); }
  return { Mb, mean, peak: Math.max(...Mb.map(Math.abs)), dA: hi - lo, R, base };
}
// the mean moment each crank needs, for the drive's power balance; inertia averages to nothing over a turn, so the speed does not enter
function tmmLoads() {
  for (const p of parts) if (p.type === 'tcrank') {
    delete p.mb;
    if (!parts.some(q => SLIDES.includes(q.type) && q.F)) continue;
    const cyc = tmmCycle(p), d = cycDynamics(cyc, 0); if (d && d.mean > 1e-9) p.mb = d.mean;
  }
}
// moment of inertia of the flywheels turning with a crank, reduced to its shaft, kg·m². A flywheel is a steel disc of the layer's thickness unless J is given.
const flyJ = f => f.J != null ? f.J : 0.5 * 7850 * Math.PI * (f.d / 2000) ** 4 * (FW / 1000);
function crankJ(crank) { let J = 0; if (crank.w) for (const f of parts) if (f.type === 'flywheel' && f.w && solved.comp && solved.comp(f) === solved.comp(crank)) J += flyJ(f) * (f.w / crank.w) ** 2; return J; }
// a steady crank speed is assumed everywhere; without enough flywheel that assumption fails
addCheck('flywheel', () => {
  const out = [];
  for (const p of parts) if (p.type === 'tcrank' && p.mb && p.w) {
    const cyc = tmmCycle(p), w = Math.abs(p.w) * RPM, d = cycDynamics(cyc, w); if (!d) continue;
    const J = crankJ(p), delta = J > 0 ? d.dA / (J * w * w) : Infinity;
    if (delta > 0.3) out.push({ level: 'warn', code: 'w.fluct', text: t('w.fluct', { a: p.name, d: isFinite(delta) ? fmtNum(delta, 2) : '∞' }), ids: [p.id] });
  }
  return out;
});
