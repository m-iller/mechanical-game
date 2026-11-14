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
  if (T(p).grp === 'heat') return p.type === 'tcomp' ? `π ${p.pr}` : p.type === 'tburn' ? `${p.T3} °C` : p.type === 'tboil' ? `${p.pb} bar` : p.type === 'tcond' ? `${p.pk} kPa` : '';
  if (isHyd(p)) return ty(p, 'hpump', 'hmotor') ? `${p.q} cm³` : p.type === 'hrelief' ? `${p.pset} bar` : p.type === 'hcyl' ? `⌀${p.d}×${p.st}` : ty(p, 'hthrottle') ? `⌀${p.dn}` : '';
  if (isLink(p)) return p.len != null ? `l${+p.len.toFixed(1)}` : '';
  switch (p.type) {
    case 'worm': return `z${p.zw}`;
    case 'emotor': return isDyn(p.motor) && p.motor.P ? fmtU(p.motor.P, 'power') : '';
    case 'engine': return `${p.cyl}×${p.eD}×${p.eS}`;
    case 'generator': return fmtU(p.Pn, 'power');
    case 'heater': return `${fmtNum(p.T == null ? 20 : p.T, 3)} °C`;
    case 'hoist': case 'weight': return `${p.m} ${unitSym('kg')}`;
    case 'conveyor': return `${p.F} ${unitSym('N')}`;
    case 'hand': case 'spring': return '';
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
// structure of the mechanism a link belongs to
function linkRows(p) {
  const g = tmmInfo.of.get(p.id); if (!g || !(g.p5 + g.pf)) return [];
  const A = tmmAssur(g), drv = g.ids.map(byId).filter(q => q && (isDriver(q) || (RIDERS.includes(q.type) && camOf(q)))), q6 = g.W - 6 * g.n + 5 * g.p5 + 4 * g.p4;
  const chain = [`I(${drv.map(q => q.name).join(', ')})`, ...A.groups.map(x => `${x.cls}(${nameOf(x.ids)})`), ...(A.left.length ? [`?(${nameOf(A.left)})`] : [])].join(' → ');
  return [[t('io.links'), `${g.n}`], [t('io.p5'), `${g.p5}`],
    [t('io.W'), `${g.W}`, ex('W', g.W, '', 'W = 3·n − 2·p₅ − p₄', [['n', g.n, ''], ['p₅', g.p5, ''], ['p₄', g.p4, '']], ['ex.cheb'])],
    [t('io.q'), `${q6}`, ex('q', q6, '', 'q = W − 6·n + 5·p₅ + 4·p₄', [['W', g.W, ''], ['n', g.n, ''], ['p₅', g.p5, ''], ['p₄', g.p4, '']], ['ex.malyshev'])],
    [t('io.assur'), chain, ex('n', A.groups.length, '', '3·n − 2·p₅ = 0', [], ['ex.assur'])]];
}
// the planetary stage around a carrier: its sun, planets and ring, and the conditions on their tooth numbers
const stageOf = c => { const pl = parts.filter(q => q.mount && q.mount.c === c.id && q.type === 'spur'), L = pl.length ? pl[0].layer : -1; return { pl, sun: parts.find(q => q.type === 'spur' && !q.mount && same(q, c) && q.layer === L), ring: parts.find(q => q.type === 'ring' && same(q, c) && q.layer === L) }; };
function planetRows(c) {
  const { pl, sun, ring } = stageOf(c); if (!pl.length || !sun || !ring) return [];
  const k = planetCheck(sun.z, pl[0].z, ring.z, c.n), yes = v => v ? t('pl.ok') : t('pl.no'), zv = [['z_s', sun.z, ''], ['z_p', pl[0].z, ''], ['z_r', ring.z, ''], ['n', c.n, '']];
  const rows = [[t('pl.i'), fmtNum(k.i, 4), ex('i', k.i, '', 'i = 1 + z_r / z_s', zv, ['ex.plRing'])],
    [t('pl.coax'), yes(k.coax), ex('z_r', ring.z, '', 'z_r = z_s + 2·z_p', zv, ['ex.plCoax'])],
    [t('pl.neigh'), yes(k.neighbour), ex('(z_s + z_p)·sin(π/n)', (sun.z + pl[0].z) * Math.sin(Math.PI / c.n), '', '(z_s + z_p)·sin(π/n) > z_p + 2', zv, ['ex.plNeigh'])],
    [t('pl.asm'), yes(k.assembly), ex('(z_s + z_r)/n', (sun.z + ring.z) / c.n, '', '(z_s + z_r) / n = whole', zv, ['ex.plAsm'])]];
  const small = Math.min(sun.z, pl[0].z); if (small < Z_MIN) rows.push([t('pl.shift'), `x ≥ ${fmtNum(shiftMin(small), 2)}`, ex('x', shiftMin(small), '', 'x_min = (17 − z) / 17', [['z', small, '']], ['ex.plShift'])]);
  return rows;
}
// pick tooth numbers for a wanted ratio and put them on the stage
let pickRatio = null;
function planetFields(c) {
  const { pl, sun, ring } = stageOf(c); if (!pl.length || !sun || !ring) return [];
  const box = el('div', null, { className: 'links' }), fill = () => {
    box.textContent = '';
    for (const o of planetPick(pickRatio || 1 + ring.z / sun.z, c.n)) { const r = el('div'); r.append(el('span', `${o.zs} / ${o.zp} / ${o.zr}  i = ${fmtNum(o.i, 4)}`), btn(t('pl.use'), () => { sun.z = o.zs; ring.z = o.zr; for (const q of pl) q.z = o.zp; c.r = M * (o.zs + o.zp) / 2; pickRatio = null; commit(); })); box.append(r); }
    if (!box.children.length) box.append(el('span', t('pl.none')));
  };
  fill();
  return [slider(t('pl.want'), 2.5, 12, 0.05, () => +(pickRatio || 1 + ring.z / sun.z).toFixed(2), v => { pickRatio = v; fill(); }), labelled(t('pl.options'), box)];
}
function specRows(p) {
  if (isHeat(p)) return [...thRows(p), ...(ty(p, 'tcomp', 'tturb') ? [[t('sp.n'), rpmText(p.w)]] : [])];
  if (IO_ROUND.includes(p.type)) return [...ioPartRows(p), [t('sp.n'), rpmText(p.w)]];
  if (isHyd(p)) return [...hydRows(p), ...(p.type === 'hcyl' ? linkRows(p) : []), ...(ty(p, 'hpump', 'hmotor') ? [[t('sp.n'), rpmText(p.w)]] : [])];
  if (isLink(p)) return [...linkRows(p), ...(isDriver(p) ? [[t('sp.n'), rpmText(p.w)]] : []), ...tmmCycleRows(p)];
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
  if (p.type === 'carrier') r.push(...planetRows(p));
  if (p.type === 'rack') {} else { add('sp.n', p.und && !p.w ? t('s.free') : rpmText(o.w)); if (d && o.w) add('sp.vPitch', `${fmt(Math.PI * d * Math.abs(o.w) / 60)} ${t('u.mms')}`); add('sp.torque', tqText(p, o)); }
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
let why = null, whySeen = false, tmmStuck = false, graphTick = null, frameNo = 0;
const fillDl = (dl, rows) => {
  dl.textContent = '';
  for (const [k, v, e] of rows) {
    const dd = el('dd', v);
    if (e) { const id = (dl.dataset.why || '') + k; dd.className = 'ex'; dd.tabIndex = 0; dd.setAttribute('role', 'button'); dd.onclick = () => { why = why && why.id === id ? null : { id, title: k, e }; renderWhy(); }; dd.onkeydown = ev => { if (ev.key === 'Enter') dd.onclick(); }; if (why && why.id === id) { why.e = e; whySeen = true; } }
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

const MOTOR_KINDS = ['speed', 'torque', 'induction', 'dc', 'stepper', 'ice', 'power'], LOAD_KINDS = ['const', 'linear', 'quad', 'table'];
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
  if (k === 'ice') out.push(nSl('motor.limit', 100, 20000));
  else if (k === 'power') out.push(pSl(), nSl('motor.limit', 1, 60000));
  else if (k === 'speed') out.push(slider(t('motor.speed'), -10000, 10000, 1, () => m.rpm, v => { m.rpm = v; commit(); }, t('u.rpm')), slider(t('motor.rated'), 0.01, 1000, 0.01, () => m.tq, v => { m.tq = v; commit(); }, t('u.Nm')));
  else if (k === 'torque') out.push(slider(t('motor.torque'), 0.01, 1000, 0.01, () => m.tq, v => { m.tq = v; commit(); }, t('u.Nm')), nSl('motor.limit', 1, 10000));
  else if (k === 'induction') out.push(pSl(), nSl('motor.nNom', 100, 2990), kSl('motor.ks', 'ks', 0.5, 4), kSl('motor.km', 'km', 1.1, 4));
  else if (k === 'dc') out.push(pSl(), nSl('motor.nNom', 10, 20000), kSl('motor.ks', 'ks', 1.1, 10));
  else out.push(nSl('motor.cmd', 1, 5000), pSl(), kSl('motor.ks', 'ks', 1, 5));
  return out;
}
// what one source is doing, each figure with where it comes from
function motorRows(p) {
  const r = power.src.get(p.id), m = p.motor, k = m.kind || 'speed', rows = []; if (!r) return rows;
  const s = r.s, nNote = { speed: 'ex.ideal', torque: 'ex.torque', induction: 'ex.kloss', dc: 'ex.dc', stepper: 'ex.stepper', ice: 'ex.ice', power: 'ex.power' }[k];
  const nVars = k === 'induction' ? [['n₀', s.w0, 'rpm'], ['s', r.slip, '%'], ['s_k', s.sk, '%'], ['M_k', s.Mk, 'Nm'], ['M_L', r.M, 'Nm']] : s.ideal ? [] : [['n₀', s.w0, 'rpm'], ['M_L', r.M, 'Nm']];
  const nForm = { speed: 'n = n_set', torque: 'M = M_set = M_L(n),  n ≤ n_max', induction: 'M(s) = 2·M_k / (s/s_k + s_k/s) = M_L,   n = n₀·(1 − s)', dc: 'M = M_start·(1 − n/n₀) = M_L', stepper: 'n = n_set,  M_L ≤ min(M_hold, P/ω)', ice: 'M_e·(0.75 + x − x²) = M_L,   x = n / n_max', power: 'P / ω = M_L,  n ≤ n_max' }[k];
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
  const ms = parts.filter(p => p.motor && !p.motor.auto), box = $('motors'), key = sceneGen + ':' + ms.map(p => p.id + (p.motor.kind || '')).join() + lang;
  if (key !== motorsKey) {
    motorsKey = key; box.textContent = '';
    if (!ms.length) box.append(el('p', t('motor.none'), { className: 'hint' }));
    for (const p of ms) {
      const m = p.motor, card = el('div', null, { className: 'motor' });
      const head = rowOf(btn(p.label ? `${p.name} ${p.label}` : p.name, () => pick([p.id])), btn(t('btn.reverse'), () => { m.rpm = -m.rpm; if (m.n) m.n = -m.n; commit(); }), !isSource(p) && btn('×', () => { delete p.motor; commit(); }));
      if (!isSource(p)) head.lastChild.setAttribute('aria-label', t('btn.removeMotor'));
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
  const key = JSON.stringify([sceneGen, selPipe, pipeDraft && [pipeDraft.a, 1], pipes.map(q => [q.id, q.kind, q.fluid, q.mat, q.pts.length]), lang, layerCount, linkDraft && [linkDraft.kind, linkDraft.ids], outId, links.map(L => [L.ids, L.crossed]), ps.map(q => [q.id, q.type, q.layer, q.on, q.held, q.loose, !!q.motor, q.load && q.load.kind, q.mount && q.mount.c, q.l0, q.l1, q.law, q.pos, q.st, q.ekind, q.grav, q.ft]), pairs.map(q => [q.id, q.type])]);
  $('sel-name').textContent = p ? `${p.name} · ${typeName(p)}` : ps.length ? t('sel.many', { n: ps.length }) : t('sel.none');
  if (key !== selKey) {
    selKey = key; selRefresh = []; graphTick = null; body.textContent = '';
    if (pipeDraft) body.append(el('p', t(pipeDraft.a == null ? 'hy.pickFirst' : 'hy.pickNext'), { className: 'hint' }), rowOf(btn(t('btn.cancel'), () => { pipeDraft = null; ui(); })));
    else if (selPipe != null && pipes.some(q => q.id === selPipe)) pipePanel(pipes.find(q => q.id === selPipe), body);
    else if (linkDraft) {
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
      if (!isLin(p) && !isSource(p) && !ty(p, 'machine', 'generator', 'heater', 'hoist', 'conveyor') && (!isLink(p) || isDriver(p)) && !isPlant(p)) tg.push(btn(t('tog.motor'), () => { if (p.motor) delete p.motor; else { p.motor = { kind: 'speed', rpm: 60, tq: 2 }; delete p.load; } commit(); }, !!p.motor));
      if (!isLin(p) && !isShaft(p) && !isLink(p) && !isPlant(p) && !isSource(p) && !ty(p, 'machine', 'brake', 'generator', 'hoist', 'conveyor') && !p.motor) tg.push(btn(t('tog.load'), () => { if (p.load) delete p.load; else p.load = { kind: 'const', tq: 1, n: 1000, eta: 1 }; commit(); }, !!p.load));
      if (!isLin(p) && !isLink(p) && !isPlant(p) && p.type !== 'brake') tg.push(btn(t('tog.held'), () => { p.held = !p.held; commit(); }, !!p.held));
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
      if (isLink(p)) { // the pairs this link is in: look, change the kind, or take apart
        const box = el('div', null, { className: 'links' }), mine = pairsOf(p);
        for (const q of mine) {
          const o = byId(q.a === p.id ? q.b : q.a), r = el('div'); r.append(el('span', o ? o.name : '?'));
          if (q.type === 'P' || q.type === 'H') r.append(el('span', t('pair.' + q.type)));
          else r.append(choice([['R', t('pair.R')], ['F', t('pair.F')]], q.type, v => { q.type = v; q.turn = v === 'F' ? wrap(linkTh(byId(q.b)) - linkTh(byId(q.a))) : 0; commit(); }));
          r.append(btn('×', () => { pairs = pairs.filter(x => x !== q); commit(); })); box.append(r);
        }
        body.append(mine.length ? labelled(t('sel.pairs'), box) : el('p', t('sel.noPairs'), { className: 'hint' }), ...tmmFields(p));
        const gc = el('canvas', null, { className: 'graphs' }), pc = el('canvas', null, { className: 'graphs' }); body.append(gc, pc); graphTick = () => { if (gc.isConnected) { drawGraphs(gc, p); drawPlans(pc, p); } }; selRefresh.push(graphTick);
      }
      if (isHyd(p)) body.append(...hydFields(p));
      if (IO_ROUND.includes(p.type)) body.append(...ioFields(p));
      if (isHeat(p)) body.append(...thFields(p));
      if (p.type === 'carrier') body.append(...planetFields(p));
      if (p.type === 'flywheel') body.append(slider(t('link.J'), 0, 10000, 0.0001, () => +flyJ(p).toPrecision(4), v => { p.J = v; commit(); }, unitSym('kgm2')));
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
  whySeen = false;
  renderMotors(); fillDl($('io'), ioRows()); renderLayers(); renderSel(); renderWarns();
  if (why && !whySeen) why = null;   // the figure it explained is gone
  renderWhy();
  const moving = parts.filter(p => !isShaft(p) && isDriven(p)).length, total = parts.filter(p => !isShaft(p)).length;
  const err = (warnings.find(w => w.level === 'error') || {}).text || (tmmStuck ? t('w.linkStuck') : '');
  $('status').className = 'status' + (linkDraft ? '' : lockMsg || err ? ' locked' : !running ? ' paused' : '');
  $('status-text').textContent = pipeDraft ? t(pipeDraft.a == null ? 'hy.pickFirst' : 'hy.pickNext') : linkDraft ? t('status.link') : !total ? t('status.empty') : lockMsg ? lockMsg : err ? err : hintMsg ? hintMsg : !running ? t('status.paused') : t('status.running', { n: moving, m: total });
  const nt = TYPES[$('new-type').value], nz = $('new-z'); $('new-size-row').hidden = !nt.key;
  if (nt.key) { nz.min = nt.lim[0]; nz.max = nt.lim[1]; nz.step = nt.lim[2]; const nn = $('new-z-num'); nn.min = nz.min; nn.max = nz.max; nn.step = nz.step; if (document.activeElement !== nn) nn.value = nz.value; $('new-z-lab').textContent = t('size.' + $('new-type').value); }
  $('new-layer').textContent = t('add.onLayer', { l: LET(activeLayer) });
  $('add').disabled = $('tpl-add').disabled = lockedLayers.has(activeLayer);
  for (const m of ['both', 'top', 'side']) press($('vm-' + m), viewMode === m);
  press($('dims'), showDims); press($('scheme'), schemeMode);
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
  if (ids.length) selPipe = null;
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
  for (const p of ps) { const o = serialize().parts.find(q => q.id === p.id), id = nextId++; map.set(p.id, id); made.push(make({ ...o, id, name: T(p).pre + id, x: p.x + 24, y: p.y + 24, motor: isSource(p) ? o.motor : null })); }
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
  if (isLink(p)) return;
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

/* ---------- hydraulics in the panel ---------- */
const LINE_KINDS = ['pressure', 'return', 'suction', 'drain', 'pilot'];
const barText = p => fmtU(p, 'bar'), lminText = q => fmtU(Math.abs(q), 'L/min');
function hydRows(p) {
  const r = hyd.part.get(p.id), rows = []; if (!r || !hyd.ok) return rows;
  const rho = [['ρ', `${FLUIDS.oil.rho} kg/m³`]];
  if (p.type === 'hpump') {
    const n = Math.abs(p.w) * RPM, dp = r.pP - r.pS;
    rows.push([t('hy.Q'), lminText(r.Q), ex('Q', r.Q, 'L/min', 'Q = q·n·η_v', [['q', `${p.q} cm³`], ['n', n, 'rpm'], ['η_v', ETA_V, '']], ['ex.pumpEta'])],
      [t('hy.p'), barText(r.pP), ex('p', r.pP, 'bar', 'p = what the network asks at this flow', [], ['ex.hydSteady'])],
      [t('hy.Ph'), fmtU(r.P, 'power'), ex('P', r.P, 'power', 'P = Δp·Q', [['Δp', dp, 'bar'], ['Q', r.Q, 'L/min']], [])],
      [t('io.M'), fmtU(r.M, 'Nm'), ex('M', r.M, 'Nm', 'M = Δp·q / (2π·η_m)', [['Δp', dp, 'bar'], ['q', `${p.q} cm³`], ['η_m', ETA_M, '']], ['ex.pumpEta'])]);
  } else if (p.type === 'hcyl') {
    const A1 = cylA1(p), A2 = cylA2(p), out = r.v >= 0, left = r.v > 1e-9 ? (p.st - p.s) / 1000 / r.v : r.v < -1e-9 ? p.s / 1000 / -r.v : 0;
    rows.push([t('hy.v'), r.held ? t('hy.held') : fmtU(r.v, 'mm/s'), ex('v', r.v, 'mm/s', out ? 'v = Q / A₁' : 'v = Q / A₂', [['Q', Math.abs(out ? r.Q : r.v * A2), 'L/min'], [out ? 'A₁' : 'A₂', `${fmtNum((out ? A1 : A2) * 1e4)} cm²`]], ['ex.hydSteady'])],
      [t('hy.pA'), barText(r.pA), ex('p_A', r.pA, 'bar', 'p_A·A₁ − p_B·A₂ = F', [['F', r.v < -1e-9 && p.Fb != null ? -p.Fb : (p.F || 0) + (p.Fs || 0), 'N'], ['A₁', `${fmtNum(A1 * 1e4)} cm²`], ['A₂', `${fmtNum(A2 * 1e4)} cm²`], ['p_B', r.pB, 'bar']], ['ex.cylStatic'])],
      [t('hy.pB'), barText(r.pB)], ...(p.grav ? [[t('hy.Fs'), fmtU(p.Fs || 0, 'force'), ex('F', p.Fs || 0, 'force', 'F = −g·Σ m·dy/ds', [], ['ex.virtual'])]] : []), [t('hy.s'), `${fmtNum(p.s)} / ${p.st} ${unitSym('mm')}`]);
    if (left) rows.push([t('hy.left'), `${fmtNum(left, 2)} ${unitSym('s')}`]);
  } else if (p.type === 'hmotor') {
    rows.push([t('io.n'), fmtU(Math.abs(r.w), 'rpm'), ex('n', Math.abs(r.w), 'rpm', 'n = Q·η_v / q', [['Q', r.Q, 'L/min'], ['q', `${p.q} cm³`], ['η_v', ETA_V, '']], ['ex.pumpEta'])],
      [t('hy.dp'), barText(r.dp), ex('Δp', r.dp, 'bar', 'Δp = 2π·M / (q·η_m)', [['q', `${p.q} cm³`], ['η_m', ETA_M, '']], ['ex.pumpEta'])]);
  } else if (p.type === 'hrelief') rows.push([t('hy.Q'), r.Q > 1e-7 ? lminText(r.Q) : t('hy.shut'), ex('Q', r.Q, 'L/min', 'Q = k·(p − p_set),  p > p_set', [['p', r.pa, 'bar'], ['p_set', p.pset * 1e5, 'bar']], ['ex.relief'])]);
  else if (r.Q != null) rows.push([t('hy.Q'), lminText(r.Q)], [t('hy.dp'), barText(Math.abs(r.dp || 0)), ex('Δp', Math.abs(r.dp || 0), 'bar', 'Δp = ρ/2·(Q / (C_d·A))²', [['Q', Math.abs(r.Q), 'L/min'], ['C_d', 0.62, ''], ['d', p.dn / 1000, 'mm'], ...rho], ['ex.orifice'])]);
  return rows;
}
function pipeRows(q) {
  const r = hyd.pipe.get(q.id), rows = [[t('hy.L'), `${fmtNum(pipeLen(q), 3)} ${unitSym('m')}`]]; if (!r || !hyd.ok) return rows;
  const fl = r.fl, v = Math.abs(r.v);
  rows.push([t('hy.Q'), lminText(r.Q)],
    [t('hy.vel'), fmtU(v, 'm/s'), ex('v', v, 'm/s', 'v = 4·Q / (π·d²)', [['Q', Math.abs(r.Q), 'L/min'], ['d', q.d / 1000, 'mm']], [])],
    ['Re', `${fmtNum(r.Re, 3)} · ${t('hy.' + r.regime)}`, ex('Re', r.Re, '', 'Re = v·d / ν', [['v', v, 'm/s'], ['d', q.d / 1000, 'mm'], ['ν', `${fmtNum(fl.nu * 1e6)} mm²/s`]], ['ex.regime'])],
    [t('hy.dp'), barText(Math.abs(r.dp)), ex('Δp', Math.abs(r.dp), 'bar', 'Δp = (λ·L/d + Σζ)·ρ·v²/2', [['λ', r.lam, ''], ['L', r.L, 'm'], ['d', q.d / 1000, 'mm'], ['Σζ', r.zeta, ''], ['ρ', `${fl.rho} kg/m³`], ['v', v, 'm/s']], ['ex.lambda', 'ex.elbows'])],
    [t('hy.pEnds'), `${barText(r.pa)} → ${barText(r.pb)}`]);
  return rows;
}
function pipePanel(q, body) {
  const a = byId(q.a), b = byId(q.b), set = k => v => { q[k] = v; commit(); }, dl = el('dl'); dl.dataset.why = 'pipe' + q.id + ':';
  body.append(el('p', `${a.name} ${portsOf(a)[q.pa][0]} → ${b.name} ${portsOf(b)[q.pb][0]}`, { className: 'hint' }), slider(t('hy.d'), 2, 300, 0.5, () => q.d, set('d'), unitSym('mm')),
    labelled(t('hy.kind'), choice(LINE_KINDS.map(k => [k, t('line.' + k)]), q.kind, set('kind'))), labelled(t('hy.fluid'), choice(Object.keys(FLUIDS).map(k => [k, t('fluid.' + k)]), q.fluid, set('fluid'))),
    labelled(t('hy.mat'), choice(Object.keys(ROUGH).map(k => [k, t('mat.' + k)]), q.mat, set('mat'))), dl);
  selRefresh.push(() => fillDl(dl, pipeRows(q)));
  const rm = btn(t('btn.remove'), () => { pipes = pipes.filter(x => x !== q); selPipe = null; commit(); }); rm.className = 'danger';
  body.append(rowOf(q.pts.length && btn(t('hy.straight'), () => { q.pts = []; commit(); }), rm));
}
function hydFields(p) {
  const out = [], num = (key, k, lo, hi, step, unit, def = 0) => slider(t(key), lo, hi, step, () => p[k] == null ? def : p[k], v => { p[k] = v; commit(); }, unit);
  if (p.type === 'hvalve') out.push(rowOf(...[[1, 'P→A'], [0, '0'], [-1, 'P→B']].map(([k, lb]) => btn(lb, () => { p.pos = k; commit(); }, (p.pos || 0) === k))));
  if (p.type === 'hcyl') out.push(slider(t('hy.rod'), 4, 300, 1, () => rodD(p), v => { p.dr = Math.min(v, p.d - 2); commit(); }, unitSym('mm')), slider(t('hy.s'), 0, p.st, 0.5, () => +(p.s || 0).toFixed(1), v => { p.s = v; delete p.jam; commit(); }, unitSym('mm')),
    num('hy.F', 'F', -1e6, 1e6, 10, unitSym('N')), num('hy.Fb', 'Fb', 0, 1e6, 10, unitSym('N')), rowOf(btn(t('hy.grav'), () => { p.grav = !p.grav; if (!p.grav) delete p.grav; commit(); }, !!p.grav)));
  if (p.type === 'hmotor') out.push(num('hy.M', 'M', 0, 1e5, 0.1, unitSym('Nm')));
  if (p.type !== 'hnode' || true) out.push(rowOf(btn(t('hy.lay'), () => { pipeDraft = { a: null, pts: [], cur: null }; sel = new Set(); ui(); })));
  return out;
}
/* A click in the side view while a pipe is being laid, as a point of the bench: the port nearest in x on the layer under the pointer,
   or else a corner at that x, in line with the last point (the side view cannot say how deep it is). */
function sidePoint(p) {
  const x = (p.x - W / 2) / view.scale + view.cx, l = Math.round(((baseY() - p.y) / view.scale - FW / 2) / LP), r = Math.max(3.5, 10 / view.scale), d = pipeDraft; let best = null;
  const last = d.a == null ? { y: 0 } : d.pts.length ? { y: d.pts[d.pts.length - 1][1] } : portPos(byId(d.a), d.pa);
  // ports that fall on one x are told apart by which lies nearer the last point in depth
  for (const g of parts) if (g.layer === l && shown(g)) portsOf(g).forEach((_, k) => { const q = portPos(g, k), dx = Math.abs(q.x - x), rank = dx + 1e-3 * Math.abs(q.y - last.y); if (dx < r && (!best || rank < best.rank) && !(d.a === g.id && d.pa === k)) best = { rank, q }; });
  if (best) return best.q;
  return { x, y: last.y };
}
// a click while a pipe is being laid: a port starts or ends it, another pipe gets a tee, anything else is a corner
function pipeClick(w) {
  const r = Math.max(3.5, 10 / view.scale), port = portAt(w, r), d = pipeDraft;
  if (d.a == null) { if (port) { d.a = port.p.id; d.pa = port.k; ui(); } return; }
  const a = byId(d.a), done = (b, pb) => { const fromTank = a.type === 'htank' || b.type === 'htank', dm = portDomain(a) || {}, thm = dm.domain === 'th'; addPipe(a, d.pa, b, pb, { pts: d.pts, d: thm ? 60 : 10, fluid: dm.domain === 'el' ? 'el' : thm ? (typeof gasOf === 'function' ? gasOf(a, d.pa) : 'air') : 'oil', kind: fromTank ? 'return' : 'pressure', mat: a.type === 'hcyl' || b.type === 'hcyl' ? 'hose' : 'steel' }); pipeDraft = null; commit(); };
  if (port && !(port.p.id === d.a && port.k === d.pa)) return done(port.p, port.k);
  const hitP = pipeAt(w, r * 0.6); if (hitP) return done(pipeTee(hitP, a.layer), 0);
  const last = d.pts.length ? { x: d.pts[d.pts.length - 1][0], y: d.pts[d.pts.length - 1][1] } : portPos(a, d.pa), sn = 5 / view.scale;   // keep runs square when the click is close to it
  d.pts.push([Math.abs(w.x - last.x) < sn ? last.x : w.x, Math.abs(w.y - last.y) < sn ? last.y : w.y]);
}

/* ---------- sources and consumers in the panel ---------- */
function ioPartRows(p) {
  const rows = [], w = Math.abs(p.w) * RPM;
  if (p.type === 'engine') {
    const sw = engineSwing(p), c = sw.c, thr = p.thr == null ? 1 : p.thr, J = crankJ(p), src = power.src.get(p.id) || { M: 0, P: 0 };
    rows.push([t('en.V'), `${fmtNum(c.Vh * c.e.cyl * 1e3, 3)} L`, ex('V', c.Vh * c.e.cyl, '', 'V = i·π·D²/4·S', [['i', c.e.cyl, ''], ['D', c.e.D, 'mm'], ['S', c.e.S, 'mm']], [])],
      [t('en.pi'), fmtU(c.pi, 'bar'), ex('p_i', c.pi, 'bar', 'p_i = W_i / V_h,   W_i = W_exp − W_comp', [['p₂', c.p2, 'bar'], ['p₃', c.p3, 'bar'], ['p₄', c.p4, 'bar'], ['W_i', c.Wi, 'J']], ['ex.engCycle'])],
      [t('en.eta'), `${fmtNum(100 * c.etaI)} %`, ex('η_i', c.etaI, '%', 'η_i = W_i / Q₁', [['W_i', c.Wi, 'J'], ['Q₁', c.Q1, 'J']], ['ex.engCycle'])],
      [t('en.Me'), fmtU(c.Me * thr, 'Nm'), ex('M_e', c.Me * thr, 'Nm', 'M_e = W_i·i·η_m·throttle / (π·τ)', [['W_i', c.Wi, 'J'], ['i', c.e.cyl, ''], ['η_m', c.e.etaM, ''], ['τ', c.e.strokes, '']], ['ex.engFill'])],
      [t('io.M'), fmtU(src.M, 'Nm')], [t('io.P'), fmtU(src.P, 'power'), ex('P', src.P, 'power', 'P = M·ω', [['M', src.M, 'Nm'], ['ω', w, 'rpm']], [])]);
    if (w) { rows.push([t('io.dA'), fmtU(sw.dA, 'energy'), ex('ΔA', sw.dA, 'energy', 'ΔA = max − min of ∫(M − M̄) dφ', [], ['ex.engSwing'])]); if (J > 0) rows.push([t('io.delta'), fmtNum(sw.dA / (J * w * w)), ex('δ', sw.dA / (J * w * w), '', 'δ = ΔA / (J·ω²)', [['ΔA', sw.dA, 'energy'], ['J', J, 'kgm2'], ['ω', w, 'rpm']], ['ex.flyJ'])]); rows.push([t('en.Jreq'), fmtU(sw.dA / (0.02 * w * w), 'kgm2'), ex('J', sw.dA / (0.02 * w * w), 'kgm2', 'J = ΔA / (δ·ω²),   δ = 1/50', [['ΔA', sw.dA, 'energy'], ['ω', w, 'rpm']], [])]); }
  } else if (p.type === 'generator') {
    const r = elec.gen.get(p.id) || { Pm: 0, Pel: 0, ratio: 0 };
    rows.push([t('ge.Pel'), fmtU(r.Pel, 'power'), ex('P_el', r.Pel, 'power', 'P_el = η·M·ω,   M = M_n·n / n_n', [['η', p.ge, ''], ['M', r.M, 'Nm'], ['ω', r.w, 'rpm']], ['ex.genLaw'])],
      [t('io.Pin'), fmtU(r.Pm, 'power')], [t('io.loadPct'), `${fmtNum(100 * r.ratio)} %`]);
  } else if (p.type === 'heater') {
    const r = elec.heat.get(p.id) || { P: 0, Tss: T_AMB, tau: 0 };
    rows.push([t('ht.P'), fmtU(r.P, 'power')], [t('ht.T'), `${fmtNum(p.T == null ? T_AMB : p.T, 3)} °C`],
      [t('ht.Tss'), `${fmtNum(r.Tss, 3)} °C`, ex('T', r.Tss + 273.15, 'degC', 'T = T₀ + P / k', [['T₀', T_AMB + 273.15, 'degC'], ['P', r.P, 'power'], ['k', `${p.hk} W/K`]], ['ex.heat'])],
      [t('ht.tau'), `${fmtNum(r.tau, 3)} ${unitSym('s')}`, ex('τ', r.tau, 's', 'τ = m·c / k', [['m', p.hm, 'kg'], ['c', `${C_STEEL} J/(kg·K)`], ['k', `${p.hk} W/K`]], ['ex.heat'])]);
  } else if (p.type === 'conveyor') {
    const L = power.load.get(p.id) || { M: 0, P: 0, Pout: 0 }, v = w * p.d / 2000;
    rows.push([t('cv.v'), fmtU(v, 'm/s'), ex('v', v, 'm/s', 'v = ω·D / 2', [['ω', w, 'rpm'], ['D', p.d / 1000, 'mm']], [])],
      [t('io.M'), fmtU(L.M, 'Nm'), ex('M', L.M, 'Nm', 'M = F·D / (2·η)', [['F', p.F, 'N'], ['D', p.d / 1000, 'mm'], ['η', CONV_ETA, '']], ['ex.conv'])], [t('io.Pin'), fmtU(L.P, 'power')], [t('io.Pout'), fmtU(L.Pout, 'power'), ex('P', L.Pout, 'power', 'P = F·v', [['F', p.F, 'N'], ['v', v, 'm/s']], [])]);
  } else if (p.type === 'hoist') {
    const L = power.load.get(p.id) || { M: 0, P: 0 }, v = w * p.d / 2000;
    rows.push([t('ho.v'), fmtU(v, 'm/s'), ex('v', v, 'm/s', 'v = ω·D / 2', [['ω', w, 'rpm'], ['D', p.d / 1000, 'mm']], [])],
      [t('io.M'), fmtU(L.M, 'Nm'), ex('M', L.M, 'Nm', 'M = m·g·D / (2·η)', [['m', p.m, 'kg'], ['D', p.d / 1000, 'mm'], ['η', HOIST_ETA, '']], [])], [t('io.Pin'), fmtU(L.P, 'power')]);
  }
  return rows;
}
function ioFields(p) {
  const out = [], num = (key, k, lo, hi, step, unit) => slider(t(key), lo, hi, step, () => p[k], v => { p[k] = v; commit(); }, unit);
  if (p.type === 'engine') {
    out.push(labelled(t('en.kind'), choice([['otto', t('en.otto')], ['diesel', t('en.diesel')]], p.ekind || 'otto', v => { p.ekind = v; p.eps = v === 'diesel' ? 17 : 9.5; commit(); })),
      num('en.cyl', 'cyl', 1, 12, 1), num('en.D', 'eD', 30, 400, 1, unitSym('mm')), num('en.S', 'eS', 30, 500, 1, unitSym('mm')), num('en.eps', 'eps', 6, 24, 0.5), slider(t('en.thr'), 5, 100, 1, () => Math.round((p.thr == null ? 1 : p.thr) * 100), v => { p.thr = v / 100; commit(); }, '%'));
    const gc = el('canvas', null, { className: 'graphs' }); out.push(gc); selRefresh.push(() => drawEngine(gc, p));
  } else if (p.type === 'generator') out.push(slider(t('motor.P'), 0.01, 5000, 0.01, () => +(p.Pn / 1000).toFixed(3), v => { p.Pn = v * 1000; commit(); }, unitSym('kW')), num('motor.nNom', 'nn', 50, 30000, 10, t('u.rpm')), num('ge.eta', 'ge', 0.3, 1, 0.01));
  else if (p.type === 'heater') out.push(num('link.m', 'hm', 0.05, 10000, 0.05, unitSym('kg')), num('ht.k', 'hk', 0.1, 5000, 0.1, 'W/K'), rowOf(btn(t('ht.cool'), () => { p.T = T_AMB; ui(); })));
  else if (p.type === 'hoist' || p.type === 'weight') out.push(num('link.m', 'm', 0, 100000, 0.5, unitSym('kg')));
  else if (p.type === 'conveyor') out.push(num('cv.F', 'F', 0, 1e6, 10, unitSym('N')), num('cv.len', 'len', 40, 5000, 10, unitSym('mm')));
  else if (p.type === 'spring') out.push(num('hy.M', 'M', 0.01, 10000, 0.01, unitSym('Nm')));
  if (portsOf(p).length) out.push(rowOf(btn(t('el.lay'), () => { pipeDraft = { a: null, pts: [], cur: null }; sel = new Set(); ui(); })));
  return out;
}
// indicator diagram p–V and the engine's torque over the 720° of its cycle
function drawEngine(cvs, p) {
  const sw = engineSwing(p), c = sw.c, dpr2 = window.devicePixelRatio || 1, Wc = cvs.clientWidth || 300, Hc = 230;
  cvs.style.height = Hc + 'px'; if (cvs.width !== Math.round(Wc * dpr2)) { cvs.width = Math.round(Wc * dpr2); cvs.height = Math.round(Hc * dpr2); }
  const g = cvs.getContext('2d'); g.setTransform(dpr2, 0, 0, dpr2, 0, 0); g.clearRect(0, 0, Wc, Hc); g.font = `11px ${C.mono}`; g.textBaseline = 'alphabetic';
  const P = engineDiagram(c, 60), x0 = 8, x1 = Wc - 8, top = 18, bot = 128, X = V => x0 + (x1 - x0) * V / (c.Va * 1.04), Y = pp => bot - (bot - top) * pp / (c.p3 * 1.05);
  g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, bot); g.lineTo(x1, bot); g.moveTo(x0, top); g.lineTo(x0, bot); g.stroke();
  g.fillStyle = C.brass; g.globalAlpha = 0.18; g.beginPath(); P.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.closePath(); g.fill(); g.globalAlpha = 1; g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = C.ink; g.textAlign = 'left'; g.fillText(`p–V   p₃ = ${fmtU(c.p3, 'bar')}`, x0 + 4, top - 5); g.textAlign = 'right'; g.fillStyle = C.muted; g.fillText(`V_h = ${fmtNum(c.Vh * 1e6, 3)} cm³`, x1, top - 5);
  const M = sw.tq.M, t2 = 150, b2 = Hc - 8, lo = Math.min(0, sw.tq.min), hi = sw.tq.max, Xm = k => x0 + (x1 - x0) * k / M.length, Ym = v => b2 - (b2 - t2) * (v - lo) / (hi - lo || 1);
  g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Ym(0)); g.lineTo(x1, Ym(0)); g.stroke();
  g.setLineDash([4, 3]); g.strokeStyle = C.brass; g.beginPath(); g.moveTo(x0, Ym(sw.tq.mean)); g.lineTo(x1, Ym(sw.tq.mean)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = C.ink; g.lineWidth = 1.5; g.beginPath(); M.forEach((v, k) => k ? g.lineTo(Xm(k), Ym(v)) : g.moveTo(Xm(k), Ym(v))); g.stroke();
  g.fillStyle = C.ink; g.textAlign = 'left'; g.fillText(`M(φ), 0…720°   M̄ = ${fmtU(sw.tq.mean, 'Nm')}`, x0 + 4, t2 - 5); g.textAlign = 'right'; g.fillStyle = C.muted; g.fillText(`${fmtU(lo, 'Nm')} … ${fmtU(hi, 'Nm')}`, x1, t2 - 5);
}

/* ---------- gas-turbine and steam plant in the panel ---------- */
const degC = Tk => `${fmtNum(Tk - 273.15, 3)} °C`, kJ = v => `${fmtNum(v / 1000, 3)} kJ/kg`;
function thRows(p) {
  const r = thermo.part.get(p.id), rows = []; if (!r) return rows;
  const mv = [['ṁ', `${fmtNum(r.m, 3)} kg/s`]];
  if (p.type === 'tcomp') {
    rows.push([t('th.T2'), degC(r.T2), ex('T₂', r.T2, 'degC', 'T₂ = T₁ + T₁·(π^((k−1)/k) − 1) / η_c', [['T₁', r.T1, 'degC'], ['π', p.pr, ''], ['k', AIR.k, ''], ['η_c', p.etaC || 0.85, '']], ['ex.idealGas'])],
      [t('th.p2'), fmtU(r.p2, 'bar')], [t('th.wc'), kJ(r.wc), ex('w_c', r.wc, '', 'w_c = c_p·(T₂ − T₁)', [['c_p', `${AIR.cp} J/(kg·K)`], ['T₂', r.T2, 'degC'], ['T₁', r.T1, 'degC']], ['ex.idealGas'])],
      [t('th.m'), `${fmtNum(r.m, 3)} kg/s`, ex('ṁ', r.m, '', p.nd ? 'ṁ = ṁ_d·n / n_d' : 'ṁ = ṁ_d', p.nd ? [['ṁ_d', `${p.mf} kg/s`], ['n', Math.abs(p.w) * RPM, 'rpm'], ['n_d', p.nd * RPM, 'rpm']] : [], ['ex.mFixed'])],
      [t('th.Pc'), fmtU(r.Pc, 'power'), ex('P', r.Pc, 'power', 'P = ṁ·w_c', mv, ['ex.mFixed'])]);
    if (r.turb) rows.push([t('th.Pnet'), fmtU(r.P, 'power'), ex('P', r.P, 'power', 'P = ṁ·(w_t − w_c)', [...mv, ['w_t', kJ(r.wt)], ['w_c', kJ(r.wc)]], ['ex.mFixed'])],
      [t('th.eta'), `${fmtNum(100 * r.eta)} %`, ex('η', r.eta, '%', 'η = (w_t − w_c) / q,   q = c_p·(T₃ − T₂)', [['w_t', kJ(r.wt)], ['w_c', kJ(r.wc)], ['q', kJ(r.q)]], ['ex.idealGas', 'ex.brayton'])],
      [t('th.bwr'), `${fmtNum(100 * r.bwr)} %`]);
  } else if (p.type === 'tburn') rows.push([t('th.Tin'), degC(r.Tin)], [t('th.Q'), fmtU(r.Q, 'power'), ex('Q', r.Q, 'power', 'Q = ṁ·c_p·(T₃ − T₂)', [...mv, ['c_p', `${FLUE.cp} J/(kg·K)`], ['T₃', r.T3, 'degC'], ['T₂', r.Tin, 'degC']], ['ex.idealGas'])], [t('th.pin'), fmtU(r.pin, 'bar')]);
  else if (p.type === 'tturb') {
    const st = stageOfTurbine(p), D = 180 / Math.PI;
    rows.push([t('th.T3'), degC(r.T3)], [t('th.T4'), degC(r.T4), r.steam ? undefined : ex('T₄', r.T4, 'degC', 'T₄ = T₃ − η_t·T₃·(1 − (p₄/p₃)^((k−1)/k))', [['T₃', r.T3, 'degC'], ['p₃', r.p3, 'bar'], ['p₄', r.p4, 'bar'], ['k', FLUE.k, ''], ['η_t', r.etaT, '']], ['ex.idealGas'])],
      [t('th.pp'), `${fmtU(r.p3, 'bar')} → ${fmtU(r.p4, 'bar')}`], [t('th.wt'), kJ(r.wt)], [t('th.Pt'), fmtU(r.Pt, 'power'), ex('P', r.Pt, 'power', 'P = ṁ·w_t', mv, ['ex.mFixed'])]);
    if (r.steam) rows.push([t('th.x4'), fmtNum(r.x4, 3)]);
    if (st) rows.push([t('th.u'), fmtU(st.u, 'm/s'), ex('u', st.u, 'm/s', 'u = ω·d_m / 2', [['ω', Math.abs(p.w) * RPM, 'rpm'], ['d_m', p.dm / 1000, 'mm']], [])],
      [t('th.c1'), fmtU(st.c1, 'm/s'), ex('c₁', st.c1, 'm/s', 'c₁ = φ·√(2·(1 − ρ)·h₀)', [['φ', 0.95, ''], ['ρ', p.rho || 0, ''], ['h₀', kJ(st.h0)]], ['ex.stage'])],
      [t('th.b1'), `${fmtNum(st.b1 * D, 3)}°`], [t('th.c2'), `${fmtU(st.c2, 'm/s')}, α₂ = ${fmtNum(st.a2 * D, 3)}°`],
      [t('th.x'), `${fmtNum(st.x, 3)} (${t('th.best')} ${fmtNum(st.xopt, 3)})`, ex('u/c_f', st.x, '', 'c_f = √(2·h₀)', [['u', st.u, 'm/s'], ['h₀', kJ(st.h0)]], ['ex.stageOpt'])],
      [t('th.etaU'), `${fmtNum(100 * st.eta)} %`, ex('η_u', st.eta, '%', 'η_u = u·(c₁u + c₂u) / h₀', [['u', st.u, 'm/s'], ['c₁u', st.c1u, 'm/s'], ['c₂u', st.c2u, 'm/s'], ['h₀', kJ(st.h0)]], ['ex.stage'])]);
  } else if (p.type === 'tboil') rows.push([t('th.Tsat'), degC(r.Tb)], [t('th.Q'), fmtU(r.Q, 'power'), ex('Q', r.Q, 'power', 'Q = ṁ·(h₃ − h₂)', [...mv, ['h₃', kJ(r.h3)], ['h₂', kJ(r.h2)]], ['ex.steam'])],
    [t('th.Pnet'), fmtU(r.P, 'power')], [t('th.eta'), `${fmtNum(100 * r.eta)} %`, ex('η', r.eta, '%', 'η = (w_t − w_p) / q', [['w_t', kJ(r.wt)], ['w_p', kJ(r.wp)], ['q', kJ(r.q)]], ['ex.steam', 'ex.rankine'])]);
  else if (p.type === 'tcond') rows.push([t('th.Tc'), degC(r.T)], [t('th.Qc'), fmtU(r.Q, 'power')], [t('th.x4'), fmtNum(r.x4, 3)]);
  else if (p.type === 'tfeed') rows.push([t('th.Pp'), fmtU(r.P, 'power'), ex('P', r.P, 'power', 'P = ṁ·v·(p_b − p_c) / η_p', [...mv, ['η_p', 0.8, '']], ['ex.steam'])]);
  return rows.filter(x => x).map(x => x.filter(y => y !== undefined));
}
function thFields(p) {
  const out = [], num = (key, k, lo, hi, step, unit, def) => slider(t(key), lo, hi, step, () => p[k] == null ? def : p[k], v => { p[k] = v; commit(); }, unit);
  if (p.type === 'tcomp') out.push(num('th.mf', 'mf', 0.01, 1000, 0.01, 'kg/s', 1), num('th.nd', 'nd', 0, 60000, 50, t('u.rpm'), 0), num('th.etaC', 'etaC', 0.5, 1, 0.01, '', 0.85));
  if (p.type === 'tboil') out.push(num('th.mf', 'mf', 0.01, 1000, 0.01, 'kg/s', 1), num('th.Tb', 'Tb', 100, 650, 5, '°C', 350));
  if (p.type === 'tturb') {
    out.push(num('th.etaT', 'etaT', 0.5, 1, 0.01, '', 0.88), num('th.z', 'zst', 1, 30, 1, '', 1), num('th.a1', 'a1', 8, 40, 0.5, '°', 16), num('th.rho', 'rho', 0, 0.7, 0.05, '', 0), num('motor.limit', 'nmax', 100, 60000, 50, t('u.rpm'), 12000));
    const gc = el('canvas', null, { className: 'graphs' }); out.push(gc); selRefresh.push(() => drawTriangles(gc, p));
  }
  out.push(rowOf(btn(t('hy.lay'), () => { pipeDraft = { a: null, pts: [], cur: null }; sel = new Set(); ui(); })));
  return out;
}
// speed triangles of the stage: inlet (c₁, w₁) above the line of rotation, outlet (c₂, w₂) drawn from the same point
function drawTriangles(cvs, p) {
  const st = stageOfTurbine(p), dpr2 = window.devicePixelRatio || 1, Wc = cvs.clientWidth || 300, Hc = 170; cvs.hidden = !st; if (!st) return;
  cvs.style.height = Hc + 'px'; if (cvs.width !== Math.round(Wc * dpr2)) { cvs.width = Math.round(Wc * dpr2); cvs.height = Math.round(Hc * dpr2); }
  const g = cvs.getContext('2d'); g.setTransform(dpr2, 0, 0, dpr2, 0, 0); g.clearRect(0, 0, Wc, Hc); g.font = `11px ${C.mono}`; g.textBaseline = 'middle';
  const xs = [st.c1u, st.w1u, -st.w2u, -st.c2u, 0], lo = Math.min(...xs), hi = Math.max(...xs), ya = Math.max(st.c1a, st.c2a), k = Math.min((Wc - 50) / (hi - lo || 1), (Hc - 44) / (ya || 1)), ox = 25 - lo * k, oy = 22;
  const vec = (x, y, colr, name, dy = 0) => { const X = ox + x * k, Y = oy + y * k, a = Math.atan2(Y - oy, X - ox); g.strokeStyle = g.fillStyle = colr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ox, oy); g.lineTo(X, Y); g.stroke();
    g.beginPath(); g.moveTo(X, Y); g.lineTo(X - 7 * Math.cos(a - 0.35), Y - 7 * Math.sin(a - 0.35)); g.lineTo(X - 7 * Math.cos(a + 0.35), Y - 7 * Math.sin(a + 0.35)); g.closePath(); g.fill(); g.textAlign = 'center'; g.fillText(name, (ox + X) / 2 + 9 * Math.sin(a), (oy + Y) / 2 - 9 * Math.cos(a) + dy); };
  const uLine = (x0, x1, y) => { g.strokeStyle = C.muted; g.lineWidth = 1.2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(ox + x0 * k, oy + y * k); g.lineTo(ox + x1 * k, oy + y * k); g.stroke(); g.setLineDash([]); g.fillStyle = C.muted; g.textAlign = 'center'; g.fillText('u', ox + (x0 + x1) / 2 * k, oy + y * k + 9); };
  uLine(st.w1u, st.c1u, st.c1a); uLine(-st.w2u, -st.c2u, st.c2a);
  vec(st.c1u, st.c1a, C.ink, 'c₁'); vec(st.w1u, st.c1a, C.select, 'w₁'); vec(-st.w2u, st.c2a, C.select, 'w₂'); vec(-st.c2u, st.c2a, C.brass, 'c₂');
  g.fillStyle = C.muted; g.textAlign = 'left'; g.fillText(`u = ${fmtU(st.u, 'm/s')}   η_u = ${fmtNum(100 * st.eta)} %`, 6, Hc - 9);
}

/* ---------- pointer input ---------- */
const pts = new Map(); let pdrag = null, drag = null, pan = null, pinch = null, holdTimer = null;
const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function hitTop(g, w) {
  if (T(g).grp === 'heat') return Math.hypot(w.x - g.x, w.y - g.y) < 11;
  if (isHyd(g) && !isLink(g)) { const u = unit(g.dir || 0), dx = w.x - g.x, dy = w.y - g.y, lx = dx * u[0] + dy * u[1], ly = -dx * u[1] + dy * u[0]; return g.type === 'hvalve' ? Math.abs(lx) < 19 && Math.abs(ly) < 8 : g.type === 'hnode' ? Math.hypot(lx, ly) < 3.5 : g.type === 'htank' ? Math.abs(lx) < 8 && ly > -2 && ly < 9 : Math.hypot(lx, ly) < 10; }
  if (isLink(g)) return tmmHit(g, w, Math.max(3.2, 9 / view.scale)) != null;
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
  // among links, a joint under the pointer wins over a slider, a slider over a bar, and a guide comes last
  const rank = g => { if (!isLink(g)) return 2; const h = tmmHit(g, w, Math.max(3.2, 9 / view.scale)); return typeof h === 'number' ? 0 : SLIDES.includes(g.type) ? 1 : g.type === 'guide' ? 3 : 2; };
  return vis.find(g => isShaft(g) && Math.hypot(w.x - g.x, w.y - g.y) < 3.2) || vis.filter(g => !isShaft(g)).sort((a, b) => b.layer - a.layer || rank(a) - rank(b)).find(g => hitTop(g, w));
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, p); clearTimeout(holdTimer);
  if (pts.size === 2) { drag = pan = boxSel = null; const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.scale, w: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), side: (a.y + b.y) / 2 < bandH() }; return; }
  const side = p.y < bandH();
  if (side && p.x < 46) { const l = Math.floor((baseY() - p.y) / view.scale / LP + 0.2); if (l >= 0 && l < layerCount) { setActive(l); return; } }   // a layer's letter in the side view makes it active
  if (pipeDraft) { pipeClick(side ? sidePoint(p) : toWorld(p.x, p.y)); return; }
  const g = hit(p);
  if (linkDraft) { // building a belt or chain: clicks add and remove wheels
    if (g && g.type === (linkDraft.kind === 'belt' ? 'pulley' : 'sprocket') && g.layer === byId(linkDraft.ids[0]).layer) { const i = linkDraft.ids.indexOf(g.id); if (i < 0) linkDraft.ids.push(g.id); else if (linkDraft.ids.length > 1) linkDraft.ids.splice(i, 1); ui(); }
    return;
  }
  if (g && e.shiftKey) { pick([g.id], true); return; }
  if (g && side) { // side view: slide along x, lift between layers, pull a shaft by its ends
    if (!sel.has(g.id)) pick([g.id]);
    const x = (p.x - W / 2) / view.scale + view.cx, z = (baseY() - p.y) / view.scale, group = new Set(selParts());
    for (const q of [...group]) if (isShaft(q)) for (const c of onShaft(q)) group.add(c);
    if ([...group].some(q => !isShaft(q) && lockedLayers.has(q.layer))) return;
    const mode = !isShaft(g) ? 'move' : g.l1 * LP + FW - z < LP * 0.45 ? 'top' : z - g.l0 * LP < LP * 0.45 ? 'bot' : 'move';
    drag = { g, side: true, mode, dx: x - g.x, dy: 0, others: mode === 'move' ? [...group].filter(q => q !== g && !q.mount).map(q => ({ q, ox: q.x - g.x, oy: q.y - g.y })) : [], sx: p.x, sy: p.y, moved: false, grabL: Math.round((z - FW / 2) / LP) };
    cv.classList.add('dragging'); return;
  }
  if (g && !side) {
    if (!sel.has(g.id)) pick([g.id]);
    const w = toWorld(p.x, p.y), group = new Set(selParts());
    for (const q of [...group]) if (isShaft(q)) for (const c of onShaft(q)) group.add(c);   // a shaft takes what is keyed to it along
    if ([...group].some(q => !isShaft(q) && lockedLayers.has(q.layer))) return;              // unless a locked layer holds one of them
    drag = { w0: w, g, dx: w.x - g.x, dy: w.y - g.y, others: [...group].filter(q => q !== g && !q.mount).map(q => ({ q, ox: q.x - g.x, oy: q.y - g.y })), sx: p.x, sy: p.y, moved: false };
    if (isLink(g)) { // which piece was taken: the far joint of a bar stretches and turns it, its first joint moves that end, anything else moves the link
      const piece = tmmHit(g, w, Math.max(3.2, 9 / view.scale)), bar = BAR.includes(g.type), k = bar && piece === 1 ? 1 : bar && piece === 0 && !ty(g, 'tcrank', 'hcyl') ? 0 : null;
      if (k != null) drag.others = [];
      drag.link = { k, far: bar ? jointPos(g, 1) : null, ids: [g.id, ...drag.others.map(o => o.q.id)] };
    }
    cv.classList.add('dragging');
  } else {
    if (g) pick([g.id]);
    const hp = !g && !side && pipeAt(toWorld(p.x, p.y), Math.max(2, 6 / view.scale));
    if (hp) { // a pipe: the first click picks it; then a corner can be dragged, and a drag off a straight run makes a new corner
      const w = toWorld(p.x, p.y), q = hp.q, was = selPipe === q.id, r2 = Math.max(3, 9 / view.scale); let i = q.pts.findIndex(v => Math.hypot(v[0] - w.x, v[1] - w.y) < r2), fresh = false;
      sel = new Set(); selPipe = q.id;
      if (i < 0 && was) { i = hp.i - 1; q.pts.splice(i, 0, [hp.x, hp.y]); fresh = true; }
      if (i >= 0) pdrag = { q, i, fresh, moved: false, sx: p.x, sy: p.y };
      ui(); return;
    }
    if (!g && selPipe != null) { selPipe = null; ui(); }
    pan = { sx: p.x, sy: p.y, cx: view.cx, cy: view.cy, moved: false, side, onPart: !!g };
    const startBox = () => { if (pan && !pan.moved && !side) { pan = null; boxSel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; cv.classList.add('boxing'); } };
    if (e.shiftKey && !g) startBox(); else if (!g) holdTimer = setTimeout(startBox, 380);   // hold still, then drag, to select an area
  }
});
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const p = pos(e); pts.set(e.pointerId, p);
  if (pipeDraft) pipeDraft.cur = p.y < bandH() ? null : toWorld(p.x, p.y);
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.scale = Math.max(0.5, Math.min(12, pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
    view.cx = pinch.w.x - (mx - W / 2) / view.scale; if (!pinch.side) view.cy = pinch.w.y - (my - topMid()) / view.scale;
  } else if (pdrag) {
    if (!pdrag.moved && Math.hypot(p.x - pdrag.sx, p.y - pdrag.sy) < 4) return;
    pdrag.moved = true; const w = toWorld(p.x, Math.max(bandH(), p.y)), P = pipePath(pdrag.q), a = P[pdrag.i], b = P[pdrag.i + 2], sn = 5 / view.scale;   // square to its neighbours when close
    const x = Math.abs(w.x - a.x) < sn ? a.x : Math.abs(w.x - b.x) < sn ? b.x : w.x, y = Math.abs(w.y - a.y) < sn ? a.y : Math.abs(w.y - b.y) < sn ? b.y : w.y;
    pdrag.q.pts[pdrag.i] = [x, y]; changed();
  } else if (boxSel) { boxSel.x1 = p.x; boxSel.y1 = Math.max(bandH(), p.y); }
  else if (drag) {
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) < 4) return;
    const g = drag.g, w = toWorld(p.x, p.y);
    if (!drag.moved) { drag.moved = true; freeze(); if (g.mount) delete g.mount; }
    if (drag.side) { sideDrag(p); changed(); return; }
    if (drag.link) { linkDrag(w); changed(); return; }
    const s = drag.others.length ? { x: w.x - drag.dx, y: w.y - drag.dy } : snap(g, w.x - drag.dx, w.y - drag.dy);
    g.x = s.x; g.y = s.y; if (s.dir != null) g.dir = s.dir; drag.mount = s.mount || null;
    for (const o of drag.others) { o.q.x = g.x + o.ox; o.q.y = g.y + o.oy; }
    changed();
  } else if (pan) {
    if (Math.hypot(p.x - pan.sx, p.y - pan.sy) > 4) { pan.moved = true; clearTimeout(holdTimer); }
    if (pan.moved) { view.cx = pan.cx - (p.x - pan.sx) / view.scale; if (!pan.side) view.cy = pan.cy - (p.y - pan.sy) / view.scale; }
  }
});
/* Dragging a link in the top view. On the first move it lets go of the pairs that would hold it back;
   when it is dropped, tmmAttach() makes the pairs for wherever its joints have landed. */
