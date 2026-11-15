/* Gear Bench — tools around the bench: theme, key sheet, right-button menu, ruler, alignment, "what depends on what" graphs,
   info windows that stay with their part and are saved with the scene. */
'use strict';

/* ---------- theme ---------- */
const isDark = () => layout.theme ? layout.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
function applyTheme() { const r = document.documentElement; if (layout.theme) r.dataset.theme = layout.theme; else delete r.dataset.theme; themeLabel(); }
function themeLabel() { const b = document.getElementById('theme'); if (b && typeof t === 'function') b.textContent = t(isDark() ? 'theme.light' : 'theme.dark'); }
function toggleTheme() {
  layout.theme = isDark() ? 'light' : 'dark'; saveLayout(); applyTheme(); readTokens(); paletteIcons(); renderPalette();
}
applyTheme();

/* ---------- key sheet ---------- */
const KEYS = [['Space', 'k.pause'], ['Ctrl+Z · Ctrl+Shift+Z', 'k.undo'], ['Ctrl+C · Ctrl+X · Ctrl+V', 'k.copy'], ['Ctrl+D', 'k.dup'], ['Ctrl+A', 'k.all'], ['Delete', 'k.del'], ['R · Shift+R', 'k.rot'],
  ['Ctrl+S · Ctrl+O', 'k.file'], ['X', 'k.pipe'], ['/ · Shift+Space · Backspace', 'k.route'], ['M', 'k.measure'], ['Alt', 'k.alt'], ['Shift', 'k.shift'], ['Esc', 'k.esc'], ['?', 'k.help']];
function openKeys() { const dl = $('keys-list'); dl.textContent = ''; for (const [k, s] of KEYS) dl.append(el('dt', k), el('dd', t(s))); $('keys').hidden = false; $('keys-x').focus(); }
$('keys-x').onclick = () => { $('keys').hidden = true; };
$('keys').addEventListener('pointerdown', e => { if (e.target === $('keys')) $('keys').hidden = true; });

/* ---------- ruler ----------
   M, then two clicks: the distance between two points of the bench, its parts along x and y, and the angle.
   The points catch on centres of parts, joints of links and ports. */
let measure = null;   // { a, b } while the ruler is out
function measureSnap(w) {
  const r = Math.max(2.5, 8 / view.scale); let best = null;
  const tryPt = (x, y) => { const d = Math.hypot(x - w.x, y - w.y); if (d < r && (!best || d < best.d)) best = { d, x, y }; };
  for (const p of parts) if (shown(p)) { tryPt(p.x, p.y); if (isLink(p)) jointsOf(p).forEach((_, k) => { const q = jointPos(p, k); tryPt(q.x, q.y); }); portsOf(p).forEach((_, k) => { const q = portPos(p, k); tryPt(q.x, q.y); }); }
  return best ? { x: best.x, y: best.y } : { x: w.x, y: w.y };
}
function toggleMeasure() { measure = measure ? null : { a: null, b: null }; ui(); }
function measureClick(w) { const q = measureSnap(w); if (!measure.a || measure.b) { measure.a = q; measure.b = null; } else measure.b = q; }

