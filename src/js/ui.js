/* Gear Bench — panel, pointer and keyboard input, start-up. */
'use strict';

const $ = id => document.getElementById(id);
const el = (tag, text, props) => Object.assign(document.createElement(tag), text != null ? { textContent: text } : {}, props);
const press = (b, on) => { b.setAttribute('aria-pressed', !!on); return b; };
function changed() { freeze(); solve(); ui(); }
const commit = () => { changed(); save(); };

/* ---------- text for labels and read-outs ---------- */
const fmt = (v, d = 1) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d)).replace('-', '−');
const fmtT = v => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
const mm = v => `${+v.toFixed(2)} ${t('u.mm')}`;
const rpmText = w => !w ? t('s.stopped') : `${fmt(Math.abs(w), Math.abs(w) < 10 ? 2 : 1)} ${t('u.rpm')} ${w > 0 ? t('s.cw') : t('s.ccw')}`;
const sizeText = p => {
  switch (p.type) {
    case 'worm': return `z${p.zw}`;
    case 'emotor': return isDyn(p.motor) ? fmtU(p.motor.P, 'power') : '';
    case 'machine': return '';
    case 'carrier': return `r${p.r}`;
    case 'crank': return `r${p.r}`;
    case 'cam': return `h${p.h}`;
    case 'shaft': return p.l0 === p.l1 ? LET(p.l0) : `${LET(p.l0)}–${LET(p.l1)}`;
    case 'hshaft': return `${p.len}`;
    default: return p.d != null ? `⌀${p.d}` : `z${p.z}`;
  }
};
const pitchD = p => ty(p, 'spur', 'ring', 'bevel', 'hbevel', 'diff', 'rack') ? M * p.z : p.type === 'sprocket' ? CP / Math.sin(Math.PI / p.z) : p.type === 'worm' ? 2 * WR : null;
const diaText = p => { const d = pitchD(p); return d && p.type !== 'rack' ? `d${+d.toFixed(1)}` : ''; };
function speedText(p, arrows) {
  const o = outOf(p);
  if (!o.w) return arrows ? '' : p.held || (p.type === 'brake' && p.on) ? t('s.held') : p.und ? t('s.free') : t('s.idle');
  if (p.type === 'rack') return `${fmt(Math.abs(o.w * RPM))} ${t('u.mms')}`;
  return arrows ? `${fmt(Math.abs(o.w))} ${t('u.rpm')} ${o.w > 0 ? '↻' : '↺'}` : `${o.w > 0 ? '+' : '−'}${fmt(Math.abs(o.w))}`;
}
const tqText = (p, o) => { const v = torqueAt(p, o); return v == null ? '–' : `${fmtT(v)} ${p.type === 'rack' ? t('u.N') : t('u.Nm')}`; };
const linksOf = p => links.filter(L => L.ids.includes(p.id));

