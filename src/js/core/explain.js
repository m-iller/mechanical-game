/* Gear Bench core — "where does this number come from".
   A computed figure travels as an object: the value in SI, the unit to show it in, the formula in symbols,
   the numbers that went into it, and the assumptions behind it. The interface turns it into a hint. No DOM here. */
'use strict';

/* ex('M', 26.7, 'Nm', 'M = P / ω', [['P', 4000, 'kW'], ['ω', 149.7, 'rpm']], ['steady state'])
   vars: [symbol, SI value, unit]. notes: plain strings or string-table keys, shown as assumptions. */
function ex(sym, v, u, formula, vars, notes, src) {
  return { sym, v, u, formula: formula || '', vars: vars || [], notes: notes || [], src: src || '' };
}
const exValue = e => fmtU(e.v, e.u);
// the hint as lines of text: formula, the substituted numbers, the result, then assumptions and the source
function exLines(e, tr) {
  const say = typeof tr === 'function' ? tr : s => s, out = [];
  if (e.formula) out.push(e.formula);
  if (e.vars.length) out.push(e.vars.map(([s, v, u]) => `${s} = ${typeof v === 'string' ? v : fmtU(v, u, 4)}`).join(';  '));
  out.push(`${e.sym} = ${fmtU(e.v, e.u, 4)}`);
  for (const n of e.notes) out.push('• ' + say(n));
  if (e.src) out.push('[' + say(e.src) + ']');
  return out;
}
