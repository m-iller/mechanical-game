// Plate cams. Peak values of the motion laws are the textbook ones (Artobolevsky; Norton, "Cam Design and Manufacturing Handbook"):
//   constant acceleration  v_max = 2·h/β      a_max = 4·h/β²
//   harmonic               v_max = π·h/(2β)   a_max = π²·h/(2β²)
//   cycloidal              v_max = 2·h/β      a_max = 2π·h/β²
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

test('motion laws: end values and peak speed and acceleration', () => {
  const r = bench().run(() => ['lin', 'par', 'harm', 'cyc'].map(law => {
    let v = 0, a = 0; for (let k = 0; k <= 1000; k++) { const [, d1, d2] = camLaw(law, k / 1000); v = Math.max(v, Math.abs(d1)); a = Math.max(a, Math.abs(d2)); }
    return { s0: camLaw(law, 0)[0], s1: camLaw(law, 1)[0], v, a, v0: camLaw(law, 0)[1], a0: camLaw(law, 0)[2] };
  }));
  for (const x of r) { close(x.s0, 0, 0, 1e-12); close(x.s1, 1, 1e-12); }
  close(r[0].v, 1); close(r[0].a, 0, 0, 1e-12);
  close(r[1].v, 2, 1e-9); close(r[1].a, 4);
  close(r[2].v, Math.PI / 2, 1e-6); close(r[2].a, Math.PI ** 2 / 2);
  close(r[3].v, 2, 1e-6); close(r[3].a, 2 * Math.PI, 1e-5); close(r[3].v0, 0, 0, 1e-12); close(r[3].a0, 0, 0, 1e-12);
});

test('rise, dwell, return, dwell: travel and its rate at the marks of the plan', () => {
  const cam = { r: 20, h: 10, law: 'harm', b1: 90, bd: 30, b2: 60 }, D = Math.PI / 180;
  const r = bench().run((c, D) => [camS(c, 0), camS(c, 45 * D), camS(c, 100 * D), camS(c, 150 * D), camS(c, 200 * D), camS(c, -10 * D)], cam, D);
  close(r[0][0], 0, 0, 1e-12); close(r[1][0], 5); close(r[1][1], 10 * (Math.PI / 2) / (90 * D));   // mid-rise: half the lift at the top harmonic speed
  close(r[2][0], 10); close(r[2][1], 0, 0, 1e-12);
  close(r[3][0], 5); close(r[3][1], -10 * (Math.PI / 2) / (60 * D));
  close(r[4][0], 0, 0, 1e-12); close(r[5][0], 0, 0, 1e-12);
});

test('pressure angle of an in-line follower: tan α = s′/(r + r_r + s); and the base radius that brings it to 30°', () => {
  // constant-speed law: s′ = h/β all along the rise, so α is largest at its start: tan α = (h/β)/(r + r_r)
  const cam = { r: 20, h: 12, law: 'lin', b1: 60, bd: 0, b2: 60 }, beta = Math.PI / 3;
  const r = bench().run(c => { const k = camCheck(c, 5), k2 = camCheck({ ...c, r: k.rmin }, 5); return { a: k.alpha, rmin: k.rmin, a2: k2.alpha }; }, cam);
  close(r.a, Math.atan((12 / beta) / 25), 1e-9);
  close(r.rmin, (12 / beta) / Math.tan(Math.PI / 6) - 5, 1e-9);
  close(r.a2, Math.PI / 6, 1e-6);
});

test('an eccentric circle is a harmonic cam: its pitch curve has the curvature radius of the circle', () => {
  // for small eccentricity e the follower travel is close to e·(1 − cos φ): harmonic rise over 180° with h = 2e. ρ stays near r + e + r_r.
  const r = bench().run(() => camCheck({ r: 30, h: 2, law: 'harm', b1: 180, bd: 0, b2: 180 }, 0).rho);
  assert.ok(r > 28 && r < 34);
});

test('the surface is the pitch curve moved in by the roller radius', () => {
  const r = bench().run(() => { const c = { r: 20, h: 8, law: 'cyc', b1: 90, bd: 30, b2: 90 }, a = camProfile(c, 0, 360), b = camProfile(c, 5, 360); return [Math.hypot(...b[300]), Math.hypot(...a[300]), Math.hypot(...b[100]) - 20, Math.hypot(...a[100]) - 28]; });
  close(r[0], 20, 1e-6); close(r[1], 20, 1e-9);        // on the base dwell
  close(r[2], 8, 1e-3); close(r[3], 0, 0, 1e-9);       // on the top dwell: lifted by h
});

test('demo: cam drive of a valve — a higher pair, W = 1, the follower rides the law and nothing is flagged', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, f] = insertTemplate('valve', 0, 0); solve();
    const out = { pairs: pairs.map(q => q.type), group: tmmInfo.groups.map(g => [g.n, g.p5, g.p4, g.W, g.drivers]), warn: warnings.map(w => w.code), rows: [] };
    for (const deg of [0, 35, 80, 125, 200]) { clock = deg * Math.PI / 180 / c.w; tmmStep(); out.rows.push([deg, Math.hypot(f.x, f.y) - 23, f.x]); }
    const S = tmmSeries(f); out.series = S.series.map(s => s.name); out.vmax = Math.max(...S.series[1].data);
    return out;
  });
  assert.deepEqual(r.pairs, ['H']); assert.deepEqual(r.group, [[2, 2, 1, 1, 1]]); assert.deepEqual(r.warn, []);
  // the follower points along −π/2, so the law angle is the cam angle + 90°: at 0° it is 90° in, on the top dwell
  const D = Math.PI / 180, want = deg => { const f = ((deg + 90) % 360) * D; return f < 70 * D ? 8 * (f / (70 * D) - Math.sin(2 * Math.PI * f / (70 * D)) / (2 * Math.PI)) : f < 90 * D ? 8 : f < 160 * D ? 8 * (1 - ((f - 90 * D) / (70 * D) - Math.sin(2 * Math.PI * (f - 90 * D) / (70 * D)) / (2 * Math.PI))) : 0; };
  for (const [deg, s, x] of r.rows) { close(s, want(deg), 1e-9, 1e-9); close(x, 0, 0, 1e-9); }
  assert.deepEqual(r.series, ['s', 'v', 'a', 'α']);
  close(r.vmax, 2 * 0.008 / (70 * D) * (600 * Math.PI / 30), 5e-3);   // cycloidal: v_max = 2h/β·ω
});

test('a steep cam is flagged with the base radius that would do', () => {
  const r = bench().run(() => { resetScene(1); const [c] = insertTemplate('valve', 0, 0); c.b1 = 20; c.h = 14; solve(); return warnings.map(w => w.code); });
  assert.ok(r.includes('w.camAngle'));
});
