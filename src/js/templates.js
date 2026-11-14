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
  // induction motor and a fan on one shaft: the speed settles where the two characteristics cross
  fan: { layers: 2, build(x, y, L) {
    return [addPart('emotor', { x, y, layer: L }), addPart('shaft', { x, y, l0: L, l1: L + 1 }), addPart('machine', { x, y, layer: L + 1, label: t('name.fan'), load: { kind: 'quad', tq: 2.4, n: 1320, eta: 0.6 } })];
  } },
  // electric motor → belt → planetary reducer (ring held) → chain → conveyor as a black-box machine
  conveyor: { layers: 5, build(x, y, L) {
    const X = x + 90, out = [addPart('emotor', { x, y, layer: L }), addPart('shaft', { x, y, l0: L, l1: L + 1 })];
    const p1 = addPart('pulley', { x, y, layer: L + 1, d: 24 }), p2 = addPart('pulley', { x: X, y, layer: L + 1, d: 60 }); addLink('belt', [p1.id, p2.id]);
    out.push(p1, p2, addPart('shaft', { x: X, y, l0: L + 1, l1: L + 2 }), addPart('spur', { x: X, y, layer: L + 2, z: 12 }), addPart('ring', { x: X, y, layer: L + 2, z: 42, held: true }));
    const c = addPart('carrier', { x: X, y, layer: L + 3, r: 27, n: 3 }); out.push(c);
    for (let k = 0; k < 3; k++) out.push(addPart('spur', { x: X, y, layer: L + 2, z: 15, mount: { c: c.id, k } }));
    const s1 = addPart('sprocket', { x: X, y, layer: L + 4, z: 12 }), s2 = addPart('sprocket', { x: X + 100, y, layer: L + 4, z: 24 }); addLink('chain', [s1.id, s2.id]);
    out.push(addPart('shaft', { x: X, y, l0: L + 3, l1: L + 4 }), s1, s2, addPart('shaft', { x: X + 100, y, l0: L + 3, l1: L + 4 }),
      addPart('machine', { x: X + 100, y, layer: L + 3, d: 56, label: t('name.conveyor'), load: { kind: 'const', tq: 45, n: 60, eta: 0.85 } }));
    return out;
  } },
  // slider-crank from separate links: crank, rod, slider on a fixed guide. The pairs are made where the joints lie together.
  slidercrank: { layers: 1, build(x, y, L) {
    const r = 20, l = 70, a = Math.PI / 3, A = { x: x + r * Math.cos(a), y: y + r * Math.sin(a) }, xs = A.x + Math.sqrt(l * l - (A.y - y) ** 2);
    const c = addPart('tcrank', { x, y, layer: L, len: r, dir: a, motor: { rpm: 60, tq: 2 } }), rod = addPart('trod', { x: A.x, y: A.y, layer: L, len: l, dir: Math.atan2(y - A.y, xs - A.x) });
    const g = addPart('guide', { x: x + 75, y, layer: L, len: 110, dir: 0 }), sl = addPart('tslider', { x: xs, y, layer: L, dir: 0 });
    tmmAttach([rod.id, sl.id]); return [c, rod, g, sl];
  } },
  // four-bar: crank 20, coupler 70, rocker 50, frame 80 — a crank-rocker by Grashof's rule
  fourbar: { layers: 1, build(x, y, L) {
    const a = 20, b = 70, c = 50, d = 80, B = { x, y: y - a }, dx = x + d - B.x, dy = y - B.y, f = Math.hypot(dx, dy), k = (b * b - c * c + f * f) / (2 * f), h = Math.sqrt(b * b - k * k);
    const C = { x: B.x + dx * k / f + dy * h / f, y: B.y + dy * k / f - dx * h / f };
    const cr = addPart('tcrank', { x, y, layer: L, len: a, dir: -Math.PI / 2, motor: { rpm: 60, tq: 2 } }), cp = addPart('trod', { x: B.x, y: B.y, layer: L, len: b, dir: Math.atan2(C.y - B.y, C.x - B.x) });
    const pv = addPart('pivot', { x: x + d, y, layer: L }), rk = addPart('trocker', { x: x + d, y, layer: L, len: c, dir: Math.atan2(C.y - y, C.x - x - d) });
    tmmAttach([cp.id, rk.id]); return [cr, cp, pv, rk];
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
  resetScene(4); showDims = false;
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
