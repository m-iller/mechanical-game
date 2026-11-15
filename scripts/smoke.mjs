// Browser smoke test: bundles the app, opens it in headless Chrome and checks that it starts and responds.
// Needs Playwright and Chrome on the machine (not a project dependency):  node scripts/smoke.mjs [screenshot.png]
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(execFileSync('npm', ['root', '-g']).toString().trim() + '/playwright')); }
execFileSync('node', [fileURLToPath(new URL('./bundle.mjs', import.meta.url))]);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1320, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.route(/^https?:/, r => r.abort());   // no network: the app must work without its web fonts
await page.goto(new URL('../dist/gear-bench.html', import.meta.url).href);
await page.waitForTimeout(600);
// a first visit opens the gallery of examples, every tile with a picture; a tile puts its scene on the bench
{ const g = await page.evaluate(() => ({ open: !document.getElementById('gallery').hidden, tiles: document.querySelectorAll('#gal-grid .gal').length, shots: [...document.querySelectorAll('#gal-grid .gal img')].filter(i => i.src.length > 2000).length, icons: [...document.querySelectorAll('#palette .pal img')].length, types: Object.keys(TYPES).length }));
  if (!g.open || g.tiles < 20 || g.shots !== g.tiles || g.icons !== g.types) console.log('SMOKE FAIL: gallery and palette on a first visit: ' + JSON.stringify(g)), process.exitCode = 1;
  if (process.env.SHOT_GAL) await page.screenshot({ path: process.env.SHOT_GAL });
  await page.click('#gal-grid .gal:nth-child(2)'); await page.waitForTimeout(300);
  const a = await page.evaluate(() => [document.getElementById('gallery').hidden, parts.length, sceneName, document.title]);
  if (!a[0] || a[1] < 4 || !a[2] || !a[3].includes(a[2])) console.log('SMOKE FAIL: opening an example: ' + JSON.stringify(a)), process.exitCode = 1;
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200); }
await page.waitForTimeout(400);
const fail = msg => { console.error('SMOKE FAIL:', msg); process.exitCode = 1; };
const state = () => page.evaluate(() => window.__bench.state());

let s = await state();
if (s.lock) fail('example is locked: ' + s.lock);
if (!s.parts.some(p => p.w)) fail('nothing moves in the example');
// every template inserts and runs
for (const id of await page.evaluate(() => Object.keys(TEMPLATES))) {
  await page.evaluate(id => { resetScene(3); insertTemplate(id, 0, 0); solve(); ui(); }, id);
  await page.waitForTimeout(30);
  s = await state(); if (s.lock) fail(`template ${id} is locked: ${s.lock}`);
}
// layers: a click lands on the active layer only
await page.evaluate(() => { resetScene(2); addPart('spur', { x: 0, y: 0, layer: 0, z: 30 }); addPart('spur', { x: 0, y: 0, layer: 1, z: 20 }); solve(); fit(); activeLayer = 0; ui(); });
const centre = await page.evaluate(() => { const r = cv.getBoundingClientRect(); return { x: r.left + W / 2 + (0 - view.cx) * view.scale + 20 * view.scale, y: r.top + topMid() + (0 - view.cy) * view.scale }; });
await page.mouse.click(centre.x, centre.y);
let picked = await page.evaluate(() => selParts().map(p => p.layer));
if (picked.join() !== '0') fail('click with layer A active picked layers [' + picked + ']');
await page.evaluate(() => setActive(1));
await page.mouse.click(centre.x - 12 * (await page.evaluate(() => view.scale)), centre.y);
picked = await page.evaluate(() => selParts().map(p => p.layer));
if (picked.join() !== '1') fail('click with layer B active picked layers [' + picked + ']');
await page.evaluate(() => { lockedLayers.add(1); pick([]); });
await page.mouse.click(centre.x - 12 * (await page.evaluate(() => view.scale)), centre.y);
if (await page.evaluate(() => sel.size)) fail('a locked layer let a part be picked');

