// Scene format and layer rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

// a bench saved by Gear Bench 2.1: the two-stage reducer template with layer B hidden
const SAVED_V2 = { v: 2, nextId: 6, layerCount: 2, outId: 5, showDims: true, hidden: [1], links: [], parts: [
  { id: 1, name: 'G1', type: 'spur', x: 0, y: 0, layer: 0, free: 0, z: 12, motor: { rpm: 120, tq: 2 } },
  { id: 2, name: 'G2', type: 'spur', x: 48, y: 0, layer: 0, free: 0.1, z: 36 },
  { id: 3, name: 'V3', type: 'shaft', x: 48, y: 0, layer: 0, free: 0, l0: 0, l1: 1 },
  { id: 4, name: 'G4', type: 'spur', x: 48, y: 0, layer: 1, free: 0, z: 14 },
  { id: 5, name: 'G5', type: 'spur', x: 104, y: 0, layer: 1, free: 0, z: 42 }] };

test('a scene saved by version 2 opens and runs as before', () => {
  const r = bench().run(d => { load(d); solve(); return { w: byId(5).w, lock: lockMsg, layerCount, hidden: [...hiddenLayers], out: outId, kind: byId(1).motor.kind, dims: showDims, scheme: schemeMode }; }, SAVED_V2);
  assert.equal(r.scheme, false);   // a 2.x bench keeps its drawn look; new benches open as a kinematic scheme
  assert.equal(r.lock, ''); close(r.w, 120 / 9);
  assert.deepEqual([r.layerCount, r.hidden, r.out, r.kind, r.dims], [2, [1], 5, 'speed', true]);
});

test('save and load round trip keeps layers, names, locks, motors and loads', () => {
  const b = bench();
  const saved = b.run(() => {
    resetScene(3); layerNames[1] = 'drive'; lockedLayers.add(2); hiddenLayers.add(0);
    addPart('spur', { x: 0, y: 0, z: 20, motor: { kind: 'induction', P: 4000, n: 1430, ks: 2, km: 2.2, rpm: 1430, tq: 26.7 } });
    addPart('spur', { x: 60, y: 0, z: 40, label: 'Mixer', load: { kind: 'quad', tq: 30, n: 700, eta: 0.8 } });
    return serialize();
  });
  assert.equal(saved.v, 5);
  assert.deepEqual(saved.layers, [{ name: '', visible: false, locked: false }, { name: 'drive', visible: true, locked: false }, { name: '', visible: true, locked: true }]);
  const back = bench().run(d => { load(d); return { s: serialize(), locked: [...lockedLayers], names: layerNames }; }, saved);
  assert.deepEqual(back.s, saved); assert.deepEqual(back.locked, [2]); assert.equal(back.names[1], 'drive');
});

test('layers: only parts of the active layer can be picked; a shaft counts on every layer it passes', () => {
  const r = bench().run(() => {
    resetScene(3);
    const a = addPart('spur', { x: 0, y: 0, layer: 0, z: 20 }), b = addPart('spur', { x: 0, y: 0, layer: 2, z: 20 }), s = addPart('shaft', { x: 0, y: 0, l0: 0, l1: 1 });
    const at = l => { activeLayer = l; return [canPick(a), canPick(b), canPick(s)]; };
    const open = [at(0), at(1), at(2)];
    lockedLayers.add(0); const locked = at(0);
    lockedLayers.clear(); hiddenLayers.add(0); const hidden = at(0);
    return { open, locked, hidden };
  });
  assert.deepEqual(r.open, [[true, false, true], [false, false, true], [false, true, false]]);
  assert.deepEqual(r.locked, [false, false, false]);
  assert.deepEqual(r.hidden, [false, false, false]);
});

test('layers: solo mode shows the active layer alone and follows it', () => {
  const r = bench().run(() => { resetScene(3); soloActive = true; activeLayer = 1; const a = [0, 1, 2].map(layerShown); activeLayer = 2; return [a, [0, 1, 2].map(layerShown)]; });
  assert.deepEqual(r, [[false, true, false], [false, false, true]]);
});

test('layers: moving and deleting a layer carries its name and lock with it', () => {
  const r = bench().run(() => {
    resetScene(3); layerNames = ['base', 'drive', 'top']; lockedLayers.add(0);
    moveLayer(0, 1); const moved = { names: layerNames.slice(), locked: [...lockedLayers] };
    deleteLayer(0); return { moved, names: layerNames.slice(), locked: [...lockedLayers], n: layerCount };
  });
  assert.deepEqual(r.moved, { names: ['drive', 'base', 'top'], locked: [1] });
  assert.deepEqual([r.names, r.locked, r.n], [['base', 'top'], [0], 2]);
});
