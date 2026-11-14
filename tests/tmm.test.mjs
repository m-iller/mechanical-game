// Planar linkages: structure, positions, speeds and accelerations against closed-form results
// (I. I. Artobolevsky, "Theory of Mechanisms and Machines": slider-crank kinematics, Chebyshev's formula, Grashof's rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close, TMM } from './load.mjs';

const tmm = () => bench(TMM);

test('solveNL: a square system and one with a redundant equation', () => {
  const r = tmm().run(() => [
    solveNL(x => [x[0] * x[0] + x[1] * x[1] - 25, x[0] - x[1] - 1], [5, 1]),
    solveNL(x => [x[0] + x[1] - 3, x[0] - x[1] - 1, 2 * x[0] + 2 * x[1] - 6], [0, 0]),
  ]);
  assert.ok(r[0].ok); close(r[0].x[0], 4, 1e-8); close(r[0].x[1], 3, 1e-8);
  assert.ok(r[1].ok); close(r[1].x[0], 2, 1e-8); close(r[1].x[1], 1, 1e-8);
});

// crank r on the ground at the origin, rod l, slider on the x axis
const sliderCrank = (r, l) => ({
  links: [{ id: 0, ground: true }, { id: 1 }, { id: 2 }, { id: 3 }],
  pairs: [
    { type: 'R', a: 0, b: 1, pa: [0, 0], pb: [0, 0] }, { type: 'R', a: 1, b: 2, pa: [r, 0], pb: [0, 0] },
    { type: 'R', a: 2, b: 3, pa: [l, 0], pb: [0, 0] }, { type: 'P', a: 0, b: 3, pa: [0, 0], pb: [0, 0], ua: [1, 0] }],
  driver: { link: 1 }, q0: [0, 0, 0, r, 0, 0, r + l, 0, 0],
});

test("Chebyshev's formula W = 3n − 2p5 − p4", () => {
  const r = tmm().run(sc => [
    mobility(sc),                                                                                         // slider-crank: 3·3 − 2·4 = 1
    mobility({ links: [{ id: 0, ground: true }, { id: 1 }, { id: 2 }, { id: 3 }], pairs: Array(4).fill({ type: 'R' }) }),          // four-bar: 1
    mobility({ links: [{ id: 0, ground: true }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], pairs: Array(5).fill({ type: 'R' }) }), // five-bar: 2
    mobility({ links: [{ id: 0, ground: true }, { id: 1 }, { id: 2 }], pairs: Array(3).fill({ type: 'R' }) }),                      // triangle: a structure, 0
    mobility({ links: [{ id: 0, ground: true }, { id: 1 }, { id: 2 }], pairs: [{ type: 'R' }, { type: 'R' }, { type: 'H' }] }),     // cam and follower: 3·2 − 2·2 − 1 = 1
  ], sliderCrank(0.1, 0.4));
  assert.deepEqual(r.map(m => m.W), [1, 1, 2, 0, 1]);
});

test('slider-crank: position, speed and acceleration of the slider over a full turn', () => {
  // x = r·cos φ + s,  s = √(l² − r²·sin²φ)
  // v = −ω·(r·sin φ + r²·sin φ·cos φ / s)
  // a = −ω²·(r·cos φ + r²·cos 2φ / s + r⁴·sin²φ·cos²φ / s³)
  const R = 0.1, L = 0.4, W = 30;
  const rows = tmm().run((mech, W) => {
    const m = linkage(mech), out = [];
    for (let k = 0; k <= 24; k++) { const phi = k * Math.PI / 12, st = m.state(phi, W), P = m.point(st, 3, [0, 0]); out.push([phi, st.ok, P.p[0], P.p[1], P.v[0], P.a[0]]); }
    return out;
  }, sliderCrank(R, L), W);
  for (const [phi, ok, x, y, v, a] of rows) {
    const s = Math.sqrt(L * L - (R * Math.sin(phi)) ** 2), sn = Math.sin(phi), cs = Math.cos(phi);
    assert.ok(ok);
    close(x, R * cs + s, 1e-9); close(y, 0, 0, 1e-9);
    close(v, -W * (R * sn + R * R * sn * cs / s), 1e-5, 1e-6);
    close(a, -W * W * (R * cs + R * R * Math.cos(2 * phi) / s + R ** 4 * sn * sn * cs * cs / s ** 3), 1e-4, 1e-3);
  }
});

test('four-bar: the coupler joint lies where the two circles meet, and the branch does not flip over a turn', () => {
  // crank a = 0.1, coupler b = 0.35, rocker c = 0.3, frame d = 0.4 (crank-rocker by Grashof: 0.1 + 0.4 ≤ 0.35 + 0.3)
  const [a, b, c, d] = [0.1, 0.35, 0.3, 0.4];
  const mech = {
    links: [{ id: 0, ground: true }, { id: 1 }, { id: 2 }, { id: 3 }],
    pairs: [{ type: 'R', a: 0, b: 1, pa: [0, 0], pb: [0, 0] }, { type: 'R', a: 1, b: 2, pa: [a, 0], pb: [0, 0] }, { type: 'R', a: 2, b: 3, pa: [b, 0], pb: [c, 0] }, { type: 'R', a: 0, b: 3, pa: [d, 0], pb: [0, 0] }],
    driver: { link: 1 }, q0: [0, 0, 0, a, 0, 1, d, 0, 2],
  };
  const rows = tmm().run(mech => { const m = linkage(mech), out = []; for (let k = 0; k <= 36; k++) { const phi = k * Math.PI / 18, s = m.solveAt(phi); out.push([phi, s.ok, ...m.at(s.q, 3, [mech.pairs[2].pb[0], 0])]); } return out; }, mech);
  for (const [phi, ok, x, y] of rows) {
    assert.ok(ok);
    // independent construction: intersect the circle (B, b) with the circle (D, c), upper branch
    const B = [a * Math.cos(phi), a * Math.sin(phi)], dx = d - B[0], dy = -B[1], f = Math.hypot(dx, dy), k = (b * b - c * c + f * f) / (2 * f), h = Math.sqrt(b * b - k * k);
    close(x, B[0] + dx * k / f - dy * h / f, 1e-8, 1e-9); close(y, B[1] + dy * k / f + dx * h / f, 1e-8, 1e-9);
  }
});

test("Grashof's rule names the kind of four-bar", () => {
  const r = tmm().run(() => [grashof(0.1, 0.35, 0.3, 0.4), grashof(0.4, 0.35, 0.3, 0.1), grashof(0.3, 0.1, 0.35, 0.4), grashof(0.2, 0.25, 0.3, 0.8), grashof(0.1, 0.3, 0.1, 0.3)]);
  assert.deepEqual(r.map(g => [g.ok, g.kind]), [[true, 'crank-rocker'], [true, 'double-crank'], [true, 'double-rocker'], [false, 'triple-rocker'], [true, 'crank-rocker']]);
  assert.equal(r[4].change, true);   // parallelogram: s + l = p + q, a change-point mechanism
});