/* Everything worth knowing about one part: its diameters and how it is built, then what it is doing. */
function specRows(p) {
  const r = [], add = (k, v) => r.push([t(k), v]), z = p.z, d = pitchD(p), o = outOf(p);
  const mates = meshes.filter(m => m.a === p || m.b === p);
  switch (p.type) {
    case 'spur': add('sp.m', mm(M)); add('sp.d', mm(d)); add('sp.da', mm(d + 2 * M)); add('sp.df', mm(d - 2.5 * M)); add('sp.db', mm(d * Math.cos(ALPHA))); add('sp.p', mm(PM)); add('sp.b', mm(FW)); break;
    case 'ring': add('sp.m', mm(M)); add('sp.dInner', mm(d)); add('sp.daInner', mm(d - 2 * M)); add('sp.dfInner', mm(d + 2.5 * M)); add('sp.zOuter', `${meshZ(p)}`); add('sp.dOuter', mm(M * meshZ(p))); add('sp.b', mm(FW)); break;
    case 'bevel': case 'hbevel': {
      const mate = mates.map(m => m.a === p ? m.b : m.a)[0];
      add('sp.me', mm(M)); add('sp.de', mm(d)); if (mate) { const dl = Math.atan(z / mate.z); add('sp.delta', `${(dl * 180 / Math.PI).toFixed(1)}°`); add('sp.Re', mm(d / 2 / Math.sin(dl))); add('sp.shaftAngle', '90°'); }
      break;
    }
    case 'worm': { const q = 2 * WR / M, ga = Math.atan(p.zw / q); add('sp.z1', `${p.zw}`); add('sp.m', mm(M)); add('sp.q', `${q}`); add('sp.d1', mm(2 * WR)); add('sp.da', mm(2 * WO)); add('sp.gamma', `${(ga * 180 / Math.PI).toFixed(1)}°`); add('sp.px', mm(PM)); add('sp.lead', mm(PM * p.zw)); add('sp.b1', mm(WL)); add('sp.eta', `≈ ${Math.round(wormEta(p.zw) * 100)} %${p.zw <= WORM_LOCK ? ', ' + t('sp.selfLock') : ''}`); break; }
    case 'rack': add('sp.m', mm(M)); add('sp.p', mm(PM)); add('sp.len', mm(rackLen(p))); add('sp.h', mm(2.25 * M)); break;
    case 'pulley': case 'fric': add('sp.dWork', mm(p.d)); add('sp.b', mm(FW)); break;
    case 'sprocket': add('sp.pc', `${CP} ${t('u.mm')} (05B)`); add('sp.d', mm(d)); add('sp.da', mm(d + 0.6 * CP)); add('sp.dRoller', mm(0.56 * CP)); break;
    case 'carrier': add('sp.arm', mm(p.r)); add('sp.pins', `${p.n}`); add('sp.pairSum', `z₁ + z₂ = ${p.r}`); add('sp.mounted', `${parts.filter(q => q.mount && q.mount.c === p.id).length}`); break;
    case 'shaft': add('sp.span', `${LET(p.l0)}–${LET(p.l1)}`); add('sp.len', mm((p.l1 - p.l0) * LP + FW + 7)); add('sp.carries', onShaft(p).map(q => q.name).join(', ') || '–'); break;
    case 'hshaft': add('sp.len', mm(p.len)); break;
    case 'diff': add('sp.d', mm(d)); add('sp.da', mm(d + 2 * M)); add('sp.rule', t('sp.diffRule')); add('sp.nLower', rpmText(p.a.w)); add('sp.nUpper', rpmText(p.b.w)); break;
    case 'crank': add('sp.stroke', mm(2 * p.r)); add('sp.rod', mm(rodL(p))); add('sp.lambda', (p.r / rodL(p)).toFixed(2)); if (p.w) add('sp.vPiston', `${fmt(4 * p.r * Math.abs(p.w) / 60)} ${t('u.mms')}`); break;
    case 'cam': add('sp.lift', mm(p.h)); add('sp.base', mm(2 * CB)); add('sp.dwell', '120°'); break;
    case 'geneva': add('sp.index', `${(360 / z).toFixed(0)}°`); add('sp.aw', mm(gvc(p))); add('sp.share', `${(100 * (z - 2) / (2 * z)).toFixed(0)} %`); if (p.w) add('sp.nWheel', `${fmt(Math.abs(p.w) / z, 2)} ${t('u.rpm')}`); break;
    case 'clutch': add('sp.dWork', mm(p.d)); add('sp.nIn', rpmText(p.w)); add('sp.nOut', rpmText(p.o.w)); break;
    case 'ratchet': add('sp.da', mm(M * z)); add('sp.freeDir', p.on ? t('s.ccw') : t('s.cw')); break;
    case 'flywheel': case 'brake': add('sp.dWork', mm(p.d)); break;
  }
  for (const m of mates) { // one line per mesh: centre distance and ratio
    const q = m.a === p ? m.b : m.a, zq = q.type === 'worm' ? q.zw : m.k === 'inner' && q.type === 'ring' ? q.z : meshZ(q) || 0, zp = p.type === 'worm' ? p.zw : m.k === 'inner' && p.type === 'ring' ? p.z : meshZ(p) || 0;
    const u = m.k === 'fric' ? RO(q) / RO(p) : zq / zp, aw = m.k === 'rack' ? null : m.k === 'worm' ? RO(ty(p, 'worm') ? q : p) + WR : dist(p, q);
    r.push([`${t('mesh.' + m.k)} ${q.name}`, [aw != null && m.k !== 'bevel' ? `a ${+aw.toFixed(1)}` : '', m.k !== 'rack' && isFinite(u) ? `u ${u >= 1 ? fmt(u, 2) : '1 : ' + fmt(1 / u, 2)}` : ''].filter(Boolean).join(', ')]);
  }
  for (const L of linksOf(p)) if (L.route) {
    const on = L.route.on.get(p.id), n = L.kind === 'chain' ? `${Math.round(L.route.L / CP)} ${t('sp.linksN')}` : `L ${L.route.L.toFixed(0)} ${t('u.mm')}`;
    r.push([t(L.kind === 'belt' ? 'sp.belt' : 'sp.chain'), on ? `${n}, ${t('sp.wrap')} ${(on.wrap * 180 / Math.PI).toFixed(0)}°` : t('sp.notWrapped')]);
  }
  if (p.type === 'rack') { add('sp.v', o.w ? `${fmt(Math.abs(o.w * RPM))} ${t('u.mms')}` : t('s.idle')); add('sp.force', tqText(p, o)); }
  else { add('sp.n', p.und && !p.w ? t('s.free') : rpmText(o.w)); if (d && o.w) add('sp.vPitch', `${fmt(Math.PI * d * Math.abs(o.w) / 60)} ${t('u.mms')}`); add('sp.torque', tqText(p, o)); }
  return r;
}
function ioRows() {
  const ms = parts.filter(p => p.motor), rows = [];
  if (!ms.length) return [[t('io.in'), t('io.noMotor')]];
  if (power.has) { // real loads on the bench: what each takes, and what the whole drive loses on the way
    let Pm = 0, Pu = 0;
    for (const p of parts) if (p.load) { const L = power.load.get(p.id); if (!L) continue; Pm += L.Pmotor; Pu += L.Pout; rows.push([p.label ? `${p.name} ${p.label}` : p.name, L.fed && L.w ? `${rpmText(outOf(p).w)} · ${fmtT(L.M)} ${t('u.Nm')} · ${fmtU(L.Pout, 'power')}` : t('s.idle')]); }
    if (Pm > 0) rows.push([t('io.etaTotal'), `${(100 * Pu / Pm).toFixed(0)} %`, ex('η', Pu / Pm, '%', 'η = Σ P_out / Σ P_motor', [['Σ P_out', Pu, 'power'], ['Σ P_motor', Pm, 'power']], ['ex.eta', 'ex.machineEta'])]);
    return rows;
  }
  const g = outPart();
  if (!g) { rows.push([t('io.out'), t('io.nothing')]); return rows; }
  const o = outOf(g), label = `${t('io.out')} ${g.name}${outId == null ? ` (${t('io.auto')})` : ''}`, tq = torqueAt(g);
  if (lockMsg) rows.push([label, t('io.locked')]);
  else if (tq == null) rows.push([label, t('s.idle')]);
  else {
    const pw = solved.pin * solved.eff.get(bodyOf(o));
    rows.push([label, `${g.type === 'rack' ? fmt(Math.abs(o.w * RPM)) + ' ' + t('u.mms') : rpmText(o.w)} · ${tqText(g)} · ${fmtT(pw)} ${t('u.W')}`, ex('P', pw, 'power', 'P_out = P_in·η,   M = P_out / ω', [['P_in', solved.pin, 'power'], ['η', solved.eff.get(bodyOf(o)), ''], ['ω', Math.abs(o.w) * RPM, g.type === 'rack' ? 'mm/s' : 'rpm']], ['ex.noLoads', 'ex.eta'])]);
    if (ms.length === 1 && g.type !== 'rack' && ms[0].w) { const i = ms[0].w / o.w; rows.push([t('io.ratio'), `${Math.abs(i) >= 1 ? fmt(Math.abs(i), 2) + ' : 1' : '1 : ' + fmt(1 / Math.abs(i), 2)}${i < 0 ? ', ' + t('io.reversed') : ''}`, ex('i', Math.abs(i), '', 'i = n_in / n_out', [['n_in', Math.abs(ms[0].w) * RPM, 'rpm'], ['n_out', Math.abs(o.w) * RPM, 'rpm']], ['ex.rigid'])]); }
    rows.push([t('io.eta'), `${(100 * solved.eff.get(bodyOf(o))).toFixed(0)} %`, ex('η', solved.eff.get(bodyOf(o)), '%', 'η = η₁·η₂·…', [], ['ex.eta'])]);
  }
  return rows;
}
// rows are [label, value] or [label, value, explanation]; a value with an explanation opens the "where from" box when clicked
let why = null;
const fillDl = (dl, rows) => {
  dl.textContent = '';
  for (const [k, v, e] of rows) {
    const dd = el('dd', v);
    if (e) { const id = (dl.dataset.why || '') + k; dd.className = 'ex'; dd.tabIndex = 0; dd.setAttribute('role', 'button'); dd.onclick = () => { why = why && why.id === id ? null : { id, title: k, e }; renderWhy(); }; dd.onkeydown = ev => { if (ev.key === 'Enter') dd.onclick(); }; if (why && why.id === id) why.e = e; }
    dl.append(el('dt', k), dd);
  }
};
function renderWhy() {
  const box = $('why'); box.hidden = !why; if (!why) return;
  $('why-t').textContent = `${t('why.title')}: ${why.title}`; $('why-b').textContent = exLines(why.e, t).join('\n');
}

/* ---------- panel ---------- */
let motorsKey = '', selKey = '', selRefresh = [], armedLayer = null;
const typeName = p => t('type.' + p.type);
function slider(label, min, max, step, get, set, unit = '') { // a labelled range input that also takes typed numbers
  const row = el('div', null, { className: 'row' }), out = el('input', null, { type: 'number', className: 'num', min, max, step }), rg = el('input', null, { type: 'range', min, max, step });
  const lab = el('label'); lab.append(el('span', label), el('span', unit, { className: 'unit' }));
  const sync = () => { if (document.activeElement !== out) out.value = get(); if (document.activeElement !== rg) rg.value = get(); };
  rg.oninput = () => { set(+rg.value); out.value = rg.value; };
  out.onchange = () => { const v = Math.max(min, Math.min(max, +out.value || 0)); set(v); sync(); };
  row.append(lab, rg, out); sync(); selRefresh.push(sync);
  return row;
}
const btn = (label, fn, on) => { const b = el('button', label, { onclick: fn }); if (on != null) press(b, on); return b; };
const rowOf = (...kids) => { const r = el('div', null, { className: 'row' }); r.append(...kids.filter(Boolean)); return r; };
const layerSeg = (cur, pickL) => { const seg = el('div', null, { className: 'seg' }); for (let l = 0; l < layerCount; l++) seg.append(btn(LET(l), () => pickL(l), cur === l)); return seg; };
const labelled = (label, node) => { const r = el('div', null, { className: 'row' }); r.append(el('span', label, { className: 'lab' }), node); return r; };

