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
if (await page.locator('canvas.graphs').count() !== 1 || await page.evaluate(() => tmmStuck)) fail('press demo: no graphs, or the mechanism is stuck');

// valve demo: the follower rides the cam and shows its graphs
await page.evaluate(() => { resetScene(1); const m = insertTemplate('valve', 0, 0); solve(); fit(); pick([m[1].id]); });
await page.waitForTimeout(300);
s = await state(); if (s.lock || s.warnings.length) fail('valve demo: ' + s.lock + JSON.stringify(s.warnings));
const lift = await page.evaluate(() => { const [c, f] = parts; return Math.hypot(f.x - c.x, f.y - c.y) - c.r - f.rr; });
if (!(lift >= -1e-6 && lift <= 8 + 1e-6) || await page.locator('canvas.graphs').count() !== 1) fail('valve demo: lift ' + lift);

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
if (hs.n !== 7 || hs.draft || hs.last.pts.length !== 1 || hs.last.kind !== 'return' || !hs.ok) fail('laying a pipe by clicks: ' + JSON.stringify(hs));
await page.evaluate(() => { resetScene(2); insertTemplate('excavator', 0, 0); solve(); viewMode = 'top'; fit(); setActive(1); });
await page.waitForTimeout(700);
s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info')) fail('excavator demo: ' + s.lock + JSON.stringify(s.warnings));
if (!(await page.evaluate(() => pipes.some(q => Math.abs(q.ph) > 0.01)))) fail('excavator demo: no flow marks are moving');
if (process.env.SHOT_EXC) await page.screenshot({ path: process.env.SHOT_EXC });
await page.evaluate(() => { viewMode = 'both'; });

// power balance: the conveyor demo runs, shows explained figures, and the "where from" box opens
await page.evaluate(() => { resetScene(5); const m = insertTemplate('conveyor', 0, 0); solve(); fit(); pick([m[m.length - 1].id]); });
await page.waitForTimeout(60);
s = await state(); if (s.lock || s.warnings.some(w => w[0] !== 'info')) fail('conveyor demo: ' + s.lock + JSON.stringify(s.warnings));
if (await page.locator('dd.ex').count() < 6) fail('no explained figures in the panel');
await page.locator('.motor dd.ex').nth(1).click();
if (!/M = Σ/.test(await page.locator('#why-b').innerText())) fail('the "where from" box did not open');
await page.evaluate(() => { parts.find(p => p.type === 'machine').load.tq = 500; solve(); ui(); });
s = await state(); if (!s.warnings.some(w => w[1] === 'w.stall')) fail('an overloaded motor did not stall');

const extra = process.env.SMOKE_EXTRA;   // optional module with more checks: export default async (page, fail) => {}
if (extra) await (await import(new URL(extra, 'file://' + process.cwd() + '/').href)).default(page, fail);
await page.evaluate(() => { example(); solve(); fit(); ui(); });
await page.waitForTimeout(200);
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
for (const e of errors) fail(e);
await browser.close();
if (!process.exitCode) console.log('smoke ok');
