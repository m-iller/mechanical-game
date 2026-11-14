// Mechanisms on the bench: links as parts, pairs made from where the joints lie, pose solved each step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

test('slider-crank from links: pairs are made by position, W = 1, and the slider follows x = r·cos φ + √(l² − r²·sin²φ)', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, rod, g, sl] = insertTemplate('slidercrank', 0, 0); solve();
    const out = { pairs: pairs.map(q => q.type).sort(), group: tmmInfo.groups.map(g => [g.n, g.p5, g.W, g.drivers]), warn: warnings.filter(w => w.level !== 'info').map(w => w.code), xs: [] };
    for (let k = 0; k <= 36; k++) { clock = k * (Math.PI / 18) / c.w; const ok = tmmStep(); out.xs.push([linkTh(c), ok, sl.x, sl.y]); }
    return out;
  });
  assert.deepEqual(r.pairs, ['P', 'R', 'R']);
  assert.deepEqual(r.group, [[3, 4, 1, 1]]);          // crank, rod, slider; hinge on the frame + 2 hinges + slide
  assert.deepEqual(r.warn, []);
  for (const [phi, ok, x, y] of r.xs) { assert.ok(ok); close(x, 20 * Math.cos(phi) + Math.sqrt(70 * 70 - (20 * Math.sin(phi)) ** 2), 1e-6); close(y, 0, 0, 1e-6); }
});

test('four-bar from links turns a full circle and the rocker stays on its circle about the pivot', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, cp, pv, rk] = insertTemplate('fourbar', 0, 0); solve();
    const out = { group: tmmInfo.groups.map(g => [g.n, g.p5, g.W]), rows: [] };
    for (let k = 0; k <= 72; k++) { clock = k * (Math.PI / 36) / c.w; const ok = tmmStep(), C = jointPos(rk, 1), B = jointPos(c, 1), E = jointPos(cp, 1); out.rows.push([ok, Math.hypot(C.x - 80, C.y), Math.hypot(E.x - B.x, E.y - B.y), Math.hypot(E.x - C.x, E.y - C.y)]); }
    return out;
  });
  assert.deepEqual(r.group, [[3, 4, 1]]);
  for (const [ok, rc, lb, gap] of r.rows) { assert.ok(ok); close(rc, 50, 1e-6); close(lb, 70, 1e-6); close(gap, 0, 0, 1e-5); }
});

test('taking the slider off its pairs leaves the chain with W = 2 and a warning; dropping it back restores W = 1', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, rod, g, sl] = insertTemplate('slidercrank', 0, 0); solve();
    tmmDetach([sl.id]); sl.y += 30; solve();
    const off = { n: pairs.length, W: tmmInfo.groups.map(g => g.W), warn: warnings.map(w => w.code).filter(c => c.startsWith('w.link')) };
    const e = jointPos(rod, 1); sl.x = e.x; sl.y = e.y; tmmAttach([sl.id]); solve();
    return { off, on: { types: pairs.map(q => q.type).sort(), W: tmmInfo.groups.map(g => g.W), warn: warnings.map(w => w.code).filter(c => c.startsWith('w.link')) } };
  });
  assert.deepEqual(r.off, { n: 1, W: [2], warn: ['w.linkFree'] });
  assert.deepEqual(r.on, { types: ['P', 'R', 'R'], W: [1], warn: [] });
});

test('a third link joins an existing hinge through one pair only', () => {
  const r = bench().run(() => {
    resetScene(1);
    const pv = addPart('pivot', { x: 0, y: 0 }), a = addPart('trocker', { x: 0, y: 0, len: 30, dir: 0 }), b = addPart('trocker', { x: 0, y: 0, len: 30, dir: 1 });
    tmmAttach([a.id]); tmmAttach([b.id]); tmmAttach([a.id, b.id]);
    return pairs.map(q => [q.type, q.a, q.b]);
  });
  assert.deepEqual(r, [['R', 1, 2], ['R', 1, 3]]);
});

test('a crank too long for its chain stops the mechanism instead of tearing it', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, cp, pv, rk] = insertTemplate('fourbar', 0, 0); solve();
    c.len = 45; let fails = 0, worst = 0;     // 45 + 80 > 70 + 50: not a Grashof chain any more
    for (let k = 0; k <= 72; k++) { clock = k * (Math.PI / 36) / c.w; if (!tmmStep()) fails++; const E = jointPos(cp, 1), C = jointPos(rk, 1); worst = Math.max(worst, Math.hypot(C.x - 80, C.y) - 50); }
    return { fails, worst };
  });
  assert.ok(r.fails > 0); close(r.worst, 0, 0, 1e-6);
});

