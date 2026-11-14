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
