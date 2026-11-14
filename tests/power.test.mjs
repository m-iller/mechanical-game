// Power balance of drive trains: operating point of a motor against the loads reduced to its shaft, and the power flow back from the loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

const M4 = { kind: 'induction', P: 4000, n: 1430, ks: 2.0, km: 2.2 };
const MNOM = 4000 / (1430 * Math.PI / 30);   // 26.71 N·m = 9550·4/1430

test('motor and machine on one shaft: nominal load gives nominal speed, torque and power', () => {
  const r = bench().run(m => {
    resetScene(2);
    const a = addPart('emotor', { x: 0, y: 0, layer: 0, motor: m }), x = addPart('machine', { x: 0, y: 0, layer: 1, load: { kind: 'const', tq: m.P / (m.n * Math.PI / 30), n: 1000, eta: 0.8 } });
    addPart('shaft', { x: 0, y: 0, l0: 0, l1: 1 }); solve();
    return { n: a.w, src: power.src.get(a.id), ld: power.load.get(x.id), lock: lockMsg, warn: warnings.map(w => w.code) };
  }, M4);
  assert.equal(r.lock, ''); close(r.n, 1430, 1e-6);
  close(r.src.M, MNOM, 1e-6); close(r.src.P, 4000, 1e-6); close(r.src.ratio, 1, 1e-6);
  close(r.ld.Pout, 3200, 1e-6);                 // the machine's own efficiency 0.8
  assert.deepEqual(r.warn, []);
});

test('through a reducer: M_motor = M_load / (i·η), load speed = motor speed / i', () => {
  // 12 → 36 teeth, i = 3, mesh efficiency 0.98 (typical value used by the bench)
  const r = bench().run(m => {
    resetScene(1);
    const a = addPart('spur', { x: 0, y: 0, z: 12, motor: m }), g = addPart('spur', { x: 48, y: 0, z: 36, load: { kind: 'const', tq: 60, n: 1000, eta: 1 } });
    solve();
    const s = power.src.get(a.id);
    return { M: s.M, onCurve: sourceOf(a.motor).M(s.w), na: a.w, ng: g.w, tqGear: torqueAt(g), tqMotor: torqueAt(a) };
  }, M4);
  close(r.M, 60 / (3 * 0.98), 1e-6);
  close(r.onCurve, r.M, 1e-6);                  // the point lies on the motor's characteristic
  close(r.ng, -r.na / 3, 1e-9);
  assert.ok(Math.abs(r.na) > 1430 && Math.abs(r.na) < 1500);   // lighter than nominal: between nominal and synchronous speed
  close(r.tqGear, 60, 1e-6); close(r.tqMotor, r.M, 1e-6);
});

test('ideal speed source with a fan: P = M₀·(n/n₀)²·ω', () => {
  const r = bench().run(() => {
    resetScene(1);
    const a = addPart('pulley', { x: 0, y: 0, d: 40, motor: { rpm: 500, tq: 2 } }), f = addPart('pulley', { x: 100, y: 0, d: 20, load: { kind: 'quad', tq: 1.5, n: 1000, eta: 1 } });
    addLink('belt', [a.id, f.id]); solve();
    return { nf: f.w, ld: power.load.get(f.id), src: power.src.get(a.id), warn: warnings.map(w => w.code) };
  });
  close(r.nf, 1000);
  close(r.ld.M, 1.5); close(r.ld.P, 1.5 * 1000 * Math.PI / 30);
  close(r.src.P, r.ld.P / 0.96, 1e-9);          // belt: √0.96 at each pulley
  close(r.src.M, 3 / 0.96, 1e-9);
  assert.deepEqual(r.warn, ['w.overload']);     // 3.1 N·m asked of a source rated 2 N·m
});

test('a load beyond the breakdown torque stalls the train and raises an error', () => {
  const r = bench().run(m => {
    resetScene(1);
    const a = addPart('spur', { x: 0, y: 0, z: 20, motor: m }), g = addPart('spur', { x: 40, y: 0, z: 20, load: { kind: 'const', tq: 80, n: 1000, eta: 1 } });
    solve(); return { na: a.w, ng: g.w, warn: warnings.map(w => [w.level, w.code]) };
  }, M4);
  assert.equal(r.na, 0); assert.equal(r.ng, 0);
  assert.deepEqual(r.warn[0], ['error', 'w.stall']);
});

test('two branches: the motor carries the sum of both loads', () => {
  const r = bench().run(() => {
    resetScene(1);
    const a = addPart('spur', { x: 0, y: 0, z: 20, motor: { rpm: 300, tq: 50 } });
    addPart('spur', { x: 40, y: 0, z: 20, load: { kind: 'const', tq: 4, n: 1000, eta: 1 } });
    addPart('spur', { x: -60, y: 0, z: 40, load: { kind: 'const', tq: 10, n: 1000, eta: 1 } });
    solve(); return power.src.get(a.id).M;
  });
  close(r, 4 / 0.98 + 10 / (2 * 0.98), 1e-9);
});

