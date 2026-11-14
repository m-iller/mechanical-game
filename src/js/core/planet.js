/* Gear Bench core — choosing tooth numbers for a simple planetary stage (sun zs, n planets zp, ring zr; ring held, carrier out).
   Conditions from the theory of mechanisms:
     coaxial    zr = zs + 2·zp                       (same module, no profile shift)
     neighbour  (zs + zp)·sin(π/n) > zp + 2          planets' tip circles (ha* = 1) do not touch
     assembly   (zs + zr) / n is whole               the planets can be put in at equal angles
     undercut   z ≥ 17 for standard 20° teeth; below that a shift x ≥ (17 − z)/17 is needed
   Ratio sun → carrier with the ring held: i = 1 + zr/zs. No DOM here. */
'use strict';

const Z_MIN = 17;
function planetCheck(zs, zp, zr, n) {
  return { coax: zr === zs + 2 * zp, neighbour: (zs + zp) * Math.sin(Math.PI / n) > zp + 2, assembly: (zs + zr) % n === 0, undercut: Math.min(zs, zp) >= Z_MIN, i: 1 + zr / zs };
}
const shiftMin = z => Math.max(0, (Z_MIN - z) / Z_MIN);
// tooth numbers that meet every condition and come nearest to ratio i, smallest gears first among equals
function planetPick(i, n, opt = {}) {
  const zmin = opt.zmin || Z_MIN, zmax = opt.zmax || 200, out = [];
  for (let zs = zmin; zs <= zmax; zs++) for (let zr = Math.max(zs + 2 * zmin, Math.round((i - 1) * zs) - 2); zr <= Math.min(zmax, Math.round((i - 1) * zs) + 2); zr++) {
    if ((zr - zs) % 2) continue;
    const zp = (zr - zs) / 2, c = planetCheck(zs, zp, zr, n);
    if (zp >= zmin && c.coax && c.neighbour && c.assembly) out.push({ zs, zp, zr, i: c.i, err: Math.abs(c.i - i) / i });
  }
  return out.sort((a, b) => Math.round((a.err - b.err) * 1e4) || a.zr - b.zr).slice(0, opt.top || 5);
}
