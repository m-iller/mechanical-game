/* Gear Bench — a hydraulic network in steady state. SI throughout. No DOM here.
   Nodes are the places where ports meet; elements join two nodes:
     pump     { k:'pump', a, b, Q }                      flow source from a (suction) to b (pressure): displacement × speed × volumetric efficiency
     pipe     { k:'pipe', a, b, d, L, eps, zeta }        resistance, see pipes/loss.js
     orifice  { k:'orifice', a, b, A, Cd }               throttle or an open path of a directional valve
     relief   { k:'relief', a, b, pset, kq }             closed until pa − pb reaches pset, then Q = kq·(pa − pb − pset)
     check    { k:'check', a, b, A, pcrack }             passes a → b only
     cyl      { k:'cyl', a, b, A1, A2, F, stop }         piston area A1 at port a, annulus A2 at port b; F resists extension;
                                                         stop: +1 held at the end of extension, −1 at the end of retraction
     motor    { k:'motor', a, b, q, M }                  displacement q m³/rad turning against torque M: Δp·q = M
   Unknowns: the pressure of every free node, and one per element — its flow, a cylinder's speed, a motor's speed.
   Equations: flows into each free node sum to zero, and each element's own law. Solved by Levenberg–Marquardt in scaled units
   (pressure in bar, flow in 0.1 L/s) from the last solution, so a valve click moves the network to its new state in a few steps. */
'use strict';

const HS = { p: 1e5, q: 1e-4 };     // scales of pressure and flow
function hydroSolve(net, x0) {
  const fluid = net.fluid || FLUIDS.oil, fixed = net.fixed || {}, free = [], ix = new Map();
  for (let n = 0; n < net.nodes; n++) if (fixed[n] == null) { ix.set(n, free.length); free.push(n); }
  const np = free.length, el = net.elems, ex0 = [], cnt = el.reduce((s, e, i) => { ex0[i] = e.k === 'pump' ? -1 : np + s; return s + (e.k === 'pump' ? 0 : 1); }, 0);
  const P = (x, n) => fixed[n] != null ? fixed[n] : x[ix.get(n)] * HS.p;
  const flows = x => el.map((e, i) => { // flow leaving node a, flow entering node b
    if (e.k === 'pump') return [e.Q, e.Q];
    const u = x[ex0[i]];
    if (e.k === 'cyl') { const v = u * 1e-2; return [e.A1 * v, e.A2 * v]; }
    if (e.k === 'motor') return [e.q * u, e.q * u];
    return [u * HS.q, u * HS.q];
  });
  const F = x => {
    const f = new Array(np + cnt).fill(0), fl = flows(x);
    el.forEach((e, i) => {
      const [qa, qb] = fl[i]; if (ix.has(e.a)) f[ix.get(e.a)] -= qa / HS.q; if (ix.has(e.b)) f[ix.get(e.b)] += qb / HS.q;
      if (e.k === 'pump') return;
      const dp = P(x, e.a) - P(x, e.b), r = ex0[i], Q = qa;
      if (e.k === 'pipe') f[r] = (dp - pipeLoss(e, Q, fluid).dp) / HS.p;
      else if (e.k === 'orifice') { const c = (e.Cd || 0.62) * e.A; f[r] = (dp - fluid.rho / 2 * Q * Math.abs(Q) / (c * c) - 1e7 * Q) / HS.p; }   // the small linear term keeps the slope finite at rest
      else if (e.k === 'relief') f[r] = (Q - (e.kq || 2e-10) * Math.max(0, dp - e.pset) - 1e-15 * dp) / HS.q;
      else if (e.k === 'check') { const c = 0.62 * e.A, open = dp - (e.pcrack || 0); f[r] = open > 0 ? (open - fluid.rho / 2 * Q * Math.abs(Q) / (c * c) - 1e7 * Q) / HS.p : (Q - 1e-15 * dp) / HS.q; }
      else if (e.k === 'cyl') f[r] = e.stop ? x[r] : (P(x, e.a) * e.A1 - P(x, e.b) * e.A2 - e.F) / (HS.p * e.A1);
      else if (e.k === 'motor') f[r] = (dp * e.q - e.M) / (HS.p * e.q);
    });
    return f;
  };
  const start = x0 && x0.length === np + cnt ? x0 : new Array(np + cnt).fill(0);
  let r = solveNL(F, start, { tol: 1e-9, max: 200 });
  if (!r.ok && start !== x0) r = solveNL(F, r.x, { tol: 1e-9, max: 200 });
  const fl = flows(r.x), p = [...Array(net.nodes)].map((_, n) => P(r.x, n));
  return { ok: r.res < 1e-6, res: r.res, x: r.x, p, q: fl.map(f => f[0]), qb: fl.map(f => f[1]), v: el.map((e, i) => e.k === 'cyl' ? r.x[ex0[i]] * 1e-2 : e.k === 'motor' ? r.x[ex0[i]] : null) };
}
