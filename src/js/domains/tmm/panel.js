/* Gear Bench — mechanisms in the interface: figures, fields and graphs for a picked link, and joint paths on the bench. */
'use strict';

const dynCache = { key: '', val: null };
// the cycle of the mechanism a link belongs to, with the series worth plotting for that link
function tmmSeries(p) {
  const cam = p.type === 'tcam' ? p : p.type === 'tfollow' ? camOf(p) : null;
  if (cam) { // a cam and its follower: the law itself over one turn
    const f = p.type === 'tfollow' ? p : parts.find(q => q.type === 'tfollow' && camOf(q) === cam), rr = f ? f.rr || 0 : 0, w = Math.abs(cam.w) * RPM, sg = cam.w < 0 ? -1 : 1, N = 180;
    const d = [...Array(N)].map((_, k) => camS(cam, TAU * k / N));
    const e = f ? f.e || 0 : 0;
    return { cam, f, rr, e, w, cyc: { ok: true, N }, chk: camCheck(cam, rr, Math.PI / 6, 720, e), at: () => mod(linkTh(cam) - (f ? f.dir : 0), TAU) / TAU, series: [
      { name: 's', unit: 'mm', data: d.map(x => x[0] * 1e-3) }, { name: 'v', unit: 'm/s', data: d.map(x => x[1] * w * sg * 1e-3) }, { name: 'a', unit: 'm/s2', data: d.map(x => x[2] * w * w * 1e-3) },
      { name: 'α', unit: 'deg', data: d.map((x, k) => camPressure(cam, rr, TAU * k / N, e)) }] };
  }
  const c = p.type === 'tcrank' ? p : crankOf(p); if (!c || linkFixed(p) && p !== c) return null;
  const cyc = tmmCycle(c); if (!cyc.ok) return { cyc, series: [] };
  const w = Math.abs(c.w) * RPM, key = [c.id, p.id, w, cyc.Q.length, cyc.Q[0] && cyc.Q[0][0], cyc.Q[90] && cyc.Q[90][0], parts.filter(isLink).map(q => [q.F, q.fw, q.m, q.len]).join(), parts.filter(q => q.type === 'flywheel').map(q => [q.d, q.J, q.w]).join()].join('|');
  if (dynCache.key === key) return dynCache.val;
  const dyn = cycDynamics(cyc, w), ks = [...Array(cyc.N).keys()], series = [];
  if (p === c) { if (dyn) series.push({ name: 'M', unit: 'Nm', data: dyn.Mb, mean: dyn.mean }); }
  else if (SLIDES.includes(p.type)) {
    const d = ks.map(k => cycD(cyc, k, i => cycTravel(cyc, i, p))), s0 = Math.min(...d.map(x => x[0]));
    series.push({ name: 's', unit: 'mm', data: d.map(x => (x[0] - s0) * 1e-3) }, { name: 'v', unit: 'm/s', data: d.map(x => x[1] * w * 1e-3) }, { name: 'a', unit: 'm/s2', data: d.map(x => x[2] * w * w * 1e-3) });
    if (p.F && dyn) series.push({ name: 'F', unit: 'N', data: ks.map(k => -cycResist(cyc, k, p, cyc.span.get(p.id))) });
  } else {
    const d = ks.map(k => cycD(cyc, k, i => cycAngle(cyc, i, p.id))), a0 = Math.min(...d.map(x => x[0]));
    series.push({ name: 'θ', unit: 'deg', data: d.map(x => x[0] - a0) }, { name: 'ω', unit: 'rad/s', data: d.map(x => x[1] * w) }, { name: 'ε', unit: 'rad/s2', data: d.map(x => x[2] * w * w) });
  }
  return (dynCache.key = key, dynCache.val = { cyc, series, dyn, w, c });
}
const peakOf = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
// figures of a link over the cycle, each with where it comes from
function tmmCycleRows(p) {
  const S = tmmSeries(p), rows = []; if (!S) return rows;
  if (!S.cyc.ok) return [[t('io.cycle'), t('io.noTurn')]];
  if (S.cam) {
    const c = S.cam, k = S.chk, D = 180 / Math.PI, wv0 = [['ω', S.w, 'rpm']], R0 = [['r', c.r * 1e-3, 'mm'], ['r_r', S.rr * 1e-3, 'mm']];
    return [
      [t('io.lift'), fmtU(c.h * 1e-3, 'mm')],
      [t('io.vmax'), fmtU(k.vmax * S.w * 1e-3, 'm/s'), ex('v', k.vmax * S.w * 1e-3, 'm/s', 'v = (ds/dφ)·ω', [["s′_max", k.vmax * 1e-3, 'mm'], ...wv0], ['ex.camLaw'])],
      [t('io.amax'), fmtU(k.amax * S.w * S.w * 1e-3, 'm/s2'), ex('a', k.amax * S.w * S.w * 1e-3, 'm/s2', 'a = (d²s/dφ²)·ω²', [["s″_max", k.amax * 1e-3, 'mm'], ...wv0], ['ex.camLaw', 'ex.constW'])],
      [t('io.alpha'), `${fmtNum(k.alpha * D)}°`, ex('α', k.alpha, 'deg', "tan α = (s′ − e) / (√((r + r_r)² − e²) + s)", [...R0, ['e', S.e * 1e-3, 'mm']], ['ex.camInline', 'ex.camAllow'])],
      [t('io.rmin'), fmtU(Math.max(0, k.rmin) * 1e-3, 'mm'), ex('r_min', Math.max(0, k.rmin) * 1e-3, 'mm', "r_min = max(|s′| / tan[α] − s) − r_r,   [α] = 30°", [['r_r', S.rr * 1e-3, 'mm']], ['ex.camInline'])],
      [t('io.rho'), isFinite(k.rho) ? fmtU(k.rho * 1e-3, 'mm') : '∞', ex('ρ_min', k.rho * 1e-3, 'mm', "ρ = (R² + R′²)^1.5 / (R² + 2R′² − R·R″),   R = r + r_r + s", R0, ['ex.camRho'])],
    ];
  }
  const w = S.w, wv = [['ω', w, 'rpm']];
  if (SLIDES.includes(p.type)) {
    const [s, v, a] = S.series;
    rows.push([t('io.stroke'), fmtU(Math.max(...s.data), 'mm'), ex('H', Math.max(...s.data), 'mm', 'H = s_max − s_min', [], ['ex.cycle'])]);
    rows.push([t('io.vmax'), fmtU(peakOf(v.data), 'm/s'), ex('v', peakOf(v.data), 'm/s', 'v = (ds/dφ)·ω', wv, ['ex.cycle'])]);
    rows.push([t('io.amax'), fmtU(peakOf(a.data), 'm/s2'), ex('a', peakOf(a.data), 'm/s2', 'a = (d²s/dφ²)·ω²', wv, ['ex.cycle', 'ex.constW'])]);
    rows.push(...deadRows(S, v.data), ...angleRows(S, p));
  } else if (p !== S.c) {
    const [th, om, ep] = S.series;
    rows.push([t('io.swing'), fmtU(Math.max(...th.data), 'deg'), ex('ψ', Math.max(...th.data), 'deg', 'ψ = θ_max − θ_min', [], ['ex.cycle'])]);
    rows.push([t('io.wmax'), fmtU(peakOf(om.data), 'rad/s'), ex('ω₂', peakOf(om.data), 'rad/s', 'ω₂ = (dθ/dφ)·ω', wv, ['ex.cycle'])]);
    rows.push([t('io.emax'), fmtU(peakOf(ep.data), 'rad/s2'), ex('ε', peakOf(ep.data), 'rad/s2', 'ε = (d²θ/dφ²)·ω²', wv, ['ex.cycle', 'ex.constW'])]);
    rows.push(...deadRows(S, om.data), ...angleRows(S, p));
  } else if (S.dyn) {
    const d = S.dyn, J = crankJ(p), g = tmmGrashof(p);
    if (g) rows.push([t('io.grashof'), t('gr.' + g.kind), ex('s + l', (g.s + g.l) * 1e-3, 'mm', 's + l ≤ p + q', [['s', g.s * 1e-3, 'mm'], ['l', g.l * 1e-3, 'mm'], ['p + q', g.rest * 1e-3, 'mm']], ['ex.grashof'])]);
    rows.push([t('io.Mmean'), fmtU(d.mean, 'Nm'), ex('M̄', d.mean, 'Nm', 'M̄ = (1/2π)·∮ M(φ) dφ', [], ['ex.kstat'])]);
    rows.push([t('io.Mpeak'), fmtU(d.peak, 'Nm'), ex('M_max', d.peak, 'Nm', 'Σ F = m·a,  Σ M = J·ε', wv, ['ex.kstat', 'ex.constW'])]);
    rows.push([t('io.Pmean'), fmtU(d.mean * w, 'power'), ex('P', d.mean * w, 'power', 'P = M̄·ω', [['M̄', d.mean, 'Nm'], ...wv], [])]);
    if (d.dA > 1e-9 && w) {
      rows.push([t('io.dA'), fmtU(d.dA, 'energy'), ex('ΔA', d.dA, 'energy', 'ΔA = max − min of ∫(M̄ − M) dφ', [], ['ex.fly'])]);
      if (J > 0) rows.push([t('io.delta'), fmtNum(d.dA / (J * w * w)), ex('δ', d.dA / (J * w * w), '', 'δ = ΔA / (J·ω²)', [['ΔA', d.dA, 'energy'], ['J', J, 'kgm2'], ...wv], ['ex.fly', 'ex.flyJ'])]);
      rows.push([t('io.Jreq'), fmtU(d.dA / (0.05 * w * w), 'kgm2'), ex('J', d.dA / (0.05 * w * w), 'kgm2', 'J = ΔA / (δ·ω²),   δ = 1/20', [['ΔA', d.dA, 'energy'], ...wv], ['ex.fly'])]);
    }
  }
  if (S.dyn && S.dyn.R) { // reactions in this link's pairs: now, and the most over the turn
    const k = Math.floor(cycIndex(S.cyc)) % S.cyc.N, row = (name, arr) => rows.push([`${t('io.R')} ${name}`, `${fmtU(arr[k], 'force')} (${t('io.upTo')} ${fmtU(Math.max(...arr), 'force')})`, ex('R', arr[k], 'force', 'Σ F = m·a,   Σ M = J·ε', wv, ['ex.kstat', 'ex.constW'])]);
    for (const q of pairsOf(p)) { const arr = S.dyn.R.get(q.id), o = byId(q.a === p.id ? q.b : q.a); if (arr && o) row(o.name, arr); }
    if (p === S.c) row(t('io.frame'), S.dyn.base);
  }
  return rows;
}
// Grashof's rule for a crank that drives a plain four-bar: crank, coupler, rocker on a frame hinge
function tmmGrashof(c) {
  const g = tmmInfo.of.get(c.id); if (!g || g.n !== 3) return null;
  const ls = g.ids.map(byId), bars = ls.filter(p => BAR.includes(p.type)); if (bars.length !== 3 || pairs.some(q => q.type !== 'R' && g.ids.includes(q.b))) return null;
  const rock = bars.find(p => p !== c && pairs.some(q => (q.a === p.id || q.b === p.id) && ty(byId(q.a === p.id ? q.b : q.a), 'pivot'))), coup = bars.find(p => p !== c && p !== rock); if (!rock || !coup) return null;
  const pq = pairs.find(q => (q.a === rock.id || q.b === rock.id) && ty(byId(q.a === rock.id ? q.b : q.a), 'pivot')), pv = byId(pq.a === rock.id ? pq.b : pq.a), d = Math.hypot(pv.x - c.x, pv.y - c.y);
  const r = grashof(c.len, coup.len, rock.len, d); return { ...r, rest: c.len + coup.len + rock.len + d - r.s - r.l };
}
// load and mass fields of a link
function tmmFields(p) {
  if (p.type === 'tcam') { const P = { ...CAM_DEF, ...p }, ang = (key, k) => slider(t(key), 5, 350, 1, () => P[k], v => { p[k] = v; commit(); }, '°');
    return [labelled(t('cam.law'), choice(['cyc', 'harm', 'par', 'lin'].map(k => [k, t('cam.' + k)]), P.law, v => { p.law = v; commit(); })), ang('cam.b1', 'b1'), ang('cam.bd', 'bd'), ang('cam.b2', 'b2')]; }
  if (p.type === 'tfollow') return [slider(t('cam.e'), -60, 60, 0.5, () => p.e || 0, v => { p.e = v; commit(); }, unitSym('mm'))];
  const out = [], num = (key, k, lo, hi, step, unit, def = 0) => slider(t(key), lo, hi, step, () => p[k] == null ? def : p[k], v => { p[k] = v; commit(); }, unit);
  if (SLIDES.includes(p.type)) out.push(num('link.F', 'F', 0, 1e6, 1, unitSym('N')), slider(t('link.fw'), 1, 100, 1, () => Math.round((p.fw == null ? 1 : p.fw) * 100), v => { p.fw = v / 100; commit(); }, '%'));
  if (!ty(p, 'pivot', 'guide')) out.push(num('link.m', 'm', 0, 10000, 0.01, unitSym('kg')));
  return out;
}
/* Graphs over one turn of the crank for the picked link. The marker is where the crank is now. */
function drawGraphs(cvs, p) {
  const S = tmmSeries(p), n = S && S.cyc.ok ? S.series.length : 0, H = 66, dpr2 = window.devicePixelRatio || 1, Wc = cvs.clientWidth || 300;
  cvs.style.height = n * H + 'px'; cvs.hidden = !n; if (!n) return;
  if (cvs.width !== Math.round(Wc * dpr2) || cvs.height !== Math.round(n * H * dpr2)) { cvs.width = Math.round(Wc * dpr2); cvs.height = Math.round(n * H * dpr2); }
  const g = cvs.getContext('2d'); g.setTransform(dpr2, 0, 0, dpr2, 0, 0); g.clearRect(0, 0, Wc, n * H);
  const at = S.at ? S.at() : cycIndex(S.cyc) / S.cyc.N, x0 = 4, x1 = Wc - 4;
  S.series.forEach((sr, i) => {
    const top = i * H + 16, bot = (i + 1) * H - 6; let lo = Math.min(0, ...sr.data), hi = Math.max(0, ...sr.data); if (hi - lo < 1e-12) hi = lo + 1;
    const X = k => x0 + (x1 - x0) * k / sr.data.length, Y = v => bot - (bot - top) * (v - lo) / (hi - lo);
    g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(0)); g.lineTo(x1, Y(0)); g.stroke();
    if (sr.mean != null) { g.setLineDash([4, 3]); g.strokeStyle = C.brass; g.beginPath(); g.moveTo(x0, Y(sr.mean)); g.lineTo(x1, Y(sr.mean)); g.stroke(); g.setLineDash([]); }
    g.strokeStyle = C.ink; g.lineWidth = 1.5; g.beginPath(); sr.data.forEach((v, k) => k ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v))); g.lineTo(X(sr.data.length), Y(sr.data[0])); g.stroke();
    const k = Math.floor(at * sr.data.length) % sr.data.length, mx = X(at * sr.data.length);
    g.strokeStyle = C.select; g.lineWidth = 1; g.beginPath(); g.moveTo(mx, top); g.lineTo(mx, bot); g.stroke(); g.fillStyle = C.select; g.beginPath(); g.arc(mx, Y(sr.data[k]), 2.5, 0, TAU); g.fill();
    const show = v => fmtU(v, sr.unit);
    g.font = `11px ${C.mono}`; g.textBaseline = 'alphabetic'; g.fillStyle = C.ink; g.textAlign = 'left'; g.fillText(`${sr.name} = ${show(sr.data[k])}`, x0, top - 5);
    g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText(`${show(lo)} … ${show(hi)}`, x1, top - 5);
  });
}
// the paths the joints of a picked link trace over one turn of the crank
function tmmDrawPath(g, s) {
  if (linkFixed(g) && g.type !== 'tcrank') return;
  const c = g.type === 'tcrank' ? g : crankOf(g), hit = c && cycCache.get(c.id), cyc = hit && hit.cyc; if (!cyc || !cyc.ok) return;
  ctx.save(); ctx.strokeStyle = C.select; ctx.lineWidth = 1 / s; ctx.setLineDash([3 / s, 2.5 / s]);
  jointsOf(g).forEach((loc, j) => { if (g === c && j === 0) return; ctx.beginPath(); for (let k = 0; k <= cyc.N; k++) { const P = cycPoint(cyc, k % cyc.N, g.id, loc); k ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); } ctx.stroke(); });
  ctx.restore();
}

