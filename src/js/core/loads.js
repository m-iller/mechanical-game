/* Gear Bench core — mechanical characteristics of sources and loads, and the operating point where they meet.
   SI throughout: torque N·m, speed rad/s, power W. Speeds here are magnitudes in the source's forward direction. No DOM here.

   Sources (m.kind):
     speed      ideal source: holds the set speed whatever the load; m.tq is its rated torque
     torque     constant torque up to a speed limit
     induction  three-phase induction motor, simplified Kloss formula on the working branch:
                  M = 2·Mk / (s/sk + sk/s),  s = 1 − ω/ω0,  sk = s_nom·(λ + √(λ² − 1)),  Mk = λ·M_nom
                and a straight line in s from (sk, Mk) to the catalogue starting torque at s = 1
     dc         DC motor with a straight characteristic through the starting torque and the nominal point
     stepper    holds the commanded speed while the load stays under the pull-out torque min(M_hold, P/ω), otherwise stalls
     ice        piston engine: M = M_max·(0.75 + x − x²), x = ω/ω_max, cut off by the governor above ω_max
     power      constant power up to a speed limit: M = P/ω
   Loads (l.kind): const, linear (M ∝ ω), quad (M ∝ ω², fans and pumps), table of [rpm, N·m] points. */
'use strict';

const W_RPM = Math.PI / 30;
const SYNC_50HZ = [500, 600, 750, 1000, 1500, 3000];   // rpm for 12 … 2 poles
// synchronous speed behind a nominal speed: the nearest 50 Hz value above it
const syncRpm = n => SYNC_50HZ.find(s => s > n) || n * 1.03;

function sourceOf(m) {
  const kind = m.kind || 'speed', wNom = Math.max(1e-6, Math.abs(m.n || m.rpm || 0) * W_RPM);
  if (kind === 'speed') { const w0 = Math.abs(m.rpm) * W_RPM; return { kind, ideal: true, w0, wNom: w0, Mnom: m.tq, M: () => m.tq }; }
  if (kind === 'torque') return { kind, ideal: false, w0: wNom, wNom, Mnom: m.tq, M: w => w <= wNom ? m.tq : 0 };
  if (kind === 'ice') { // piston engine: torque peaks at half the top speed, the governor cuts it off just above the top speed
    return { kind, ideal: false, w0: 1.08 * wNom, wNom, Mnom: m.tq, M: w => { const x = w / wNom; return x <= 1 ? m.tq * (0.75 + x - x * x) : Math.max(0, m.tq * 0.75 * (1.08 - x) / 0.08); } };
  }
  if (kind === 'power') { // a machine that gives its power at any speed (a turbine fed with a set flow): M = P/ω up to the speed limit
    const Mn = m.P / wNom; return { kind, ideal: false, w0: wNom, wNom, Mnom: Mn, M: w => w <= wNom ? m.P / Math.max(w, 0.05 * wNom) : 0 };
  }
  const Mnom = m.P / wNom, ks = m.ks || 1.5;
  if (kind === 'dc') {
    const Ms = Math.max(ks, 1.05) * Mnom, w0 = wNom / (1 - Mnom / Ms);
    return { kind, ideal: false, w0, wNom, Mnom, M: w => Math.max(0, Ms * (1 - w / w0)) };
  }
  if (kind === 'stepper') { const Mh = ks * Mnom; return { kind, ideal: true, w0: wNom, wNom, Mnom, M: w => Math.min(Mh, m.P / Math.max(w, 1e-9)) }; }
  // induction
  const w0 = syncRpm(wNom / W_RPM) * W_RPM, sn = 1 - wNom / w0, lam = Math.max(m.km || 2.2, 1.01), sk = Math.min(0.95, sn * (lam + Math.sqrt(lam * lam - 1))), Mk = lam * Mnom;
  const M = w => {
    const s = 1 - w / w0;
    if (s <= 0) return 0;
    if (s <= sk) return 2 * Mk / (s / sk + sk / s);
    return Mk + (ks * Mnom - Mk) * (s - sk) / (1 - sk);
  };
  return { kind, ideal: false, w0, wNom, Mnom, M, sn, sk, Mk };
}

function loadOf(l) {
  const wn = Math.max(1e-6, Math.abs(l.n || 0) * W_RPM), tq = l.tq || 0;
  switch (l.kind) {
    case 'linear': return w => tq * w / wn;
    case 'quad': return w => tq * (w / wn) ** 2;
    case 'table': {
      const pts = (l.table || []).map(([n, m]) => [n * W_RPM, m]).sort((a, b) => a[0] - b[0]);
      if (!pts.length) return () => 0;
      return w => {
        if (w <= pts[0][0]) return pts[0][1];
        for (let i = 1; i < pts.length; i++) if (w <= pts[i][0]) { const [w0, m0] = pts[i - 1], [w1, m1] = pts[i]; return m0 + (m1 - m0) * (w - w0) / (w1 - w0 || 1); }
        return pts[pts.length - 1][1];
      };
    }
    default: return () => tq;
  }
}

/* Loads seen from the source shaft. Each item: k = ω_load/ω_source, eta = efficiency of the path between them, M = load torque law.
   Power balance per load: M_reduced·ω = M(kω)·kω / eta. */
const reduceLoads = items => w => items.reduce((s, it) => s + Math.abs(it.k) * it.M(Math.abs(it.k) * w) / (it.eta || 1), 0);

/* Steady speed where the source's torque equals the reduced load torque.
   Walks down from the no-load speed to the first crossing, so it lands on the stable working branch, then bisects.
   Returns { w, M, P, ratio: M/M_nom, stalled, starts, slip }. */
function operatingPoint(src, Mload) {
  const done = (w, stalled) => {
    const M = stalled ? 0 : Mload(w), M0 = Mload(0);
    return { w, M, P: M * w, ratio: src.Mnom ? M / src.Mnom : 0, stalled, starts: src.M(0) >= M0, slip: src.ideal || !src.w0 ? 0 : 1 - w / src.w0 };
  };
  if (src.ideal) { const need = Mload(src.w0); return src.kind === 'stepper' && need > src.M(src.w0) ? done(0, true) : done(src.w0, false); }
  const f = w => src.M(w) - Mload(w), N = 400;
  let hi = src.w0;
  if (f(hi) >= 0) return done(hi, false);
  for (let i = 1; i <= N; i++) {
    const lo = src.w0 * (1 - i / N);
    if (f(lo) >= 0) { let a = lo, b = hi; for (let k = 0; k < 60; k++) { const c = (a + b) / 2; if (f(c) >= 0) a = c; else b = c; } return done((a + b) / 2, false); }
    hi = lo;
  }
  return done(0, true);
}
