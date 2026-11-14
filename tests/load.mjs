// Loads Gear Bench's plain scripts into a fresh node:vm context, in the order index.html lists them,
// so the tests exercise the same code the app runs. See docs/DECISIONS.md, D-002.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const CORE = ['core/units.js', 'core/explain.js', 'core/warn.js', 'core/ports.js', 'core/migrate.js', 'core/loads.js', 'core/nonlin.js', 'core/planet.js'];
export const HYDRO = [...CORE, 'domains/pipes/loss.js', 'domains/hydro/net.js'];
export const THERMO = ['model.js', 'domains/thermo/engine.js', 'domains/thermo/cycle.js'];
export const TMM = [...CORE, 'domains/tmm/linkage.js', 'domains/tmm/cam.js'];
export const DRIVES = ['strings.js', ...CORE, 'domains/pipes/loss.js', 'domains/hydro/net.js', 'domains/thermo/engine.js', 'domains/thermo/cycle.js', 'domains/tmm/linkage.js', 'domains/tmm/cam.js', 'model.js', 'paths.js', 'solver.js', 'power.js', 'domains/tmm/scene.js', 'domains/hydro/scene.js', 'domains/io/scene.js', 'domains/tmm/cycle.js', 'domains/tmm/panel.js', 'templates.js'];

class Path2D { moveTo() {} lineTo() {} arc() {} rect() {} closePath() {} }

export function bench(files = DRIVES) {
  const ctx = vm.createContext({ console, Path2D, Math, JSON });
  for (const f of files) {
    let src;
    try { src = readFileSync(new URL(`../src/js/${f}`, import.meta.url), 'utf8'); } catch (e) { if (f.startsWith('core/')) continue; throw e; }
    vm.runInContext(src, ctx, { filename: f });
  }
  vm.runInContext("if (typeof setLang === 'function') setLang('en');", ctx);
  // run(fn, ...args): calls fn inside the context, where every global of the scripts is in scope. The result comes back as plain JSON.
  const run = (fn, ...args) => {
    const out = vm.runInContext(`JSON.stringify((${fn})(...${JSON.stringify(args)}))`, ctx);
    return out === undefined ? undefined : JSON.parse(out);
  };
  return { ctx, run };
}

export const close = (actual, expected, rel = 1e-6, abs = 1e-9) => {
  if (!(Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected)))) throw new Error(`expected ${expected}, got ${actual}`);
};
