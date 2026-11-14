/* Gear Bench — planar linkages (theory of mechanisms and machines). SI: metres, radians. No DOM here.

   A mechanism is links and pairs:
     links   [{ id, ground, pose }]                 a ground link is part of the frame (стойка); pose [x, y, θ] puts it somewhere
                                                    other than the origin, and lets a driven crank be given as a moving frame
     pairs   { type: 'R', a, b, pa, pb }            revolute: point pa of link a coincides with point pb of link b
             { type: 'P', a, b, pa, pb, ua, turn }  prismatic: b slides on a along the direction ua through pa, held at the angle turn to it
             { type: 'F', a, b, pa, pb, turn }      fixed: the two links are one rigid piece
     driver  { link, ref }                          the angle of `link` relative to `ref` (the ground when omitted) is the input φ
   Each moving link has a pose (x, y, θ); points are given in the link's own frame. Every lower pair removes two freedoms.

   Positions come from the constraint equations by Levenberg–Marquardt (core/nonlin.js), started from the previous pose,
   so the mechanism stays on its assembly branch. Speeds and accelerations are central differences over the input angle:
   for constant input speed ω, v = q′·ω and a = q″·ω². */
'use strict';

/* Degrees of freedom of a planar mechanism by Chebyshev's formula W = 3n − 2·p5 − p4:
   n moving links, p5 lower pairs (one freedom each), p4 higher pairs (two freedoms each). */
function mobility(mech) {
  const n = mech.links.filter(l => !l.ground).length, p5 = mech.pairs.filter(p => p.type === 'R' || p.type === 'P').length, p4 = mech.pairs.filter(p => p.type === 'H').length, pf = mech.pairs.filter(p => p.type === 'F').length;
  return { n: n - pf, p5, p4, W: 3 * (n - pf) - 2 * p5 - p4 };   // links fixed to each other count as one
}

/* Grashof's condition for a four-bar with link lengths: a input, b coupler, c output, d frame.
   The shortest link can turn fully when s + l ≤ p + q. kind: crank-rocker, double-crank, double-rocker, or triple-rocker when it fails. */
function grashof(a, b, c, d) {
  const L = [a, b, c, d], s = Math.min(...L), l = Math.max(...L), rest = L.reduce((x, y) => x + y, 0) - s - l, ok = s + l <= rest + 1e-12;
  const kind = !ok ? 'triple-rocker' : s === d ? 'double-crank' : s === a || s === c ? 'crank-rocker' : 'double-rocker';
  return { ok, s, l, kind, change: Math.abs(s + l - rest) < 1e-12 };
}

function linkage(mech) {
  const moving = mech.links.filter(l => !l.ground), ix = new Map(moving.map((l, i) => [l.id, 3 * i]));
  const frame = new Map(mech.links.filter(l => l.ground && l.pose).map(l => [l.id, l.pose])), ORIGIN = [0, 0, 0];
  const pose = (q, id) => { const i = ix.get(id); return i == null ? frame.get(id) || ORIGIN : [q[i], q[i + 1], q[i + 2]]; };
  const at = (q, id, p) => { const [x, y, th] = pose(q, id), c = Math.cos(th), s = Math.sin(th); return [x + c * p[0] - s * p[1], y + s * p[0] + c * p[1]]; };
  const drv = mech.driver;
  // constraint residuals for the input angle phi
  const eqs = (q, phi) => {
    const f = [];
    for (const p of mech.pairs) {
      const A = at(q, p.a, p.pa), B = at(q, p.b, p.pb);
      if (p.type === 'R') f.push(A[0] - B[0], A[1] - B[1]);
      else if (p.type === 'F') f.push(A[0] - B[0], A[1] - B[1], (pose(q, p.b)[2] - pose(q, p.a)[2] - (p.turn || 0)) * (mech.scale || 1));
      else if (p.type === 'P') {
        const tha = pose(q, p.a)[2], thb = pose(q, p.b)[2], ux = Math.cos(tha) * p.ua[0] - Math.sin(tha) * p.ua[1], uy = Math.sin(tha) * p.ua[0] + Math.cos(tha) * p.ua[1];
        f.push(-(B[0] - A[0]) * uy + (B[1] - A[1]) * ux, (thb - tha - (p.turn || 0)) * (mech.scale || 1));   // scale: a length that makes an angle error weigh like a position error
      }
    }
    if (drv) f.push(pose(q, drv.link)[2] - (drv.ref ? pose(q, drv.ref)[2] : 0) - phi);
    return f;
  };
  let last = mech.q0 ? mech.q0.slice() : new Array(3 * moving.length).fill(0);
  const solveAt = (phi, q0) => { const r = solveNL(q => eqs(q, phi), q0 || last, { tol: 1e-11 }); if (r.ok) last = r.x; return { q: r.x, ok: r.ok, res: r.res }; };
  /* pose, its rate and its acceleration for input angle phi turning at omega (and speeding up at eps) */
  const state = (phi, omega = 1, eps = 0, h = 1e-3) => {
    const c0 = solveAt(phi), tight = { tol: 1e-14 }, cc = solveNL(q => eqs(q, phi), c0.q, tight), c = { q: cc.x, ok: c0.ok };
    const m = solveNL(q => eqs(q, phi - h), c.q, tight), p = solveNL(q => eqs(q, phi + h), c.q, tight);   // tight, because the second difference divides the leftover by h²
    const d1 = c.q.map((_, i) => (p.x[i] - m.x[i]) / (2 * h)), d2 = c.q.map((v, i) => (p.x[i] - 2 * v + m.x[i]) / (h * h));
    return { q: c.q, ok: c.ok && m.res < 1e-8 && p.res < 1e-8, v: d1.map(x => x * omega), a: d2.map((x, i) => x * omega * omega + d1[i] * eps), d1, d2 };
  };
  // position, velocity and acceleration of a point fixed on a link
  const point = (st, id, p) => {
    const i = ix.get(id), P = at(st.q, id, p); if (i == null) return { p: P, v: [0, 0], a: [0, 0] };
    const rx = P[0] - st.q[i], ry = P[1] - st.q[i + 1], w = st.v[i + 2], e = st.a[i + 2];
    return { p: P, v: [st.v[i] - w * ry, st.v[i + 1] + w * rx], a: [st.a[i] - e * ry - w * w * rx, st.a[i + 1] + e * rx - w * w * ry] };
  };
  return { mobility: () => mobility(mech), solveAt, state, point, pose, at, eqs };
}
