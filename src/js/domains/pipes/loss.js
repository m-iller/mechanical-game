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