// side view: dragging a part moves it along x and lifts it between layers; a shaft stretches by its end
await page.evaluate(() => { resetScene(3); addPart('spur', { x: 0, y: 0, layer: 0, z: 20 }); addPart('shaft', { x: 60, y: 0, l0: 0, l1: 0 }); solve(); viewMode = 'both'; fit(); setActive(0); });
const sidePos = (x, layer, dz = 0) => page.evaluate(([x, layer, dz]) => { const r = cv.getBoundingClientRect(); return { x: r.left + W / 2 + (x - view.cx) * view.scale, y: r.top + baseY() - (layer * LP + FW / 2 + dz) * view.scale }; }, [x, layer, dz]);
const shotGC = process.env.SHOT_GC;
const dragTo = async (a, b) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); };
await dragTo(await sidePos(0, 0), await sidePos(25, 2));
let moved = await page.evaluate(() => { const g = parts[0]; return [Math.round(g.x), g.layer, activeLayer]; });
if (moved.join() !== '25,2,2') fail('side-view drag gave x, layer, active = ' + moved);
await page.evaluate(() => setActive(0));
await dragTo(await sidePos(60, 0, 4), await sidePos(60, 2, 4));
moved = await page.evaluate(() => { const s = parts[1]; return [s.l0, s.l1]; });
if (moved.join() !== '0,2') fail('stretching a shaft in the side view gave span ' + moved);

// mechanism links: dragging a rod's free end onto a slider makes the pair, and the chain then runs
await page.evaluate(() => {
  resetScene(1); viewMode = 'top';
  addPart('tcrank', { x: 0, y: 0, len: 20, dir: Math.PI / 2, motor: { rpm: 30, tq: 2 } }); addPart('trod', { x: 0, y: 20, len: 60, dir: 0 });
  addPart('guide', { x: 70, y: 0, len: 120, dir: 0 }); addPart('tslider', { x: 75, y: 0, dir: 0 });
  tmmAttach([2, 4]); solve(); fit(); setActive(0); running = false; ui();
});
const topPos = (x, y) => page.evaluate(([x, y]) => { const r = cv.getBoundingClientRect(); return { x: r.left + W / 2 + (x - view.cx) * view.scale, y: r.top + topMid() + (y - view.cy) * view.scale }; }, [x, y]);
let pr = await page.evaluate(() => pairs.map(q => q.type).sort().join());
if (pr !== 'P,R') fail('pairs before the drag: ' + pr);
await dragTo(await topPos(60, 20), await topPos(75.5, 0.5));
pr = await page.evaluate(() => [pairs.map(q => q.type).sort().join(), tmmInfo.groups.map(g => g.W).join(), tmmInfo.ok, Math.round(parts[1].len * 10) / 10]);
if (pr[0] !== 'P,R,R' || pr[1] !== '1' || !pr[2]) fail('dropping a rod end on a slider gave ' + JSON.stringify(pr));
await page.evaluate(() => { running = true; }); await page.waitForTimeout(500);
const run = await page.evaluate(() => [tmmStuck, Math.abs(parts[3].y) < 1e-6, parts[3].x]);
if (run[0] || !run[1]) fail('the slider-crank does not run: ' + JSON.stringify(run));
await page.screenshot({ path: '/tmp/tmm1.png' });
// pulling the slider off the guide breaks its pairs
await page.evaluate(() => { running = false; });
const sl = await page.evaluate(() => ({ x: parts[3].x, y: parts[3].y }));
await dragTo(await topPos(sl.x + 5, sl.y + 2.5), await topPos(sl.x + 5, sl.y + 32));
pr = await page.evaluate(() => pairs.map(q => q.type).sort().join());
if (pr !== 'R') fail('pairs after pulling the slider away: ' + pr);
await page.evaluate(() => { viewMode = 'both'; running = true; });

// press demo: runs, and the ram shows its graphs
await page.evaluate(() => { resetScene(3); const m = insertTemplate('press', 0, 0); solve(); fit(); setActive(2); pick([m[m.length - 1].id]); });
await page.waitForTimeout(300);
s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info')) fail('press demo: ' + s.lock + JSON.stringify(s.warnings));
if (await page.locator('canvas.graphs').count() < 1 || await page.evaluate(() => tmmStuck)) fail('press demo: no graphs, or the mechanism is stuck');

// valve demo: the follower rides the cam and shows its graphs
await page.evaluate(() => { resetScene(1); const m = insertTemplate('valve', 0, 0); solve(); fit(); pick([m[1].id]); });
await page.waitForTimeout(300);
s = await state(); if (s.lock || s.warnings.length) fail('valve demo: ' + s.lock + JSON.stringify(s.warnings));
const lift = await page.evaluate(() => { const [c, f] = parts; return Math.hypot(f.x - c.x, f.y - c.y) - c.r - f.rr; });
if (!(lift >= -1e-6 && lift <= 8 + 1e-6) || await page.locator('canvas.graphs').count() < 1) fail('valve demo: lift ' + lift);

