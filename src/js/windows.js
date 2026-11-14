/* Gear Bench — the parts of the window the user can resize or move, and the info windows opened from markers on the sheet.
   Layout lives apart from the scene (its own key in localStorage): it belongs to the person, not to the drawing. */
'use strict';

const LAYOUT_KEY = 'gear-bench-layout';
const layout = { panelW: null, sideFrac: null, closed: [], labels: false };
try { Object.assign(layout, JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}')); } catch (e) {}
const saveLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (e) {} };
const byIdEl = id => document.getElementById(id);

/* ---------- sheet | panel ---------- */
function applyLayout() {
  const main = document.querySelector('main');
  if (layout.panelW) main.style.setProperty('--panel-w', layout.panelW + 'px'); else main.style.removeProperty('--panel-w');
  document.querySelectorAll('.panel section').forEach((s, i) => s.classList.toggle('closed', layout.closed.includes(i)));
}
function setPanelW(w) {
  const main = document.querySelector('main'), max = Math.max(260, main.clientWidth - 320);
  layout.panelW = w == null ? null : Math.round(Math.max(240, Math.min(max, w))); applyLayout(); saveLayout();
}
(function () {
  const sp = byIdEl('split'), main = document.querySelector('main'); let on = false;
  sp.addEventListener('pointerdown', e => { on = true; sp.setPointerCapture(e.pointerId); sp.classList.add('on'); e.preventDefault(); });
  sp.addEventListener('pointermove', e => { if (on) setPanelW(main.getBoundingClientRect().right - e.clientX - sp.offsetWidth / 2); });
  const end = () => { on = false; sp.classList.remove('on'); };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => setPanelW(null));
  sp.addEventListener('keydown', e => { const w = document.querySelector('.panel').offsetWidth; if (e.key === 'ArrowLeft') setPanelW(w + 24); else if (e.key === 'ArrowRight') setPanelW(w - 24); else if (e.key === 'Home') setPanelW(null); else return; e.preventDefault(); });
  // a section of the panel folds away under its heading
  document.querySelectorAll('.panel section > h2').forEach((h, i) => {
    h.tabIndex = 0; h.setAttribute('role', 'button');
    const flip = () => { const k = layout.closed.indexOf(i); if (k < 0) layout.closed.push(i); else layout.closed.splice(k, 1); applyLayout(); saveLayout(); };
    h.addEventListener('click', flip); h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); flip(); } });
  });
  applyLayout();
})();

/* ---------- windows that float over the sheet: dragged by the heading, resized by the corner ---------- */
function floatWin(node, handle) {
  let d = null;
  handle.style.touchAction = 'none';
  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = node.getBoundingClientRect(), s = node.parentElement.getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top, s }; handle.setPointerCapture(e.pointerId); node.classList.add('moved'); floatTop(node); e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (!d) return;
    const x = Math.max(0, Math.min(d.s.width - 40, e.clientX - d.s.left - d.dx)), y = Math.max(0, Math.min(d.s.height - 24, e.clientY - d.s.top - d.dy));
    node.style.left = x + 'px'; node.style.top = y + 'px'; node.style.bottom = 'auto'; node.style.right = 'auto';
  });
  const end = () => { d = null; }; handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  node.addEventListener('pointerdown', () => floatTop(node));
}
let floatZ = 5;
const floatTop = node => { node.style.zIndex = ++floatZ; };
floatWin(byIdEl('why'), byIdEl('why-t'));

/* ---------- markers and info windows ----------
   The sheet shows a small circle by each part and on each pipe instead of a line of figures. A click on the circle opens
   a window with what is known about that part: speed, torque, power, pressure, flow, temperature. Several can stay open. */
let markers = [];                       // filled while the top view is drawn: { key, x, y } in sheet pixels
const infoWins = new Map();             // key -> { key, node, dl, title }
const infoTarget = key => key[0] === 'q' ? pipes.find(q => q.id === +key.slice(1)) : byId(+key.slice(1));
const markerAt = p => markers.find(m => Math.hypot(m.x - p.x, m.y - p.y) < 9);
function infoRows(key) {
  const o = infoTarget(key); if (!o) return [];
  if (key[0] === 'q') return pipeRows(o);
  return [...(o.motor && !o.motor.auto ? motorRows(o) : []), ...(o.load ? loadRows(o) : []), ...specRows(o)];
}
function infoTitle(key) {
  const o = infoTarget(key); if (!o) return '';
  if (key[0] === 'q') { const a = byId(o.a), b = byId(o.b); return `${t(isWire(o) ? 'info.wire' : 'info.pipe')} ${a ? a.name : ''} → ${b ? b.name : ''}`; }
  return `${o.label ? o.name + ' ' + o.label : o.name} · ${typeName(o)}`;
}
function infoOpen(key, at) {
  if (infoWins.has(key)) { floatTop(infoWins.get(key).node); return infoWins.get(key); }
  const sh = byIdEl('sheet'), node = el('div', null, { className: 'info' }), head = el('h3'), title = el('span'), x = el('button', '×'), dl = el('dl');
  x.setAttribute('aria-label', t('btn.cancel')); x.onclick = () => infoClose(key);
  head.append(title, x); node.append(head, dl); dl.dataset.why = 'info' + key + ':'; sh.append(node);
  const w = { key, node, dl, title }; infoWins.set(key, w); infoFill(w);
  const px = at ? at.x + 14 : 20 + 16 * infoWins.size, py = at ? at.y + 14 : 50 + 16 * infoWins.size;
  node.style.left = Math.max(4, Math.min(sh.clientWidth - node.offsetWidth - 4, px)) + 'px'; node.style.top = Math.max(4, Math.min(sh.clientHeight - node.offsetHeight - 4, py)) + 'px';
  floatWin(node, head); floatTop(node);
  return w;
}
function infoClose(key) { const w = infoWins.get(key); if (w) { w.node.remove(); infoWins.delete(key); } }
const infoToggle = (key, at) => { if (infoWins.has(key)) infoClose(key); else infoOpen(key, at); };
function infoFill(w) { w.title.textContent = infoTitle(w.key); fillDl(w.dl, infoRows(w.key)); }
// after every change: drop the windows whose part is gone, refresh the rest
function infoSync() { for (const [key, w] of [...infoWins]) { if (!infoTarget(key)) infoClose(key); else infoFill(w); } }
// while the bench runs the figures move; a window under the pointer is left alone so a click on a figure lands
function infoTick() { for (const w of infoWins.values()) if (!w.node.matches(':hover')) infoFill(w); }
// where a leader from a marker meets its window: the nearest point of the window's box
function infoAnchor(w, m) { const n = w.node, x0 = n.offsetLeft, y0 = n.offsetTop; return { x: Math.max(x0, Math.min(x0 + n.offsetWidth, m.x)), y: Math.max(y0, Math.min(y0 + n.offsetHeight, m.y)) }; }