const MOTOR_KINDS = ['speed', 'torque', 'induction', 'dc', 'stepper'], LOAD_KINDS = ['const', 'linear', 'quad', 'table'];
const choice = (items, value, onPick) => { const sl = el('select'); for (const [v, label] of items) sl.append(el('option', label, { value: v })); sl.value = value; sl.onchange = () => onPick(sl.value); return sl; };
// switching a motor to another kind fills in what that kind needs from what is already known
function setMotorKind(m, kind) {
  const dir = motorDir(m);
  if (kind !== 'speed') {
    if (m.P == null) m.P = Math.max(10, Math.round(Math.abs(m.tq * m.rpm * RPM))) || 370;
    if (!m.n) m.n = Math.round(Math.abs(m.rpm)) || 1320;
    m.n = dir * Math.abs(m.n); if (m.ks == null) m.ks = 2.2; if (m.km == null) m.km = 2.2;
  } else m.rpm = dir * Math.round(Math.abs(m.n || m.rpm || 60));
  m.kind = kind;
}
function motorFields(p) {
  const m = p.motor, k = m.kind || 'speed', dir = () => motorDir(m), out = [];
  const nSl = (key, lo, hi) => slider(t(key), lo, hi, 1, () => Math.round(Math.abs(m.n)), v => { m.n = dir() * v; commit(); }, t('u.rpm'));
  const pSl = () => slider(t('motor.P'), 0.01, 500, 0.01, () => +(m.P / 1000).toFixed(3), v => { m.P = v * 1000; commit(); }, unitSym('kW'));
  const kSl = (key, prop, lo, hi) => slider(t(key), lo, hi, 0.05, () => m[prop], v => { m[prop] = v; commit(); });
  if (k === 'speed') out.push(slider(t('motor.speed'), -10000, 10000, 1, () => m.rpm, v => { m.rpm = v; commit(); }, t('u.rpm')), slider(t('motor.rated'), 0.01, 1000, 0.01, () => m.tq, v => { m.tq = v; commit(); }, t('u.Nm')));
  else if (k === 'torque') out.push(slider(t('motor.torque'), 0.01, 1000, 0.01, () => m.tq, v => { m.tq = v; commit(); }, t('u.Nm')), nSl('motor.limit', 1, 10000));
  else if (k === 'induction') out.push(pSl(), nSl('motor.nNom', 100, 2990), kSl('motor.ks', 'ks', 0.5, 4), kSl('motor.km', 'km', 1.1, 4));
  else if (k === 'dc') out.push(pSl(), nSl('motor.nNom', 10, 20000), kSl('motor.ks', 'ks', 1.1, 10));
  else out.push(nSl('motor.cmd', 1, 5000), pSl(), kSl('motor.ks', 'ks', 1, 5));
  return out;
}
// what one source is doing, each figure with where it comes from
function motorRows(p) {
  const r = power.src.get(p.id), m = p.motor, k = m.kind || 'speed', rows = []; if (!r) return rows;
  const s = r.s, nNote = { speed: 'ex.ideal', torque: 'ex.torque', induction: 'ex.kloss', dc: 'ex.dc', stepper: 'ex.stepper' }[k];
  const nVars = k === 'induction' ? [['n₀', s.w0, 'rpm'], ['s', r.slip, '%'], ['s_k', s.sk, '%'], ['M_k', s.Mk, 'Nm'], ['M_L', r.M, 'Nm']] : s.ideal ? [] : [['n₀', s.w0, 'rpm'], ['M_L', r.M, 'Nm']];
  const nForm = { speed: 'n = n_set', torque: 'M = M_set = M_L(n),  n ≤ n_max', induction: 'M(s) = 2·M_k / (s/s_k + s_k/s) = M_L,   n = n₀·(1 − s)', dc: 'M = M_start·(1 − n/n₀) = M_L', stepper: 'n = n_set,  M_L ≤ min(M_hold, P/ω)' }[k];
  rows.push([t('io.n'), r.stalled ? t('io.stalled') : rpmText(p.w), ex('n', r.w, 'rpm', nForm, nVars, [nNote, 'ex.steady'])]);
  if (power.has) {
    const feeds = r.feeds.map(byId).filter(Boolean), lv = [];
    for (const q of feeds) { const L = power.load.get(q.id), nm = q.label || q.name; lv.push([`M(${nm})`, L.M, 'Nm'], [`k(${nm})`, r.w ? L.w / r.w : 0, ''], [`η(${nm})`, L.etaPath, '']); }
    rows.push([t('io.M'), `${fmtT(r.M)} ${t('u.Nm')}`, ex('M', r.M, 'Nm', 'M = Σ M_L·k / η,   k = n_L / n', lv, ['ex.steady', 'ex.eta'])]);
    rows.push([t('io.P'), fmtU(r.P, 'power'), ex('P', r.P, 'power', 'P = M·ω', [['M', r.M, 'Nm'], ['ω', r.w, 'rpm']], [])]);
    rows.push([t('io.loadPct'), `${fmtNum(100 * r.ratio)} %`, ex('M / M_nom', r.ratio, '%', k === 'speed' || k === 'torque' ? 'M / M_rated' : 'M / M_nom,   M_nom = P_nom / ω_nom', [['M', r.M, 'Nm'], ['M_nom', r.Mnom, 'Nm']], [])]);
    if (k === 'induction' && !r.stalled) rows.push([t('io.slip'), `${fmtNum(100 * r.slip)} %`, ex('s', r.slip, '%', 's = (n₀ − n) / n₀', [['n₀', s.w0, 'rpm'], ['n', r.w, 'rpm']], ['ex.kloss'])]);
  } else {
    const Pa = (s.ideal && k === 'speed' ? m.tq : s.M(r.w)) * r.w;
    rows.push([t('io.avail'), fmtU(Pa, 'power'), ex('P', Pa, 'power', 'P = M·ω', [['M', r.w ? Pa / r.w : 0, 'Nm'], ['ω', r.w, 'rpm']], ['ex.noLoads'])]);
  }
  return rows;
}
function renderMotors() {
  const ms = parts.filter(p => p.motor), box = $('motors'), key = ms.map(p => p.id + (p.motor.kind || '')).join() + lang;
  if (key !== motorsKey) {
    motorsKey = key; box.textContent = '';
    if (!ms.length) box.append(el('p', t('motor.none'), { className: 'hint' }));
    for (const p of ms) {
      const m = p.motor, card = el('div', null, { className: 'motor' });
      const head = rowOf(btn(p.label ? `${p.name} ${p.label}` : p.name, () => pick([p.id])), btn(t('btn.reverse'), () => { m.rpm = -m.rpm; if (m.n) m.n = -m.n; commit(); }), p.type !== 'emotor' && btn('×', () => { delete p.motor; commit(); }));
      if (p.type !== 'emotor') head.lastChild.setAttribute('aria-label', t('btn.removeMotor'));
      const refs = [], keep = selRefresh, dl = el('dl'); selRefresh = refs;
      card.append(head, rowOf(choice(MOTOR_KINDS.map(k => [k, t('mk.' + k)]), m.kind || 'speed', k => { setMotorKind(m, k); commit(); })), ...motorFields(p), dl);
      selRefresh = keep; card.sync = () => { refs.forEach(f => f()); fillDl(dl, motorRows(p)); };
      box.append(card); card.sync();
    }
  } else for (const c of box.children) if (c.sync) c.sync();
}
// the figures of one load
function loadRows(p) {
  const L = power.load.get(p.id), l = p.load; if (!L) return [];
  const form = { const: 'M = M₀', linear: 'M = M₀·n / n₀', quad: 'M = M₀·(n / n₀)²', table: 'M = table(n)' }[l.kind], vars = l.kind === 'table' ? [['n', L.w, 'rpm']] : l.kind === 'const' ? [['M₀', l.tq, 'Nm']] : [['M₀', l.tq, 'Nm'], ['n', L.w, 'rpm'], ['n₀', toSI(Math.abs(l.n), 'rpm'), 'rpm']];
  return [
    [t('io.n'), rpmText(outOf(p).w), ex('n', L.w, 'rpm', 'n = n_motor·k', [], ['ex.rigid'])],
    [t('io.M'), `${fmtT(L.M)} ${t('u.Nm')}`, ex('M', L.M, 'Nm', form, vars, ['ex.loadLaw'])],
    [t('io.Pin'), fmtU(L.P, 'power'), ex('P', L.P, 'power', 'P = M·ω', [['M', L.M, 'Nm'], ['ω', L.w, 'rpm']], [])],
    [t('io.Pout'), fmtU(L.Pout, 'power'), ex('P_out', L.Pout, 'power', 'P_out = η·P', [['η', L.eta, ''], ['P', L.P, 'power']], ['ex.machineEta'])],
  ];
}
function loadFields(p) {
  const l = p.load, out = [], name = el('input', null, { type: 'text', value: p.label || '', maxLength: 28, className: 'text' });
  name.onchange = () => { p.label = name.value.trim() || undefined; if (!p.label) delete p.label; ui(); save(); };
  out.push(labelled(t('load.name'), name), labelled(t('load.kind'), choice(LOAD_KINDS.map(k => [k, t('lk.' + k)]), l.kind, k => { l.kind = k; if (k === 'table' && !l.table) l.table = [[0, l.tq], [Math.abs(l.n), l.tq]]; commit(); })));
  if (l.kind === 'table') {
    const ta = el('textarea', null, { rows: 4, className: 'text', value: (l.table || []).map(r => r.join(' : ')).join('\n') });
    ta.setAttribute('aria-label', t('load.table'));
    ta.onchange = () => { const rows = ta.value.split('\n').map(r => r.split(/[:;\t]/).map(x => parseFloat(x.replace(',', '.')))).filter(r => r.length >= 2 && isFinite(r[0]) && isFinite(r[1])).map(r => [r[0], r[1]]); if (rows.length) { l.table = rows; commit(); } };
    out.push(el('p', t('load.table'), { className: 'hint' }), ta);
  } else {
    out.push(slider(t(l.kind === 'const' ? 'motor.torque' : 'load.tq'), 0, 5000, 0.01, () => l.tq, v => { l.tq = v; commit(); }, t('u.Nm')));
    if (l.kind !== 'const') out.push(slider(t('load.n'), 1, 20000, 1, () => Math.abs(l.n), v => { l.n = v; commit(); }, t('u.rpm')));
  }
  out.push(slider(t('load.eta'), 0.05, 1, 0.01, () => l.eta == null ? 1 : l.eta, v => { l.eta = v; commit(); }));
  return out;
}
function renderLayers() {
  const box = $('layers'); box.textContent = '';
  for (let l = layerCount - 1; l >= 0; l--) {
    const n = parts.filter(p => !isShaft(p) && p.layer === l).length, row = el('div', null, { className: 'layer' + (l === activeLayer ? ' on' : '') });
    let name;
    if (l === activeLayer) { // the active layer's row carries its name field
      name = el('label', null, { className: 'name on' }); const inp = el('input', null, { type: 'text', value: layerNames[l] || '', placeholder: t('layer.name'), maxLength: 24 });
      inp.onchange = () => { layerNames[l] = inp.value.trim(); save(); }; name.append(el('b', `${LET(l)} · ${n}`), inp);
    } else { name = btn(`${layerLabel(l)} · ${n}`, () => setActive(l), false); name.className = 'name'; }
    const lk = btn(lockedLayers.has(l) ? '⊘' : '◌', () => { if (lockedLayers.has(l)) lockedLayers.delete(l); else lockedLayers.add(l); pick([...sel]); save(); }, lockedLayers.has(l));
    lk.title = lockedLayers.has(l) ? t('layer.locked') : t('layer.open'); lk.setAttribute('aria-label', lk.title);
    const eye = btn(layerShown(l) ? '◉' : '○', () => { if (hiddenLayers.has(l)) hiddenLayers.delete(l); else hiddenLayers.add(l); ui(); save(); }, layerShown(l)); eye.disabled = soloActive; eye.title = layerShown(l) ? t('layer.shown') : t('layer.hidden'); eye.setAttribute('aria-label', eye.title);
    const upB = btn('↑', () => { moveLayer(l, 1); commit(); }), dn = btn('↓', () => { moveLayer(l, -1); commit(); });
    upB.disabled = l === layerCount - 1; dn.disabled = l === 0; upB.setAttribute('aria-label', t('layer.up')); dn.setAttribute('aria-label', t('layer.down'));
    const del = btn(armedLayer === l ? t('layer.confirm', { n }) : '×', () => { if (n && armedLayer !== l) { armedLayer = l; ui(); return; } armedLayer = null; deleteLayer(l); commit(); });
    del.disabled = layerCount <= 1; del.className = armedLayer === l ? 'danger' : ''; del.setAttribute('aria-label', t('layer.delete'));
    row.append(name, eye, lk, upB, dn, del); box.append(row);
  }
  $('add-layer').disabled = layerCount >= MAXL;
  $('solo').textContent = t('layer.solo'); press($('solo'), soloActive);
}
function renderSel() {
  const ps = selParts(), p = ps.length === 1 ? ps[0] : null, body = $('sel-body');
  const key = JSON.stringify([lang, layerCount, linkDraft && [linkDraft.kind, linkDraft.ids], outId, links.map(L => [L.ids, L.crossed]), ps.map(q => [q.id, q.type, q.layer, q.on, q.held, q.loose, !!q.motor, q.load && q.load.kind, q.mount && q.mount.c, q.l0, q.l1])]);
  $('sel-name').textContent = p ? `${p.name} · ${typeName(p)}` : ps.length ? t('sel.many', { n: ps.length }) : t('sel.none');
  if (key !== selKey) {
    selKey = key; selRefresh = []; body.textContent = '';
    if (linkDraft) {
      body.append(el('p', t('link.pick', { kind: t('type.' + (linkDraft.kind === 'belt' ? 'pulley' : 'sprocket')), list: nameOf(linkDraft.ids) }), { className: 'hint' }),
        rowOf(btn(t('btn.done'), finishLink), btn(t('btn.cancel'), () => { linkDraft = null; ui(); })));
      body.firstChild.nextSibling.firstChild.className = 'primary';
    } else if (!ps.length) body.append(el('p', t('sel.hint'), { className: 'hint' }));
    else if (!p) {
      const wheels = ps.every(q => q.type === ps[0].type && q.layer === ps[0].layer) && ty(ps[0], 'pulley', 'sprocket');
      body.append(labelled(t('sel.layer'), layerSeg(ps.every(q => q.layer === ps[0].layer) ? ps[0].layer : -1, l => { for (const q of ps) setLayer(q, l); commit(); })),
        rowOf(btn('⟲ 15°', () => rotateSel(-15)), btn('⟳ 15°', () => rotateSel(15)), btn(t('btn.duplicate'), duplicateSel)),
        rowOf(wheels && btn(t(ps[0].type === 'pulley' ? 'link.belt' : 'link.chain'), () => { addLink(ps[0].type === 'pulley' ? 'belt' : 'chain', ps.map(q => q.id)); commit(); }), btn(t('btn.remove'), removeSel)));
      body.lastChild.lastChild.className = 'danger';
    } else {
      const T0 = T(p), set = k => v => { p[k] = v; keepContact(p); commit(); };
      if (T0.key) body.append(slider(t(`size.${p.type}`), ...T0.lim, () => p[T0.key], set(T0.key)));
      if (T0.key2) body.append(slider(t(`size2.${p.type}`), T0.lim2[0], T0.lim2[1], 1, () => p[T0.key2], set(T0.key2)));
      if (T0.dir) body.append(slider(t('sel.dir'), 0, 359, 1, () => Math.round(mod(p.dir * 180 / Math.PI, 360)) % 360, v => { p.dir = v * Math.PI / 180; commit(); }, '°'),
        rowOf(btn('⟲ 15°', () => rotateSel(-15)), btn('⟳ 15°', () => rotateSel(15)), btn('⟳ 90°', () => rotateSel(90))));
      if (isShaft(p)) body.append(labelled(t('shaft.from'), layerSeg(p.l0, l => { p.l0 = Math.min(l, p.l1); p.layer = p.l0; commit(); })), labelled(t('shaft.to'), layerSeg(p.l1, l => { p.l1 = Math.max(l, p.l0); commit(); })));
      else body.append(labelled(t('sel.layer'), layerSeg(p.layer, l => { setLayer(p, l); commit(); })));
      const tg = [];
      if (T0.tog) tg.push(btn(t(`tog.${p.type}.${p.on ? 1 : 0}`), () => { p.on = !p.on; commit(); }, p.on));
      if (!isLin(p) && !ty(p, 'emotor', 'machine')) tg.push(btn(t('tog.motor'), () => { if (p.motor) delete p.motor; else { p.motor = { kind: 'speed', rpm: 60, tq: 2 }; delete p.load; } commit(); }, !!p.motor));
      if (!isLin(p) && !isShaft(p) && !ty(p, 'emotor', 'machine', 'brake') && !p.motor) tg.push(btn(t('tog.load'), () => { if (p.load) delete p.load; else p.load = { kind: 'const', tq: 1, n: 1000, eta: 1 }; commit(); }, !!p.load));
      if (!isLin(p) && p.type !== 'brake') tg.push(btn(t('tog.held'), () => { p.held = !p.held; commit(); }, !!p.held));
      if (isVert(p) && !isShaft(p) && !ty(p, 'clutch', 'diff')) tg.push(btn(t('tog.loose'), () => { p.loose = !p.loose; commit(); }, !!p.loose));
      if (p.mount) tg.push(btn(t('tog.unmount'), () => { delete p.mount; commit(); }));
      if (tg.length) { const r = rowOf(...tg); r.classList.add('togs'); body.append(r); }
      if (p.mount) body.append(el('p', t('sel.onCarrier', { a: byId(p.mount.c).name }), { className: 'hint' }));
      if (ty(p, 'pulley', 'sprocket')) {
        const belt = p.type === 'pulley', box = el('div', null, { className: 'links' });
        for (const L of linksOf(p)) {
          const r = el('div'); r.append(el('span', nameOf(L.ids)));
          if (belt && L.ids.length === 2) r.append(btn(t('link.crossed'), () => { L.crossed = !L.crossed; commit(); }, L.crossed));
          r.append(btn(t('link.leave'), () => { L.ids = L.ids.filter(id => id !== p.id); commit(); }), btn('×', () => { links = links.filter(q => q !== L); commit(); }));
          box.append(r);
        }
        body.append(labelled(t(belt ? 'link.belts' : 'link.chains'), box), rowOf(btn(t(belt ? 'link.belt' : 'link.chain'), () => { linkDraft = { kind: belt ? 'belt' : 'chain', ids: [p.id] }; ui(); })));
      }
      if (p.load) body.append(...loadFields(p));
      const dl = el('dl'); dl.dataset.why = p.id + ':'; body.append(dl); selRefresh.push(() => fillDl(dl, [...(p.load ? loadRows(p) : []), ...specRows(p)]));
      const rm = btn(t('btn.remove'), removeSel); rm.className = 'danger';
      body.append(rowOf(!isShaft(p) && !p.motor && btn(t(outId === p.id ? 'btn.clearOut' : 'btn.setOut'), () => { outId = outId === p.id ? null : p.id; ui(); save(); }, outId === p.id), btn(t('btn.duplicate'), duplicateSel), rm));
    }
  }
  selRefresh.forEach(f => f());
}
function ui() {
  $('run').textContent = running ? t('btn.pause') : t('btn.run'); press($('run'), !running);
  renderMotors(); fillDl($('io'), ioRows()); renderLayers(); renderSel(); renderWarns(); renderWhy();
  const moving = parts.filter(p => !isShaft(p) && isDriven(p)).length, total = parts.filter(p => !isShaft(p)).length;
  const err = (warnings.find(w => w.level === 'error') || {}).text;
  $('status').className = 'status' + (linkDraft ? '' : lockMsg || err ? ' locked' : !running ? ' paused' : '');
  $('status-text').textContent = linkDraft ? t('status.link') : !total ? t('status.empty') : lockMsg ? lockMsg : err ? err : hintMsg ? hintMsg : !running ? t('status.paused') : t('status.running', { n: moving, m: total });
  const nt = TYPES[$('new-type').value], nz = $('new-z'); $('new-size-row').hidden = !nt.key;
  if (nt.key) { nz.min = nt.lim[0]; nz.max = nt.lim[1]; nz.step = nt.lim[2]; const nn = $('new-z-num'); nn.min = nz.min; nn.max = nz.max; nn.step = nz.step; if (document.activeElement !== nn) nn.value = nz.value; $('new-z-lab').textContent = t('size.' + $('new-type').value); }
  $('new-layer').textContent = t('add.onLayer', { l: LET(activeLayer) });
  $('add').disabled = $('tpl-add').disabled = lockedLayers.has(activeLayer);
  for (const m of ['both', 'top', 'side']) press($('vm-' + m), viewMode === m);
  press($('dims'), showDims);
  const tr = $('train'), out = outPart(); tr.textContent = '';
  for (const p of parts) {
    const b = el('button', null, { onclick: e => pick([p.id], e.shiftKey) });
    b.className = (sel.has(p.id) ? 'sel ' : '') + (p === out ? 'out ' : '') + (collide.has(p.id) ? 'bad' : p.motor ? 'drv' : '');
    for (const s of [p.name, sizeText(p), isShaft(p) ? '' : LET(p.layer), isShaft(p) ? (p.w ? `${p.w > 0 ? '+' : '−'}${fmt(Math.abs(p.w))}` : '') : speedText(p, false)]) b.append(el('span', s));
    tr.append(b);
  }
}
function renderWarns() {
  const sec = $('warn-sec'), box = $('warns'); sec.hidden = !warnings.length; box.textContent = '';
  for (const w of warnings) { const b = el('button', w.text, { onclick: () => { if (w.ids.length) pick(w.ids); } }); b.className = 'w-' + w.level; box.append(b); }
}
function applyLang() {
  document.documentElement.lang = lang;
  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
  for (const n of document.querySelectorAll('[data-t-label]')) n.setAttribute('aria-label', t(n.dataset.tLabel));
  $('lang').textContent = lang === 'ru' ? 'EN' : 'RU';
  const fillSel = (s, groups) => { const v = s.value; s.textContent = ''; for (const [g, items] of groups) { const og = g ? el('optgroup', null, { label: g }) : s; for (const [val, label] of items) og.append(el('option', label, { value: val })); if (g) s.append(og); } if (v) s.value = v; };
  fillSel($('new-type'), GROUPS.map(g => [t('grp.' + g), Object.keys(TYPES).filter(k => TYPES[k].grp === g).map(k => [k, t('type.' + k)])]));
  fillSel($('tpl'), [['', Object.keys(TEMPLATES).map(k => [k, t('tpl.' + k)])]]);
  motorsKey = selKey = '';
}

