/* Gear Bench — piston engine as an air-standard cycle with polytropic compression and expansion. SI. No DOM here.
   e: { D, S bore and stroke, m;  eps compression ratio;  cyl cylinders;  kind 'otto' | 'diesel';
        lam  pressure rise at constant volume p3/p2 (Otto; 1 for a pure Diesel);  rho  cut-off ratio V3/Vc (Diesel);
        p1 pressure at the start of compression;  n1, n2 polytropic exponents;  etaM mechanical efficiency;  strokes 4 or 2 }
   Points: 1 start of compression, 2 its end, 3 end of heat supply, 4 end of expansion.
   Work per cycle W_i = W_expansion − W_compression, mean indicated pressure p_i = W_i / V_h,
   shaft torque M_e = W_i·cyl·η_m / (π·strokes) — the same at any speed, as long as the filling does not change. */
'use strict';

const ENGINE_DEF = { D: 0.08, S: 0.09, eps: 9.5, cyl: 4, kind: 'otto', lam: 3.6, rho: 1.9, p1: 0.9e5, n1: 1.36, n2: 1.27, etaM: 0.85, strokes: 4, lr: 0.28 };
function engineCycle(e0) {
  const e = { ...ENGINE_DEF, ...e0 }, A = Math.PI * e.D * e.D / 4, Vh = A * e.S, Vc = Vh / (e.eps - 1), Va = Vh + Vc, diesel = e.kind === 'diesel';
  const p2 = e.p1 * e.eps ** e.n1, p3 = p2 * (diesel ? (e0.lam || 1) : e.lam), V3 = diesel ? e.rho * Vc : Vc, p4 = p3 * (V3 / Va) ** e.n2;
  const Wexp = p3 * (V3 - Vc) + (p3 * V3 - p4 * Va) / (e.n2 - 1), Wcomp = (p2 * Vc - e.p1 * Va) / (e.n1 - 1), Wi = Wexp - Wcomp;
  // heat supplied, for an ideal gas with the exponent of the expansion line: at constant volume, then at constant pressure
  const k = e.n2, Q1 = (p3 - p2) * Vc / (k - 1) + k / (k - 1) * p3 * (V3 - Vc);
  return { e, A, Vh, Vc, Va, V3, p1: e.p1, p2, p3, p4, Wi, pi: Wi / Vh, Q1, etaI: Wi / Q1, Me: Wi * e.cyl * e.etaM / (Math.PI * e.strokes), Mi: Wi * e.cyl / (Math.PI * e.strokes) };
}
// pressure in one cylinder at crank angle phi (0 = top dead centre at the start of intake), over the 720° of a four-stroke cycle
function enginePressure(c, phi) {
  const e = c.e, f = mod(phi, 2 * TAU), sn = Math.sin(f), x = e.S / 2 * ((1 - Math.cos(f)) + (1 - Math.sqrt(1 - (e.lr * sn) ** 2)) / e.lr), V = c.Vc + c.A * x;
  if (f < Math.PI) return { V, p: c.p1 };
  if (f < TAU) return { V, p: c.p1 * (c.Va / V) ** e.n1 };
  if (f < 3 * Math.PI) return { V, p: V <= c.V3 ? c.p3 : c.p3 * (c.V3 / V) ** e.n2 };
  return { V, p: 1.1e5 };
}
/* Gas torque of the whole engine over one cycle, N·m, at N steps of the crank: every cylinder's (p − p0)·A·r·(sin φ + λ·sin φ·cos φ/√(1 − λ²sin²φ)),
   the cylinders firing evenly. Returns { M: [...], mean, min, max }. Inertia of the pistons is left out. */
function engineTorque(c, N = 360) {
  const e = c.e, r = e.S / 2, M = new Array(N).fill(0), span = 2 * TAU;
  for (let k = 0; k < N; k++) for (let j = 0; j < e.cyl; j++) {
    const f = span * k / N + span * j / e.cyl, sn = Math.sin(f), cs = Math.cos(f), { p } = enginePressure(c, f);
    M[k] += (p - 1e5) * c.A * r * (sn + e.lr * sn * cs / Math.sqrt(1 - (e.lr * sn) ** 2));
  }
  return { M, mean: M.reduce((a, b) => a + b, 0) / N, min: Math.min(...M), max: Math.max(...M) };
}
// the closed p–V line of the cycle as points [V, p], for the indicator diagram
function engineDiagram(c, n = 40) {
  const e = c.e, pts = [];
  for (let i = 0; i <= n; i++) { const V = c.Va - (c.Va - c.Vc) * i / n; pts.push([V, c.p1 * (c.Va / V) ** e.n1]); }
  pts.push([c.Vc, c.p3], [c.V3, c.p3]);
  for (let i = 0; i <= n; i++) { const V = c.V3 + (c.Va - c.V3) * i / n; pts.push([V, c.p3 * (c.V3 / V) ** e.n2]); }
  pts.push([c.Va, c.p1]); return pts;
}
