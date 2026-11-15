/* Gear Bench — scenes as files, pictures of the scheme, and the calculation report. */
'use strict';

const FILE_EXT = '.gearbench';
const safeName = s => (s || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 80) || 'gear-bench';

/* ---------- small pieces of interface used here and in tools.js ---------- */
// a short message over the sheet that goes away by itself
function toast(text, bad) {
  let box = $('toasts'); if (!box) { box = el('div', null, { id: 'toasts' }); $('sheet').append(box); }
  const n = el('div', text, { className: 'toast' + (bad ? ' bad' : '') }); box.append(n);
  setTimeout(() => n.classList.add('gone'), 2600); setTimeout(() => n.remove(), 3200);
}
/* A drop-down list of commands at x, y of the window: [label, fn, hint] rows, null for a rule. One at a time; any click or Esc closes it. */
let menuNode = null;
function closeMenu() { if (menuNode) { menuNode.remove(); menuNode = null; } }
function openMenu(x, y, items) {
  closeMenu();
  const m = el('div', null, { className: 'menu' }); m.setAttribute('role', 'menu');
  for (const it of items) {
    if (!it) { m.append(el('hr')); continue; }
    const [label, fn, hint, off] = it, b = el('button', null, { disabled: !!off }); b.setAttribute('role', 'menuitem');
    b.append(el('span', label), el('kbd', hint || '')); b.onclick = () => { closeMenu(); fn(); }; m.append(b);
  }
  document.body.append(m); menuNode = m;
  m.style.left = Math.max(4, Math.min(innerWidth - m.offsetWidth - 4, x)) + 'px'; m.style.top = Math.max(4, Math.min(innerHeight - m.offsetHeight - 4, y)) + 'px';
  const first = m.querySelector('button:not(:disabled)'); if (first) first.focus();
  m.onkeydown = e => { const bs = [...m.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); } };
}
addEventListener('pointerdown', e => { if (menuNode && !menuNode.contains(e.target)) closeMenu(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape' && menuNode) { closeMenu(); e.stopPropagation(); } }, true);
addEventListener('blur', closeMenu);

/* ---------- writing files ---------- */
function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })), a = el('a', null, { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
// through the system's "save as" window where the browser has one, as a download otherwise. Resolves to the name written, or null when cancelled.
async function saveFile(name, data, type, ext, desc) {
  if (window.showSaveFilePicker) {
    try { const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: { [type]: [ext] } }] }), w = await h.createWritable(); await w.write(data instanceof Blob ? data : new Blob([data], { type })); await w.close(); return h.name; }
    catch (e) { if (e && e.name === 'AbortError') return null; }   // anything else: fall back to a download
  }
  download(name, data, type); return name;
}

/* ---------- scenes ---------- */
function setSceneName(n) { sceneName = (n || '').trim(); document.title = sceneName ? `${sceneName} — Gear Bench` : 'Gear Bench'; const f = $('scene-name'); if (f && document.activeElement !== f) f.value = sceneName; }
async function saveScene() {
  const got = await saveFile(safeName(sceneName) + FILE_EXT, JSON.stringify(serialize(), null, 1), 'application/json', FILE_EXT, 'Gear Bench');
  if (got) { if (!sceneName) { setSceneName(got.replace(/\.[^.]+$/, '')); save(); } toast(t('file.saved', { a: got })); }
}
// put a scene read from text on the bench; the one that was there stays one Ctrl+Z away
function openText(text, name) {
  let d = null; try { d = JSON.parse(text); } catch (e) {}
  if (!d || !Array.isArray(d.parts)) { toast(t('file.bad', { a: name || '' }), true); return false; }
  const back = JSON.stringify(serialize());
  try { load(d); } catch (e) { load(JSON.parse(back)); place(); solve(); ui(); toast(t('file.bad', { a: name || '' }), true); return false; }
  if (!sceneName && name) sceneName = name.replace(/\.[^.]+$/, '');
  for (const k of [...infoWins.keys()]) infoClose(k);
  setSceneName(sceneName); place(); solve(); fit(); ui(); save(); infoRestore(d.info); toast(t('file.opened', { a: name || sceneName }));
  return true;
}
function openScene() {
  const f = el('input', null, { type: 'file', accept: `${FILE_EXT},.json,application/json` });
  f.onchange = () => { const file = f.files[0]; if (file) file.text().then(txt => openText(txt, file.name)); };
  f.click();
}
function newScene() { const n = layerCount; resetScene(n); setSceneName(''); for (const k of [...infoWins.keys()]) infoClose(k); commit(); fit(); }
// a scene file dropped anywhere on the window opens
addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
addEventListener('drop', e => { const file = e.dataTransfer && e.dataTransfer.files[0]; if (!file) return; e.preventDefault(); file.text().then(txt => openText(txt, file.name)); });