// hydraulics: a click on the valve's box drives the cylinder; the excavator arm moves and shows flow
await page.evaluate(() => { resetScene(2); insertTemplate('hydro', 0, 0); solve(); viewMode = 'top'; fit(); setActive(1); });
const boxOf = (dx) => page.evaluate(dx => { const g = parts.find(p => p.type === 'hvalve'), r = cv.getBoundingClientRect(); return { x: r.left + W / 2 + (g.x + dx - view.cx) * view.scale, y: r.top + topMid() + (g.y - view.cy) * view.scale }; }, dx);
let bx = await boxOf(-12); await page.mouse.click(bx.x, bx.y); await page.waitForTimeout(600);
let hs = await page.evaluate(() => { const c = parts.find(p => p.type === 'hcyl'); return { pos: parts.find(p => p.type === 'hvalve').pos, s: c.s, ok: hyd.ok, stuck: tmmStuck }; });
if (hs.pos !== 1 || !(hs.s > 4) || !hs.ok || hs.stuck) fail('valve click did not drive the cylinder: ' + JSON.stringify(hs));
bx = await boxOf(0); await page.mouse.click(bx.x, bx.y); await page.waitForTimeout(150);
const s1 = await page.evaluate(() => parts.find(p => p.type === 'hcyl').s); await page.waitForTimeout(200);
if (Math.abs(await page.evaluate(() => parts.find(p => p.type === 'hcyl').s) - s1) > 1e-9) fail('a closed valve does not hold the cylinder');
// laying a pipe by clicks: port, corner, port
await page.evaluate(() => { const n = pipes.length; pipes = pipes.filter(q => !(byId(q.a).type === 'hrelief')); pipeDraft = { a: null, pts: [], cur: null }; ui(); });
const portXY = (type, k) => page.evaluate(([type, k]) => { const g = parts.filter(p => p.type === type).pop(), q = portPos(g, k), r = cv.getBoundingClientRect(); return { x: r.left + W / 2 + (q.x - view.cx) * view.scale, y: r.top + topMid() + (q.y - view.cy) * view.scale }; }, [type, k]);
const pa = await portXY('hrelief', 1), pb = await portXY('htank', 0);
await page.mouse.click(pa.x, pa.y); await page.mouse.click(pa.x, pb.y - 30); await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(100);
hs = await page.evaluate(() => ({ n: pipes.length, last: pipes[pipes.length - 1], draft: pipeDraft, ok: hyd.ok }));
if (hs.n !== 7 || hs.draft || hs.last.pts.length !== 2 || hs.last.kind !== 'return' || !hs.ok) fail('laying a pipe by clicks: ' + JSON.stringify(hs));
// the same pipe again, started by a click on the free port itself; the bend follows the pointer, / flips it, Backspace takes a point back
await page.evaluate(() => { pipes.pop(); solve(); ui(); });
await page.mouse.click(pa.x, pa.y); await page.mouse.move(pa.x + 60, pa.y + 25);
let rt = await page.evaluate(() => { const d = pipeDraft, L = pipeLast(d); return d && d.cur ? [d.a != null, pipeElbow(L, d.cur, '45', 0), pipeElbow(L, d.cur, '45', 1)] : null; });
if (!rt || !rt[0] || !rt[1] || !rt[2] || Math.abs(rt[1].y - rt[2].y) < 1) fail('routing preview: ' + JSON.stringify(rt));
if (process.env.SHOT_RT) await page.screenshot({ path: process.env.SHOT_RT });
await page.keyboard.press('/'); await page.mouse.click(pa.x + 60, pa.y + 25);
rt = await page.evaluate(() => [pipeDraft.flip, pipeDraft.pts.length]); if (rt[0] !== 1 || rt[1] !== 2) fail('flip and fix: ' + rt);
await page.keyboard.press('Backspace'); rt = await page.evaluate(() => pipeDraft.pts.length); if (rt !== 1) fail('Backspace while routing: ' + rt);
await page.keyboard.press('Shift+Space'); rt = await page.evaluate(() => layout.route); if (rt !== '90') fail('Shift+Space while routing: ' + rt);
await page.evaluate(() => setRoute('45')); await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(100);
hs = await page.evaluate(() => ({ n: pipes.length, draft: pipeDraft, ok: hyd.ok })); if (hs.n !== 7 || hs.draft || !hs.ok) fail('pipe started from a port: ' + JSON.stringify(hs));
// a corner of a laid pipe can be dragged; dragging a straight run makes a corner; a corner put back in line goes away
await page.evaluate(() => { resetScene(1); const a = addPart('htank', { x: 0, y: 0 }), b = addPart('htank', { x: 100, y: 0 }); addPipe(a, 0, b, 0, {}); solve(); viewMode = 'top'; fit(); setActive(0); });
const mid = await topPos(50, 0), up40 = await topPos(50, -40), back = await topPos(50, 0.4);
await page.mouse.click(mid.x, mid.y); await dragTo(mid, up40);
let pc = await page.evaluate(() => pipes[0].pts.map(v => v.map(Math.round)));
if (JSON.stringify(pc) !== '[[50,-40]]') fail('dragging a straight pipe run: ' + JSON.stringify(pc));
await dragTo(up40, back); pc = await page.evaluate(() => pipes[0].pts.length);
if (pc !== 0) fail('a corner dragged back in line stayed: ' + pc);
// Geneva, ratchet and swinging-follower demos run clean
for (const tpl of ['genevalinks', 'ratchetlinks', 'camrocker']) {
  await page.evaluate(tpl => { resetScene(1); const m = insertTemplate(tpl, 0, 0); solve(); fit(); pick([m[m.length - 1].id]); }, tpl); await page.waitForTimeout(250);
  s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info') || await page.evaluate(() => tmmStuck)) fail(tpl + ': ' + s.lock + JSON.stringify(s.warnings));
}
// undo, redo, copy and paste from the keyboard; a motor of any kind can be set to zero speed
await page.evaluate(() => { resetScene(1); const a = addPart('spur', { x: 0, y: 0, z: 20, motor: { rpm: 60, tq: 1 } }); solve(); fit(); pick([a.id]); save(); });
await page.waitForTimeout(400);
{ const c = await topPos(0, 0); await page.mouse.move(c.x, c.y); await page.keyboard.press('Control+c'); const d = await topPos(40, 20); await page.mouse.move(d.x, d.y); await page.keyboard.press('Control+v'); }
let un = await page.evaluate(() => parts.map(p => [p.type, Math.round(p.x), Math.round(p.y)]));
if (JSON.stringify(un) !== '[["spur",0,0],["spur",40,20]]') fail('copy and paste: ' + JSON.stringify(un) + JSON.stringify(await page.evaluate(() => [mouse, bandH(), viewMode])));
await page.keyboard.press('Control+z'); un = await page.evaluate(() => parts.length); if (un !== 1) fail('undo left ' + un + ' parts');
await page.keyboard.press('Control+Shift+z'); un = await page.evaluate(() => parts.length); if (un !== 2) fail('redo left ' + un + ' parts');
await page.keyboard.press('Control+z');
un = await page.evaluate(() => { resetScene(1); const out = []; for (const kind of MOTOR_KINDS) { const m = addPart('emotor', { x: 0, y: 0 }); setMotorKind(m.motor, kind); m.motor.n = 0; m.motor.rpm = 0; solve(); out.push([kind, m.w, lockMsg || '', warnings.filter(w => w.level === 'error').length]); removeParts([m.id]); } return out; });
for (const [kind, w, lock, errs] of un) if (w !== 0 || lock || errs) fail('zero speed, ' + kind + ': ' + JSON.stringify([w, lock, errs]));
// markers on the sheet open info windows; the panel border, the border between the views and the panel sections can be moved
await page.evaluate(() => { resetScene(1); insertTemplate('fan', 0, 0); solve(); viewMode = 'both'; why = null; fit(); ui(); });
await page.waitForTimeout(300);
{ const ms = await page.evaluate(() => window.__bench.markers()), r = await page.evaluate(() => { const r = cv.getBoundingClientRect(); return [r.left, r.top]; });
  if (ms.length < 2) fail('markers on the sheet: ' + ms.length);
  await page.mouse.click(r[0] + ms[0].x, r[1] + ms[0].y); await page.waitForTimeout(150);
  let iw = await page.evaluate(() => [document.querySelectorAll('.info').length, document.querySelectorAll('.info dd').length, sel.size]);
  if (iw[0] !== 1 || iw[1] < 2 || iw[2] !== 0) fail('info window after a click on a marker: ' + iw);
  const hb = await page.evaluate(() => { const b = document.querySelector('.info h3').getBoundingClientRect(); return [b.left + 30, b.top + 8, document.querySelector('.info').offsetLeft]; });
  await dragTo({ x: hb[0], y: hb[1] }, { x: hb[0] - 60, y: hb[1] - 40 });
  iw = await page.evaluate(() => document.querySelector('.info').offsetLeft); if (Math.abs(hb[2] - iw - 60) > 3 && iw > 2) fail('dragging an info window: ' + hb[2] + ' -> ' + iw);
  await page.click('.info h3 button:last-child'); iw = await page.evaluate(() => document.querySelectorAll('.info').length); if (iw) fail('info window did not close');
  const sp = await page.evaluate(() => { const b = split.getBoundingClientRect(); return [b.left + 7, b.top + 200, document.querySelector('.panel').offsetWidth, W]; });
  await dragTo({ x: sp[0], y: sp[1] }, { x: sp[0] - 100, y: sp[1] });
  const sp2 = await page.evaluate(() => [document.querySelector('.panel').offsetWidth, W]);
  if (Math.abs(sp2[0] - sp[2] - 100) > 3 || Math.abs(sp[3] - sp2[1] - 100) > 3) fail('dragging the panel border: ' + sp + ' -> ' + sp2);
  await page.dblclick('#split'); 
  const bh = await page.evaluate(() => { const r = cv.getBoundingClientRect(); return [r.left + 300, r.top + bandH(), bandH()]; });
  await dragTo({ x: bh[0], y: bh[1] }, { x: bh[0], y: bh[1] + 80 });
  const bh2 = await page.evaluate(() => bandH()); if (Math.abs(bh2 - bh[2] - 80) > 3) fail('dragging the border between the views: ' + bh[2] + ' -> ' + bh2);
  await page.evaluate(() => { layout.sideFrac = null; saveLayout(); });
  await page.click('.panel section:nth-child(4) > h2'); let cl = await page.evaluate(() => getComputedStyle(document.getElementById('layers')).display); if (cl !== 'none') fail('a folded section still shows: ' + cl);
  await page.click('.panel section:nth-child(4) > h2');
}
// the far joint of a rod dragged onto a gear is pinned there, and the gear then carries the rod round
await page.evaluate(() => { resetScene(1); const g = addPart('spur', { x: 0, y: 0, z: 40, motor: { rpm: 30, tq: 1 } }), pv = addPart('pivot', { x: 90, y: 0 }), rk = addPart('trocker', { x: 90, y: 0, len: 50, dir: -Math.PI / 2 }), rod = addPart('trod', { x: 90, y: -50, len: 60, dir: Math.PI }); tmmAttach([rk.id, rod.id]); solve(); viewMode = 'top'; running = false; fit(); ui(); });
await dragTo(await topPos(30, -50), await topPos(20, -15)); await page.waitForTimeout(200);
{ const st = await page.evaluate(() => ({ pin: pairs.filter(q => q.pa).map(q => [byId(q.a).type, Math.round(Math.hypot(...q.pa))]), W: tmmInfo.groups.map(g => [g.W, g.drivers]), ok: tmmInfo.ok, warn: warnings.filter(w => w.level !== 'info').map(w => w.code) }));
  if (JSON.stringify(st.pin) !== '[["spur",25]]' || JSON.stringify(st.W) !== '[[1,1]]' || !st.ok || st.warn.length) fail('pinning a rod to a gear: ' + JSON.stringify(st)); }
