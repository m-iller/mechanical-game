// The hydraulic drive on the bench: network built from parts and pipes, coupled to the drive and to the linkage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

const setup = `resetScene(2); const m = insertTemplate('hydro', 0, 0); const pump = m.find(p => p.type === 'hpump'), rv = m.find(p => p.type === 'hrelief'), dv = m.find(p => p.type === 'hvalve'), cy = m.find(p => p.type === 'hcyl'), sl = m[m.length - 1], mot = m[0];`;
const run = body => bench().run(new Function(setup + body));

test('valve closed: the pump flow goes over the relief valve at its setting, the cylinder is locked, the motor carries Δp·q/(2π·η)', () => {
  const r = run(`solve(); const P = hyd.part.get(pump.id), R = hyd.part.get(rv.id), C = hyd.part.get(cy.id);
    return { ok: hyd.ok, lock: lockMsg, Q: P.Q, n: pump.w, pP: P.pP, relief: R.Q, v: C.v, M: P.M, src: power.src.get(mot.id), warn: warnings.map(w => w.code) };`);
  assert.ok(r.ok); assert.equal(r.lock, '');
  close(r.Q, 2e-6 * r.n / 60 * 0.95, 1e-9);                      // displacement × speed × volumetric efficiency
  close(r.relief, r.Q, 1e-4); close(r.v, 0, 0, 1e-9);
  assert.ok(r.pP > 100e5 && r.pP < 104e5);
  close(r.M, r.pP * 2e-6 / (2 * Math.PI) / 0.9, 1e-3); close(r.src.M, r.M, 1e-2);
  assert.ok(r.src.ratio > 0.5 && r.src.ratio < 1.05);
  assert.deepEqual(r.warn, ['w.relief']);
});

test('valve to extend: v = Q/A₁, p ≈ F/A₁ plus line losses, the relief valve stays shut; the slider is pushed along', () => {
  const r = run(`dv.pos = 1; solve(); const P = hyd.part.get(pump.id), R = hyd.part.get(rv.id), C = hyd.part.get(cy.id), x0 = sl.x;
    for (let i = 0; i < 20; i++) { const tk = hydTick(0.02); if (tk.restep) hydroStep(); tmmStep(); }
    return { Q: P.Q, v: C.v, pA: C.pA, pB: C.pB, relief: R.Q, s: cy.s, dx: sl.x - x0, A1: cylA1(cy), ok: tmmInfo.ok, warn: warnings.map(w => w.code) };`);
  close(r.v, r.Q / r.A1, 5e-4); close(r.relief, 0, 0, 1e-7);
  assert.ok(r.pA > 8000 / r.A1 && r.pA < 8000 / r.A1 + 3e5 && r.pB >= 0 && r.pB < 2e5);
  close(r.s, r.v * 0.4 * 1000, 1e-6); close(r.dx, r.s, 1e-5);   // the rod end carries the slider
  assert.deepEqual(r.warn, []);
});

test('at the end of the stroke the cylinder stops and the pressure goes to the relief valve; reversing the valve brings it back against Fb', () => {
  const r = run(`dv.pos = 1; solve(); let steps = 0;
    while (cy.s < cy.st && steps++ < 400) { const tk = hydTick(0.02); if (tk.restep) hydroStep(); }
    const end = { s: cy.s, v: hyd.part.get(cy.id).v, relief: hyd.part.get(rv.id).Q, Q: hyd.part.get(pump.id).Q };
    dv.pos = -1; solve(); const C = hyd.part.get(cy.id), P = hyd.part.get(pump.id);
    return { end, v: C.v, pB: C.pB, pA: C.pA, Q: P.Q, A2: cylA2(cy), A1: cylA1(cy) };`);
  close(r.end.s, 60); close(r.end.v, 0, 0, 1e-12); close(r.end.relief, r.end.Q, 1e-4);
  close(r.v, -r.Q / r.A2, 5e-4);                                 // rod side: faster, by the area ratio
  assert.ok(r.pB > 2000 / r.A2 && r.pB < 2000 / r.A2 + 4e5);
});

test('pipe figures: length along the route, speed, Reynolds number, and a warning for a line that is too thin', () => {
  const r = run(`dv.pos = 1; const q = pipes[1]; solve(); const a = hyd.pipe.get(q.id), L = pipeLen(q);
    q.d = 2; solve(); return { L, Q: a.Q, v: a.v, Re: a.Re, regime: a.regime, warn: warnings.map(w => w.code), v2: hyd.pipe.get(q.id).v };`);
  close(r.L, (19 + 4 + 11) / 1000, 1e-9);                        // 0,−11 → 0,−30 → −4,−30 → −4,−41
  close(r.v, r.Q / (Math.PI * 0.008 ** 2 / 4), 1e-9); close(r.Re, r.v * 0.008 / 46e-6, 1e-9); assert.equal(r.regime, 'laminar');
  assert.ok(r.v2 > 5 && r.warn.includes('w.pipeFast'));
});

test('a gas line on hydraulic ports is refused; a pump with no way out and no relief valve is an error', () => {
  const r = run(`pipes[1].fluid = 'air'; solve(); const gas = warnings.map(w => w.code);
    pipes[1].fluid = 'oil'; removeParts([rv.id]); solve(); return { gas, dead: warnings.map(w => [w.level, w.code]) };`);
  assert.ok(r.gas.includes('w.pipeGas'));
  assert.deepEqual(r.dead[0], ['error', 'w.hydDead']);
});

