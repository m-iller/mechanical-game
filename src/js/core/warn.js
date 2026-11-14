/* Gear Bench core — applicability warnings.
   Each domain registers checks. A check looks at the solved scene and returns warnings:
   { level: 'info' | 'warn' | 'error', code, text, ids } — ids are the parts to highlight. No DOM here. */
'use strict';

const CHECKS = [];
const addCheck = (name, fn) => { CHECKS.push({ name, fn }); };
const LEVELS = { error: 0, warn: 1, info: 2 };
function runChecks(scene) {
  const out = [];
  for (const c of CHECKS) {
    let res;
    try { res = c.fn(scene) || []; } catch (e) { res = [{ level: 'error', code: 'check.failed', text: `${c.name}: ${e.message}`, ids: [] }]; }
    for (const w of res) out.push({ level: w.level || 'warn', code: w.code, text: w.text, ids: w.ids || [] });
  }
  return out.sort((a, b) => LEVELS[a.level] - LEVELS[b.level]);
}