/* ---------- editing ---------- */
function pick(ids, toggle) {
  if (toggle) for (const id of ids) { if (sel.has(id)) sel.delete(id); else sel.add(id); }
  else sel = new Set(ids);
  for (const q of selParts()) if (!isShaft(q) && lockedLayers.has(q.layer)) sel.delete(q.id);   // a locked layer gives nothing up
  const p = one(); if (p && !onActive(p)) activeLayer = p.layer;
  ui();
}
// make a layer the active one; parts picked on other layers are let go
function setActive(l) { activeLayer = l; sel = new Set(selParts().filter(onActive).map(p => p.id)); armedLayer = null; ui(); save(); }
function setLayer(p, l) { if (isShaft(p)) { const n = p.l1 - p.l0; p.l0 = Math.min(l, layerCount - 1 - n); p.l1 = p.l0 + n; p.layer = p.l0; } else { p.layer = l; delete p.mount; autoShaft(p); } activeLayer = l; }
function removeSel() { removeParts([...sel]); commit(); }
function duplicateSel() {
  const ps = selParts(); if (!ps.length) return;
  freeze(); const map = new Map(), made = [];
  for (const p of ps) { const o = serialize().parts.find(q => q.id === p.id), id = nextId++; map.set(p.id, id); made.push(make({ ...o, id, name: T(p).pre + id, x: p.x + 24, y: p.y + 24, motor: p.type === 'emotor' ? o.motor : null })); }
  for (const q of made) { if (q.mount) { if (map.has(q.mount.c)) q.mount.c = map.get(q.mount.c); else delete q.mount; } parts.push(q); }
  for (const L of links.slice()) if (L.ids.every(id => map.has(id))) addLink(L.kind, L.ids.map(id => map.get(id)), L.crossed);
  sel = new Set(made.map(q => q.id)); commit();
}
function rotateSel(deg) { // one part turns in place; several turn together about their common centre
  const ps = selParts().filter(p => !p.mount), a = deg * Math.PI / 180; if (!ps.length) return;
  freeze();
  const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length, c = Math.cos(a), s = Math.sin(a);
  for (const p of ps) {
    const dx = p.x - cx, dy = p.y - cy; p.x = cx + dx * c - dy * s; p.y = cy + dx * s + dy * c;
    if (p.dir != null) p.dir = mod(p.dir + a, TAU); else p.free += a;
    if (p.o) p.o.free += a; if (p.a) { p.a.free += a; p.b.free += a; }
  }
  rest(); solve(); ui(); save();
}
// after a size change, slide the part so it still touches the neighbour it was meshing with
function keepContact(p) {
  const m = meshes.find(q => (q.a === p || q.b === p) && (q.k === 'gear' || q.k === 'fric') && !p.mount); if (!m) return;
  const o = m.a === p ? m.b : m.a; if (o.mount) return;
  const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1, s = RO(p) + RO(o); p.x = o.x + dx / d * s; p.y = o.y + dy / d * s;
}
function finishLink() { if (linkDraft && linkDraft.ids.length >= 2) addLink(linkDraft.kind, linkDraft.ids); linkDraft = null; commit(); }
function freeSpot(r) { // the nearest clear place to the middle of the view
  const c = toWorld(W / 2, topMid());
  for (let k = 0; k < 600; k++) {
    const a = k * 2.399963, d = Math.sqrt(k) * 9, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (parts.every(o => o.layer !== activeLayer && !isShaft(o) || Math.hypot(o.x - x, o.y - y) > r + tipR(o) + reach(o) + 5)) return { x, y };
  }
  return c;
}

