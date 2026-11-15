/* Gear Bench — the palette of parts (pictures instead of a long list, a search box, drag onto the sheet)
   and the gallery of example scenes with previews. The pictures are taken from real scenes, see withScratch() in render.js. */
'use strict';

/* ---------- adding a part ---------- */
// a new part of the given type: at a point of the bench when one is given (where it snaps as if dragged there), else at the nearest clear place
function addNew(type, at) {
  const nt = TYPES[type]; if (!nt || lockedLayers.has(activeLayer)) return null;
  const size = $('new-type').value === type && nt.key ? { [nt.key]: +$('new-z').value } : {};
  const g = addPart(type, { ...size, x: 0, y: 0, layer: activeLayer, ...(type === 'shaft' ? { l0: activeLayer, l1: Math.min(layerCount - 1, activeLayer + 1) } : {}) });
  if (at) {
    g.x = Math.round(at.x); g.y = Math.round(at.y);
    if (isLink(g)) { const q = tmmSnap(g, g.x, g.y, null, new Set([g.id]), Math.max(3, 9 / view.scale)); g.x = q.x; g.y = q.y; tmmAttach([g.id]); }
    else if (!isPlant(g)) { const s = snap(g, g.x, g.y); g.x = s.x; g.y = s.y; if (s.dir != null) g.dir = s.dir; if (s.mount) g.mount = s.mount; else autoShaft(g); }
  } else Object.assign(g, freeSpot(tipR(g) + reach(g)));
  if (!parts.some(p => p.motor) && !isLin(g) && !isLink(g) && !isPlant(g) && !ty(g, 'generator', 'heater', 'hoist', 'conveyor') && !ty(g, 'carrier', 'brake', 'machine')) g.motor = { kind: 'speed', rpm: 60, tq: 2 };   // the first part on an empty bench gets the motor
  sel = new Set([g.id]); selPipe = null; commit();
  return g;
}
$('add').onclick = () => addNew($('new-type').value);

/* ---------- pictures ---------- */
const palIcons = new Map();   // type -> data URL
let palTheme = '';
function paletteIcons() {
  if (palTheme === C.ink + C.paper) return; palTheme = C.ink + C.paper; palIcons.clear(); galShots.clear();
  withScratch(() => {
    for (const type of Object.keys(TYPES)) {
      try {
        resetScene(type === 'shaft' ? 2 : 1); schemeMode = true;
        addPart(type, { x: 0, y: 0, layer: 0, ...(type === 'shaft' ? { l0: 0, l1: 1 } : {}) }); place(); solve();
        palIcons.set(type, snapshot(52, 44, 2, 'icon').toDataURL('image/png'));
      } catch (e) {}
    }
  });
}