test('ending a pipe on a pipe puts a tee there and cuts the old pipe in two', () => {
  const r = run(`const n0 = pipes.length, q = pipes[1], hit = pipeAt({ x: 0, y: -20 }, 1), j = pipeTee(hit, 1); solve();
    return { n: pipes.length - n0, type: j.type, at: [j.x, j.y], ends: [q.b, pipes[pipes.length - 1].a].map(id => id === j.id), ok: hyd.ok, relief: hyd.part.get(rv.id).Q, Q: hyd.part.get(pump.id).Q };`);
  assert.deepEqual([r.n, r.type, r.ends], [1, 'hnode', [true, true]]); close(r.at[0], 0, 0, 1e-9); close(r.at[1], -20);
  assert.ok(r.ok); close(r.relief, r.Q, 1e-4);
});

test('save and load keep pipes, valve position and the cylinder extension', () => {
  const saved = run(`dv.pos = 1; cy.s = 25; solve(); return serialize();`);
  assert.equal(saved.v, 5); assert.equal(saved.pipes.length, 7);
  const back = bench().run(d => { load(d); solve(); const cy = parts.find(p => p.type === 'hcyl'); return { n: pipes.length, s: cy.s, len: cy.len, pos: parts.find(p => p.type === 'hvalve').pos, ok: hyd.ok && tmmInfo.ok, v: hyd.part.get(cy.id).v }; }, saved);
  assert.deepEqual([back.n, back.s, back.len, back.pos, back.ok], [7, 25, 101, 1, true]); assert.ok(back.v > 0);
});

test('demo: excavator arm — pump, two valves, two cylinders, boom and stick; the boom cylinder lifts the boom, then the stick valve takes over', () => {
  const r = bench().run(() => {
    resetScene(2); const m = insertTemplate('excavator', 0, 0); solve();
    const boom = m.find(p => p.type === 'tplate'), stick = m.find(p => p.type === 'trocker'), [c1, c2] = m.filter(p => p.type === 'hcyl'), [dv1, dv2] = m.filter(p => p.type === 'hvalve'), pump = m.find(p => p.type === 'hpump');
    const step = n => { for (let i = 0; i < n; i++) { const tk = hydTick(0.02); let ok = tmmStep(); if (!ok) { hydJam(tk.undo); tk.restep = true; tmmStep(); } if (tk.restep) hydroStep(); } };
    const out = { ok: hyd.ok && tmmInfo.ok, lock: lockMsg, W: tmmInfo.groups.map(g => [g.n, g.W]), pipes: pipes.length, warn: warnings.filter(w => w.level !== 'info').map(w => w.code), v1: hyd.part.get(c1.id).v, Q: hyd.part.get(pump.id).Q, A1: cylA1(c1) };
    const a0 = boom.dir, s0 = c1.s; step(25); out.lift = { ds: c1.s - s0, da: boom.dir - a0, ok: tmmInfo.ok, gap: Math.hypot(jointPos(c1, 1).x - jointPos(boom, 2).x, jointPos(c1, 1).y - jointPos(boom, 2).y) };
    dv1.pos = 0; dv2.pos = 1; solve(); const b0 = stick.dir, bd = boom.dir; step(25);
    out.stick = { v1: hyd.part.get(c1.id).v, ds: c2.s > 0, da: stick.dir - b0, boomStill: Math.abs(boom.dir - bd) < 1e-9 };
    return out;
  });
  assert.ok(r.ok); assert.equal(r.lock, ''); assert.deepEqual(r.W, [[4, 0]]); assert.equal(r.pipes, 12); assert.deepEqual(r.warn, []);
  close(r.v1, r.Q / r.A1, 1e-3);
  assert.ok(r.lift.ds > 10 && Math.abs(r.lift.da) > 0.05 && r.lift.gap < 1e-4);
  close(r.stick.v1, 0, 0, 1e-9); assert.ok(r.stick.ds && Math.abs(r.stick.da) > 0.05 && r.stick.boomStill);
});

test('a reducer is counted where pipes of different bore meet; an accumulator on the line changes nothing in steady state', () => {
  const r = bench().run(() => {
    resetScene(1); const tk = addPart('htank', { x: 0, y: 40 }), pm = addPart('hpump', { x: 0, y: 0, q: 10, motor: { rpm: 1500, tq: 50 } }), j = addPart('hnode', { x: 40, y: 0 }), t2 = addPart('htank', { x: 120, y: 40 });
    addPipe(tk, 0, pm, 0, { d: 20, kind: 'suction' }); const a = addPipe(pm, 1, j, 0, { d: 12 }), b = addPipe(j, 0, t2, 0, { d: 8, kind: 'return' }); solve();
    const z = [hyd.pipe.get(a.id).zeta, hyd.pipe.get(b.id).zeta], p0 = hyd.part.get(pm.id).pP;
    const ac = addPart('haccu', { x: 40, y: -30 }); addPipe(j, 0, ac, 0, { d: 8 }); solve();
    return { z, p0, p1: hyd.part.get(pm.id).pP, ok: hyd.ok, q: hyd.pipe.get(pipes[pipes.length - 1].id).Q };
  });
  assert.deepEqual(r.z, [0.3, 0.3]); assert.ok(r.ok); close(r.p1, r.p0, 1e-6); close(r.q, 0, 0, 1e-9);
});