/* ---------- snapping: where a dragged part wants to settle ---------- */
function circ2(a, Ra, b, Rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 1e-6 || d > Ra + Rb || d < Math.abs(Ra - Rb)) return [];
  const k = (Ra * Ra - Rb * Rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, Ra * Ra - k * k));
  const mx = a.x + dx * k / d, my = a.y + dy * k / d;
  return [{ x: mx - dy * h / d, y: my + dx * h / d }, { x: mx + dy * h / d, y: my - dx * h / d }];
}
function snap(g, x, y) {
  const S = Math.max(2 * M + 0.4, 10 / view.scale), near = Math.max(3, 8 / view.scale), layerMates = parts.filter(o => o !== g && o.layer === g.layer && !isShaft(o));
  const frame = (o, px = x, py = y) => { const u = unit(o.dir), dx = px - o.x, dy = py - o.y; return { u, al: dx * u[0] + dy * u[1], pe: -dx * u[1] + dy * u[0] }; };
  const at = (o, al, pe) => { const u = unit(o.dir); return { x: o.x + u[0] * al - u[1] * pe, y: o.y + u[1] * al + u[0] * pe }; };
  if (g.type === 'rack' || g.type === 'worm') { // slide sideways until the pitch line touches a gear
    const off = g.type === 'worm' ? WR : 0; let best = null;
    for (const o of layerMates) if (kind(o) === 'gear' && !o.mount) {
      const f = frame({ x, y, dir: g.dir }, o.x, o.y), lim = g.type === 'rack' ? rackLen(g) / 2 : WL / 2 - 2;
      for (const side of g.type === 'worm' ? [1, -1] : [1]) { const e = f.pe - side * (RO(o) + off); if (Math.abs(f.al) <= lim && Math.abs(e) < S && (best == null || Math.abs(e) < Math.abs(best))) best = e; }
    }
    if (best != null) { const u = unit(g.dir); return { x: x - u[1] * best, y: y + u[0] * best }; }
  }
  if (isHz(g)) { // onto the line of a horizontal shaft, or a shaft onto the line of a part
    for (const o of layerMates) if (isHz(o) && (o.type === 'hshaft' || g.type === 'hshaft')) {
      const f = frame(o); if (Math.abs(f.pe) < S && Math.abs(f.al) < (o.len || WL) / 2 + (g.len || WL) / 2 + 6) return { ...at(o, f.al, 0), dir: Math.cos(g.dir - o.dir) >= 0 ? o.dir : mod(o.dir + Math.PI, TAU) };
    }
    if (g.type === 'hbevel') for (const o of layerMates) if (o.type === 'bevel') { // onto the bevel gear's pitch circle, pointing outward
      const d = Math.hypot(x - o.x, y - o.y); if (d > 1 && Math.abs(d - RO(o)) < S) { const a = Math.atan2(y - o.y, x - o.x); return { x: o.x + RO(o) * Math.cos(a), y: o.y + RO(o) * Math.sin(a), dir: mod(a, TAU) }; }
    }
    return { x, y };
  }
  if (!isVert(g)) return { x, y };
  if (ty(g, 'spur', 'fric', 'sprocket', 'pulley')) for (const c of parts) if (c.type === 'carrier' && c.layer !== g.layer) // onto a carrier pin
    for (let k = 0; k < c.n; k++) { const q = pinPos(c, k); if (Math.hypot(x - q.x, y - q.y) < near) return { ...q, mount: { c: c.id, k } }; }
  for (const o of parts) if (o !== g && isVert(o) && !o.mount && (isShaft(o) || isShaft(g) || o.layer !== g.layer || ty(o, 'ring') || ty(g, 'ring')) && Math.hypot(x - o.x, y - o.y) < near) return { x: o.x, y: o.y }; // onto a shared axis
  if (isShaft(g)) return { x, y };
  const k = kind(g);
  if (k === 'gear') {
    for (const o of layerMates) {
      if (o.type === 'rack') { const f = frame(o), R = RO(g); if (Math.abs(f.al) <= rackLen(o) / 2 && Math.abs(f.pe - R) < S) return at(o, f.al, R); }
      if (o.type === 'worm') { const f = frame(o), R = RO(g) + WR; if (Math.abs(f.al) <= WL / 2 - 2 && Math.abs(Math.abs(f.pe) - R) < S) return at(o, f.al, Math.sign(f.pe) * R); }
      if (o.type === 'ring' && g.type === 'spur') { const d = Math.hypot(x - o.x, y - o.y), R = RI(o) - RO(g); if (d > 1 && d < RI(o) && Math.abs(d - R) < S) return { x: o.x + (x - o.x) / d * R, y: o.y + (y - o.y) / d * R }; }
    }
  }
  if (g.type === 'bevel') for (const o of layerMates) if (o.type === 'hbevel') { const u = unit(o.dir), c = { x: o.x - u[0] * RO(g), y: o.y - u[1] * RO(g) }; if (Math.hypot(x - c.x, y - c.y) < S * 2) return c; }
  if (!k) return { x, y };
  const c = [];
  for (const o of layerMates) if (kind(o) === k) { const s = RO(g) + RO(o), e = Math.abs(Math.hypot(x - o.x, y - o.y) - s); if (e < S) c.push({ o, s, e }); }
  c.sort((a, b) => a.e - b.e);
  if (c.length >= 2) { let best = null; for (const p of circ2(c[0].o, c[0].s, c[1].o, c[1].s)) { const d = Math.hypot(p.x - x, p.y - y); if (!best || d < best.d) best = { p, d }; } if (best && best.d < S * 1.6) return best.p; }
  if (c.length) { const o = c[0].o; let dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy); if (d < 1e-6) { dx = 1; dy = 0; d = 1; } return { x: o.x + dx / d * c[0].s, y: o.y + dy / d * c[0].s }; }
  return { x, y };
}

