/* Gear Bench core — scene format versions. A saved scene carries v; MIGRATIONS[n] turns version n into n + 1.
   Loading runs the chain, so every older file still opens. No DOM here.
     v2  Gear Bench 2.x: layerCount + hidden[], motor { rpm, tq }
     v3  layers [{ name, visible, locked }], motor.kind, loads on parts
     v4  links of mechanisms as parts, pairs [] between them
     v5  hydraulic parts, pipes [] between their ports */
'use strict';

const SCENE_V = 5;
const MIGRATIONS = {
  2(d) {
    const n = Math.max(1, d.layerCount || 1), hidden = new Set(d.hidden || []), layers = [];
    for (let l = 0; l < n; l++) layers.push({ name: '', visible: !hidden.has(l), locked: false });
    const parts = (d.parts || []).map(p => p.motor ? { ...p, motor: { kind: 'speed', ...p.motor } } : p);
    const { layerCount, hidden: h, ...rest } = d;
    return { ...rest, v: 3, layers, parts, scheme: false };   // a 2.x bench keeps the drawn look it was saved with
  },
  3(d) { return { ...d, v: 4, pairs: [] }; },
  4(d) { return { ...d, v: 5, pipes: [] }; },
};
function migrate(d) {
  if (!d || !Array.isArray(d.parts)) return null;
  let v = d.v || 2;                       // files older than the version field are v2-shaped
  if (v > SCENE_V) return null;           // written by a newer app
  while (v < SCENE_V) { d = MIGRATIONS[v](d); v = d.v; }
  return d;
}
