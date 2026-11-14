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
  // electric motor → belt → planetary reducer (ring held) → chain → belt conveyor pulling 1450 N
  conveyor: { layers: 5, build(x, y, L) {
    const X = x + 90, out = [addPart('emotor', { x, y, layer: L }), addPart('shaft', { x, y, l0: L, l1: L + 1 })];
    const p1 = addPart('pulley', { x, y, layer: L + 1, d: 24 }), p2 = addPart('pulley', { x: X, y, layer: L + 1, d: 60 }); addLink('belt', [p1.id, p2.id]);
    out.push(p1, p2, addPart('shaft', { x: X, y, l0: L + 1, l1: L + 2 }), addPart('spur', { x: X, y, layer: L + 2, z: 12 }), addPart('ring', { x: X, y, layer: L + 2, z: 42, held: true }));
    const c = addPart('carrier', { x: X, y, layer: L + 3, r: 27, n: 3 }); out.push(c);
    for (let k = 0; k < 3; k++) out.push(addPart('spur', { x: X, y, layer: L + 2, z: 15, mount: { c: c.id, k } }));
    const s1 = addPart('sprocket', { x: X, y, layer: L + 4, z: 12 }), s2 = addPart('sprocket', { x: X + 100, y, layer: L + 4, z: 24 }); addLink('chain', [s1.id, s2.id]);
    out.push(addPart('shaft', { x: X, y, l0: L + 3, l1: L + 4 }), s1, s2, addPart('shaft', { x: X + 100, y, l0: L + 3, l1: L + 4 }),
      addPart('conveyor', { x: X + 100, y, layer: L + 3, d: 56, F: 1450, len: 150 }));
    return out;
  } },
  // slider-crank from separate links: crank, rod, slider on a fixed guide. The pairs are made where the joints lie together.
  slidercrank: { layers: 1, build(x, y, L) {
    const r = 20, l = 70, a = Math.PI / 3, A = { x: x + r * Math.cos(a), y: y + r * Math.sin(a) }, xs = A.x + Math.sqrt(l * l - (A.y - y) ** 2);
    const c = addPart('tcrank', { x, y, layer: L, len: r, dir: a, motor: { rpm: 60, tq: 2 } }), rod = addPart('trod', { x: A.x, y: A.y, layer: L, len: l, dir: Math.atan2(y - A.y, xs - A.x) });
    const g = addPart('guide', { x: x + 75, y, layer: L, len: 110, dir: 0 }), sl = addPart('tslider', { x: xs, y, layer: L, dir: 0 });
    tmmAttach([rod.id, sl.id]); return [c, rod, g, sl];
  } },
  /* crank press: motor, belt, flywheel on the crank shaft, then crank, rod and ram built from links.
     The ram meets 4 kN over the last quarter of its downward stroke; the flywheel carries the peak. */
  press: { layers: 3, build(x, y, L) {
    const out = [addPart('emotor', { x: x - 110, y, layer: L }), addPart('shaft', { x: x - 110, y, l0: L, l1: L + 1 }), addPart('flywheel', { x, y, layer: L, d: 120, J: 0.6 })];
    const p1 = addPart('pulley', { x: x - 110, y, layer: L + 1, d: 24 }), p2 = addPart('pulley', { x, y, layer: L + 1, d: 96 }); addLink('belt', [p1.id, p2.id]);
    out.push(p1, p2, addPart('shaft', { x, y, l0: L, l1: L + 2 }));
    const c = addPart('tcrank', { x, y, layer: L + 2, len: 20, dir: -Math.PI / 2 }), rod = addPart('trod', { x, y: y - 20, layer: L + 2, len: 90, dir: Math.PI / 2 });
    const g = addPart('guide', { x, y: y + 80, layer: L + 2, len: 70, dir: Math.PI / 2 }), ram = addPart('tslider', { x, y: y + 70, layer: L + 2, dir: Math.PI / 2, F: 4000, fw: 0.25, m: 5 });
    tmmAttach([rod.id, ram.id]); out.push(c, rod, g, ram); return out;
  } },
  // cam drive of a valve: a cam on its own motor lifts a roller follower by the cycloidal law
  valve: { layers: 1, build(x, y, L) {
    const c = addPart('tcam', { x, y, layer: L, r: 18, h: 8, law: 'cyc', b1: 70, bd: 20, b2: 70, dir: 0, motor: { rpm: 600, tq: 2 } });
    const f = addPart('tfollow', { x, y: y - 23, layer: L, rr: 5, dir: -Math.PI / 2 });
    tmmAttach([f.id]); return [c, f];
  } },
  /* hydraulic drive: motor, pump, relief valve, 4/3 directional valve, cylinder pushing a slider. Click the valve's boxes to drive it. */
  hydro: { layers: 2, build(x, y, L) {
    const H = L + 1, out = [addPart('emotor', { x, y, layer: L, motor: { kind: 'induction', P: 550, n: 1390, ks: 2.2, km: 2.2, rpm: 1390, tq: 3.8 } }), addPart('shaft', { x, y, l0: L, l1: H })];
    const pump = addPart('hpump', { x, y, layer: H, q: 2, dir: -Math.PI / 2 }), tank = addPart('htank', { x, y: y + 30, layer: H }), tank2 = addPart('htank', { x: x + 48, y: y + 30, layer: H });
    const rv = addPart('hrelief', { x: x + 30, y: y - 20, layer: H, pset: 100, dir: Math.PI / 2 }), dv = addPart('hvalve', { x, y: y - 50, layer: H, dn: 6, pos: 0 });
    const cy = addPart('hcyl', { x: x - 40, y: y - 80, layer: H, d: 40, st: 60, s: 0, F: 8000, Fb: 2000, dir: 0 }), pv = addPart('pivot', { x: x - 40, y: y - 80, layer: H, dir: Math.PI });
    const g = addPart('guide', { x: x + 70, y: y - 80, layer: H, len: 110, dir: 0 }), sl = addPart('tslider', { x: x + 36, y: y - 80, layer: H, dir: 0 });
    hydSync(); tmmAttach([cy.id, sl.id]);
    addPipe(tank, 0, pump, 0, { d: 16, kind: 'suction' }); addPipe(pump, 1, dv, 0, { d: 8, pts: [[x, y - 30], [x - 4, y - 30]] }); addPipe(pump, 1, rv, 0, { d: 8, pts: [[x + 30, y - 11]] });
    addPipe(rv, 1, tank2, 0, { d: 10, kind: 'return', pts: [[x + 30, y + 20], [x + 48, y + 20]] }); addPipe(dv, 1, tank2, 0, { d: 10, kind: 'return', pts: [[x + 48, y - 41]] });
    addPipe(dv, 2, cy, 0, { d: 8, pts: [[x - 35, y - 59]] }); addPipe(dv, 3, cy, 1, { d: 8, pts: [[x + 28, y - 59]] });
    out.push(pump, tank, tank2, rv, dv, cy, pv, g, sl); return out;
  } },
  /* excavator arm: one pump feeds two directional valves; the boom cylinder swings the boom (a three-joint link) about its
     foot, the stick cylinder swings the stick on the boom's end. Click the valves' boxes to move them. */
  excavator: { layers: 2, build(x, y, L) {
    const H = L + 1, out = [addPart('emotor', { x: x - 70, y: y + 110, layer: L, motor: { kind: 'induction', P: 550, n: 1390, ks: 2.2, km: 2.2, rpm: 1390, tq: 3.8 } }), addPart('shaft', { x: x - 70, y: y + 110, l0: L, l1: H })];
    const foot = addPart('pivot', { x, y, layer: H }), boom = addPart('tplate', { x, y, layer: H, r: 40, n: 3, dir: -1 }), J1 = jointPos(boom, 1), J2 = jointPos(boom, 2);
    const stick = addPart('trocker', { x: J1.x, y: J1.y, layer: H, len: 60, dir: -0.6 }), tip = jointPos(stick, 1), heel = addPart('pivot', { x: x + 55, y: y + 38, layer: H });
    const cyl = (a, b, F, Fb) => { const d = Math.hypot(b.x - a.x, b.y - a.y); return addPart('hcyl', { x: a.x, y: a.y, layer: H, d: 40, st: 40, s: d - 56, F, Fb, dir: Math.atan2(b.y - a.y, b.x - a.x) }); };
    const c1 = cyl(heel, J2, 6000, 1500), c2 = cyl(J2, tip, 3000, 800);
    hydSync(); tmmAttach([boom.id, stick.id, c1.id, c2.id]);
    const pump = addPart('hpump', { x: x - 70, y: y + 110, layer: H, q: 2, dir: -Math.PI / 2 }), tk = addPart('htank', { x: x - 70, y: y + 135, layer: H }), tk2 = addPart('htank', { x: x - 118, y: y + 125, layer: H }), tk3 = addPart('htank', { x: x + 130, y: y + 125, layer: H });
    const tee = addPart('hnode', { x: x - 70, y: y + 90, layer: H }), rv = addPart('hrelief', { x: x - 100, y: y + 80, layer: H, pset: 100, dir: -Math.PI / 2 });
    const dv1 = addPart('hvalve', { x: x + 20, y: y + 70, layer: H, dn: 6, pos: 1 }), dv2 = addPart('hvalve', { x: x + 95, y: y + 70, layer: H, dn: 6, pos: 0 });
    addPipe(tk, 0, pump, 0, { d: 16, kind: 'suction' }); addPipe(pump, 1, tee, 0, { d: 8 }); addPipe(tee, 0, rv, 0, { d: 8, pts: [[x - 100, y + 90]] });
    addPipe(rv, 1, tk2, 0, { d: 10, kind: 'return', pts: [[x - 100, y + 62], [x - 118, y + 62]] });
    addPipe(tee, 0, dv1, 0, { d: 8, pts: [[x + 16, y + 90]] }); addPipe(tee, 0, dv2, 0, { d: 8, pts: [[x + 91, y + 90]] });
    addPipe(dv1, 1, tk3, 0, { d: 10, kind: 'return', pts: [[x + 24, y + 100], [x + 130, y + 100]] }); addPipe(dv2, 1, tk3, 0, { d: 10, kind: 'return', pts: [[x + 99, y + 100], [x + 130, y + 100]] });
    addPipe(dv1, 2, c1, 0, { d: 8, mat: 'hose' }); addPipe(dv1, 3, c1, 1, { d: 8, mat: 'hose' }); addPipe(dv2, 2, c2, 0, { d: 8, mat: 'hose' }); addPipe(dv2, 3, c2, 1, { d: 8, mat: 'hose', pts: [[x + 99, y - 40]] });
    out.push(foot, boom, stick, heel, c1, c2, pump, tk, tk2, tk3, tee, rv, dv1, dv2); return out;
  } },
  // piston engine, flywheel and generator on one shaft; the generator feeds a heater through a wire
  genset: { layers: 3, build(x, y, L) {
    const e = addPart('engine', { x, y, layer: L, thr: 0.7 }), f = addPart('flywheel', { x, y, layer: L + 1, d: 110, J: 0.15 }), g = addPart('generator', { x, y, layer: L + 2, Pn: 30000, nn: 3000, ge: 0.9 });
    const h = addPart('heater', { x: x + 90, y, layer: L + 2, d: 40, hm: 20, hk: 100 });
    addPipe(g, 0, h, 0, { fluid: 'el', pts: [[x + 60, y], [x + 60, y - 30], [x + 113, y - 30]] });
    return [e, addPart('shaft', { x, y, l0: L, l1: L + 2 }), f, g, h];
  } },
  /* gas-turbine set (Brayton): compressor and turbine on one shaft with a generator; air goes compressor → combustor → turbine → stack.
     2 kg/s, pressure ratio 8, 1000 °C: about 480 kW left after the compressor has taken its share. */
  gasturbine: { layers: 3, build(x, y, L) {
    const c = addPart('tcomp', { x, y, layer: L, pr: 8, mf: 2, dir: -Math.PI / 2 }), tb = addPart('tturb', { x, y, layer: L + 1, dm: 700, zst: 3, nmax: 6500 }), g = addPart('generator', { x, y, layer: L + 2, Pn: 450000, nn: 6000, ge: 0.95 });
    const cc = addPart('tburn', { x: x - 45, y: y - 45, layer: L + 1, T3: 1000, dir: Math.PI }), st = addPart('tstack', { x: x + 60, y, layer: L + 1 }), h = addPart('heater', { x: x + 70, y: y + 60, layer: L + 2, d: 40, hm: 500, hk: 1500 });
    addPipe(c, 1, cc, 0, { d: 160, fluid: 'air', pts: [[x, y - 45]] }); addPipe(cc, 1, tb, 0, { d: 200, fluid: 'flue', pts: [[x - 70, y - 45], [x - 70, y]] }); addPipe(tb, 1, st, 0, { d: 450, fluid: 'flue' });
    addPipe(g, 0, h, 0, { fluid: 'el', pts: [[x + 40, y], [x + 40, y + 30], [x + 93, y + 30]] });
    return [c, addPart('shaft', { x, y, l0: L, l1: L + 2 }), tb, g, cc, st, h];
  } },
  // steam plant (Rankine): boiler, turbine with a generator, condenser, feed pump
  steam: { layers: 2, build(x, y, L) {
    const b = addPart('tboil', { x: x - 60, y: y - 40, layer: L, pb: 30, Tb: 350, mf: 1 }), tb = addPart('tturb', { x, y, layer: L, dm: 1500, zst: 6, etaT: 0.85, nmax: 3300, dir: Math.PI / 2 }), g = addPart('generator', { x, y, layer: L + 1, Pn: 800000, nn: 3000, ge: 0.95 });
    const cd = addPart('tcond', { x, y: y + 50, layer: L, pk: 10, dir: Math.PI }), fp = addPart('tfeed', { x: x - 60, y: y + 50, layer: L, dir: Math.PI }), h = addPart('heater', { x: x + 80, y, layer: L + 1, d: 40, hm: 800, hk: 2500 });
    addPipe(b, 1, tb, 0, { d: 80, fluid: 'steam', pts: [[x, y - 40]] }); addPipe(tb, 1, cd, 0, { d: 800, fluid: 'steam', pts: [[x, y + 30], [x + 12, y + 30]] }); addPipe(cd, 1, fp, 0, { d: 40, fluid: 'water' }); addPipe(fp, 1, b, 0, { d: 30, fluid: 'water', pts: [[x - 85, y + 50], [x - 85, y - 40]] });
    addPipe(g, 0, h, 0, { fluid: 'el' });
    return [b, tb, addPart('shaft', { x, y, l0: L, l1: L + 1 }), g, cd, fp, h];
  } },
  // Geneva drive from links: a crank with a pin and a wheel of four slots at a = r / sin(π/z)
  genevalinks: { layers: 1, build(x, y, L) {
    const c = addPart('tcrank', { x, y, layer: L, len: 20, dir: Math.PI, motor: { rpm: 30, tq: 2 } }), g = addPart('tgeneva', { x: x + 20 / Math.sin(Math.PI / 4), y, layer: L, z: 4 });
    tmmAttach([g.id]); return [c, g];
  } },
  // ratchet feed: a crank-rocker swings a rocker whose pawl carries a ratchet wheel round one way
  ratchetlinks: { layers: 1, build(x, y, L) {
    const m = TEMPLATES.fourbar.build(x, y, L), rk = m[3], w = addPart('tratchet', { x: rk.x, y: rk.y, layer: L, z: 24 });
    tmmAttach([w.id]); return [...m, w];
  } },
  // cam with a swinging roller follower
  camrocker: { layers: 1, build(x, y, L) {
    const c = addPart('tcam', { x, y, layer: L, r: 18, h: 8, law: 'cyc', b1: 90, bd: 30, b2: 90, dir: 0, motor: { rpm: 300, tq: 2 } }), O = { x: x + 45, y: y - 35 }, a = Math.atan2(y - 23 - O.y, x - O.x);
    const f = addPart('tfollowr', { x: O.x, y: O.y, layer: L, len: Math.hypot(x - O.x, y - 23 - O.y), rr: 5, dir: a });
    tmmAttach([f.id]); return [c, f];
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
