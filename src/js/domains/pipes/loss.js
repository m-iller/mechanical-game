/* Gear Bench — pipes: fluids and pressure losses. SI throughout. No DOM here.
   One pipe is one lumped resistance: Δp = (λ·L/d + Σζ)·ρ·v²/2, v = 4Q/(π·d²).
   Friction factor λ:  Re < 2300   laminar, λ = 64/Re (Poiseuille)
                       Re > 4000   Altshul's formula λ = 0.11·(ε/d + 68/Re)^0.25 — Blasius for smooth pipes, Shifrinson for rough ones
                       between     a straight blend of the two, so Δp(Q) stays continuous
   Gases are treated as incompressible at the line's mean density: fair while the pressure drop is under a tenth of the pressure. */
'use strict';

/* rho kg/m³, nu m²/s. vmax: recommended speed by line kind, m/s (hydraulic drive practice: pressure 3–6, return 2, suction 0.5–1.5). */
const FLUIDS = {
  oil:   { phase: 'liquid', rho: 870, nu: 46e-6, vmax: { pressure: 5, return: 2, suction: 1.2, drain: 1, pilot: 5 } },    // mineral oil ISO VG 46 at 40 °C
  water: { phase: 'liquid', rho: 998, nu: 1.0e-6, vmax: { pressure: 3, return: 2, suction: 1, drain: 1, pilot: 3 } },      // 20 °C
  air:   { phase: 'gas', rho: 1.204, nu: 15.1e-6, vmax: { pressure: 20 } },                                                // 20 °C, 1 bar; density is rescaled by pressure
  steam: { phase: 'gas', rho: 0.59, nu: 21e-6, vmax: { pressure: 40 } },                                                   // saturated at 1 bar
  flue:  { phase: 'gas', rho: 0.46, nu: 80e-6, vmax: { pressure: 30 } },                                                   // combustion products near 500 °C, 1 bar
};
// typical local resistance coefficients ζ, referred to the speed in the pipe
const ZETA = { elbow: 1.1, bend: 0.3, tee: 1.3, teeRun: 0.2, reducer: 0.3, entry: 0.5, exit: 1.0, valveOpen: 3 };
// absolute roughness, m
const ROUGH = { steel: 0.05e-3, drawn: 0.0015e-3, hose: 0.03e-3, cast: 0.25e-3 };

const reynolds = (v, d, nu) => Math.abs(v) * d / nu;
function frictionFactor(Re, rel = 0) {
  if (Re < 1e-9) return 0;
  const lam = 64 / Re, tur = r => 0.11 * (rel + 68 / r) ** 0.25;
  if (Re <= 2300) return lam;
  if (Re >= 4000) return tur(Re);
  const k = (Re - 2300) / 1700; return 64 / 2300 * (1 - k) + tur(4000) * k;
}
const pipeArea = d => Math.PI * d * d / 4;
/* Loss in one pipe for flow Q (m³/s, either sign). pipe: { d, L, eps, zeta }. Returns the speed, Re, λ, regime and the drop with the sign of Q. */
function pipeLoss(pipe, Q, fluid) {
  const A = pipeArea(pipe.d), v = Q / A, Re = reynolds(v, pipe.d, fluid.nu), lam = frictionFactor(Re, (pipe.eps || 0) / pipe.d), dyn = fluid.rho * v * Math.abs(v) / 2;
  const dpL = lam * pipe.L / pipe.d * dyn, dpM = (pipe.zeta || 0) * dyn;
  return { v, Re, lam, regime: Re <= 2300 ? 'laminar' : Re < 4000 ? 'transition' : 'turbulent', dpL, dpM, dp: dpL + dpM };
}
// flow through a sharp-edged opening of area A under a pressure difference dp: Q = Cd·A·√(2·|dp|/ρ)
const orificeFlow = (dp, A, rho, Cd = 0.62) => Math.sign(dp) * Cd * A * Math.sqrt(2 * Math.abs(dp) / rho);
// is the speed above what is recommended for this kind of line?
const tooFast = (v, fluid, line = 'pressure') => Math.abs(v) > (fluid.vmax[line] || fluid.vmax.pressure);

/* ---------- heat and gas figures ---------- */
// specific heat of the liquids, J/(kg·K); for the gases: cp, the adiabatic index k and the gas constant R
const HEAT_C = { oil: 1880, water: 4182 };
const GAS = { air: { cp: 1005, k: 1.4, R: 287 }, flue: { cp: 1150, k: 1.33, R: 288 }, steam: { cp: 2000, k: 1.3, R: 461.5 } };
// a pressure loss turns to heat in the fluid itself: ΔT = Δp / (ρ·c)
const heatRise = (dp, rho, c) => Math.abs(dp) / (rho * c);
const soundSpeed = (k, R, T) => Math.sqrt(k * R * T);

/* ---------- fittings: local resistance coefficients ----------
   Sources: I. E. Idelchik, "Handbook of Hydraulic Resistance" (sudden expansion — Borda–Carnot; sudden contraction; conical diffuser
   and confuser; sharp-edged orifice in a straight pipe) and Weisbach's formulas for bends and elbows and his gate-valve table.
   n is the ratio of the smaller area to the larger one, 0 < n ≤ 1. Cone coefficients are referred to the speed in the NARROW section. */