function linkDrag(w) {
  const d = drag, g = d.g, L = d.link, skip = new Set(L.ids), near = Math.max(3, 9 / view.scale);
  if (!L.loose) { L.loose = true; tmmDetach(L.ids, L.k); }
  if (L.k === 1 && g.type === 'hcyl') { const q = tmmSnap(g, w.x, w.y, 1, skip, near); g.s = Math.max(0, Math.min(g.st, Math.hypot(q.x - g.x, q.y - g.y) - CYL_L0(g))); g.len = CYL_L0(g) + g.s; g.dir = Math.atan2(q.y - g.y, q.x - g.x); delete g.jam; return; }   // pulling the rod sets the extension
  if (L.k === 1) { const q = tmmSnap(g, w.x, w.y, 1, skip, near), [lo, hi] = T(g).lim; g.len = Math.max(lo, Math.min(hi, +Math.hypot(q.x - g.x, q.y - g.y).toFixed(2))); g.dir = Math.atan2(q.y - g.y, q.x - g.x); return; }
  if (L.k === 0) { const q = tmmSnap(g, w.x, w.y, 0, skip, near), [lo, hi] = T(g).lim; g.x = q.x; g.y = q.y; g.len = Math.max(lo, Math.min(hi, +Math.hypot(L.far.x - q.x, L.far.y - q.y).toFixed(2))); g.dir = Math.atan2(L.far.y - q.y, L.far.x - q.x); return; }
  let q = { x: w.x - d.dx, y: w.y - d.dy };
  if (isDriver(g) && !d.others.length) { const a = snap(g, q.x, q.y); if (a.x !== q.x || a.y !== q.y) q = a; else q = tmmSnap(g, q.x, q.y, null, skip, near); }   // a crank goes onto a shaft first
  else q = tmmSnap(g, q.x, q.y, null, skip, near);
  g.x = q.x; g.y = q.y; for (const o of d.others) { o.q.x = g.x + o.ox; o.q.y = g.y + o.oy; }
}
// Dragging in the side view (the x–z projection of the same model): x follows the pointer, the layer follows its height.
function sideDrag(p) {
  const d = drag, g = d.g, x = (p.x - W / 2) / view.scale + view.cx, z = (baseY() - p.y) / view.scale;
  const L = Math.max(0, Math.min(layerCount - 1, Math.round((z - FW / 2) / LP)));
  if (d.mode === 'top') { g.l1 = Math.max(g.l0, L); return; }
  if (d.mode === 'bot') { g.l0 = Math.min(g.l1, L); g.layer = g.l0; return; }
  let nx = x - d.dx;
  if (!d.others.length) { // onto an axis that stands in the same plane
    const near = Math.max(3, 8 / view.scale), ax = parts.find(o => o !== g && isVert(o) && !o.mount && Math.abs(o.y - g.y) < COAX && Math.abs(o.x - nx) < near);
    if (ax) nx = ax.x;
  }
  g.x = nx; for (const o of d.others) o.q.x = g.x + o.ox;
  const all = [g, ...d.others.map(o => o.q)], lo = Math.min(...all.map(q => isShaft(q) ? q.l0 : q.layer)), hi = Math.max(...all.map(q => isShaft(q) ? q.l1 : q.layer));
  const k = Math.max(-lo, Math.min(layerCount - 1 - hi, L - d.grabL));
  if (k) {
    for (const q of all) { if (isShaft(q)) { q.l0 += k; q.l1 += k; q.layer = q.l0; } else q.layer += k; }
    d.grabL += k; activeLayer = isShaft(g) ? Math.max(g.l0, Math.min(g.l1, activeLayer + k)) : g.layer;
  }
}
const up = e => {
  pts.delete(e.pointerId); clearTimeout(holdTimer);
  if (boxSel) {
    const a = toWorld(Math.min(boxSel.x0, boxSel.x1), Math.min(boxSel.y0, boxSel.y1)), b = toWorld(Math.max(boxSel.x0, boxSel.x1), Math.max(boxSel.y0, boxSel.y1));
    const inside = parts.filter(g => canPick(g) && g.x >= a.x && g.x <= b.x && g.y >= a.y && g.y <= b.y).map(g => g.id);
    boxSel = null; cv.classList.remove('boxing'); pick(inside, e.shiftKey);
  } else if (pan && !pan.moved && !pan.onPart && sel.size) pick([]);
  if (pdrag) { // a corner left on the straight line between its neighbours is not a corner
    const q = pdrag.q, P = pipePath(q), a = P[pdrag.i], c = P[pdrag.i + 1], b = P[pdrag.i + 2], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, off = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / L;
    if ((pdrag.fresh && !pdrag.moved) || off < 1.2) q.pts.splice(pdrag.i, 1);
    const moved = pdrag.moved; pdrag = null; if (moved) commit(); else ui();
  }
  if (drag && !drag.moved && !drag.side && drag.g.type === 'hvalve') { // a click on one of the valve's boxes switches it there
    const g = drag.g, u = unit(g.dir || 0), lx = (drag.w0.x - g.x) * u[0] + (drag.w0.y - g.y) * u[1]; g.pos = lx < -6 ? 1 : lx > 6 ? -1 : 0; commit();
  }
  if (drag && drag.moved) { const g = drag.g; if (drag.link) tmmAttach(drag.link.ids); if (drag.mount) g.mount = drag.mount; else if (!drag.others.length) autoShaft(g); commit(); }
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
  if (!parts.some(p => p.motor) && !isLin(g) && !isLink(g) && !isPlant(g) && !ty(g, 'generator', 'heater', 'hoist', 'conveyor') && !ty(g, 'carrier', 'brake', 'machine')) g.motor = { kind: 'speed', rpm: 60, tq: 2 };   // the first part on an empty bench gets the motor
  sel = new Set([g.id]); commit();
};
$('tpl-add').onclick = () => { const c = toWorld(W / 2, topMid()); freeze(); const made = insertTemplate($('tpl').value, c.x, c.y); sel = new Set(made.map(p => p.id)); commit(); fit(); };
$('add-layer').onclick = () => { addLayer(); ui(); save(); };
$('solo').onclick = () => { soloActive = !soloActive; ui(); save(); };
$('dims').onclick = () => { showDims = !showDims; ui(); save(); };
$('example').onclick = () => { example(); solve(); fit(); ui(); save(); };
$('clear').onclick = () => { const n = layerCount; resetScene(n); commit(); };
$('fit').onclick = fit;
$('scheme').onclick = () => { schemeMode = !schemeMode; ui(); save(); };
$('why-x').onclick = () => { why = null; renderWhy(); };
$('zoom-in').onclick = () => zoomAt(W / 2, topMid(), 1.3);
$('zoom-out').onclick = () => zoomAt(W / 2, topMid(), 1 / 1.3);
for (const m of ['both', 'top', 'side']) $('vm-' + m).onclick = () => { viewMode = m; fit(); ui(); };
addEventListener('keydown', e => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range';
  if (e.key === 'Escape') { if (pipeDraft) pipeDraft = null; else if (linkDraft) linkDraft = null; else { sel = new Set(); selPipe = null; } ui(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selPipe != null && !sel.size) { e.preventDefault(); pipes = pipes.filter(q => q.id !== selPipe); selPipe = null; commit(); return; }
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
    if (running && !lockMsg) { // a mechanism that cannot follow its crank holds the whole bench at that instant
      const c0 = clock; clock += RPM * dt; place();
      const tk = hydTick(dt); ioTick(dt); let ok = tmmStep();
      if (!ok && tk.undo.some(([q, s0]) => q.s !== s0)) { hydJam(tk.undo); tk.restep = true; ok = tmmStep(); }   // a cylinder ran the linkage to its limit: it stops there, the crank's time goes on
      if (!ok) { clock = c0; place(); }
      if (tk.restep) { hydroStep(); elStep(); thermoStep(true); thermoPipes(); warnings = runChecks({ parts, power }); ui(); }
      if (ok === tmmStuck) { tmmStuck = !ok; ui(); }
      if (graphTick && ++frameNo % 4 === 0) graphTick();
    }
    draw(ts); requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
// small hook for automated checks
window.__bench = { state: () => ({ lock: lockMsg, hint: hintMsg, io: ioRows(), warnings: warnings.map(w => [w.level, w.code]), parts: parts.map(p => ({ name: p.name, w: +outOf(p).w.toFixed(4), und: p.und })) }), parts: () => parts, solve, pick };
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => serialize());
if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : null);