// crank angles, from where it stands at the start of the cycle, at which the output link stops and turns back
function deadRows(S, rate) {
  const N = rate.length, at = []; for (let k = 0; k < N; k++) { const a = rate[k], b = rate[(k + 1) % N]; if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) at.push(Math.round((k + Math.abs(a) / (Math.abs(a) + Math.abs(b) || 1)) * 360 / N)); }
  if (!at.length || at.length > 4) return [];
  const th0 = mod(S.cyc.th0 * 180 / Math.PI, 360);
  return [[t('io.dead'), at.map(a => `${Math.round(mod(th0 + S.cyc.sign * a, 360))}°`).join(', '), ex('φ', at[0] * Math.PI / 180, 'deg', 'ds/dφ = 0', [], ['ex.dead'])]];
}
/* The angle that tells how well the driving link pushes the driven one, at its worst over the turn:
   for a slider, the pressure angle between the rod and the guide (should stay under about 30°);
   for a rocker, the transmission angle between the coupler and the rocker (should stay over about 40°). */
function linkAngle(S, p) {
  const drv = pairs.filter(q => q.type === 'R' && (q.a === p.id || q.b === p.id)).map(q => byId(q.a === p.id ? q.b : q.a)).find(o => o && BAR.includes(o.type) && !linkFixed(o)); if (!drv) return null;
  const rail = SLIDES.includes(p.type) ? railOf(p) : null; if (SLIDES.includes(p.type) && !rail) return null;
  let worst = rail ? 0 : Math.PI / 2;
  for (let k = 0; k < S.cyc.N; k++) { let a = Math.abs(wrap(cycAngle(S.cyc, k, drv.id) - (rail ? cycAngle(S.cyc, k, rail.id) : cycAngle(S.cyc, k, p.id)))); if (a > Math.PI / 2) a = Math.PI - a; worst = rail ? Math.max(worst, a) : Math.min(worst, a); }
  return { worst, slider: !!rail, drv };
}
function angleRows(S, p) {
  const a = linkAngle(S, p); if (!a) return [];
  return [[t(a.slider ? 'io.press' : 'io.trans'), `${fmtNum(a.worst * 180 / Math.PI, 3)}°`, ex(a.slider ? 'ϑ' : 'μ', a.worst, 'deg', a.slider ? 'ϑ = ∠(rod, guide)' : 'μ = ∠(coupler, rocker)', [], [a.slider ? 'ex.press' : 'ex.trans'])]];
}
addCheck('angles', () => {
  const out = [];
  for (const p of parts) if (isLink(p) && !linkFixed(p) && (SLIDES.includes(p.type) || p.type === 'trocker')) {
    const c = crankOf(p); if (!c || !c.w) continue; const cyc = tmmCycle(c); if (!cyc.ok) continue; const a = linkAngle({ cyc }, p); if (!a) continue;
    if (a.slider ? a.worst > 0.61 : a.worst < 0.52) out.push({ level: 'warn', code: a.slider ? 'w.press' : 'w.trans', text: t(a.slider ? 'w.press' : 'w.trans', { a: p.name, d: fmtNum(a.worst * 180 / Math.PI, 3) }), ids: [p.id] });
  }
  return out;
});
/* Plans of velocities and accelerations for the position the mechanism is in: every joint's vector drawn from one pole,
   the ends of joints that sit on one link joined by a thin line (the relative velocity or acceleration within that link). */
