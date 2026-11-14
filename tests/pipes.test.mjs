// Pipes and hydraulic networks against closed-form results from hydraulics textbooks
// (T. M. Bashta, "Hydraulics, hydraulic machines and hydraulic drives"; Idelchik's handbook for the friction formulas).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close, HYDRO } from './load.mjs';

const hy = () => bench(HYDRO);
const LMIN = 1 / 60000, BAR = 1e5;

test('laminar pipe: Poiseuille, Δp = 128·μ·L·Q / (π·d⁴)', () => {
  // oil VG 46, 40 L/min through 12 mm × 5 m: v = 5.89 m/s, Re = 1538
  const r = hy().run(Q => pipeLoss({ d: 0.012, L: 5 }, Q, FLUIDS.oil), 40 * LMIN);
  close(r.v, 40 * LMIN / (Math.PI * 0.012 ** 2 / 4), 1e-12); close(r.Re, r.v * 0.012 / 46e-6, 1e-12); assert.equal(r.regime, 'laminar');
  close(r.dp, 128 * (870 * 46e-6) * 5 * (40 * LMIN) / (Math.PI * 0.012 ** 4), 1e-9);   // 2.62 bar
});

test('turbulent smooth pipe: within 1 % of Blasius λ = 0.3164 / Re^0.25', () => {
  const r = hy().run(() => [frictionFactor(1e4), frictionFactor(1e5)]);
  close(r[0], 0.3164 / 1e4 ** 0.25, 1e-2); close(r[1], 0.3164 / 1e5 ** 0.25, 1e-2);
});

test('rough pipe at high Re: Shifrinson λ = 0.11·(ε/d)^0.25, within 10 % of the Moody chart value', () => {
  const lam = hy().run(() => frictionFactor(1e7, 0.01));
  close(lam, 0.11 * 0.01 ** 0.25, 1e-3);
  close(lam, 0.0379, 0.1);                       // Moody chart, ε/d = 0.01, fully rough
});

test('the friction factor is continuous across the transition', () => {
  const r = hy().run(() => [frictionFactor(2299.9), frictionFactor(2300.1), frictionFactor(3999.9), frictionFactor(4000.1)]);
  close(r[0], r[1], 1e-3); close(r[2], r[3], 1e-3);
});

test('local losses add as ζ·ρ·v²/2; water at 2 m/s through two elbows', () => {
  const r = hy().run(() => pipeLoss({ d: 0.05, L: 0, zeta: 2 * ZETA.elbow }, 2 * Math.PI * 0.05 ** 2 / 4, FLUIDS.water));
  close(r.dp, 2.2 * 998 * 4 / 2, 1e-9);
});

test('recommended speeds: 40 L/min of oil is too fast for a 10 mm pressure line and far too fast for suction', () => {
  const r = hy().run(Q => { const v = d => Q / pipeArea(d); return [tooFast(v(0.010), FLUIDS.oil, 'pressure'), tooFast(v(0.016), FLUIDS.oil, 'pressure'), tooFast(v(0.016), FLUIDS.oil, 'suction'), tooFast(v(0.032), FLUIDS.oil, 'suction')]; }, 40 * LMIN);
  assert.deepEqual(r, [true, false, true, false]);
});

/* ---- networks ---- */
test('pump into a pipe to the tank: the pump pressure is the pipe loss', () => {
  const r = hy().run(Q => { const net = { nodes: 2, fixed: { 0: 0 }, elems: [{ k: 'pump', a: 0, b: 1, Q }, { k: 'pipe', a: 1, b: 0, d: 0.012, L: 5 }] }; const s = hydroSolve(net); return { ok: s.ok, p: s.p[1], q: s.q[1], want: pipeLoss(net.elems[1], Q, FLUIDS.oil).dp }; }, 40 * LMIN);
  assert.ok(r.ok); close(r.p, r.want, 1e-6); close(r.q, 40 * LMIN, 1e-9);
});

test('pump against a blocked line: everything goes over the relief valve at its setting', () => {
  const r = hy().run(Q => hydroSolve({ nodes: 2, fixed: { 0: 0 }, elems: [{ k: 'pump', a: 0, b: 1, Q }, { k: 'relief', a: 1, b: 0, pset: 160e5 }] }), 40 * LMIN);
  assert.ok(r.ok); close(r.q[1], 40 * LMIN, 1e-6);
  close(r.p[1], 160 * BAR + 40 * LMIN / 2e-10, 1e-4);          // setting plus the valve's override, 33 bar here
});

