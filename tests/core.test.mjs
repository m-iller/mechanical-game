// Tests for the DOM-free core modules: units, explanations, warnings, ports, migrations, load characteristics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close, CORE } from './load.mjs';

const core = () => bench(CORE);

test('units: SI in, interface units out', () => {
  const r = core().run(() => [toSI(1500, 'rpm'), toSI(160, 'bar'), toSI(20, 'degC'), fromSI(0.001, 'L/min'), fromSI(2500, 'kW'), toSI(25, 'mm')]);
  close(r[0], 157.0796327, 1e-9);   // 1500 rpm = 50π rad/s
  close(r[1], 16e6); close(r[2], 293.15); close(r[3], 60000 * 0.001); close(r[4], 2.5); close(r[5], 0.025);
});

test('units: formatting picks the unit a person would write', () => {
  const r = core().run(() => [fmtU(4000, 'power'), fmtU(750, 'power'), fmtU(16e6, 'pressure'), fmtU(2.5e5, 'pressure'), fmtU(157.0796, 'rpm'), fmtNum(-0.012345), fmtNum(123456), fmtU(0.5, 'deg', 3)]);
  assert.deepEqual(r, ['4 kW', '750 W', '16 MPa', '2.5 bar', '1500 rpm', '−0.0123', '123456', '28.6°']);
});

test('explain: a figure carries its formula, the numbers put into it and its assumptions', () => {
  const lines = core().run(() => exLines(ex('M', 4000 / toSI(1430, 'rpm'), 'Nm', 'M = P / ω', [['P', 4000, 'kW'], ['ω', toSI(1430, 'rpm'), 'rpm']], ['steady state'], 'M = 9550·P[kW]/n[rpm]')));
  assert.deepEqual(lines, ['M = P / ω', 'P = 4 kW;  ω = 1430 rpm', 'M = 26.71 N·m', '• steady state', '[M = 9550·P[kW]/n[rpm]]']);
});

test('warnings: checks are collected, sorted by severity, and a failing check does not hide the others', () => {
  const r = core().run(() => {
    addCheck('a', () => [{ level: 'info', code: 'x', text: 'note' }]);
    addCheck('b', () => { throw new Error('boom'); });
    addCheck('c', s => s.n > 1 ? [{ code: 'y', text: 'too many', ids: [7] }] : []);
    return runChecks({ n: 2 });
  });
  assert.deepEqual(r.map(w => [w.level, w.code]), [['error', 'check.failed'], ['warn', 'y'], ['info', 'x']]);
  assert.deepEqual(r[1].ids, [7]);
});

test('ports: only the same domain joins; a gas line on a hydraulic port is refused', () => {
  const r = core().run(() => [
    canConnect(port('a', 'rot'), port('b', 'rot')), canConnect(port('a', 'rot'), port('b', 'hyd')),
    canConnect(port('a', 'hyd', { medium: 'oil' }), port('b', 'hyd', { medium: 'air' })), canConnect(port('a', 'hyd', { medium: 'oil' }), port('b', 'hyd', { medium: 'water' })),
    portPower(port('a', 'hyd'), 16e6, 1e-3),
  ]);
  assert.deepEqual(r.slice(0, 4), [{ ok: true, code: '' }, { ok: false, code: 'port.domain' }, { ok: false, code: 'port.phase' }, { ok: true, code: 'port.medium' }]);
  close(r[4], 16000);   // 160 bar × 60 L/min = 16 kW
});

test('migrate: a v2 scene comes up to the current version with layer objects, motor kinds and an empty pair list', () => {
  const v2 = { v: 2, nextId: 3, layerCount: 3, outId: 2, hidden: [1], links: [], parts: [{ id: 1, name: 'G1', type: 'spur', x: 0, y: 0, layer: 0, z: 12, motor: { rpm: 120, tq: 2 } }, { id: 2, name: 'G2', type: 'spur', x: 36, y: 0, layer: 0, z: 24 }] };
  const d = core().run(s => migrate(s), v2);
  assert.equal(d.v, 4); assert.deepEqual(d.pairs, []);
  assert.deepEqual(d.layers, [{ name: '', visible: true, locked: false }, { name: '', visible: false, locked: false }, { name: '', visible: true, locked: false }]);
  assert.deepEqual(d.parts[0].motor, { kind: 'speed', rpm: 120, tq: 2 });
  assert.equal(d.layerCount, undefined); assert.equal(d.outId, 2);
  assert.equal(core().run(() => migrate({ v: 99, parts: [] })), null);
});

/* ---- sources and loads ---- */
const motor4kW = { kind: 'induction', P: 4000, n: 1430, ks: 2.0, km: 2.2 };   // AIR100L4-like catalogue values

test('induction motor: nominal torque M = 9550·P[kW]/n[rpm], and the Kloss curve passes through the nominal point', () => {
  const r = core().run(m => { const s = sourceOf(m); return { Mnom: s.Mnom, atNom: s.M(s.wNom), w0: s.w0, Mk: s.Mk, atSk: s.M(s.w0 * (1 - s.sk)), start: s.M(0), sync: s.M(s.w0) }; }, motor4kW);
  close(r.Mnom, 9550 * 4 / 1430, 1e-4);         // 26.71 N·m
  close(r.atNom, r.Mnom, 1e-9);                 // sk = s_nom(λ + √(λ² − 1)) makes Kloss exact at s_nom
  close(r.w0, 1500 * Math.PI / 30);
  close(r.atSk, 2.2 * r.Mnom); close(r.start, 2.0 * r.Mnom); close(r.sync, 0, 0, 1e-12);
});

