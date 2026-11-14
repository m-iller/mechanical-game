/* Gear Bench — gas-turbine and steam cycles as blocks, and one turbine stage. SI (J/kg, K, Pa). No DOM here.
   Air and combustion gas are ideal gases with constant heat capacity. Water and steam come from short fits to the steam tables
   (saturation line by Antoine's equation, heat of evaporation by Watson's, superheat with a mean heat capacity): within about 2 %
   of the tables from 0.05 to 100 bar, which is far inside what the rest of the model can claim. */
'use strict';

const AIR = { cp: 1005, k: 1.4, R: 287 }, FLUE = { cp: 1148, k: 1.333, R: 287 };
/* Brayton cycle: compressor (pressure ratio pr, efficiency etaC), combustor (to T3, pressure loss dpc as a fraction),
   turbine (efficiency etaT) back to p1. gas: the working gas after the combustor (FLUE by default; pass AIR for the air-standard cycle). */
function brayton(o) {
  const T1 = o.T1 || 288, p1 = o.p1 || 1e5, etaC = o.etaC == null ? 0.85 : o.etaC, etaT = o.etaT == null ? 0.88 : o.etaT, m = o.m == null ? 1 : o.m, g = o.gas || FLUE, a = AIR;
  const T2s = T1 * o.pr ** ((a.k - 1) / a.k), T2 = T1 + (T2s - T1) / etaC, p2 = p1 * o.pr, p3 = p2 * (1 - (o.dpc || 0));
  const T4s = o.T3 * (p1 / p3) ** ((g.k - 1) / g.k), T4 = o.T3 - etaT * (o.T3 - T4s);
  const wc = a.cp * (T2 - T1), wt = g.cp * (o.T3 - T4), q = g.cp * (o.T3 - T2), w = wt - wc;
  return { T1, T2, T3: o.T3, T4, p1, p2, p3, p4: p1, wc, wt, q, w, eta: w / q, bwr: wc / wt, Pc: m * wc, Pt: m * wt, P: m * w, Q: m * q, m };
}
// saturated water and steam at pressure p: temperature K, enthalpies J/kg, entropies J/(kg·K)
function steamSat(p) {
  const mmHg = p / 133.322, lg = Math.log10(mmHg), t = lg < Math.log10(760) ? 1730.63 / (8.07131 - lg) - 233.426 : 1810.94 / (8.14019 - lg) - 244.485, T = t + 273.15;
  const hf = (4.18 * t + 5.2e-4 * t * t) * 1e3, hfg = 2501e3 * Math.max(0, (647.1 - T) / 373.94) ** 0.33, L = Math.log(T / 273.15);
  const sf = (4.18 * L + 1.04e-3 * (t - 273.15 * L)) * 1e3;
  return { T, hf, hfg, hg: hf + hfg, sf, sfg: hfg / T, sg: sf + hfg / T, vf: 1e-3 * (1 + 6.47e-5 * t + 3.67e-6 * t * t) };
}
// steam at p and T: superheated above saturation (mean heat capacity grows with pressure), else saturated vapour
function steamAt(p, T) { const s = steamSat(p), cp = (2.0 + 0.3 * (p / 1e6) ** 0.7) * 1e3; return T > s.T ? { h: s.hg + cp * (T - s.T), s: s.sg + cp * Math.log(T / s.T), T, sat: s } : { h: s.hg, s: s.sg, T: s.T, sat: s }; }
/* Rankine cycle: boiler at pb to temperature Tb (saturated steam when left out), turbine (etaT) to the condenser at pc, feed pump (etaP). */
function rankine(o) {
  const etaT = o.etaT == null ? 0.85 : o.etaT, etaP = o.etaP == null ? 0.8 : o.etaP, m = o.m == null ? 1 : o.m;
  const c = steamSat(o.pc), s3 = steamAt(o.pb, o.Tb || 0), xs = (s3.s - c.sf) / c.sfg, h4s = xs < 1 ? c.hf + xs * c.hfg : c.hg + 2.0e3 * c.T * (Math.exp((s3.s - c.sg) / 2.0e3) - 1);
  const wt = etaT * (s3.h - h4s), h4 = s3.h - wt, x4 = Math.min(1, (h4 - c.hf) / c.hfg), wp = c.vf * (o.pb - o.pc) / etaP, h2 = c.hf + wp, q = s3.h - h2, w = wt - wp;
  return { h1: c.hf, h2, h3: s3.h, h4, s3: s3.s, T3: s3.T, Tc: c.T, Tb: s3.sat.T, x4, wt, wp, q, w, eta: w / q, Pt: m * wt, Pp: m * wp, P: m * w, Q: m * q, Qc: m * (h4 - c.hf), m };
}
/* One axial turbine stage at the mean diameter. u blade speed; h0 isentropic heat drop of the stage, J/kg; rho degree of reaction;
   a1 nozzle exit angle from the plane of rotation; phi, psi speed coefficients of nozzles and blades; b2 blade exit angle
   (taken equal to b1 for an impulse stage, to a1 for a reaction stage, when left out).
   Speed triangles: c absolute, w relative; the index u is the part along the rotation. Work by Euler: L = u·(c1u + c2u). */
function turbineStage(o) {
  const phi = o.phi == null ? 0.95 : o.phi, psi = o.psi == null ? 0.9 : o.psi, rho = o.rho || 0, u = o.u;
  const c1 = phi * Math.sqrt(2 * (1 - rho) * o.h0), c1u = c1 * Math.cos(o.a1), c1a = c1 * Math.sin(o.a1), w1u = c1u - u, w1 = Math.hypot(w1u, c1a), b1 = Math.atan2(c1a, w1u);
  const w2 = psi * Math.sqrt(w1 * w1 + 2 * rho * o.h0), b2 = o.b2 != null ? o.b2 : rho >= 0.3 ? o.a1 : b1, w2u = w2 * Math.cos(b2), c2a = w2 * Math.sin(b2), c2u = w2u - u, c2 = Math.hypot(c2u, c2a);
  const L = u * (c1u + c2u), cf = Math.sqrt(2 * o.h0);
  return { c1, c1u, c1a, w1, w1u, b1, w2, w2u, b2, c2, c2u, c2a, a2: Math.atan2(c2a, -c2u), L, eta: L / o.h0, x: u / cf, xopt: rho >= 0.3 ? phi * Math.cos(o.a1) / Math.SQRT2 : phi * Math.cos(o.a1) / 2 };
}
