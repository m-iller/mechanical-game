// Sources and consumers: engine, generator, heater, hoist, weight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

test('demo: engine → flywheel → generator → heater. The speed settles where the engine curve meets the generator; the heater gets η·M·ω', () => {
  const r = bench().run(() => {
    resetScene(3); const [e, sh, f, g, h] = insertTemplate('genset', 0, 0); solve();
    const c = engineOf(e), src = power.src.get(e.id), G = elec.gen.get(g.id), H = elec.heat.get(h.id), T0 = h.T;
    for (let i = 0; i < 50; i++) ioTick(0.02);
    return { lock: lockMsg, warn: warnings.map(w => w.code), n: e.w, Me: c.Me * 0.7, M: src.M, Pm: G.Pm, Pel: G.Pel, Ph: H.P, Tss: H.Tss, tau: H.tau, dT: h.T - T0, J: crankJ(e), wire: hyd.pipe.get(pipes[0].id) };
  });
  assert.equal(r.lock, ''); assert.deepEqual(r.warn, []);
  const x = r.n / 5000, Mn = 30000 / (3000 * Math.PI / 30 * 0.9);
  close(r.Me * (0.75 + x - x * x), Mn * r.n / 3000, 1e-6);       // on both curves at once
  close(r.M, Mn * r.n / 3000, 1e-6); close(r.Pm, r.M * r.n * Math.PI / 30, 1e-9);
  close(r.Pel, 0.9 * r.Pm, 1e-12); close(r.Ph, r.Pel, 1e-12);
  close(r.Tss, 20 + r.Pel / 100, 1e-12); close(r.tau, 20 * 460 / 100, 1e-12);
  close(r.dT, r.Pel / (20 * 460) * 1.0, 2e-2);                   // first second: nearly all the power still goes into the mass
  close(r.J, 0.15, 1e-12); assert.ok(r.wire.el && r.wire.Q > 0);
});

test('a generator with nothing wired to it takes only its idle losses, and says so', () => {
  const r = bench().run(() => { resetScene(3); const [e, sh, f, g, h] = insertTemplate('genset', 0, 0); pipes = []; solve(); return { Pel: elec.gen.get(g.id).Pel, M: power.src.get(e.id).M, Mnom: engineOf(e).Me, warn: warnings.map(w => w.code), n: e.w }; });
  assert.equal(r.Pel, 0); assert.ok(r.M < 0.1 * r.Mnom && r.n > 5000); assert.ok(r.warn.includes('w.genOpen'));
});

test('a heater as a friction brake turns all the shaft power into heat', () => {
  const r = bench().run(() => {
    resetScene(2); const m = addPart('spur', { x: 0, y: 0, layer: 0, z: 20, motor: { rpm: 300, tq: 20 } }), h = addPart('heater', { x: 0, y: 0, layer: 1, hm: 1, hk: 2, load: { kind: 'const', tq: 5, n: 1000, eta: 1 } });
    addPart('shaft', { x: 0, y: 0, l0: 0, l1: 1 }); solve(); return { P: elec.heat.get(h.id).P, Tss: elec.heat.get(h.id).Tss, warn: warnings.map(w => w.code) };
  });
  close(r.P, 5 * 300 * Math.PI / 30, 1e-9); close(r.Tss, 20 + r.P / 2, 1e-12); assert.deepEqual(r.warn, []);
});

test('hoist: M = m·g·D/(2·η), lifting speed v = ω·D/2; a weight on a rope drives with m·g·D/2', () => {
  const r = bench().run(() => {
    resetScene(2); const w = addPart('weight', { x: 0, y: 0, layer: 0, d: 100, m: 40 }), h = addPart('hoist', { x: 0, y: 0, layer: 1, d: 50, m: 60 });
    addPart('shaft', { x: 0, y: 0, l0: 0, l1: 1 }); solve();
    return { tq: w.motor.tq, L: power.load.get(h.id), src: power.src.get(w.id), n: w.w };
  });
  close(r.tq, 40 * 9.81 * 0.05, 1e-12); close(r.L.M, 60 * 9.81 * 0.025 / 0.95, 1e-12);
  close(r.src.M, r.L.M, 1e-9); assert.ok(r.n > 0);               // 19.6 N·m available against 15.5 N·m: it runs up to the speed limit
});

test('a wire to a hydraulic port is refused', () => {
  const r = bench().run(() => { resetScene(1); const g = addPart('generator', { x: 0, y: 0 }), t2 = addPart('htank', { x: 60, y: 0 }); addPipe(g, 0, t2, 0, { fluid: 'el' }); solve(); return warnings.map(w => [w.level, w.code]); });
  assert.ok(r.some(w => w[0] === 'error' && w[1] === 'w.portDomain'));
});

test('engine flywheel: the excess work of a four-cylinder engine and the warning without a flywheel', () => {
  const r = bench().run(() => { resetScene(3); const [e, sh, f] = insertTemplate('genset', 0, 0); solve(); const sw = engineSwing(e), ok = warnings.map(w => w.code); f.J = 1e-5; solve(); return { dA: sw.dA, mean: sw.tq.mean, ok, bad: warnings.map(w => w.code) }; });
  assert.ok(r.dA > 0.3 * r.mean && r.dA < 6 * r.mean);            // a fraction of the work of one firing interval (π rad × mean torque)
  assert.deepEqual(r.ok, []); assert.ok(r.bad.includes('w.fluct'));
});