test('cylinder lifting a load: p = F/A₁ plus the back pressure of the return line; v = Q/A₁', () => {
  // bore 63, rod 36: A₁ = 31.17 cm², A₂ = 20.99 cm²; F = 30 kN → 96.2 bar; 40 L/min → 0.214 m/s
  const A1 = Math.PI * 0.063 ** 2 / 4, A2 = A1 - Math.PI * 0.036 ** 2 / 4, Q = 40 * LMIN;
  const r = hy().run((A1, A2, Q) => {
    const net = { nodes: 3, fixed: { 0: 0 }, elems: [{ k: 'pump', a: 0, b: 1, Q }, { k: 'relief', a: 1, b: 0, pset: 160e5 }, { k: 'cyl', a: 1, b: 2, A1, A2, F: 30e3 }, { k: 'pipe', a: 2, b: 0, d: 0.012, L: 3 }] };
    const s = hydroSolve(net); return { ok: s.ok, p: s.p, v: s.v[2], relief: s.q[1], back: pipeLoss(net.elems[3], A2 * Q / A1, FLUIDS.oil).dp };
  }, A1, A2, Q);
  assert.ok(r.ok); close(r.v, Q / A1, 1e-4); close(r.relief, 0, 0, 2e-8);   // the closed relief valve is given a hair of leakage to keep the system regular
  close(r.p[2], r.back, 1e-4); close(r.p[1], (30e3 + r.back * A2) / A1, 1e-5);
});

test('cylinder at its end stop: the pressure climbs to the relief setting and the flow leaves through the valve', () => {
  const A1 = Math.PI * 0.063 ** 2 / 4, A2 = A1 - Math.PI * 0.036 ** 2 / 4;
  const r = hy().run((A1, A2, Q) => hydroSolve({ nodes: 3, fixed: { 0: 0 }, elems: [{ k: 'pump', a: 0, b: 1, Q }, { k: 'relief', a: 1, b: 0, pset: 160e5 }, { k: 'cyl', a: 1, b: 2, A1, A2, F: 30e3, stop: 1 }, { k: 'pipe', a: 2, b: 0, d: 0.012, L: 3 }] }), A1, A2, 40 * LMIN);
  assert.ok(r.ok); close(r.v[2], 0, 0, 1e-12); close(r.q[1], 40 * LMIN, 1e-6); assert.ok(r.p[1] > 160 * BAR);
});

test('meter-in throttle: the cylinder takes what the orifice passes under (p_relief − p_load), the rest goes over the relief valve', () => {
  const A1 = Math.PI * 0.063 ** 2 / 4, A2 = A1 - Math.PI * 0.036 ** 2 / 4, Q = 40 * LMIN, Ao = 4e-6;
  const r = hy().run((A1, A2, Q, Ao) => hydroSolve({ nodes: 3, fixed: { 0: 0 }, elems: [{ k: 'pump', a: 0, b: 1, Q }, { k: 'relief', a: 1, b: 0, pset: 160e5 }, { k: 'orifice', a: 1, b: 2, A: Ao }, { k: 'cyl', a: 2, b: 0, A1, A2, F: 30e3 }] }), A1, A2, Q, Ao);
  assert.ok(r.ok);
  const qo = r.q[2]; close(qo + r.q[1], Q, 1e-6); assert.ok(r.q[1] > 0);
  close(r.p[2], 30e3 / A1, 1e-6);
  close(qo, 0.62 * Ao * Math.sqrt(2 * (r.p[1] - r.p[2]) / 870), 2e-3);   // the regularising term shifts it by a fraction of a percent
  close(r.v[3], qo / A1, 1e-9);
});

test('a check valve passes one way only', () => {
  const r = hy().run(Q => [1, -1].map(dir => hydroSolve({ nodes: 3, fixed: { 0: 0 }, elems: [{ k: 'pump', a: 0, b: 1, Q }, { k: 'relief', a: 1, b: 0, pset: 100e5 }, dir > 0 ? { k: 'check', a: 1, b: 2, A: 5e-5 } : { k: 'check', a: 2, b: 1, A: 5e-5 }, { k: 'pipe', a: 2, b: 0, d: 0.012, L: 1 }] })), 20 * LMIN);
  assert.ok(r[0].ok && r[1].ok);
  close(r[0].q[2], 20 * LMIN, 1e-4); assert.ok(r[0].p[1] < 5 * BAR);
  close(r[1].q[1], 20 * LMIN, 1e-4); assert.ok(Math.abs(r[1].q[2]) < 1e-7);
});

test('hydraulic motor: Δp = M/q, speed = Q/q', () => {
  // 32 cm³/rev against 50 N·m: Δp = 2π·50/32e-6 = 98.2 bar; 40 L/min → 1250 rpm
  const q = 32e-6 / (2 * Math.PI);
  const r = hy().run((q, Q) => hydroSolve({ nodes: 2, fixed: { 0: 0 }, elems: [{ k: 'pump', a: 0, b: 1, Q }, { k: 'relief', a: 1, b: 0, pset: 160e5 }, { k: 'motor', a: 1, b: 0, q, M: 50 }] }), q, 40 * LMIN);
  assert.ok(r.ok); close(r.p[1], 50 / q, 1e-6); close(r.v[2], 40 * LMIN / q, 1e-4); close(r.v[2] * 30 / Math.PI, 1250, 1e-4);
});
