/* Gear Bench core — energy ports. Every domain is an effort and a flow whose product is power, as in a bond graph.
   Elements meet only through ports of the same domain, and for fluids of the same medium. No DOM here. */
'use strict';

const DOMAINS = {
  rot:   { effort: 'Nm', flow: 'rad/s', show: ['Nm', 'rpm'] },            // torque × angular speed
  trans: { effort: 'N', flow: 'm/s', show: ['N', 'mm/s'] },               // force × speed
  hyd:   { effort: 'Pa', flow: 'm3/s', show: ['bar', 'L/min'] },          // pressure × volume flow
  el:    { effort: 'V', flow: 'A', show: ['V', 'A'] },                    // voltage × current, used at the "power out" level
  th:    { effort: 'K', flow: 'kg/s', show: ['degC', 'kg/s'], pseudo: 1 },// temperature or enthalpy with mass flow: power = ṁ·Δh
};
const MEDIA = { oil: 'liquid', water: 'liquid', air: 'gas', steam: 'gas', flue: 'gas' };
const port = (id, domain, opt) => ({ id, domain, ...opt });
const portPower = (p, effort, flow) => DOMAINS[p.domain].pseudo ? null : effort * flow;
/* Can two ports be joined? { ok, code } — code names the reason for the string table.
   Different domains never join. Liquid to gas is refused; two different liquids or gases join with a warning. */
function canConnect(a, b) {
  if (a.domain !== b.domain) return { ok: false, code: 'port.domain' };
  if (a.medium && b.medium && a.medium !== b.medium) {
    if (MEDIA[a.medium] !== MEDIA[b.medium]) return { ok: false, code: 'port.phase' };
    return { ok: true, code: 'port.medium' };
  }
  return { ok: true, code: '' };
}