function drawPlans(cvs, p) {
  const c = p.type === 'tcrank' ? p : crankOf(p), cyc = c && tmmCycle(c), dpr2 = window.devicePixelRatio || 1, Wc = cvs.clientWidth || 300, Hc = 150, ok = cyc && cyc.ok && c.w;
  cvs.hidden = !ok; if (!ok) return;
  cvs.style.height = Hc + 'px'; if (cvs.width !== Math.round(Wc * dpr2)) { cvs.width = Math.round(Wc * dpr2); cvs.height = Math.round(Hc * dpr2); }
  const g = cvs.getContext('2d'); g.setTransform(dpr2, 0, 0, dpr2, 0, 0); g.clearRect(0, 0, Wc, Hc); g.font = `10px ${C.mono}`; g.textBaseline = 'middle';
  const k = Math.floor(cycIndex(cyc)) % cyc.N, w = Math.abs(c.w) * RPM, links = [c, ...cyc.moving], pts = new Map();
  for (const L of links) jointsOf(L).forEach((loc, j) => { if (L === c && j === 0) return; const X = cycD(cyc, k, i => cycPoint(cyc, i, L.id, loc)[0]), Y = cycD(cyc, k, i => cycPoint(cyc, i, L.id, loc)[1]), key = Math.round(X[0] * 20) + ':' + Math.round(Y[0] * 20);
    if (!pts.has(key)) pts.set(key, { v: [X[1] * w * 1e-3 * cyc.sign, Y[1] * w * 1e-3 * cyc.sign], a: [X[2] * w * w * 1e-3, Y[2] * w * w * 1e-3], names: [], links: [] }); const r = pts.get(key); r.names.push(L.name); r.links.push(L.id); });
  const P = [...pts.values()];
  [['v', 'm/s', 'p'], ['a', 'm/s2', 'π']].forEach(([f, unit, pole], i) => {
    const x0 = i * Wc / 2, cx = x0 + Wc / 4, cy = Hc / 2 + 8, mx = Math.max(1e-9, ...P.map(r => Math.hypot(r[f][0], r[f][1]))), sc = Math.min(Wc / 4 - 14, Hc / 2 - 22) / mx, tip = r => [cx + r[f][0] * sc, cy + r[f][1] * sc];
    g.strokeStyle = C.line; g.lineWidth = 1; for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) if (P[a].links.some(id => P[b].links.includes(id))) { const A = tip(P[a]), B = tip(P[b]); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); }
    for (const r of P) { const T2 = tip(r); g.strokeStyle = i ? C.brass : C.select; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(T2[0], T2[1]); g.stroke(); g.fillStyle = C.ink; g.textAlign = T2[0] >= cx ? 'left' : 'right'; g.fillText(r.names.join('/'), T2[0] + (T2[0] >= cx ? 3 : -3), T2[1]); }
    g.fillStyle = C.ink; g.beginPath(); g.arc(cx, cy, 2, 0, TAU); g.fill(); g.textAlign = 'right'; g.fillText(pole, cx - 4, cy - 6);
    g.textAlign = 'left'; g.fillStyle = C.muted; g.fillText(`${f}: ${t('io.upTo')} ${fmtU(mx, unit)}`, x0 + 5, 9);
  });
}