await page.evaluate(() => { resetScene(1); insertTemplate('gearcrank', 0, 0); solve(); running = true; fit(); ui(); }); await page.waitForTimeout(400);
s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info') || await page.evaluate(() => tmmStuck)) fail('gearcrank: ' + s.lock + JSON.stringify(s.warnings));
if (shotGC) await page.screenshot({ path: shotGC });
// water line with fittings: solves, the cone's info window shows its figures, and a pipe drawn from a fitting takes the line's fluid and the port's bore
await page.evaluate(() => { resetScene(2); const m = insertTemplate('venturi', 0, 0); solve(); viewMode = 'top'; setActive(1); fit(); ui(); infoOpen('p' + m[5].id, { x: 30, y: 60 }); });
await page.waitForTimeout(300);
{ const v = await page.evaluate(() => ({ ok: hyd.ok, err: warnings.filter(w => w.level === 'error').length, rows: [...document.querySelectorAll('.info dt')].length, mode: hyd.part.get(parts.find(p => p.type === 'hcone').id).mode }));
  if (!v.ok || v.err || v.rows < 6 || v.mode !== 'confuser') fail('venturi: ' + JSON.stringify(v));
  if (process.env.SHOT_VT) await page.screenshot({ path: process.env.SHOT_VT });
  const made = await page.evaluate(() => { const c = parts.filter(p => p.type === 'hcone')[1], old = pipes.find(q => q.a === c.id && q.pa === 1); pipes = pipes.filter(q => q !== old); const b = byId(old.b); pipeStart({ p: c, k: 1 }); pipeClick(portPos(b, old.pb)); const q = pipes[pipes.length - 1]; return [q.fluid, q.d, hyd.ok]; });
  if (made.join() !== 'water,32,true') fail('pipe from a fitting: ' + made); }