test('save and load keep the pairs, and the crank where it stood', () => {
  const b = bench();
  const saved = b.run(() => { resetScene(1); const [c] = insertTemplate('slidercrank', 0, 0); solve(); clock = 0.5 / c.w; tmmStep(); return serialize(); });
  assert.equal(saved.v, 4); assert.equal(saved.pairs.length, 3);
  close(saved.parts[0].dir, Math.PI / 3 + 0.5, 1e-9);
  const back = bench().run(d => { load(d); solve(); return { ok: tmmInfo.ok, n: pairs.length, x: parts[3].x }; }, saved);
  assert.ok(back.ok); assert.equal(back.n, 3);
  const phi = Math.PI / 3 + 0.5; close(back.x, 20 * Math.cos(phi) + Math.sqrt(4900 - (20 * Math.sin(phi)) ** 2), 1e-6);
});

/* ---- one turn of the crank: rates, forces, flywheel ---- */
const R = 20, L = 70, MM = 1e-3;
const sc = phi => { const s = Math.sqrt(L * L - (R * Math.sin(phi)) ** 2), sn = Math.sin(phi), cs = Math.cos(phi); return { x: R * cs + s, d1: -(R * sn + R * R * sn * cs / s), d2: -(R * cs + R * R * Math.cos(2 * phi) / s + R ** 4 * sn * sn * cs * cs / s ** 3) }; };

test('cycle of the slider-crank: stroke H = 2r, and the slider rates match the closed form', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, rod, g, sl] = insertTemplate('slidercrank', 0, 0); solve();
    const cyc = tmmCycle(c), span = cycSpan(cyc, k => cycTravel(cyc, k, sl)), rows = [];
    for (const k of [0, 25, 60, 100, 150]) rows.push([cyc.th0 + k * 2 * Math.PI / cyc.N, ...cycD(cyc, k, i => cycPoint(cyc, i, sl.id, [0, 0])[0])]);
    return { ok: cyc.ok, H: span.max - span.min, rows };
  });
  assert.ok(r.ok); close(r.H, 40, 1e-6);
  for (const [phi, x, d1, d2] of r.rows) { const e = sc(phi); close(x, e.x, 1e-7); close(d1, e.d1, 2e-3, 1e-3); close(d2, e.d2, 2e-3, 2e-2); }
});

test('kinetostatics agrees with virtual work: resisting force F on the slider needs M = F·|v/ω| on the crank; mean M = F·H / 2π', () => {
  // Zhukovsky's lever: the balancing moment times the crank speed equals the power of the applied forces
  const r = bench().run(() => {
    resetScene(1); const [c, rod, g, sl] = insertTemplate('slidercrank', 0, 0); sl.F = 500; solve();
    const cyc = tmmCycle(c), d = cycDynamics(cyc, 0);
    return { th0: cyc.th0, N: cyc.N, Mb: d.Mb, mean: d.mean, mb: c.mb, src: power.src.get(c.id).M };
  });
  for (let k = 0; k < r.N; k += 7) { const e = sc(r.th0 + k * 2 * Math.PI / r.N), want = e.d1 > 0 ? 500 * e.d1 * MM : 0; if (Math.abs(e.d1) > 0.5) close(r.Mb[k], want, 3e-3, 1e-4); }
  close(r.mean, 500 * 0.040 / (2 * Math.PI), 2e-3);
  close(r.mb, r.mean, 1e-12); close(r.src, r.mean, 1e-9);       // and that mean moment is what the crank asks of its motor
});

test('inertia of the slider: M = m·a·(v/ω), with a and v from the closed form', () => {
  const W = 40, m = 2;
  const r = bench().run((W, m) => {
    resetScene(1); const [c, rod, g, sl] = insertTemplate('slidercrank', 0, 0); sl.m = m; solve();
    const cyc = tmmCycle(c), d = cycDynamics(cyc, W); return { th0: cyc.th0, N: cyc.N, Mb: d.Mb, mean: d.mean };
  }, W, m);
  for (let k = 3; k < r.N; k += 11) { const e = sc(r.th0 + k * 2 * Math.PI / r.N); close(r.Mb[k], m * (e.d2 * MM * W * W) * (e.d1 * MM), 5e-3, 2e-4); }
  close(r.mean, 0, 0, 1e-4);                                     // inertia does no work over a full turn
});

