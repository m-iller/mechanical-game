/* Gear Bench — ready-made assemblies. Each one is built from the same separate parts a person would add by hand.
   A template gets the point to build around and the lowest layer to use, and returns the parts it made. */
'use strict';

const H2 = Math.PI / 2;
const TEMPLATES = {
  planetary: { layers: 2, build(x, y, L) { // sun in, ring held, carrier out
    const c = addPart('carrier', { x, y, layer: L, r: 27, n: 3 });
    const out = [c, addPart('spur', { x, y, layer: L + 1, z: 12, motor: { rpm: 120, tq: 2 } }), addPart('ring', { x, y, layer: L + 1, z: 42, held: true })];
    for (let k = 0; k < 3; k++) out.push(addPart('spur', { x, y, layer: L + 1, z: 15, mount: { c: c.id, k } }));
    return out;
  } },
  reducer: { layers: 2, build(x, y, L) { // two spur stages on three shafts
    return [addPart('spur', { x, y, layer: L, z: 12, motor: { rpm: 120, tq: 2 } }), addPart('spur', { x: x + 48, y, layer: L, z: 36 }),
      addPart('shaft', { x: x + 48, y, l0: L, l1: L + 1 }), addPart('spur', { x: x + 48, y, layer: L + 1, z: 14 }), addPart('spur', { x: x + 104, y, layer: L + 1, z: 42 })];
  } },
  worm: { layers: 1, build(x, y, L) {
    return [addPart('spur', { x, y, layer: L, z: 30 }), addPart('worm', { x, y: y + 30 + WR, layer: L, zw: 1, dir: 0, motor: { rpm: 240, tq: 2 } })];
  } },
  bevel: { layers: 1, build(x, y, L) { // flat bevel gear, a bevel pinion on a horizontal shaft
    return [addPart('bevel', { x, y, layer: L, z: 24, motor: { rpm: 60, tq: 2 } }), addPart('hbevel', { x: x + 24, y, layer: L, z: 12, dir: 0 }), addPart('hshaft', { x: x + 56, y, layer: L, len: 60, dir: 0 })];
  } },
  belt: { layers: 1, build(x, y, L) {
    const a = addPart('pulley', { x, y, layer: L, d: 24, motor: { rpm: 120, tq: 2 } }), b = addPart('pulley', { x: x + 80, y, layer: L, d: 60 }), c = addPart('pulley', { x: x + 40, y: y - 46, layer: L, d: 30 });
    addLink('belt', [a.id, b.id, c.id]); return [a, b, c];
  } },
  chain: { layers: 1, build(x, y, L) {
    const a = addPart('sprocket', { x, y, layer: L, z: 12, motor: { rpm: 120, tq: 2 } }), b = addPart('sprocket', { x: x + 80, y, layer: L, z: 24 });
    addLink('chain', [a.id, b.id]); return [a, b];
  } },
  rack: { layers: 1, build(x, y, L) {
    return [addPart('spur', { x, y, layer: L, z: 20, motor: { rpm: 30, tq: 2 } }), addPart('rack', { x: x + 20, y: y + 20, layer: L, z: 24, dir: Math.PI })];
  } },
  diff: { layers: 3, build(x, y, L) { // housing driven by a pinion; brake on the lower half shaft, piston on the upper one
    return [addPart('spur', { x, y: y - 56, layer: L + 1, z: 16, motor: { rpm: 120, tq: 2 } }), addPart('diff', { x, y, layer: L + 1, z: 40 }),
      addPart('shaft', { x, y, l0: L, l1: L + 1 }), addPart('brake', { x, y, layer: L, d: 44, on: false }),
      addPart('shaft', { x, y, l0: L + 1, l1: L + 2 }), addPart('crank', { x, y, layer: L + 2, r: 14, l: 40, dir: 0 })];
  } },
  clutch: { layers: 3, build(x, y, L) { // motor shaft below, driven shaft above, friction clutch between them
    return [addPart('flywheel', { x, y, layer: L, d: 60, motor: { rpm: 120, tq: 2 } }), addPart('shaft', { x, y, l0: L, l1: L + 1 }), addPart('clutch', { x, y, layer: L + 1, d: 40 }),
      addPart('shaft', { x, y, l0: L + 1, l1: L + 2 }), addPart('spur', { x, y, layer: L + 2, z: 20 })];
  } },
  piston: { layers: 1, build(x, y, L) { return [addPart('crank', { x, y, layer: L, r: 14, l: 40, dir: 0, motor: { rpm: 60, tq: 2 } })]; } },
  geneva: { layers: 1, build(x, y, L) { return [addPart('geneva', { x, y, layer: L, z: 4, dir: 0, motor: { rpm: 30, tq: 2 } })]; } },
};

function insertTemplate(id, x, y) {
  const tp = TEMPLATES[id]; if (!tp) return [];
  const L = Math.max(0, Math.min(activeLayer, MAXL - tp.layers));
  layerCount = Math.max(layerCount, L + tp.layers);
  return tp.build(Math.round(x), Math.round(y), L);
}

// the scene a new bench opens on: one motor, a three-pulley belt, a planetary stage built from loose gears, a bevel and worm branch
function example() {
  parts = []; links = []; nextId = 1; sel = new Set(); linkDraft = null; clock = 0; layerCount = 4; activeLayer = 0; hiddenLayers = new Set(); showDims = false;
  const p1 = addPart('pulley', { x: 0, y: 0, layer: 0, d: 24, motor: { rpm: 240, tq: 2 } });
  const p2 = addPart('pulley', { x: 80, y: 0, layer: 0, d: 60 });
  const p3 = addPart('pulley', { x: 30, y: -62, layer: 0, d: 30 });
  addLink('belt', [p1.id, p2.id, p3.id]);
  // planetary stage: sun on the pulley's shaft, ring held, carrier drives the piston
  addPart('shaft', { x: 80, y: 0, l0: 0, l1: 1 });
  addPart('spur', { x: 80, y: 0, layer: 1, z: 12 });
  addPart('ring', { x: 80, y: 0, layer: 1, z: 42, held: true });
  const c = addPart('carrier', { x: 80, y: 0, layer: 2, r: 27, n: 3 });
  for (let k = 0; k < 3; k++) addPart('spur', { x: 80, y: 0, layer: 1, z: 15, mount: { c: c.id, k } });
  addPart('shaft', { x: 80, y: 0, l0: 2, l1: 3 });
  const k = addPart('crank', { x: 80, y: 0, layer: 3, r: 14, l: 40, dir: 0 });
  // third pulley turns a bevel pair, a horizontal shaft, a worm and its wheel, which pushes a rack
  addPart('shaft', { x: 30, y: -62, l0: 0, l1: 1 });
  addPart('bevel', { x: 30, y: -62, layer: 1, z: 20 });
  addPart('hbevel', { x: 10, y: -62, layer: 1, z: 10, dir: Math.PI });
  addPart('hshaft', { x: -20, y: -62, layer: 1, len: 56, dir: Math.PI });
  addPart('worm', { x: -62, y: -62, layer: 1, zw: 1, dir: Math.PI });
  addPart('spur', { x: -62, y: -27.5, layer: 1, z: 30 });
  addPart('rack', { x: -62, y: 2.5, layer: 1, z: 16, dir: Math.PI });
  outId = k.id;
  place();
}
