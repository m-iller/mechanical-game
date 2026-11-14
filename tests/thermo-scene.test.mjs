// Gas-turbine and steam plants on the bench.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

test('demo: gas-turbine set — the bench agrees with the Brayton block, the shaft settles where turbine power less compressor power meets the generator', () => {
  const r = bench().run(() => {
    resetScene(3); const [c, sh, tb, g, cc, st, h] = insertTemplate('gasturbine', 0, 0); solve();
    const C = thermo.part.get(c.id), Tb = thermo.part.get(tb.id), ref = brayton({ T1: 288.15, pr: 8, T3: 1273.15, dpc: 0.03, etaC: 0.85, etaT: 0.88, m: 2 }), stg = stageOfTurbine(tb), G = elec.gen.get(g.id);
    return { lock: lockMsg, warn: warnings.map(w => w.code), C, Tb, ref, n: tb.w, nc: c.w, stg, Pel: G.Pel, src: power.src.get(tb.id), lines: pipes.filter(q => q.fluid !== 'el').map(q => hyd.pipe.get(q.id)), gas: hyd.gas, pmax: hyd.pmax };
  });
  assert.equal(r.lock, ''); assert.deepEqual(r.warn, []);
  close(r.C.T2, r.ref.T2, 1e-9); close(r.C.Pc, r.ref.Pc, 1e-9);
  close(r.Tb.Pt, r.ref.Pt, 2e-2); assert.ok(r.Tb.Pt < r.ref.Pt);            // a little less: the lines take some pressure
  close(r.C.eta, r.ref.eta, 3e-2); assert.ok(r.C.eta > 0.25 && r.C.eta < 0.33);
  const Pnet = r.Tb.Pt - r.C.Pc; close(450000 / 0.95 * (r.n / 6000) ** 2, Pnet, 1e-4); close(r.n, r.nc, 1e-12);
  close(r.Pel, 0.95 * Pnet, 1e-4); close(r.src.P, r.Tb.Pt, 1e-4);
  close(r.stg.u, Math.abs(r.n) * Math.PI / 30 * 0.35, 1e-9); assert.ok(r.stg.eta > 0.6 && r.stg.eta < 0.9 && r.stg.z === 3);
  assert.ok(r.gas && r.lines.length === 3 && r.lines.every(l => l && l.gas && l.Q > 0 && l.v > 1)); assert.ok(r.pmax > 7.5e5);
});

test('gas lines: density from the gas law, and a thin line both warns and costs the turbine power', () => {
  const r = bench().run(() => {
    resetScene(3); const [c, sh, tb] = insertTemplate('gasturbine', 0, 0); solve(); const q = pipes[0], a = hyd.pipe.get(q.id), P0 = thermo.part.get(tb.id).Pt;
    q.d = 30; solve(); return { rho: a.fl.rho, v: a.v, T2: thermo.part.get(c.id).T2, P0, P1: thermo.part.get(tb.id).Pt, warn: warnings.map(w => w.code) };
  });
  close(r.rho, 8e5 / (287 * r.T2), 1e-9); close(r.v, 2 / r.rho / (Math.PI * 0.16 ** 2 / 4), 1e-9);
  assert.ok(r.P1 < 0.9 * r.P0 && r.warn.includes('w.pipeFast'));
});

test('a turbine at the wrong speed for its diameter is flagged with the best speed ratio', () => {
  const r = bench().run(() => { resetScene(3); const [c, sh, tb] = insertTemplate('gasturbine', 0, 0); tb.dm = 200; tb.zst = 1; solve(); return warnings.map(w => w.code); });
  assert.ok(r.includes('w.stageRatio'));
});

test('steam plant: the bench agrees with the Rankine block; the turbine drives the generator', () => {
  const r = bench().run(() => {
    resetScene(2); const [b, tb, sh, g, cd, fp, h] = insertTemplate('steam', 0, 0); solve();
    const ref = rankine({ pb: 30e5, Tb: 623.15, pc: 10e3, etaT: 0.85, etaP: 0.8, m: 1 });
    return { lock: lockMsg, warn: warnings.filter(w => w.level !== 'info').map(w => w.code), B: thermo.part.get(b.id), Tb: thermo.part.get(tb.id), ref, n: tb.w, Pel: elec.gen.get(g.id).Pel, lines: pipes.filter(q => q.fluid !== 'el').map(q => !!hyd.pipe.get(q.id)) };
  });
  assert.equal(r.lock, ''); assert.deepEqual(r.warn, []);
  close(r.B.eta, r.ref.eta, 1e-12); close(r.Tb.Pt, r.ref.Pt, 1e-12); assert.ok(r.B.eta > 0.25 && r.B.eta < 0.33 && r.B.x4 > 0.86);
  close(800000 / 0.95 * (r.n / 3000) ** 2, r.ref.Pt, 1e-4); close(r.Pel, 0.95 * r.ref.Pt, 1e-4);
  assert.deepEqual(r.lines, [true, true, true, true]);
});

test('a compressor with nothing after it only loads its shaft', () => {
  const r = bench().run(() => {
    resetScene(2); const m = addPart('spur', { x: 0, y: 0, layer: 0, z: 20, motor: { rpm: 3000, tq: 500 } }), c = addPart('tcomp', { x: 0, y: 0, layer: 1, pr: 4, mf: 0.5 }); addPart('shaft', { x: 0, y: 0, l0: 0, l1: 1 }); solve();
    return { P: power.src.get(m.id).P, Pc: thermo.part.get(c.id).Pc, warn: warnings.map(w => w.code) };
  });
  close(r.P, r.Pc, 1e-6); assert.ok(r.warn.includes('w.noTurbine'));
});

test('with a design speed on the compressor the flow follows the shaft: lighter load, faster shaft, more air, more power', () => {
  const r = bench().run(() => {
    resetScene(3); const [c, sh, tb, g] = insertTemplate('gasturbine', 0, 0); c.nd = 6000; solve();
    const one = () => ({ n: c.w, m: thermo.part.get(c.id).m, Pnet: thermo.part.get(tb.id).Pt - thermo.part.get(c.id).Pc, Pm: elec.gen.get(g.id).Pm, warn: warnings.map(w => w.code) });
    const a = one(); g.Pn = 350000; tb.nmax = 9000; solve(); return [a, one()];   // room under the speed limit, or the governor would hold the shaft there
  });
  for (const x of r) { close(x.m, 2 * x.n / 6000, 1e-9); close(x.Pm, x.Pnet, 2e-2); }
  assert.deepEqual(r[0].warn, []);                               // off the design point the lines run fast and the heater gets more: those warnings are right
  assert.ok(r[1].n > r[0].n * 1.2 && r[1].m > r[0].m * 1.2);
});