test('two equal motors on one shaft share the load equally and run nearer to synchronous speed', () => {
  const r = bench().run(m => {
    const one = () => { resetScene(3); const a = addPart('emotor', { x: 0, y: 0, layer: 0, motor: m }); addPart('machine', { x: 0, y: 0, layer: 1, load: { kind: 'const', tq: 26.71, n: 1000, eta: 1 } }); return a; };
    const a1 = one(); addPart('shaft', { x: 0, y: 0, l0: 0, l1: 1 }); solve(); const single = a1.w;
    const a = one(), b = addPart('emotor', { x: 0, y: 0, layer: 2, motor: m }); addPart('shaft', { x: 0, y: 0, l0: 0, l1: 2 }); solve();
    return { single, na: a.w, nb: b.w, ra: power.src.get(a.id).ratio, rb: power.src.get(b.id).ratio, lock: lockMsg };
  }, M4);
  assert.equal(r.lock, ''); close(r.na, r.nb, 1e-9);
  close(r.ra, 0.5, 1e-3); close(r.rb, 0.5, 1e-3);
  assert.ok(r.na > r.single && r.na < 1500);
});

test('a disengaged clutch takes the load off the motor', () => {
  const r = bench().run(m => {
    resetScene(3);
    const a = addPart('emotor', { x: 0, y: 0, layer: 0, motor: m }); addPart('shaft', { x: 0, y: 0, l0: 0, l1: 1 });
    const c = addPart('clutch', { x: 0, y: 0, layer: 1 }); addPart('shaft', { x: 0, y: 0, l0: 1, l1: 2 });
    const x = addPart('machine', { x: 0, y: 0, layer: 2, load: { kind: 'const', tq: 26.71, n: 1000, eta: 1 } });
    solve(); const on = { n: a.w, M: power.src.get(a.id).M };
    c.on = false; solve();
    return { on, off: { n: a.w, M: power.src.get(a.id).M, nx: x.w }, warn: warnings.map(w => w.code) };
  }, M4);
  close(r.on.n, 1430, 1e-4); close(r.off.n, 1500, 1e-9); assert.equal(r.off.M, 0); assert.equal(r.off.nx, 0);
  assert.deepEqual(r.warn, ['w.idleLoad']);
});

test('without loads the old estimate stays: all motor power at the output', () => {
  const r = bench().run(() => { resetScene(2); const m = insertTemplate('reducer', 0, 0); solve(); return { has: power.has, tq: torqueAt(m[4]), w: m[4].w }; });
  assert.equal(r.has, false); close(r.tq * r.w, 2 * 120 * 0.98 * 0.98);
});

test('undercut note for spur gears under 17 teeth (z_min = 2/sin²20° = 17.1)', () => {
  const r = bench().run(() => { resetScene(1); addPart('spur', { x: 0, y: 0, z: 16 }); addPart('spur', { x: 200, y: 0, z: 17 }); solve(); return warnings.map(w => [w.code, w.ids]); });
  assert.deepEqual(r, [['w.undercut', [1]]]);
});

test('demo: motor → belt → planetary → chain → conveyor; total ratio and torque at the motor', () => {
  // i = (60/24)·(1 + 42/12)·(24/12) = 2.5·4.5·2 = 22.5
  // η = 0.96 (belt) · 0.98 (sun–planet; the ring mesh lies off the power path the bench walks) · 0.95 (chain)
  const r = bench().run(() => {
    resetScene(5); const m = insertTemplate('conveyor', 0, 0); solve();
    const a = m[0], x = m[m.length - 1];
    return { lock: lockMsg, i: a.w / x.w, M: power.src.get(a.id).M, n: a.w, L: power.load.get(x.id), warn: warnings.filter(w => w.level !== 'info').map(w => w.code) };
  });
  assert.equal(r.lock, '');
  close(Math.abs(r.i), 22.5, 1e-9);
  close(r.L.etaPath, 0.96 * 0.98 * 0.95, 1e-9);
  close(r.M, 45 / (22.5 * 0.96 * 0.98 * 0.95), 1e-9);
  assert.ok(r.n > 1320 && r.n < 1500);            // 2.24 N·m asked of a 2.68 N·m motor
  assert.deepEqual(r.warn, []);
});

test('demo: motor and fan settle on the fan curve', () => {
  const r = bench().run(() => { resetScene(2); const m = insertTemplate('fan', 0, 0); solve(); return { n: m[0].w, M: power.src.get(m[0].id).M, Mnom: power.src.get(m[0].id).Mnom }; });
  close(r.M, 2.4 * (r.n / 1320) ** 2, 1e-9);     // on the fan law
  assert.ok(r.M < r.Mnom * 1.05 && r.n > 1300 && r.n < 1500);
});