test('operating point: induction motor on a constant nominal load runs at its nominal speed', () => {
  const r = core().run(m => { const s = sourceOf(m); return { op: operatingPoint(s, loadOf({ kind: 'const', tq: s.Mnom })), wNom: s.wNom }; }, motor4kW);
  close(r.op.w, r.wNom, 1e-6); close(r.op.ratio, 1, 1e-6); assert.equal(r.op.stalled, false); assert.equal(r.op.starts, true);
  close(r.op.slip, 1 - 1430 / 1500, 1e-6);
});

test('operating point: a load above the breakdown torque stalls the motor', () => {
  const r = core().run(m => { const s = sourceOf(m); return operatingPoint(s, loadOf({ kind: 'const', tq: 2.5 * s.Mnom })); }, motor4kW);
  assert.equal(r.stalled, true); assert.equal(r.w, 0); assert.equal(r.starts, false);
});

test('operating point: DC motor with a linear load, closed form ω = Ms / (Ms/ω0 + c)', () => {
  // M = Ms(1 − ω/ω0) meets M_L = c·ω
  const m = { kind: 'dc', P: 1000, n: 3000, ks: 4 }, load = { kind: 'linear', tq: 2, n: 3000 };
  const r = core().run((m, l) => { const s = sourceOf(m); return { op: operatingPoint(s, loadOf(l)), Ms: s.M(0), w0: s.w0 }; }, m, load);
  const c = 2 / (3000 * Math.PI / 30);
  close(r.op.w, r.Ms / (r.Ms / r.w0 + c), 1e-9);
  close(r.w0, 3000 * Math.PI / 30 / (1 - 1 / 4));
});

test('operating point: DC motor with a fan load M ∝ ω², root of the quadratic', () => {
  const m = { kind: 'dc', P: 1000, n: 3000, ks: 4 }, load = { kind: 'quad', tq: 5, n: 3000 };
  const r = core().run((m, l) => { const s = sourceOf(m); return { w: operatingPoint(s, loadOf(l)).w, Ms: s.M(0), w0: s.w0 }; }, m, load);
  const a = 5 / (3000 * Math.PI / 30) ** 2, b = r.Ms / r.w0;   // a·ω² + b·ω − Ms = 0
  close(r.w, (-b + Math.sqrt(b * b + 4 * a * r.Ms)) / (2 * a), 1e-9);
});

test('reduced load: through a reducer i with efficiency η, M_red = M_load / (i·η)', () => {
  // textbook reduction of a resisting torque to the motor shaft from the power balance
  const M = core().run(() => reduceLoads([{ k: 1 / 9, eta: 0.96, M: loadOf({ kind: 'const', tq: 180 }) }])(100));
  close(M, 180 / (9 * 0.96));
});

test('stepper: holds the commanded speed under the pull-out torque, stalls above it', () => {
  const m = { kind: 'stepper', P: 60, n: 300, ks: 2 };   // P/ω = 1.91 N·m at 300 rpm, holding torque 3.82 N·m
  const r = core().run(m => { const s = sourceOf(m); return [operatingPoint(s, loadOf({ kind: 'const', tq: 1.5 })), operatingPoint(s, loadOf({ kind: 'const', tq: 2.5 }))]; }, m);
  close(r[0].w, 300 * Math.PI / 30); assert.equal(r[0].stalled, false); assert.equal(r[1].stalled, true);
});

test('table load: linear interpolation between points, held flat outside them', () => {
  const r = core().run(() => { const M = loadOf({ kind: 'table', table: [[0, 10], [1000, 20], [2000, 60]] }); return [M(0), M(toSI(500, 'rpm')), M(toSI(1500, 'rpm')), M(toSI(5000, 'rpm'))]; });
  close(r[0], 10); close(r[1], 15); close(r[2], 40); close(r[3], 60);
});

/* ---- planetary tooth numbers ---- */
test('planetary conditions: coaxial, neighbour, assembly (worked example z = 18 / 27 / 72, three planets, i = 5)', () => {
  // 72 = 18 + 2·27; (18 + 27)·sin 60° = 38.97 > 29; (18 + 72)/3 = 30
  const r = core().run(() => [planetCheck(18, 27, 72, 3), planetCheck(18, 27, 72, 4), planetCheck(18, 27, 72, 5), planetCheck(13, 15, 43, 3), planetCheck(18, 26, 72, 3)]);
  assert.deepEqual(r[0], { coax: true, neighbour: true, assembly: true, undercut: true, i: 5 });
  assert.equal(r[1].assembly, false);                       // 90/4 is not whole
  assert.equal(r[2].neighbour, false);                      // 45·sin 36° = 26.45 < 29: five planets do not fit
  assert.deepEqual([r[3].assembly, r[3].undercut], [false, false]);
  assert.equal(r[4].coax, false);
});

test('planetary pick: every option meets the conditions and the best one hits the ratio', () => {
  const r = core().run(() => planetPick(5, 3).map(o => ({ ...o, c: planetCheck(o.zs, o.zp, o.zr, 3) })));
  assert.ok(r.length > 0);
  for (const o of r) { assert.ok(o.c.coax && o.c.neighbour && o.c.assembly && o.c.undercut); }
  close(r[0].i, 5, 1e-12); assert.deepEqual([r[0].zs, r[0].zp, r[0].zr], [18, 27, 72]);
  close(core().run(() => shiftMin(12)), 5 / 17);
});