/* ---------- alignment ---------- */
let guides = [];      // lines shown while a dragged part stands level with another: { x } or { y }
// a dragged part that came level with another part's centre is put exactly level; Alt switches this off
function alignSnap(g, x, y, skip) {
  guides = []; const r = 4 / view.scale; let bx = null, by = null;
  for (const o of parts) if (o !== g && !skip.has(o.id) && shown(o) && !o.mount) {
    const dx = Math.abs(o.x - x), dy = Math.abs(o.y - y);
    if (dx < r && (!bx || dx < bx.d)) bx = { d: dx, v: o.x, o }; if (dy < r && (!by || dy < by.d)) by = { d: dy, v: o.y, o };
  }
  if (bx) { x = bx.v; guides.push({ x, a: bx.o.y, b: y }); } if (by) { y = by.v; guides.push({ y, a: by.o.x, b: x }); }
  return { x, y };
}
// the picked parts put on one line, or spread evenly between the outermost two
function alignSel(how) {
  const ps = selParts().filter(p => !p.mount); if (ps.length < 2) return;
  freeze(); const ids = ps.filter(isLink).map(p => p.id); if (ids.length) tmmDetach(ids);
  const mean = k => ps.reduce((s, p) => s + p[k], 0) / ps.length;
  if (how === 'row') { const y = Math.round(mean('y')); for (const p of ps) p.y = y; }
  else if (how === 'col') { const x = Math.round(mean('x')); for (const p of ps) p.x = x; }
  else { const k = how === 'dx' ? 'x' : 'y', s = [...ps].sort((a, b) => a[k] - b[k]), lo = s[0][k], hi = s[s.length - 1][k]; s.forEach((p, i) => { p[k] = lo + (hi - lo) * i / (s.length - 1); }); }
  if (ids.length) tmmAttach(ids);
  commit();
}
const alignRow = () => rowOf(btn(t('al.row'), () => alignSel('row')), btn(t('al.col'), () => alignSel('col')), btn(t('al.dx'), () => alignSel('dx')), btn(t('al.dy'), () => alignSel('dy')));