test('flywheel sum: excess work between the mean moment and the need, δ = ΔA / (J·ω²)', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, rod, g, sl] = insertTemplate('slidercrank', 0, 0); sl.F = 500; solve();
    const cyc = tmmCycle(c), d = cycDynamics(cyc, 0); return { th0: cyc.th0, N: cyc.N, dA: d.dA, mean: d.mean };
  });
  // the same sum from the closed form, integrated independently on a finer grid
  const n = 7200, h = 2 * Math.PI / n, mean = 500 * 0.040 / (2 * Math.PI); let E = 0, lo = 0, hi = 0;
  for (let i = 0; i < n; i++) { const e = sc(r.th0 + (i + 0.5) * h); E += (mean - (e.d1 > 0 ? 500 * e.d1 * MM : 0)) * h; lo = Math.min(lo, E); hi = Math.max(hi, E); }
  close(r.dA, hi - lo, 1e-2);
});

test('flywheel inertia: a steel disc of the layer thickness, J = ½·m·r²', () => {
  const J = bench().run(() => flyJ({ d: 200 }));
  close(J, 0.5 * (7850 * Math.PI * 0.1 * 0.1 * 0.01) * 0.1 * 0.1, 1e-12);
});

test('demo: crank press — motor, belt, flywheel, crank, rod, ram; the mean moment loads the motor and the flywheel holds the speed', () => {
  const r = bench().run(() => {
    resetScene(3); const m = insertTemplate('press', 0, 0); solve();
    const mot = m[0], c = m.find(p => p.type === 'tcrank'), ram = m[m.length - 1], cyc = tmmCycle(c), w = Math.abs(c.w) * RPM, d = cycDynamics(cyc, w), J = crankJ(c);
    return { lock: lockMsg, warn: warnings.filter(x => x.level !== 'info').map(x => x.code), pairs: pairs.map(q => q.type).sort(), W: tmmInfo.groups.map(g => g.W), ratio: mot.w / c.w,
      mean: d.mean, src: power.src.get(mot.id), H: cycSpan(cyc, k => cycTravel(cyc, k, ram)), J, delta: d.dA / (J * w * w), peak: d.peak };
  });
  assert.equal(r.lock, ''); assert.deepEqual(r.warn, []); assert.deepEqual(r.pairs, ['P', 'R', 'R']); assert.deepEqual(r.W, [1]);
  close(Math.abs(r.ratio), 4, 1e-9);                              // belt 24 → 96
  close(r.H.max - r.H.min, 40, 1e-5);
  close(r.mean, 4000 * 0.25 * 0.040 / (2 * Math.PI), 5e-3);       // work of the force over its part of the stroke, per turn
  close(r.src.M, r.mean / (4 * 0.96), 1e-6);                      // reduced through the belt
  assert.ok(r.src.ratio > 0.4 && r.src.ratio < 1);
  close(r.J, 0.6, 1e-12); assert.ok(r.delta > 0.01 && r.delta < 0.1); assert.ok(r.peak > 5 * r.mean);
});

test('Assur groups: the slider-crank and the four-bar are a driven link plus one dyad; a six-bar is two dyads', () => {
  const r = bench().run(() => {
    resetScene(1); insertTemplate('slidercrank', 0, 0); solve(); const a = tmmAssur(tmmInfo.groups[0]);
    resetScene(1); const [c, cp, pv, rk] = insertTemplate('fourbar', 0, 0);
    // hang a second dyad on the rocker's end: a rod to a slider on a guide
    const e = jointPos(rk, 1), g = addPart('guide', { x: e.x + 60, y: e.y, len: 120, dir: 0 }), sl = addPart('tslider', { x: e.x + 55, y: e.y, dir: 0 }), rod = addPart('trod', { x: e.x, y: e.y, len: 55, dir: 0 });
    tmmAttach([rod.id, sl.id]); solve(); const g6 = tmmInfo.groups[0], b = tmmAssur(g6);
    return { a: a.groups.map(x => [x.cls, x.ids.length]), left: a.left, b: b.groups.map(x => [x.cls, x.ids.length]), W: g6.W, n: g6.n, ok: tmmInfo.ok };
  });
  assert.deepEqual(r.a, [['II', 2]]); assert.deepEqual(r.left, []);
  assert.deepEqual(r.b, [['II', 2], ['II', 2]]); assert.deepEqual([r.W, r.n, r.ok], [1, 5, true]);
});