const zetaExpand = n => (1 - n) ** 2;                         // Borda–Carnot
const zetaContract = n => 0.5 * (1 - n);                      // sudden contraction
const coneFriction = (n, alphaDeg, lam) => lam / (8 * Math.sin(Math.max(0.5, Math.min(180, alphaDeg)) * Math.PI / 360)) * (1 - n * n);
// conical diffuser with the full angle α: shock factor φ = 3.2·tan^1.25(α/2) up to 40°, a sudden expansion beyond; plus wall friction
function zetaDiffuser(n, alphaDeg, lam = 0.02) {
  const phi = alphaDeg >= 40 ? 1 : Math.min(1, 3.2 * Math.tan(alphaDeg * Math.PI / 360) ** 1.25);
  return phi * zetaExpand(n) + (alphaDeg >= 40 ? 0 : coneFriction(n, alphaDeg, lam));
}
// conical confuser: Idelchik's fit of the local part over 0…180°, plus wall friction; at 180° it is the sudden contraction
function zetaConfuser(n, alphaDeg, lam = 0.02) {
  const a = Math.min(180, Math.max(0, alphaDeg)) * Math.PI / 180;
  const loc = (-0.0125 * n ** 4 + 0.0224 * n ** 3 - 0.00723 * n * n + 0.00444 * n - 0.00745) * (a ** 3 - 2 * Math.PI * a * a - 10 * a);
  return Math.max(0, loc) + (alphaDeg >= 40 ? 0 : coneFriction(n, alphaDeg, lam));
}
// a bend turning the flow by δ with the centre-line radius R = rd·d (Weisbach); rd under 0.5 is a sharp mitre elbow
function zetaBend(deltaDeg, rd) {
  const h = deltaDeg * Math.PI / 360;
  if (rd < 0.5) return 0.946 * Math.sin(h) ** 2 + 2.05 * Math.sin(h) ** 4;
  return (0.131 + 0.163 * (1 / rd) ** 3.5) * deltaDeg / 90;
}
// thin sharp-edged orifice plate of area ratio m in a straight pipe, referred to the speed in the pipe
const zetaOrifice = m => ((1 + 0.707 * Math.sqrt(Math.max(0, 1 - m)) - m) / m) ** 2;
// gate valve opened to the share h of its bore (Weisbach's table, interpolated on a log scale)
const GATE = [[0.125, 97.8], [0.25, 17], [0.375, 5.52], [0.5, 2.06], [0.625, 0.81], [0.75, 0.26], [0.875, 0.07], [1, 0.05]];
function zetaGate(h) {
  h = Math.max(GATE[0][0], Math.min(1, h));
  for (let i = 1; i < GATE.length; i++) if (h <= GATE[i][0]) { const [h0, z0] = GATE[i - 1], [h1, z1] = GATE[i], k = (h - h0) / (h1 - h0); return Math.exp(Math.log(z0) * (1 - k) + Math.log(z1) * k); }
  return GATE[GATE.length - 1][1];
}
/* One fitting for flow Q (m³/s; positive from port a to port b). f:
     { kind:'cone', d1, d2, alpha }   bores at ports a and b and the full cone angle; which way the flow goes makes it a confuser or a diffuser
     { kind:'bend', d, ang, rd }      { kind:'orif', d, d0 }      { kind:'gate', d, open }
   Returns the speeds at both ports, ζ and the speed it is referred to, the loss (always ≥ 0) and dp = p_a − p_b of the STATIC pressure:
   Bernoulli between the ports, p_a + ρ·v_a²/2 = p_b + ρ·v_b²/2 + loss. In a diffuser the static pressure rises along the flow. */
function fittingLoss(f, Q, fluid) {
  const sg = Q < 0 ? -1 : 1, rho = fluid.rho;
  if (f.kind === 'cone') {
    const A1 = pipeArea(f.d1), A2 = pipeArea(f.d2), va = Q / A1, vb = Q / A2, dn = Math.min(f.d1, f.d2), An = Math.min(A1, A2), n = An / Math.max(A1, A2), vn = Math.abs(Q) / An;
    const lam = frictionFactor(reynolds(vn, dn, fluid.nu), 0) || 0.02, narrows = (sg > 0) === (A2 < A1), mode = n > 1 - 1e-9 ? 'straight' : narrows ? 'confuser' : 'diffuser';
    const zeta = mode === 'straight' ? 0 : narrows ? zetaConfuser(n, f.alpha, lam) : zetaDiffuser(n, f.alpha, lam), loss = zeta * rho * vn * vn / 2;
    return { va, vb, vref: vn, zeta, mode, n, loss, dp: sg * loss + rho * (vb * vb - va * va) / 2 };
  }
  const v = Q / pipeArea(f.d), zeta = f.kind === 'bend' ? zetaBend(f.ang, f.rd) : f.kind === 'orif' ? zetaOrifice(Math.min(1, (f.d0 / f.d) ** 2)) : zetaGate(f.open), loss = zeta * rho * v * v / 2;
  return { va: v, vb: v, vref: Math.abs(v), zeta, mode: f.kind, loss, dp: sg * loss };
}