/* ---------- what the sheet shows on top of the drawing: guides and the ruler ---------- */
function drawOverlay(bh) {
  if (bh >= H) return;
  const mid = bh + (H - bh) / 2, s = view.scale, X = x => (x - view.cx) * s + W / 2, Y = y => (y - view.cy) * s + mid;
  ctx.save(); ctx.beginPath(); ctx.rect(0, bh, W, H - bh); ctx.clip();
  if (guides.length) { ctx.strokeStyle = C.select; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.beginPath(); for (const g of guides) { if (g.x != null) { ctx.moveTo(X(g.x), Y(Math.min(g.a, g.b)) - 30); ctx.lineTo(X(g.x), Y(Math.max(g.a, g.b)) + 30); } else { ctx.moveTo(X(Math.min(g.a, g.b)) - 30, Y(g.y)); ctx.lineTo(X(Math.max(g.a, g.b)) + 30, Y(g.y)); } } ctx.stroke(); ctx.setLineDash([]); }
  if (measure && measure.a) {
    const a = measure.a, b = measure.b || (mouse && mouse.y >= bh ? measureSnap(toWorld(mouse.x, mouse.y)) : null);
    ctx.fillStyle = ctx.strokeStyle = C.select; ctx.lineWidth = 1.5;
    const dot = q => { ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), 3.5, 0, TAU); ctx.fill(); }; dot(a);
    if (b) {
      dot(b); ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
      ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke(); ctx.setLineDash([]);
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), ang = Math.atan2(-dy, dx) * 180 / Math.PI, u = unitSym('mm');
      const str = `${fmtNum(L, 4)} ${u}   Δx ${fmtNum(Math.abs(dx), 4)}   Δy ${fmtNum(Math.abs(dy), 4)}   ∠ ${fmtNum(ang, 3)}°`;
      ctx.font = `500 12px ${C.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const tx = Math.max(140, Math.min(W - 140, (X(a.x) + X(b.x)) / 2)), ty2 = (Y(a.y) + Y(b.y)) / 2 - 14, tw = ctx.measureText(str).width;
      ctx.fillStyle = C.panel; ctx.fillRect(tx - tw / 2 - 6, ty2 - 10, tw + 12, 20); ctx.strokeRect(tx - tw / 2 - 6, ty2 - 10, tw + 12, 20); ctx.fillStyle = C.select; ctx.fillText(str, tx, ty2);
    }
  }
  ctx.restore();
  for (const w of infoWins.values()) if (w.pin) { const m = markers.find(k => k.key === w.key); if (m) { w.node.style.left = Math.max(0, Math.min(W - 60, m.x + w.pin.dx)) + 'px'; w.node.style.top = Math.max(0, Math.min(H - 30, m.y + w.pin.dy)) + 'px'; } }
}

/* ---------- right-button menu ---------- */
cv.addEventListener('contextmenu', e => {
  e.preventDefault(); if (pipeDraft || linkDraft) return;
  const p = pos(e), side = p.y < bandH(), g = hit(p), w = toWorld(p.x, p.y), hp = !g && !side && pipeAt(w, Math.max(2, 6 / view.scale)); mouse = p;
  if (g) {
    if (!sel.has(g.id)) pick([g.id]);
    const many = sel.size > 1;
    openMenu(e.clientX, e.clientY, [[t('cm.info'), () => infoOpen('p' + g.id, markers.find(m => m.key === 'p' + g.id))], ...(many ? [] : [[t('btn.sweep'), () => openSweep(g)]]), null,
      [t('cm.copy'), copySel, 'Ctrl+C'], [t('cm.cut'), () => { if (copySel()) removeSel(); }, 'Ctrl+X'], [t('btn.duplicate'), duplicateSel, 'Ctrl+D'], [t('cm.rot'), () => rotateSel(15), 'R'],
      ...(many ? [null, [t('al.row'), () => alignSel('row')], [t('al.col'), () => alignSel('col')]] : []), null, [t('btn.remove'), removeSel, 'Del']]);
  } else if (hp) {
    const q = hp.q; sel = new Set(); selPipe = q.id; ui();
    openMenu(e.clientX, e.clientY, [[t('cm.info'), () => infoOpen('q' + q.id, markers.find(m => m.key === 'q' + q.id))], [t('hy.straight'), () => { q.pts = []; commit(); }, '', !q.pts.length], null, [t('btn.remove'), () => { pipes = pipes.filter(x => x !== q); selPipe = null; commit(); }, 'Del']]);
  } else openMenu(e.clientX, e.clientY, [[t('cm.paste'), pasteSel, 'Ctrl+V', !clip || side], [t('cm.measure'), toggleMeasure, 'M'], [t('hy.lay'), () => pipeStart(null), 'X'], null, [t('btn.fit'), fit], [t('file.examples'), openGallery]]);
});

/* ---------- info windows: pinned to the part, saved with the scene ---------- */
function infoPin(w) {
  const m = markers.find(k => k.key === w.key);
  w.pin = w.pin || !m ? null : { dx: w.node.offsetLeft - m.x, dy: w.node.offsetTop - m.y }; press(w.pinBtn, !!w.pin);
}
sceneExtra = () => infoWins.size ? { info: [...infoWins.values()].map(w => ({ key: w.key, x: w.node.offsetLeft, y: w.node.offsetTop, w: w.node.offsetWidth, h: w.node.offsetHeight, pin: w.pin || undefined })) } : {};
function infoRestore(list) {
  for (const o of Array.isArray(list) ? list : []) {
    if (typeof o.key !== 'string' || !infoTarget(o.key)) continue;
    const w = infoOpen(o.key, null), sh = $('sheet');
    w.node.style.left = Math.max(0, Math.min(sh.clientWidth - 60, o.x || 0)) + 'px'; w.node.style.top = Math.max(0, Math.min(sh.clientHeight - 30, o.y || 0)) + 'px';
    if (o.w) w.node.style.width = o.w + 'px'; if (o.h) w.node.style.height = o.h + 'px';
    if (o.pin && typeof o.pin.dx === 'number') { w.pin = { dx: o.pin.dx, dy: o.pin.dy }; press(w.pinBtn, true); }
  }
}

/* ---------- what depends on what ----------
   One number of a part is run through a range, the bench is solved at every step, and any figure the bench works out is plotted
   against it. Any figure that has a "where this comes from" can be the ordinate, so the list covers the whole scene. */
const PROP_LABEL = { F: 'link.F', eD: 'en.D', eS: 'en.S', cyl: 'en.cyl', eps: 'en.eps', al: 'fit.al', ang: 'fit.ang', d2: 'fit.d2', rd: 'fit.rd', ge: 'ge.eta', hk: 'ht.k', Fb: 'hy.Fb', M: 'hy.M', T0: 'hy.T0', m: 'link.m', hm: 'link.m',
  nmax: 'motor.limit', nn: 'motor.nNom', Tb: 'th.Tb', a1: 'th.a1', etaC: 'th.etaC', etaT: 'th.etaT', mf: 'th.mf', nd: 'th.nd', zst: 'th.z', e: 'cam.e', op: 'fit.open', Pn: 'motor.P' };
const SWEEP_SKIP = new Set(['dir', 'l0', 'l1', 'pos', 'side', 'sg', 's', 'n', 'layer', 'on', 'J', 'rho']);
function sweepParams(p) {
  const out = [], T0 = TYPES[p.type], add = (label, get, set, lo, hi, step) => out.push({ label, get, set, lo, hi, step });
  if (T0.key) add(t('size.' + p.type), () => p[T0.key], v => { p[T0.key] = v; keepContact(p); }, T0.lim[0], T0.lim[1], T0.lim[2]);
  if (p.motor && !p.motor.auto) {
    const m = p.motor, k = m.kind || 'speed';
    if (k === 'speed') add(t('motor.speed'), () => m.rpm, v => { m.rpm = v; }, -10000, 10000); else add(t(k === 'induction' || k === 'dc' ? 'motor.nNom' : 'motor.limit'), () => Math.abs(m.n), v => { m.n = motorDir(m) * v; }, 0, 60000);
    if (k === 'speed' || k === 'torque') add(t(k === 'speed' ? 'motor.rated' : 'motor.torque'), () => m.tq, v => { m.tq = v; }, 0.01, 1000); else if (k !== 'ice') add(`${t('motor.P')}, ${unitSym('W')}`, () => m.P, v => { m.P = v; }, 10, 5e5);
  }
  if (p.load && p.load.kind !== 'table') add(`M₀, ${unitSym('Nm')}`, () => p.load.tq, v => { p.load.tq = v; }, 0, 1e5);
  for (const k of PROPS) if (typeof p[k] === 'number' && k !== T0.key && !SWEEP_SKIP.has(k)) add(PROP_LABEL[k] ? t(PROP_LABEL[k]) : k, () => p[k], v => { p[k] = v; });
  return out;
}
// every figure on the bench that carries an explanation: { id, label, read() -> explanation or null }
function sweepFigures() {
  const out = [], take = (key, name, rows) => rows.forEach(([k, , e]) => { if (e && typeof e.v === 'number' && isFinite(e.v)) out.push({ id: key + '|' + k, label: `${name} · ${k}`, key, k }); });
  take('io', t('sec.motors'), ioRows());
  for (const p of parts) take('p' + p.id, p.label ? `${p.name} ${p.label}` : p.name, infoRows('p' + p.id));
  for (const q of pipes) take('q' + q.id, infoTitle('q' + q.id), infoRows('q' + q.id));
  return out;
}
const sweepRead = f => { const rows = f.key === 'io' ? ioRows() : infoRows(f.key), r = rows.find(x => x[0] === f.k); return r && r[2] && isFinite(r[2].v) ? r[2] : null; };
const sweepUnit = (v, u) => FAMILY[u] ? FAMILY[u].find(x => Math.abs(v) < (LIMIT[x] || Infinity)) || FAMILY[u][FAMILY[u].length - 1] : u;
function sweepRun(p, par, fig, lo, hi, n) {
  const v0 = par.get(), x0 = p.x, y0 = p.y, step = par.step || 0, pts = [];
  hist.mute = true;
  try {
    for (let i = 0; i < n; i++) {
      let v = lo + (hi - lo) * i / Math.max(1, n - 1); if (step >= 1) v = Math.round(v / step) * step;
      if (pts.length && pts[pts.length - 1][0] === v) continue;
      let y = NaN; try { par.set(v); freeze(); solve(); const e = sweepRead(fig); if (e && !lockMsg && tmmInfo.ok) y = e.v; } catch (err) {}
      pts.push([v, y]); p.x = x0; p.y = y0;
    }
  } finally { par.set(v0); p.x = x0; p.y = y0; freeze(); solve(); hist.mute = false; }
  return pts;
}
let sweepWin = null;
function openSweep(p) {
  if (sweepWin) sweepWin.node.remove();
  const pars = sweepParams(p), figs = sweepFigures();
  if (!pars.length || !figs.length) { toast(t('sw.none'), true); return; }
  const sh = $('sheet'), node = el('div', null, { className: 'info sweep' }), head = el('h3'), x = el('button', '×'), body = el('div', null, { className: 'sw-body' }), cvs = el('canvas'), note = el('p', '', { className: 'hint' });
  head.append(el('span', `${t('sw.title')} · ${p.name}`), x); x.onclick = () => { node.remove(); sweepWin = null; };
  const own = figs.findIndex(f => f.key === 'p' + p.id), st = { par: (p.motor || p.load) && pars.length > 1 && TYPES[p.type].key ? 1 : 0, fig: Math.max(0, own), lo: 0, hi: 1, n: 30, pts: [], unit: '' };
  const range = () => { const P = pars[st.par], v = P.get(), a = Math.abs(v) || 1; st.lo = Math.max(P.lo == null ? -Infinity : P.lo, +(v - a * 0.5).toPrecision(3)); st.hi = Math.min(P.hi == null ? Infinity : P.hi, +(v + a * 0.5).toPrecision(3)); fLo.value = st.lo; fHi.value = st.hi; };
  const numIn = (get, set) => { const i = el('input', null, { type: 'number', className: 'num', step: 'any' }); i.onchange = () => { set(+i.value); run(); }; return i; };
  const fLo = numIn(() => st.lo, v => { st.lo = v; }), fHi = numIn(() => st.hi, v => { st.hi = v; });
  const run = () => {
    const q = byId(p.id); if (!q) { node.remove(); sweepWin = null; return; }
    const P = sweepParams(q)[st.par], F = figs[st.fig]; if (!P || !F || !(st.hi > st.lo)) return;
    st.pts = sweepRun(q, P, F, st.lo, st.hi, st.n); const ok = st.pts.filter(v => isFinite(v[1])), e = sweepRead(F), top = Math.max(...ok.map(v => Math.abs(v[1])), 0);
    st.unit = e ? sweepUnit(top, e.u) : ''; st.now = [P.get(), e ? e.v : NaN]; st.xl = P.label; st.yl = F.label;
    note.textContent = ok.length < st.pts.length ? t('sw.gaps') : ''; drawSweep(cvs, st); ui();
  };
  const csv = () => download('sweep.csv', [`"${st.xl}";"${st.yl}, ${unitSym(st.unit)}"`, ...st.pts.map(v => `${v[0]};${isFinite(v[1]) ? fromSI(v[1], st.unit) : ''}`)].join('\n'), 'text/csv');
  body.append(labelled(t('sw.x'), choice(pars.map((P, i) => [i, P.label]), st.par, v => { st.par = +v; range(); run(); })), rowOf(el('span', t('sw.from'), { className: 'lab2' }), fLo, el('span', t('sw.to'), { className: 'lab2' }), fHi),
    labelled(t('sw.y'), choice(figs.map((F, i) => [i, F.label]), st.fig, v => { st.fig = +v; run(); })), cvs, note, rowOf(btn(t('sw.again'), run), btn('CSV', csv)));
  node.append(head, body); sh.append(node); node.style.left = '16px'; node.style.top = '48px'; floatWin(node, head); floatTop(node);
  sweepWin = { node }; range(); run();
  new ResizeObserver(() => drawSweep(cvs, st)).observe(cvs);
}
// "nice" tick values across a range
function ticks(lo, hi, n = 5) { const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v); return out; }
function drawSweep(cvs, st) {
  const dpr = window.devicePixelRatio || 1, Wc = cvs.clientWidth || 320, Hc = cvs.clientHeight || 200; if (cvs.width !== Math.round(Wc * dpr)) { cvs.width = Math.round(Wc * dpr); cvs.height = Math.round(Hc * dpr); }
  const g = cvs.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, Wc, Hc);
  const pts = st.pts.map(v => [v[0], isFinite(v[1]) ? fromSI(v[1], st.unit) : NaN]), ok = pts.filter(v => isFinite(v[1])); if (!ok.length) return;
  const L = 54, R = 10, T2 = 20, B = 34, x0 = pts[0][0], x1 = pts[pts.length - 1][0]; let y0 = Math.min(...ok.map(v => v[1])), y1 = Math.max(...ok.map(v => v[1]));
  if (y1 - y0 < 1e-9 * Math.max(1, Math.abs(y1))) { const d = Math.abs(y1) * 0.1 || 1; y0 -= d; y1 += d; } else { const d = (y1 - y0) * 0.08; y0 -= d; y1 += d; }
  const X = v => L + (v - x0) / (x1 - x0 || 1) * (Wc - L - R), Y = v => Hc - B - (v - y0) / (y1 - y0) * (Hc - T2 - B);
  g.font = `11px ${C.mono}`; g.strokeStyle = C.line; g.fillStyle = C.muted; g.lineWidth = 1;
  g.textAlign = 'right'; g.textBaseline = 'middle'; for (const v of ticks(y0, y1, 4)) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(Wc - R, Y(v)); g.stroke(); g.fillText(fmtNum(v, 3), L - 5, Y(v)); }
  g.textAlign = 'center'; g.textBaseline = 'top'; for (const v of ticks(x0, x1, 5)) { g.beginPath(); g.moveTo(X(v), T2); g.lineTo(X(v), Hc - B); g.stroke(); g.fillText(fmtNum(v, 3), X(v), Hc - B + 4); }
  g.strokeStyle = C.ink; g.strokeRect(L, T2, Wc - L - R, Hc - T2 - B);
  g.strokeStyle = C.select; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); let pen = false; for (const v of pts) { if (!isFinite(v[1])) { pen = false; continue; } if (pen) g.lineTo(X(v[0]), Y(v[1])); else g.moveTo(X(v[0]), Y(v[1])); pen = true; } g.stroke();
  if (st.now && isFinite(st.now[1]) && st.now[0] >= x0 && st.now[0] <= x1) { g.fillStyle = C.brass; g.beginPath(); g.arc(X(st.now[0]), Y(fromSI(st.now[1], st.unit)), 4, 0, TAU); g.fill(); }
  g.fillStyle = C.ink; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(`${st.yl}${st.unit ? ', ' + unitSym(st.unit) : ''}`.slice(0, 60), 4, 3);
  g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(st.xl.slice(0, 50), Wc - R, Hc - 2);
}

/* ---------- header buttons and keys ---------- */
$('file').onclick = () => fileMenu($('file'));
$('examples').onclick = openGallery;
$('theme').onclick = toggleTheme;
$('help').onclick = openKeys;
$('scene-name').onchange = () => { setSceneName($('scene-name').value); save(); };
addEventListener('keydown', e => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range', mod2 = e.ctrlKey || e.metaKey;
  if (mod2 && e.code === 'KeyS') { e.preventDefault(); saveScene(); return; }
  if (mod2 && e.code === 'KeyO') { e.preventDefault(); openScene(); return; }
  if (e.key === 'Escape') { if (!$('keys').hidden) $('keys').hidden = true; if (measure) { measure = null; ui(); } return; }
  if (typing || mod2) return;
  if (!pipeDraft && (e.key === '?' || (e.code === 'Slash' && e.shiftKey))) { e.preventDefault(); openKeys(); }
  else if (e.code === 'KeyM') toggleMeasure();
});
