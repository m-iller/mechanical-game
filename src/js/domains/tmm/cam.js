/* Gear Bench — plate cams with an in-line translating follower. No DOM here. Lengths in mm, angles in radians.
   A cam (tcam) has a base radius r, a lift h and a motion plan: rise over b1, dwell at the top over bd, return over b2,
   dwell at the base for the rest of the turn (angles in degrees on the part). The law shapes the rise and the return:
     lin   constant speed (hard shocks at the ends: infinite acceleration)
     par   constant acceleration, then constant deceleration (soft shocks: acceleration jumps)
     harm  simple harmonic (soft shocks at the ends when followed by a dwell)
     cyc   cycloidal (no shocks)
   The follower's roller centre runs on the pitch curve R(φ) = r + rr + s(φ); the cam surface is that curve moved in by the
   roller radius rr. Pressure angle: tan α = (s′ − e) / (√((r + rr)² − e²) + s), s′ = ds/dφ; e is the follower's offset from the
   cam's centre (0 for an in-line follower). The offset eases the rise and makes the return steeper, or the other way round by its sign. */
'use strict';

// displacement 0…1 over x = 0…1 with its first and second derivative over x
function camLaw(law, x) {
  switch (law) {
    case 'lin': return [x, 1, 0];
    case 'par': return x < 0.5 ? [2 * x * x, 4 * x, 4] : [1 - 2 * (1 - x) ** 2, 4 * (1 - x), -4];
    case 'harm': return [(1 - Math.cos(Math.PI * x)) / 2, Math.PI / 2 * Math.sin(Math.PI * x), Math.PI ** 2 / 2 * Math.cos(Math.PI * x)];
    default: return [x - Math.sin(TAU * x) / TAU, 1 - Math.cos(TAU * x), TAU * Math.sin(TAU * x)];
  }
}
const CAM_DEF = { law: 'cyc', b1: 90, bd: 30, b2: 90 };
const camPlan = c => { const D = Math.PI / 180, b1 = (c.b1 == null ? CAM_DEF.b1 : c.b1) * D, bd = (c.bd == null ? CAM_DEF.bd : c.bd) * D, b2 = (c.b2 == null ? CAM_DEF.b2 : c.b2) * D; return { b1, bd, b2, law: c.law || CAM_DEF.law, fits: b1 + bd + b2 <= TAU + 1e-9 }; };
// follower travel at cam angle phi from the start of the rise: [s, ds/dφ, d²s/dφ²], mm, mm/rad, mm/rad²
function camS(c, phi) {
  const P = camPlan(c), f = mod(phi, TAU), h = c.h;
  if (f < P.b1) { const [s, v, a] = camLaw(P.law, f / P.b1); return [h * s, h * v / P.b1, h * a / P.b1 ** 2]; }
  if (f < P.b1 + P.bd) return [h, 0, 0];
  if (f < P.b1 + P.bd + P.b2) { const [s, v, a] = camLaw(P.law, (f - P.b1 - P.bd) / P.b2); return [h * (1 - s), -h * v / P.b2, -h * a / P.b2 ** 2]; }
  return [0, 0, 0];
}
const camReach = (c, rr, e = 0) => Math.sqrt(Math.max(1e-9, (c.r + rr) ** 2 - e * e));   // roller centre along the follower's line at the base circle
const camPressure = (c, rr, phi, e = 0) => { const [s, d1] = camS(c, phi); return Math.atan2(d1 - e, camReach(c, rr, e) + s); };
/* Figures of the whole turn: the largest pressure angle, the smallest radius of curvature of the pitch curve
   (convex side; at or below the roller radius the surface is undercut), and the base radius that would keep
   the pressure angle within aMax: r_min = max(|s′| / tan aMax − s) − rr. */
function camCheck(c, rr, aMax = Math.PI / 6, N = 720, e = 0) {
  let alpha = 0, rho = Infinity, rmin = 0, vmax = 0, amax = 0;
  for (let k = 0; k < N; k++) {
    const phi = TAU * k / N, [s, d1, d2] = camS(c, phi), R = c.r + rr + s;
    alpha = Math.max(alpha, Math.abs(camPressure(c, rr, phi, e))); rmin = Math.max(rmin, Math.abs(d1) / Math.tan(aMax) - s - rr);
    const den = R * R + 2 * d1 * d1 - R * d2; if (den > 1e-9) rho = Math.min(rho, (R * R + d1 * d1) ** 1.5 / den);
    vmax = Math.max(vmax, Math.abs(d1)); amax = Math.max(amax, Math.abs(d2));
  }
  return { alpha, rho, rmin, vmax, amax };
}
// the cam surface in the cam's own frame, as points; the point for law angle φ lies at polar angle −φ
function camProfile(c, rr, N = 240, e = 0) {
  const d0 = camReach(c, rr, e), pitch = [...Array(N)].map((_, k) => { const phi = TAU * k / N, d = d0 + camS(c, phi)[0], cs = Math.cos(-phi), sn = Math.sin(-phi); return [d * cs - e * sn, d * sn + e * cs]; });
  if (!rr) return pitch;
  return pitch.map((p, k) => { const a = pitch[mod(k - 1, N)], b = pitch[(k + 1) % N], tx = b[0] - a[0], ty2 = b[1] - a[1], L = Math.hypot(tx, ty2) || 1; let nx = ty2 / L, ny = -tx / L; if (nx * p[0] + ny * p[1] > 0) { nx = -nx; ny = -ny; } return [p[0] + nx * rr, p[1] + ny * rr]; });
}
