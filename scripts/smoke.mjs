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
