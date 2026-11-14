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

/* ---------- any follower on a cam ----------
   f describes the follower:  { kind: 'roller', rr, e, dir }   translating with a roller, offset e, moving along dir
                              { kind: 'flat', dir }            translating with a flat face square to dir
                              { kind: 'rock', rr, O, L, side } swinging arm of length L about the fixed point O, roller at its end
   C is the cam's centre. For a swinging arm the law gives the arc the roller travels: its angle grows by s/L. */
function camPose(c, f, C, th) {
  if (f.kind === 'rock') {
    const A = Math.hypot(C[0] - f.O[0], C[1] - f.O[1]), beta = Math.atan2(C[1] - f.O[1], C[0] - f.O[0]), R0 = c.r + f.rr, s = camS(c, th)[0];
    const psi0 = Math.acos(Math.max(-1, Math.min(1, (A * A + f.L * f.L - R0 * R0) / (2 * A * f.L)))), dir = beta + f.side * (psi0 + s / f.L);
    return { x: f.O[0] + f.L * Math.cos(dir), y: f.O[1] + f.L * Math.sin(dir), dir, fits: Math.abs(A - f.L) < R0 && A + f.L > R0 };
  }
  const s = camS(c, th - f.dir)[0], e = f.kind === 'flat' ? 0 : f.e || 0, d = (f.kind === 'flat' ? c.r : camReach(c, f.rr, e)) + s, u = [Math.cos(f.dir), Math.sin(f.dir)];
  return { x: C[0] + d * u[0] - e * u[1], y: C[1] + d * u[1] + e * u[0], dir: f.dir, fits: true };
}
// the curve the follower's reference point draws on the cam (in the cam's frame): the roller centre, or for a flat face the contact point itself
function camPitch(c, f, C, N = 240) {
  return [...Array(N)].map((_, k) => {
    const phi = TAU * k / N;
    if (f.kind === 'flat') { const [s, d1] = camS(c, phi), cs = Math.cos(-phi), sn = Math.sin(-phi); return [(c.r + s) * cs + d1 * sn, (c.r + s) * sn - d1 * cs]; }   // contact sits s′ off the follower's axis
    const th = phi + (f.kind === 'rock' ? 0 : f.dir), P = camPose(c, f, C, th), dx = P.x - C[0], dy = P.y - C[1], cs = Math.cos(-th), sn = Math.sin(-th);
    return [dx * cs - dy * sn, dx * sn + dy * cs];
  });
}
// the cam's working surface: the pitch curve moved in by the roller radius
function camSurface(c, f, C, N = 240) {
  const pitch = camPitch(c, f, C, N), rr = f.kind === 'flat' ? 0 : f.rr || 0; if (!rr) return pitch;
  return pitch.map((p, k) => { const a = pitch[mod(k - 1, N)], b = pitch[(k + 1) % N], tx = b[0] - a[0], ty2 = b[1] - a[1], L = Math.hypot(tx, ty2) || 1; let nx = ty2 / L, ny = -tx / L; if (nx * p[0] + ny * p[1] > 0) { nx = -nx; ny = -ny; } return [p[0] + nx * rr, p[1] + ny * rr]; });
}
/* Figures over the turn for any follower: pressure angle at each step and its largest value, the smallest radius of curvature,
   the angle usually allowed (30° translating, 45° swinging), and whether the surface stays convex (flat face) or clear of undercut. */
function camFollowerCheck(c, f, C, N = 360) {
  const alphas = new Array(N).fill(0); let rho = Infinity, vmax = 0, amax = 0;
  for (let k = 0; k < N; k++) { const [, d1, d2] = camS(c, TAU * k / N); vmax = Math.max(vmax, Math.abs(d1)); amax = Math.max(amax, Math.abs(d2)); }
  if (f.kind === 'flat') { for (let k = 0; k < N; k++) { const [s, , d2] = camS(c, TAU * k / N); rho = Math.min(rho, c.r + s + d2); } return { alphas, alpha: 0, rho, allow: Math.PI / 6, vmax, amax, rmin: 0, flat: true }; }
  if (f.kind === 'roller') { const k0 = camCheck(c, f.rr, Math.PI / 6, N, f.e || 0); for (let k = 0; k < N; k++) alphas[k] = camPressure(c, f.rr, TAU * k / N, f.e || 0); return { alphas, alpha: k0.alpha, rho: k0.rho, allow: Math.PI / 6, vmax, amax, rmin: k0.rmin }; }
  const P = camPitch(c, f, C, N);
  for (let k = 0; k < N; k++) {
    const a = P[mod(k - 1, N)], b = P[k], d = P[(k + 1) % N], th = TAU * k / N, tx = d[0] - a[0], ty2 = d[1] - a[1], L = Math.hypot(tx, ty2) || 1, cs = Math.cos(th), sn = Math.sin(th);
    const nx = (ty2 * cs + tx * sn) / L, ny = (ty2 * sn - tx * cs) / L, dir = camPose(c, f, C, th).dir, dot = Math.abs(-nx * Math.sin(dir) + ny * Math.cos(dir));
    alphas[k] = Math.acos(Math.min(1, dot));
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bd = Math.hypot(d[0] - b[0], d[1] - b[1]), ad = L, area = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1])) / 2;
    const turn = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);   // the curve runs clockwise in the cam's frame: convex where this is negative
    if (area > 1e-12 && turn < 0) rho = Math.min(rho, ab * bd * ad / (4 * area));
  }
  return { alphas, alpha: Math.max(...alphas), rho, allow: Math.PI / 4, vmax, amax, rmin: 0 };
}

/* ---------- Geneva drive ----------
   A crank of radius r with a pin turns a wheel of z radial slots; centre distance a = r / sin(π/z), so the pin enters and leaves
   each slot along the slot. phi is the crank angle from the line crank → wheel. The wheel turns only while |phi| < π/2 − π/z
   in each crank turn, by 2π/z the other way, and stands still (locked) for the rest. Returns the wheel's angle from the line wheel → crank. */
function genevaTurn(z, phi) {
  const n = Math.floor((phi + Math.PI) / TAU), f = phi - n * TAU, lam = Math.sin(Math.PI / z), f0 = Math.PI / 2 - Math.PI / z;
  const d = Math.abs(f) < f0 ? Math.atan2(-lam * Math.sin(f), 1 - lam * Math.cos(f)) : -Math.sign(f) * Math.PI / z;
  return { angle: -n * TAU / z + d, moving: Math.abs(f) < f0 };
}