/* ---------- pointer input ---------- */
const pts = new Map(); let drag = null, pan = null, pinch = null, holdTimer = null;
const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function hitTop(g, w) {
  const b = boxOf(g);
  if (b) { const u = unit(g.dir), dx = w.x - g.x, dy = w.y - g.y, lx = dx * u[0] + dy * u[1], ly = -dx * u[1] + dy * u[0]; return g.type === 'rack' ? Math.abs(lx) <= b[0] && ly >= -1.25 * M - RB - 1 && ly <= M + 1 : g.type === 'hbevel' ? lx > -9 && lx < 14 && Math.abs(ly) <= b[1] : Math.abs(lx) <= b[0] && Math.abs(ly) <= b[1] + 1; }
  const d = Math.hypot(w.x - g.x, w.y - g.y);
  if (g.type === 'ring') return d < tipR(g) && d > RI(g) - 2 * M;
  if (g.type === 'carrier') { if (d < HUB + 1) return true; for (let k = 0; k < g.n; k++) { const q = pinPos(g, k), ux = q.x - g.x, uy = q.y - g.y, tt = Math.max(0, Math.min(1, ((w.x - g.x) * ux + (w.y - g.y) * uy) / (g.r * g.r))); if (Math.hypot(w.x - g.x - ux * tt, w.y - g.y - uy * tt) < 5) return true; } return false; }
  if (d < tipR(g)) return true;
  if (g.dir != null && reach(g)) { const u = unit(g.dir), dx = w.x - g.x, dy = w.y - g.y, lx = dx * u[0] + dy * u[1], ly = -dx * u[1] + dy * u[0]; return g.type === 'geneva' ? Math.hypot(lx - gvc(g), ly) < gvb(g) : lx > 0 && lx < reach(g) - 3 && Math.abs(ly) <= 8; }
  return false;
}
function hit(p) {
  if (p.y < bandH()) { // side view: shafts are thin, so they win where they show between parts
    const x = (p.x - W / 2) / view.scale + view.cx, z = (baseY() - p.y) / view.scale;
    const inL = g => { const zb = g.layer * LP; return z > zb - 1 && z < zb + FW + 1; };
    const pool = parts.filter(canPick);
    return [...pool].sort((a, b) => b.y - a.y).find(g => !isShaft(g) && Math.abs(x - g.x) < halfW(g) && inL(g))
      || pool.find(g => isShaft(g) && Math.abs(x - g.x) < 4 && z > g.l0 * LP - 4 && z < g.l1 * LP + FW + 4);
  }
  const w = toWorld(p.x, p.y), vis = parts.filter(canPick);   // only the active layer takes the pointer
  return vis.find(g => isShaft(g) && Math.hypot(w.x - g.x, w.y - g.y) < 3.2) || vis.filter(g => !isShaft(g)).sort((a, b) => b.layer - a.layer).find(g => hitTop(g, w));
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, p); clearTimeout(holdTimer);
  if (pts.size === 2) { drag = pan = boxSel = null; const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.scale, w: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), side: (a.y + b.y) / 2 < bandH() }; return; }
  const side = p.y < bandH();
  if (side && p.x < 46) { const l = Math.floor((baseY() - p.y) / view.scale / LP + 0.2); if (l >= 0 && l < layerCount) { setActive(l); return; } }   // a layer's letter in the side view makes it active
  const g = hit(p);
  if (linkDraft) { // building a belt or chain: clicks add and remove wheels
    if (g && g.type === (linkDraft.kind === 'belt' ? 'pulley' : 'sprocket') && g.layer === byId(linkDraft.ids[0]).layer) { const i = linkDraft.ids.indexOf(g.id); if (i < 0) linkDraft.ids.push(g.id); else if (linkDraft.ids.length > 1) linkDraft.ids.splice(i, 1); ui(); }
    return;
  }
  if (g && e.shiftKey) { pick([g.id], true); return; }
  if (g && !side) {
    if (!sel.has(g.id)) pick([g.id]);
    const w = toWorld(p.x, p.y), group = new Set(selParts());
    for (const q of [...group]) if (isShaft(q)) for (const c of onShaft(q)) group.add(c);   // a shaft takes what is keyed to it along
    if ([...group].some(q => !isShaft(q) && lockedLayers.has(q.layer))) return;              // unless a locked layer holds one of them
    drag = { g, dx: w.x - g.x, dy: w.y - g.y, others: [...group].filter(q => q !== g && !q.mount).map(q => ({ q, ox: q.x - g.x, oy: q.y - g.y })), sx: p.x, sy: p.y, moved: false };
    cv.classList.add('dragging');
  } else {
    if (g) pick([g.id]);
    pan = { sx: p.x, sy: p.y, cx: view.cx, cy: view.cy, moved: false, side, onPart: !!g };
    const startBox = () => { if (pan && !pan.moved && !side) { pan = null; boxSel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; cv.classList.add('boxing'); } };
    if (e.shiftKey && !g) startBox(); else if (!g) holdTimer = setTimeout(startBox, 380);   // hold still, then drag, to select an area
  }
});
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const p = pos(e); pts.set(e.pointerId, p);
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.scale = Math.max(0.5, Math.min(12, pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
    view.cx = pinch.w.x - (mx - W / 2) / view.scale; if (!pinch.side) view.cy = pinch.w.y - (my - topMid()) / view.scale;
  } else if (boxSel) { boxSel.x1 = p.x; boxSel.y1 = Math.max(bandH(), p.y); }
  else if (drag) {
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 4) return;
    const g = drag.g, w = toWorld(p.x, p.y);
    if (!drag.moved) { drag.moved = true; freeze(); if (g.mount) delete g.mount; }
    const s = drag.others.length ? { x: w.x - drag.dx, y: w.y - drag.dy } : snap(g, w.x - drag.dx, w.y - drag.dy);
    g.x = s.x; g.y = s.y; if (s.dir != null) g.dir = s.dir; drag.mount = s.mount || null;
    for (const o of drag.others) { o.q.x = g.x + o.ox; o.q.y = g.y + o.oy; }
    changed();
  } else if (pan) {
    if (Math.hypot(p.x - pan.sx, p.y - pan.sy) > 4) { pan.moved = true; clearTimeout(holdTimer); }
    if (pan.moved) { view.cx = pan.cx - (p.x - pan.sx) / view.scale; if (!pan.side) view.cy = pan.cy - (p.y - pan.sy) / view.scale; }
  }
});
const up = e => {
  pts.delete(e.pointerId); clearTimeout(holdTimer);
  if (boxSel) {
    const a = toWorld(Math.min(boxSel.x0, boxSel.x1), Math.min(boxSel.y0, boxSel.y1)), b = toWorld(Math.max(boxSel.x0, boxSel.x1), Math.max(boxSel.y0, boxSel.y1));
    const inside = parts.filter(g => canPick(g) && g.x >= a.x && g.x <= b.x && g.y >= a.y && g.y <= b.y).map(g => g.id);
    boxSel = null; cv.classList.remove('boxing'); pick(inside, e.shiftKey);
  } else if (pan && !pan.moved && !pan.onPart && sel.size) pick([]);
  if (drag && drag.moved) { const g = drag.g; if (drag.mount) g.mount = drag.mount; else if (!drag.others.length) autoShaft(g); commit(); }
  drag = pan = null; if (pts.size < 2) pinch = null; cv.classList.remove('dragging');
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

/* ---------- controls ---------- */
$('run').onclick = () => { running = !running; ui(); };
$('lang').onclick = () => { setLang(lang === 'ru' ? 'en' : 'ru'); applyLang(); solve(); ui(); };
$('new-type').onchange = () => { const nt = TYPES[$('new-type').value]; if (nt.key) { $('new-z').min = nt.lim[0]; $('new-z').max = nt.lim[1]; $('new-z').value = nt.def; } ui(); };
$('new-z').oninput = () => { $('new-z-num').value = $('new-z').value; };
// typed sizes: any whole number inside the limits, applied on Enter or when the field loses focus
$('new-z-num').onchange = () => { const nz = $('new-z'), v = Math.max(+nz.min, Math.min(+nz.max, Math.round(+$('new-z-num').value) || +nz.min)); nz.step = 1; nz.value = v; $('new-z-num').value = v; };
$('add').onclick = () => {
  const type = $('new-type').value, nt = TYPES[type];
  const g = addPart(type, { ...(nt.key ? { [nt.key]: +$('new-z').value } : {}), x: 0, y: 0, layer: activeLayer, ...(type === 'shaft' ? { l0: activeLayer, l1: Math.min(layerCount - 1, activeLayer + 1) } : {}) });
  Object.assign(g, freeSpot(tipR(g) + reach(g)));
  if (!parts.some(p => p.motor) && !isLin(g) && !ty(g, 'carrier', 'brake', 'machine')) g.motor = { kind: 'speed', rpm: 60, tq: 2 };   // the first part on an empty bench gets the motor
  sel = new Set([g.id]); commit();
};
$('tpl-add').onclick = () => { const c = toWorld(W / 2, topMid()); freeze(); const made = insertTemplate($('tpl').value, c.x, c.y); sel = new Set(made.map(p => p.id)); commit(); fit(); };
$('add-layer').onclick = () => { addLayer(); ui(); save(); };
$('solo').onclick = () => { soloActive = !soloActive; ui(); save(); };
$('dims').onclick = () => { showDims = !showDims; ui(); save(); };
$('example').onclick = () => { example(); solve(); fit(); ui(); save(); };
$('clear').onclick = () => { const n = layerCount; resetScene(n); commit(); };
$('fit').onclick = fit;
$('why-x').onclick = () => { why = null; renderWhy(); };
$('zoom-in').onclick = () => zoomAt(W / 2, topMid(), 1.3);
$('zoom-out').onclick = () => zoomAt(W / 2, topMid(), 1 / 1.3);
for (const m of ['both', 'top', 'side']) $('vm-' + m).onclick = () => { viewMode = m; fit(); ui(); };
addEventListener('keydown', e => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range';
  if (e.key === 'Escape') { if (linkDraft) linkDraft = null; else sel = new Set(); ui(); return; }
  if (typing) return;
  if (e.key === 'Enter' && linkDraft) finishLink();
  else if (e.key === ' ') { e.preventDefault(); running = !running; ui(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); removeSel(); }
  else if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'к') rotateSel(e.shiftKey ? -15 : 15);
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'ф')) { e.preventDefault(); pick(parts.filter(canPick).map(p => p.id)); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'в')) { e.preventDefault(); duplicateSel(); }
});

/* ---------- start ---------- */
function start(d) {
  let ok = false;
  try { const src = d && d.parts ? d : JSON.parse(localStorage.getItem(STORE) || 'null'); if (src && Array.isArray(src.parts) && src.parts.length) { load(src); ok = true; } } catch (e) {}
  if (!ok) example();
  running = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  readTokens(); resize(); applyLang(); $('new-type').onchange(); place(); solve(); fit(); ui();
  new ResizeObserver(resize).observe(sheet);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTokens);
  new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(readTokens);
  let last = performance.now();
  const frame = ts => {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
    if (running && !lockMsg) { clock += RPM * dt; place(); }
    draw(ts); requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
// small hook for automated checks
window.__bench = { state: () => ({ lock: lockMsg, hint: hintMsg, io: ioRows(), warnings: warnings.map(w => [w.level, w.code]), parts: parts.map(p => ({ name: p.name, w: +outOf(p).w.toFixed(4), und: p.und })) }), parts: () => parts, solve, pick };
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => serialize());
if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : null);