/* ---------- the palette ---------- */
let palDrag = null;
function renderPalette() {
  const box = $('palette'), q = $('pal-q').value.trim().toLowerCase(), cur = $('new-type').value; box.textContent = '';
  let shown2 = 0;
  for (const g of GROUPS) {
    const types = Object.keys(TYPES).filter(k => TYPES[k].grp === g && (!q || t('type.' + k).toLowerCase().includes(q) || t('grp.' + g).toLowerCase().includes(q) || k.includes(q)));
    if (!types.length) continue;
    box.append(el('h3', t('grp.' + g)));
    const grid = el('div', null, { className: 'pal-grid' });
    for (const k of types) {
      const b = el('button', null, { className: 'pal' + (k === cur ? ' cur' : ''), title: t('type.' + k) }), src = palIcons.get(k);
      b.append(src ? el('img', null, { src, alt: '', draggable: false }) : el('i'), el('span', t('type.' + k)));
      b.onpointerdown = e => { if (e.button) return; palDrag = { type: k, x: e.clientX, y: e.clientY, ghost: null, src, id: e.pointerId }; b.setPointerCapture(e.pointerId); };
      b.onpointermove = e => palMove(e);
      b.onpointerup = e => palDrop(e, false); b.onpointercancel = e => palDrop(e, true);
      b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); palPick(k); addNew(k); } };
      grid.append(b); shown2++;
    }
    box.append(grid);
  }
  if (!shown2) box.append(el('p', t('pal.none'), { className: 'hint' }));
}
function palPick(type) { $('new-type').value = type; $('new-type').onchange(); for (const b of $('palette').querySelectorAll('.pal')) b.classList.toggle('cur', b.title === t('type.' + type)); }
function palMove(e) {
  const d = palDrag; if (!d) return;
  if (!d.ghost && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.ghost = el('div', null, { className: 'pal-ghost' }); if (d.src) d.ghost.append(el('img', null, { src: d.src, alt: '' })); d.ghost.append(el('span', t('type.' + d.type))); document.body.append(d.ghost); }
  if (d.ghost) { d.ghost.style.left = e.clientX + 10 + 'px'; d.ghost.style.top = e.clientY + 10 + 'px'; }
}
// released over the top view: the part goes there; released without a drag: it goes to the nearest clear place
function palDrop(e, cancel) {
  const d = palDrag; palDrag = null; if (!d) return;
  if (d.ghost) d.ghost.remove();
  if (cancel) return;
  palPick(d.type);
  if (!d.ghost) { addNew(d.type); return; }
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (x < 0 || y < bandH() || x > r.width || y > r.height) return;
  addNew(d.type, toWorld(x, y));
}
$('pal-q').oninput = renderPalette;
$('pal-q').onkeydown = e => { if (e.key === 'Enter') { const b = $('palette').querySelector('.pal'); if (b) { const k = Object.keys(TYPES).find(x => t('type.' + x) === b.title); palPick(k); addNew(k); } } else if (e.key === 'Escape') { $('pal-q').value = ''; renderPalette(); } };

/* ---------- the gallery of examples ---------- */
const galShots = new Map();   // template id -> data URL
const GAL_FIRST = ['example', 'press', 'valve', 'excavator', 'conveyor', 'genset', 'gasturbine'];
const galList = () => { const ks = ['example', ...Object.keys(TEMPLATES)]; return [...GAL_FIRST.filter(k => ks.includes(k)), ...ks.filter(k => !GAL_FIRST.includes(k))]; };
// build one example on an empty bench
function buildExample(k) {
  if (k === 'example') { example(); return; }
  resetScene(Math.max(1, TEMPLATES[k].layers || 1)); showDims = false; insertTemplate(k, 0, 0);
  const n = [...Array(layerCount)].map((_, l) => parts.filter(p => p.layer === l && !isShaft(p)).length); activeLayer = n.indexOf(Math.max(...n));   // the busiest layer comes to the front
}
function galleryShots() {
  const todo = galList().filter(k => !galShots.has(k)); if (!todo.length) return;
  withScratch(() => { for (const k of todo) { try { buildExample(k); schemeMode = true; place(); solve(); galShots.set(k, snapshot(240, 150, 2, 'icon').toDataURL('image/png')); } catch (e) { galShots.set(k, ''); } } });
}
function openGallery() {
  galleryShots();
  const g = $('gallery'), grid = $('gal-grid'); grid.textContent = '';
  for (const k of galList()) {
    const b = el('button', null, { className: 'gal' }), src = galShots.get(k);
    b.append(src ? el('img', null, { src, alt: '' }) : el('i'), el('span', t(k === 'example' ? 'tpl.example' : 'tpl.' + k)));
    b.onclick = () => { closeGallery(); openExample(k); };
    grid.append(b);
  }
  g.hidden = false; const f = grid.querySelector('button'); if (f) f.focus();
}
function closeGallery() { $('gallery').hidden = true; }
// an example replaces the scene; the one that was there is one Ctrl+Z away
function openExample(k) {
  for (const key of [...infoWins.keys()]) infoClose(key);
  buildExample(k); setSceneName(t(k === 'example' ? 'tpl.example' : 'tpl.' + k)); place(); solve(); fit(); ui(); save();
}
$('gal-x').onclick = closeGallery; $('gal-empty').onclick = () => { closeGallery(); newScene(); };
$('gallery').addEventListener('pointerdown', e => { if (e.target === $('gallery')) closeGallery(); });
$('gallery').addEventListener('keydown', e => { if (e.key === 'Escape') { closeGallery(); e.stopPropagation(); } });