/* ---------- pictures ---------- */
const EXPORT_W = 1400, EXPORT_H = 900;
async function exportPng() {
  const c = snapshot(EXPORT_W, EXPORT_H, 2), blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const got = await saveFile(safeName(sceneName) + '.png', blob, 'image/png', '.png', 'PNG'); if (got) toast(t('file.saved', { a: got }));
}
async function exportSvg() {
  const got = await saveFile(safeName(sceneName) + '.svg', snapshotSvg(EXPORT_W, EXPORT_H), 'image/svg+xml', '.svg', 'SVG'); if (got) toast(t('file.saved', { a: got }));
}

/* ---------- calculation report ----------
   Everything the bench has worked out, part by part, each figure with the formula, the numbers put into it and the assumptions —
   the same "where this number comes from" the panel shows on a click. */
function reportData() {
  const say = (k, v, e) => ({ k, v, why: e ? exLines(e, t) : null });
  const secs = [];
  for (const p of parts) { const rows = infoRows('p' + p.id); if (rows.length) secs.push({ title: `${p.label ? p.name + ' ' + p.label : p.name} — ${typeName(p)}${sizeText(p) ? ', ' + sizeText(p) : ''}`, rows: rows.map(r => say(...r)) }); }
  for (const q of pipes) { const rows = infoRows('q' + q.id); if (rows.length > 1) secs.push({ title: infoTitle('q' + q.id) + `, ⌀${q.d}`, rows: rows.map(r => say(...r)) }); }
  return { name: sceneName || t('file.untitled'), date: new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB'), total: ioRows().map(r => say(...r)), warns: warnings.map(w => w.text), secs };
}
function reportMarkdown() {
  const d = reportData(), out = [`# ${d.name}`, '', `${t('rep.made')} Gear Bench, ${d.date}. ${t('rep.rough')}`, ''];
  const table = rows => { out.push(`| ${t('rep.what')} | ${t('rep.value')} |`, '|---|---|'); for (const r of rows) out.push(`| ${r.k} | ${String(r.v).replace(/\|/g, '/')} |`); out.push(''); for (const r of rows) if (r.why) out.push(`- **${r.k}**: ${r.why.map(l => l.replace(/^• /, '')).join('; ')}`); out.push(''); };
  if (d.total.length) { out.push(`## ${t('rep.total')}`, ''); table(d.total); }
  if (d.warns.length) { out.push(`## ${t('sec.warn')}`, ''); for (const w of d.warns) out.push(`- ${w}`); out.push(''); }
  for (const s of d.secs) { out.push(`## ${s.title}`, ''); table(s.rows); }
  return out.join('\n');
}
function reportHtml() {
  const d = reportData(), esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'), img = snapshot(1200, 700, 2).toDataURL('image/png');
  const table = rows => `<table>${rows.map(r => `<tr><th>${esc(r.k)}</th><td>${esc(r.v)}</td><td class="why">${r.why ? r.why.map(esc).join('<br>') : ''}</td></tr>`).join('')}</table>`;
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>${esc(d.name)}</title><style>
body{font:14px/1.45 "Segoe UI",system-ui,sans-serif;color:#15262f;max-width:980px;margin:24px auto;padding:0 16px}
h1{font-size:24px;margin:0 0 4px} h2{font-size:16px;margin:22px 0 6px;border-bottom:1px solid #15262f;padding-bottom:3px;break-after:avoid}
p.sub{color:#586b73;margin:0 0 14px} img{width:100%;border:1px solid #b4c2c3}
table{border-collapse:collapse;width:100%} th,td{border:1px solid #b4c2c3;padding:4px 8px;vertical-align:top;text-align:left} th{font-weight:500;width:26%} td{width:20%;font-family:ui-monospace,Consolas,monospace;font-size:13px}
td.why{width:54%;color:#3d5059;font-size:12px} ul{margin:6px 0;padding-left:20px} tr{break-inside:avoid}
@media print{body{margin:0;max-width:none} h2{margin-top:14px}}
</style><h1>${esc(d.name)}</h1><p class="sub">${esc(t('rep.made'))} Gear Bench, ${esc(d.date)}. ${esc(t('rep.rough'))}</p><img alt="" src="${img}">
${d.total.length ? `<h2>${esc(t('rep.total'))}</h2>${table(d.total)}` : ''}${d.warns.length ? `<h2>${esc(t('sec.warn'))}</h2><ul>${d.warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
${d.secs.map(s => `<h2>${esc(s.title)}</h2>${table(s.rows)}`).join('\n')}</html>`;
}
async function exportReport(kind) {
  const md = kind === 'md', got = await saveFile(safeName(sceneName) + (md ? '.md' : '.html'), md ? reportMarkdown() : reportHtml(), md ? 'text/markdown' : 'text/html', md ? '.md' : '.html', md ? 'Markdown' : 'HTML');
  if (got) toast(t('file.saved', { a: got }));
}

function fileMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  openMenu(r.left, r.bottom + 2, [[t('file.new'), newScene], [t('file.open'), openScene, 'Ctrl+O'], [t('file.save'), saveScene, 'Ctrl+S'], [t('file.examples'), openGallery], null,
    [t('file.png'), exportPng], [t('file.svg'), exportSvg], null, [t('file.report'), () => exportReport('html')], [t('file.reportMd'), () => exportReport('md')]]);
}