await page.evaluate(() => { for (const k of [...infoWins.keys()]) infoClose(k); });
// 3.1: palette, files, pictures, report, graph, ruler, alignment, menu, theme
await page.evaluate(() => { resetScene(2); insertTemplate('fan', 0, 0); solve(); viewMode = 'both'; setActive(0); fit(); ui(); save(); });
{ // a tile dragged from the palette lands where it is dropped; a click on a tile adds the part at a clear place
  const n0 = await page.evaluate(() => parts.length), tile = await page.evaluate(() => { const b = [...document.querySelectorAll('#palette .pal')].find(x => x.title === t('type.flywheel')); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; });
  const wc = await page.evaluate(() => [Math.round(view.cx) + 7, Math.round(view.cy) + 33]), at = await topPos(wc[0], wc[1]); await dragTo(tile, at); await page.waitForTimeout(150);
  let r = await page.evaluate(() => { const p = parts[parts.length - 1]; return [parts.length, p.type, Math.round(p.x), Math.round(p.y)]; });
  if (r[0] !== n0 + 1 || r[1] !== 'flywheel' || Math.hypot(r[2] - wc[0], r[3] - wc[1]) > 40) fail('dragging a part from the palette: ' + r);
  await page.fill('#pal-q', await page.evaluate(() => t('type.spur').slice(0, 4))); r = await page.evaluate(() => document.querySelectorAll('#palette .pal').length); if (r < 1 || r > 12) fail('palette search: ' + r + ' tiles');
  await page.fill('#pal-q', '');
  // the scene as a file and back; pictures and reports are well-formed
  r = await page.evaluate(() => { setSceneName('Fan test'); const txt = JSON.stringify(serialize()), n = parts.length; resetScene(1); const ok = openText(txt, 'fan.gearbench'); const bad = openText('{"x":1}', 'bad.json'); const svg = snapshotSvg(800, 500), png = snapshot(400, 300, 1).toDataURL(), html = reportHtml(), md = reportMarkdown();
    return { ok, bad, n: parts.length === n, name: sceneName, title: document.title, svg: [svg.length, new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror') ? 'broken' : 'fine', (svg.match(/<path/g) || []).length, (svg.match(/<text/g) || []).length], png: png.length, html: [html.includes('<table>'), html.includes('data:image/png'), (html.match(/<h2>/g) || []).length], md: [md.startsWith('# Fan test'), (md.match(/^\| /gm) || []).length] }; });
  if (!r.ok || r.bad || !r.n || r.name !== 'Fan test' || !r.title.startsWith('Fan test') || r.svg[1] !== 'fine' || r.svg[2] < 10 || r.svg[3] < 2 || r.png < 5000 || !r.html[0] || !r.html[1] || r.html[2] < 3 || !r.md[0] || r.md[1] < 8) fail('files, pictures, report: ' + JSON.stringify(r));
  // graph: the fan's power against the motor's speed grows as the cube
  r = await page.evaluate(() => { resetScene(2); insertTemplate('fan', 0, 0); solve(); ui(); const m = parts.find(p => p.motor), n0 = parts.map(p => [p.x, p.y, p.w]); openSweep(m); const st = sweepParams(m), figs = sweepFigures(), F = figs.filter(f => sweepRead(f).u === 'power').pop() || figs[0];
    const pts = sweepRun(m, st.find(x => x.get() === m.motor.rpm || x.get() === Math.abs(m.motor.n)) || st[0], F, 700, 1400, 5); return { win: !!document.querySelector('.info.sweep canvas'), pars: st.length, figs: figs.length, pts, same: JSON.stringify(parts.map(p => [p.x, p.y, p.w])) === JSON.stringify(n0), fig: F.label }; });
  if (!r.win || r.pars < 2 || r.figs < 5 || r.pts.length !== 5 || !r.same || !(r.pts[4][1] > 4 * r.pts[0][1])) fail('graph: ' + JSON.stringify(r));
  if (process.env.SHOT_SW) await page.screenshot({ path: process.env.SHOT_SW });
  await page.click('.info.sweep h3 button');
  // ruler between two part centres; alignment of a dragged part with a neighbour; spreading the selection
  r = await page.evaluate(() => { resetScene(1); const a = addPart('spur', { x: 0, y: 0, z: 20 }), b = addPart('spur', { x: 90, y: 40, z: 20 }), c = addPart('pulley', { x: 40, y: -70, d: 30 }); solve(); viewMode = 'top'; fit(); ui(); toggleMeasure(); return [a.id, b.id, c.id]; });
  { const a = await topPos(1, 1), b = await topPos(89, 41); await page.mouse.click(a.x, a.y); await page.mouse.click(b.x, b.y); const m = await page.evaluate(() => measure && measure.b && [measure.a.x, measure.a.y, measure.b.x, measure.b.y]); if (JSON.stringify(m) !== '[0,0,90,40]') fail('ruler: ' + JSON.stringify(m)); if (process.env.SHOT_MS) await page.screenshot({ path: process.env.SHOT_MS }); await page.keyboard.press('m'); }
  await dragTo(await topPos(40, -70), await topPos(60, -0.3)); r = await page.evaluate(() => { const c = parts[2]; return [c.x, c.y]; }); if (r[1] !== 0 || Math.abs(r[0] - 60) > 1) fail('alignment while dragging: ' + r);
  r = await page.evaluate(() => { pick(parts.map(p => p.id)); alignSel('row'); const ys = parts.map(p => p.y); alignSel('dx'); return [new Set(ys).size, parts.map(p => Math.round(p.x)).sort((a, b) => a - b)]; }); if (r[0] !== 1 || JSON.stringify(r[1]) !== '[0,45,90]') fail('align and spread: ' + JSON.stringify(r));
  // right-button menu on a part; the key sheet; the theme button; a pinned info window follows its part and is saved with the scene
  { const a = await topPos(0, 0); await page.mouse.click(a.x, a.y, { button: 'right' }); r = await page.evaluate(() => document.querySelectorAll('.menu button').length); if (r < 6) fail('menu: ' + r); await page.keyboard.press('Escape'); r = await page.evaluate(() => document.querySelectorAll('.menu').length); if (r) fail('menu stays after Esc'); }
  await page.click('#help'); r = await page.evaluate(() => [document.getElementById('keys').hidden, document.querySelectorAll('#keys-list dt').length]); if (r[0] || r[1] < 10) fail('key sheet: ' + r); await page.click('#keys-x');
  r = await page.evaluate(() => { const a = getComputedStyle(document.documentElement).getPropertyValue('--paper'); toggleTheme(); const b = getComputedStyle(document.documentElement).getPropertyValue('--paper'); toggleTheme(); return [a.trim() !== b.trim(), document.querySelectorAll('#palette .pal img').length]; }); if (!r[0] || r[1] < 60) fail('theme: ' + r);
  r = await page.evaluate(async () => { const p = parts[0], w = infoOpen('p' + p.id, { x: 200, y: 200 }); infoPin(w); const s = serialize().info, a = w.node.offsetLeft; view.cx += 20; await new Promise(q => setTimeout(q, 120)); const b = w.node.offsetLeft; const d = serialize(); infoClose('p' + p.id); infoRestore(d.info); const back = infoWins.size; infoClose('p' + p.id); return [s.length, !!s[0].pin, Math.round(a - b - 20 * view.scale), back]; });
  if (r[0] !== 1 || !r[1] || Math.abs(r[2]) > 2 || r[3] !== 1) fail('pinned info window: ' + r);
  r = await page.evaluate(async () => { resetScene(2); insertTemplate('fan', 0, 0); solve(); viewMode = 'both'; fit(); ui(); await new Promise(q => setTimeout(q, 120)); return [markers.filter(m => m.y < bandH()).length, markers.filter(m => m.y > bandH()).length, document.getElementById('status-text').textContent]; }); if (r[0] < 2 || r[1] < 2) fail('markers in both views: ' + r);
}
// laying a pipe in the side view: port on one layer, port on another
await page.evaluate(() => { resetScene(2); addPart('htank', { x: 0, y: 0, layer: 0 }); addPart('hpump', { x: 60, y: 0, layer: 1, q: 5, motor: { rpm: 1000, tq: 20 } }); solve(); viewMode = 'both'; fit(); setActive(1); pipeDraft = { a: null, pts: [], cur: null }; ui(); });
const sa = await sidePos(0, 0), sb = await sidePos(49, 1);
await page.mouse.click(sa.x, sa.y); await page.mouse.click(sb.x, sb.y); await page.waitForTimeout(80);
hs = await page.evaluate(() => ({ n: pipes.length, q: pipes[0], draft: !!pipeDraft, L: pipes[0] && pipeLen(pipes[0]) }));
if (hs.n !== 1 || hs.draft || hs.q.a !== 1 || hs.q.b !== 2 || hs.q.pb !== 0 || Math.abs(hs.L - (49 + 18) / 1000) > 1e-6) fail('laying a pipe in the side view: ' + JSON.stringify(hs));
await page.evaluate(() => { resetScene(2); insertTemplate('excavator', 0, 0); solve(); viewMode = 'top'; fit(); setActive(1); });
await page.waitForTimeout(700);
s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info')) fail('excavator demo: ' + s.lock + JSON.stringify(s.warnings));
if (!(await page.evaluate(() => pipes.some(q => Math.abs(q.ph) > 0.01)))) fail('excavator demo: no flow marks are moving');
if (process.env.SHOT_EXC) await page.screenshot({ path: process.env.SHOT_EXC });
await page.evaluate(() => { viewMode = 'both'; });

// engine, flywheel, generator, heater: runs, the heater warms up, the engine panel draws its diagrams
await page.evaluate(() => { resetScene(3); const m = insertTemplate('genset', 0, 0); solve(); viewMode = 'top'; fit(); setActive(2); pick([m[0].id]); });
await page.waitForTimeout(700);
s = await state(); if (s.lock || s.warnings.length) fail('genset demo: ' + s.lock + JSON.stringify(s.warnings));
const heat = await page.evaluate(() => parts.find(p => p.type === 'heater').T);
if (!(heat > 20.5) || await page.locator('canvas.graphs').count() !== 1) fail('genset demo: heater at ' + heat);
if (process.env.SHOT_GEN) { await page.evaluate(() => { setActive(0); pick([parts[0].id]); setActive(2); }); await page.waitForTimeout(100); await page.screenshot({ path: process.env.SHOT_GEN }); }
await page.evaluate(() => { viewMode = 'both'; });

// gas-turbine set: runs, gas moves along the lines, the turbine panel draws its speed triangles; the steam plant runs too
await page.evaluate(() => { resetScene(3); const m = insertTemplate('gasturbine', 0, 0); solve(); viewMode = 'top'; fit(); setActive(1); pick([m[2].id]); });
await page.waitForTimeout(600);
s = await state(); if (s.lock || s.warnings.length) fail('gas-turbine demo: ' + s.lock + JSON.stringify(s.warnings));
if (!(await page.evaluate(() => pipes.every(q => Math.abs(q.ph) > 0.01))) || await page.locator('canvas.graphs').count() !== 1) fail('gas-turbine demo: no flow on the lines or no triangles');
if (process.env.SHOT_GT) await page.screenshot({ path: process.env.SHOT_GT });
await page.evaluate(() => { resetScene(2); insertTemplate('steam', 0, 0); solve(); fit(); }); await page.waitForTimeout(200);
s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info')) fail('steam demo: ' + s.lock + JSON.stringify(s.warnings));
await page.evaluate(() => { viewMode = 'both'; });

// power balance: the conveyor demo runs, shows explained figures, and the "where from" box opens
await page.evaluate(() => { resetScene(5); const m = insertTemplate('conveyor', 0, 0); solve(); fit(); pick([m[m.length - 1].id]); });
await page.waitForTimeout(60);
s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info')) fail('conveyor demo: ' + s.lock + JSON.stringify(s.warnings));
if (await page.locator('dd.ex').count() < 6) fail('no explained figures in the panel');
await page.locator('.motor dd.ex').nth(1).click();
if (!/M = Σ/.test(await page.locator('#why-b').innerText())) fail('the "where from" box did not open');
if (process.env.SHOT_CV) { await page.evaluate(() => { why = null; viewMode = 'both'; fit(); setActive(1); ui(); }); await page.waitForTimeout(150); await page.screenshot({ path: process.env.SHOT_CV }); }
await page.evaluate(() => { parts.find(p => p.type === 'conveyor').F = 16000; solve(); ui(); });
s = await state(); if (!s.warnings.some(w => w[1] === 'w.stall')) fail('an overloaded motor did not stall');

const extra = process.env.SMOKE_EXTRA;   // optional module with more checks: export default async (page, fail) => {}
if (extra) await (await import(new URL(extra, 'file://' + process.cwd() + '/').href)).default(page, fail);
await page.evaluate(() => { example(); solve(); fit(); ui(); });
await page.waitForTimeout(200);
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
for (const e of errors) fail(e);
await browser.close();
if (!process.exitCode) console.log('smoke ok');
