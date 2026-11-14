// Regression tests for the drive-train kinematics. Expected values are textbook ratios, named in each test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

const fresh = () => { const b = bench(); b.run(() => { parts = []; links = []; nextId = 1; layerCount = 4; }); return b; };

test('two-stage spur reducer: i = (z2/z1)·(z4/z3), output turns the same way as the input', () => {
  // 12→36 and 14→42 give i = 3·3 = 9; two external meshes reverse twice
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('reducer', 0, 0); solve(); return { w: m[4].w, lock: lockMsg }; });
  assert.equal(r.lock, '');
  close(r.w, 120 / 9);
});

test('planetary stage, ring held: carrier speed by the Willis formula ωc = ωs·zs/(zs+zr)', () => {
  // Willis: (ωs − ωc)/(ωr − ωc) = −zr/zs; with ωr = 0, zs = 12, zr = 42: ωc = 120·12/54
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('planetary', 0, 0); solve(); return { wc: m[0].w, wp: m[3].w, lock: lockMsg }; });
  assert.equal(r.lock, '');
  close(r.wc, 120 * 12 / 54);
  // planet relative to the carrier: (ωp − ωc) = −(ωs − ωc)·zs/zp
  close(r.wp - r.wc, -(120 - r.wc) * 12 / 15);
});

test('planetary assembly condition: (zs + zr)/n must be whole, otherwise the teeth do not line up', () => {
  // zs = 13, zr = 43, planets 15 (coaxial: 13 + 2·15 = 43), three planets: 56/3 is not whole
  const b = fresh();
  const lock = b.run(() => {
    const c = addPart('carrier', { x: 0, y: 0, layer: 0, r: 28, n: 3 });
    addPart('spur', { x: 0, y: 0, layer: 1, z: 13, motor: { rpm: 60, tq: 2 } }); addPart('ring', { x: 0, y: 0, layer: 1, z: 43, held: true });
    for (let k = 0; k < 3; k++) addPart('spur', { x: 0, y: 0, layer: 1, z: 15, mount: { c: c.id, k } });
    solve(); return lockMsg;
  });
  assert.match(lock, /teeth do not line up/);
});

test('worm pair: i = z2/z1', () => {
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('worm', 0, 0); solve(); return { w: m[0].w, lock: lockMsg }; });
  assert.equal(r.lock, '');
  close(Math.abs(r.w), 240 / 30);
});

test('a worm of up to four starts cannot be driven by its wheel (self-locking)', () => {
  const b = fresh();
  const lock = b.run(() => { const m = insertTemplate('worm', 0, 0); delete m[1].motor; m[0].motor = { rpm: 10, tq: 2 }; solve(); return lockMsg; });
  assert.match(lock, /self-locking/);
});

test('belt drive: speeds inversely proportional to pulley diameters, same direction', () => {
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('belt', 0, 0); solve(); return m.map(p => p.w); });
  close(r[1], 120 * 24 / 60); close(r[2], 120 * 24 / 30);
});

test('crossed belt reverses the driven pulley', () => {
  const b = fresh();
  const w = b.run(() => {
    const a = addPart('pulley', { x: 0, y: 0, d: 20, motor: { rpm: 100, tq: 1 } }), c = addPart('pulley', { x: 90, y: 0, d: 40 });
    addLink('belt', [a.id, c.id], true); solve(); return c.w;
  });
  close(w, -50);
});

test('chain drive: i = z2/z1', () => {
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('chain', 0, 0); solve(); return m[1].w; });
  close(r, 60);
});

test('rack and pinion: v = ω·d/2', () => {
  // z = 20, m = 2 → d = 40 mm; 30 rpm = π rad/s → v = 20π mm/s
  const b = fresh();
  const v = b.run(() => { const m = insertTemplate('rack', 0, 0); solve(); return Math.abs(speedOf(m[1])); });
  close(v, 20 * Math.PI);
});

test('bevel pair: i = z2/z1', () => {
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('bevel', 0, 0); solve(); return [m[1].w, m[2].w]; });
  close(Math.abs(r[0]), 120); close(Math.abs(r[1]), 120);
});

test('differential: ωa + ωb = 2·ωh; one shaft braked doubles the other', () => {
  const b = fresh();
  const r = b.run(() => {
    const m = insertTemplate('diff', 0, 0); solve();
    const open = { h: m[1].w, a: m[1].a.w, b: m[1].b.w };
    m[3].on = true; solve();
    return { open, braked: { h: m[1].w, a: m[1].a.w, b: m[1].b.w } };
  });
  close(Math.abs(r.open.h), 120 * 16 / 40);
  close(r.open.a, r.open.h); close(r.open.b, r.open.h);
  close(r.braked.a, 0, 0, 1e-9); close(r.braked.b, 2 * r.braked.h);
});

test('clutch: engaged passes the speed, disengaged leaves the driven shaft at rest', () => {
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('clutch', 0, 0); solve(); const on = m[4].w; m[2].on = false; solve(); return [on, m[4].w]; });
  close(r[0], 120); assert.equal(r[1], 0);
});

test('three gears in a triangle jam', () => {
  const b = fresh();
  const lock = b.run(() => {
    addPart('spur', { x: 0, y: 0, z: 20, motor: { rpm: 60, tq: 1 } }); addPart('spur', { x: 40, y: 0, z: 20 });
    addPart('spur', { x: 20, y: Math.sqrt(40 * 40 - 20 * 20), z: 20 }); solve(); return lockMsg;
  });
  assert.match(lock, /^Locked/);
});

test('the opening example runs without a lock', () => {
  const b = fresh();
  const r = b.run(() => { example(); solve(); return { lock: lockMsg, out: byId(outId).w }; });
  assert.equal(r.lock, '');
  close(r.out, 240 * 24 / 60 * 12 / 54);   // belt 24→60, then the planetary stage with the ring held
});

test('efficiency chain: output power = input power × product of stage efficiencies', () => {
  const b = fresh();
  const r = b.run(() => { const m = insertTemplate('reducer', 0, 0); solve(); return { tq: torqueAt(m[4]), w: m[4].w }; });
  // P_in = 2 N·m · 120 rpm; two spur meshes at 0.98 each
  close(r.tq * r.w, 2 * 120 * 0.98 * 0.98);
});
