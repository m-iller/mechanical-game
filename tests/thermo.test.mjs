// Heat engines against textbook results (Çengel & Boles, "Thermodynamics: An Engineering Approach"; steam tables; Shchegliaev for the turbine stage).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

const th = () => bench();

test('Otto cycle with k = 1.4: thermal efficiency 1 − 1/ε^(k−1)', () => {
  const r = th().run(() => engineCycle({ kind: 'otto', eps: 8, n1: 1.4, n2: 1.4, lam: 3 }));
  close(r.etaI, 1 - 1 / 8 ** 0.4, 1e-9);                         // 56.5 %
});

test('Diesel cycle with k = 1.4: efficiency 1 − (ρ^k − 1) / (k·(ρ − 1)·ε^(k−1))', () => {
  const r = th().run(() => engineCycle({ kind: 'diesel', eps: 18, rho: 2, n1: 1.4, n2: 1.4 }));
  close(r.etaI, 1 - (2 ** 1.4 - 1) / (1.4 * (2 - 1) * 18 ** 0.4), 1e-9);   // 63.2 %
});

test('engine: mean indicated pressure, torque M = W·cyl·η/(π·τ), and the torque curve averages to the indicated torque', () => {
  const r = th().run(() => { const c = engineCycle({}), t = engineTorque(c, 720); return { pi: c.pi, Wi: c.Wi, Vh: c.Vh, Me: c.Me, Mi: c.Mi, mean: t.mean, max: t.max, min: t.min }; });
  close(r.Vh, Math.PI * 0.08 ** 2 / 4 * 0.09, 1e-12);
  assert.ok(r.pi > 8e5 && r.pi < 14e5);                          // petrol engines: 8–14 bar indicated
  close(r.Me, r.Wi * 4 * 0.85 / (4 * Math.PI), 1e-12);
  close(r.mean, r.Mi, 4e-2);                                     // pumping strokes are drawn at near-atmospheric pressure, hence a few percent
  assert.ok(r.max > 2 * r.mean && r.min < 0);                    // a four-cylinder engine still pulses
});

test('the indicator diagram is a closed line whose area is the work of the cycle', () => {
  const r = th().run(() => { const c = engineCycle({}), P = engineDiagram(c, 400); let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += (a[0] * b[1] - b[0] * a[1]) / 2; } return [Math.abs(A), c.Wi]; });
  close(r[0], r[1], 1e-3);
});

test('engine as a source: torque peaks at half the top speed and the governor cuts it above the top speed', () => {
  const r = th().run(() => { const s = sourceOf({ kind: 'ice', tq: 100, n: 5000 }); return [s.M(0), s.M(s.wNom / 2), s.M(s.wNom), s.M(s.wNom * 1.04), s.M(s.w0)]; });
  close(r[0], 75); close(r[1], 100); close(r[2], 75); close(r[3], 37.5, 1e-9); close(r[4], 0, 0, 1e-9);
});

test('Brayton, air standard (Çengel ex. 9-5: r_p = 8, 300 K, 1300 K): η = 1 − r_p^(−(k−1)/k) = 44.8 %, back work ratio 0.418', () => {
  const r = th().run(() => brayton({ T1: 300, pr: 8, T3: 1300, etaC: 1, etaT: 1, gas: AIR }));
  close(r.eta, 1 - 8 ** (-0.4 / 1.4), 1e-9); close(r.T2, 543.4, 1e-3); close(r.T4, 717.7, 1e-3); close(r.bwr, 0.418, 2e-3);
});

test('Brayton with losses: compressor work up by 1/η_c, turbine work down by η_t', () => {
  const r = th().run(() => [brayton({ T1: 300, pr: 8, T3: 1300, etaC: 1, etaT: 1, gas: AIR }), brayton({ T1: 300, pr: 8, T3: 1300, etaC: 0.8, etaT: 0.85, gas: AIR, m: 10 })]);
  close(r[1].wc, r[0].wc / 0.8, 1e-9); close(r[1].wt, r[0].wt * 0.85, 1e-9);
  close(r[1].eta, 0.274, 1e-2);                                  // constant-cp value; Çengel's 26.6 % uses variable specific heats
  close(r[1].P, 10 * (r[1].wt - r[1].wc), 1e-12);
});

test('steam fits against the tables: saturation at 0.75 bar and 30 bar, superheated steam at 30 bar, 350 °C', () => {
  const r = th().run(() => [steamSat(75e3), steamSat(3e6), steamAt(3e6, 623.15), steamSat(1e5), steamSat(10e6)]);
  close(r[0].T - 273.15, 91.76, 2e-3); close(r[0].hf, 384.4e3, 2e-2); close(r[0].hfg, 2278e3, 1e-2); close(r[0].sg, 7.4558e3, 1e-2);
  close(r[1].T - 273.15, 233.85, 2e-3); close(r[1].hg, 2803.2e3, 1e-2); close(r[1].sg, 6.1856e3, 1e-2);
  close(r[2].h, 3116.1e3, 1e-2); close(r[2].s, 6.745e3, 1e-2);
  close(r[3].T - 273.15, 99.61, 3e-3); close(r[3].hfg, 2257.5e3, 1e-2);
  close(r[4].T - 273.15, 311.0, 5e-3); close(r[4].hg, 2725.5e3, 2e-2);
});

test('Rankine (Çengel ex. 10-1: 3 MPa, 350 °C, condenser 75 kPa, ideal): η = 26.0 %, exhaust dryness 0.886, net work 710 kJ/kg', () => {
  const r = th().run(() => rankine({ pb: 3e6, Tb: 623.15, pc: 75e3, etaT: 1, etaP: 1 }));
  close(r.eta, 0.260, 2e-2); close(r.x4, 0.886, 1e-2); close(r.w, 710e3, 2e-2); close(r.wp, 3.03e3, 2e-2);
});

test('impulse stage without losses: η_u = 4·x·(cos α₁ − x), x = u/c₁, with its maximum cos²α₁ at x = cos α₁ / 2', () => {
  const a1 = 14 * Math.PI / 180, h0 = 80e3, c1 = Math.sqrt(2 * h0);
  const r = th().run((a1, h0, c1) => [0.2, 0.35, Math.cos(a1) / 2, 0.6].map(x => { const s = turbineStage({ u: x * c1, h0, a1, phi: 1, psi: 1 }); return [x, s.eta, s.xopt, s.c2u, s.w1, s.w2]; }), a1, h0, c1);
  for (const [x, eta, , , w1, w2] of r) { close(eta, 4 * x * (Math.cos(a1) - x), 1e-9); close(w1, w2, 1e-12); }
  close(r[2][1], Math.cos(a1) ** 2, 1e-9); close(r[2][3], 0, 0, 1e-6);      // at the best speed ratio the steam leaves without swirl
  close(r[0][2], Math.cos(a1) / 2, 1e-12);
});

test('reaction stage (ρ = 0.5, symmetric blades): the best speed ratio is near cos α₁ / √2, about twice the blade speed of an impulse stage', () => {
  const a1 = 20 * Math.PI / 180, h0 = 40e3, cf = Math.sqrt(2 * h0);
  const r = th().run((a1, h0, cf) => { let best = [0, 0]; for (let x = 0.3; x < 1; x += 0.005) { const s = turbineStage({ u: x * cf, h0, a1, rho: 0.5, phi: 1, psi: 1 }); if (s.eta > best[1]) best = [x, s.eta]; } return best; }, a1, h0, cf);
  close(r[0], Math.cos(a1) / Math.SQRT2, 6e-2); assert.ok(r[1] > 0.9);   // the blade angles are fixed here, so the peak sits a little above the design ratio
});
