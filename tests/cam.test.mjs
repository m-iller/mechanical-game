// Plate cams. Peak values of the motion laws are the textbook ones (Artobolevsky; Norton, "Cam Design and Manufacturing Handbook"):
//   constant acceleration  v_max = 2·h/β      a_max = 4·h/β²
//   harmonic               v_max = π·h/(2β)   a_max = π²·h/(2β²)
//   cycloidal              v_max = 2·h/β      a_max = 2π·h/β²
import test from 'node:test';
import assert from 'node:assert/strict';
import { bench, close } from './load.mjs';

test('motion laws: end values and peak speed and acceleration', () => {
  const r = bench().run(() => ['lin', 'par', 'harm', 'cyc'].map(law => {
    let v = 0, a = 0; for (let k = 0; k <= 1000; k++) { const [, d1, d2] = camLaw(law, k / 1000); v = Math.max(v, Math.abs(d1)); a = Math.max(a, Math.abs(d2)); }
    return { s0: camLaw(law, 0)[0], s1: camLaw(law, 1)[0], v, a, v0: camLaw(law, 0)[1], a0: camLaw(law, 0)[2] };
  }));
  for (const x of r) { close(x.s0, 0, 0, 1e-12); close(x.s1, 1, 1e-12); }
  close(r[0].v, 1); close(r[0].a, 0, 0, 1e-12);
  close(r[1].v, 2, 1e-9); close(r[1].a, 4);
  close(r[2].v, Math.PI / 2, 1e-6); close(r[2].a, Math.PI ** 2 / 2);
  close(r[3].v, 2, 1e-6); close(r[3].a, 2 * Math.PI, 1e-5); close(r[3].v0, 0, 0, 1e-12); close(r[3].a0, 0, 0, 1e-12);
});

test('rise, dwell, return, dwell: travel and its rate at the marks of the plan', () => {
  const cam = { r: 20, h: 10, law: 'harm', b1: 90, bd: 30, b2: 60 }, D = Math.PI / 180;
  const r = bench().run((c, D) => [camS(c, 0), camS(c, 45 * D), camS(c, 100 * D), camS(c, 150 * D), camS(c, 200 * D), camS(c, -10 * D)], cam, D);
  close(r[0][0], 0, 0, 1e-12); close(r[1][0], 5); close(r[1][1], 10 * (Math.PI / 2) / (90 * D));   // mid-rise: half the lift at the top harmonic speed
  close(r[2][0], 10); close(r[2][1], 0, 0, 1e-12);
  close(r[3][0], 5); close(r[3][1], -10 * (Math.PI / 2) / (60 * D));
  close(r[4][0], 0, 0, 1e-12); close(r[5][0], 0, 0, 1e-12);
});

test('pressure angle of an in-line follower: tan α = s′/(r + r_r + s); and the base radius that brings it to 30°', () => {
  // constant-speed law: s′ = h/β all along the rise, so α is largest at its start: tan α = (h/β)/(r + r_r)
  const cam = { r: 20, h: 12, law: 'lin', b1: 60, bd: 0, b2: 60 }, beta = Math.PI / 3;
  const r = bench().run(c => { const k = camCheck(c, 5), k2 = camCheck({ ...c, r: k.rmin }, 5); return { a: k.alpha, rmin: k.rmin, a2: k2.alpha }; }, cam);
  close(r.a, Math.atan((12 / beta) / 25), 1e-9);
  close(r.rmin, (12 / beta) / Math.tan(Math.PI / 6) - 5, 1e-9);
  close(r.a2, Math.PI / 6, 1e-6);
});

test('an eccentric circle is a harmonic cam: its pitch curve has the curvature radius of the circle', () => {
  // for small eccentricity e the follower travel is close to e·(1 − cos φ): harmonic rise over 180° with h = 2e. ρ stays near r + e + r_r.
  const r = bench().run(() => camCheck({ r: 30, h: 2, law: 'harm', b1: 180, bd: 0, b2: 180 }, 0).rho);
  assert.ok(r > 28 && r < 34);
});

test('the surface is the pitch curve moved in by the roller radius', () => {
  const r = bench().run(() => { const c = { r: 20, h: 8, law: 'cyc', b1: 90, bd: 30, b2: 90 }, a = camProfile(c, 0, 360), b = camProfile(c, 5, 360); return [Math.hypot(...b[300]), Math.hypot(...a[300]), Math.hypot(...b[100]) - 20, Math.hypot(...a[100]) - 28]; });
  close(r[0], 20, 1e-6); close(r[1], 20, 1e-9);        // on the base dwell
  close(r[2], 8, 1e-3); close(r[3], 0, 0, 1e-9);       // on the top dwell: lifted by h
});

test('demo: cam drive of a valve — a higher pair, W = 1, the follower rides the law and nothing is flagged', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, f] = insertTemplate('valve', 0, 0); solve();
    const out = { pairs: pairs.map(q => q.type), group: tmmInfo.groups.map(g => [g.n, g.p5, g.p4, g.W, g.drivers]), warn: warnings.map(w => w.code), rows: [] };
    for (const deg of [0, 35, 80, 125, 200]) { clock = deg * Math.PI / 180 / c.w; tmmStep(); out.rows.push([deg, Math.hypot(f.x, f.y) - 23, f.x]); }
    const S = tmmSeries(f); out.series = S.series.map(s => s.name); out.vmax = Math.max(...S.series[1].data);
    return out;
  });
  assert.deepEqual(r.pairs, ['H']); assert.deepEqual(r.group, [[2, 2, 1, 1, 1]]); assert.deepEqual(r.warn, []);
  // the follower points along −π/2, so the law angle is the cam angle + 90°: at 0° it is 90° in, on the top dwell
  const D = Math.PI / 180, want = deg => { const f = ((deg + 90) % 360) * D; return f < 70 * D ? 8 * (f / (70 * D) - Math.sin(2 * Math.PI * f / (70 * D)) / (2 * Math.PI)) : f < 90 * D ? 8 : f < 160 * D ? 8 * (1 - ((f - 90 * D) / (70 * D) - Math.sin(2 * Math.PI * (f - 90 * D) / (70 * D)) / (2 * Math.PI))) : 0; };
  for (const [deg, s, x] of r.rows) { close(s, want(deg), 1e-9, 1e-9); close(x, 0, 0, 1e-9); }
  assert.deepEqual(r.series, ['s', 'v', 'a', 'α']);
  close(r.vmax, 2 * 0.008 / (70 * D) * (600 * Math.PI / 30), 5e-3);   // cycloidal: v_max = 2h/β·ω
});

test('a steep cam is flagged with the base radius that would do', () => {
  const r = bench().run(() => { resetScene(1); const [c] = insertTemplate('valve', 0, 0); c.b1 = 20; c.h = 14; solve(); return warnings.map(w => w.code); });
  assert.ok(r.includes('w.camAngle'));
});

test('offset follower: tan α = (s′ − e)/(√((r + r_r)² − e²) + s); an offset the right way eases the rise', () => {
  const cam = { r: 20, h: 12, law: 'lin', b1: 60, bd: 0, b2: 60 }, beta = Math.PI / 3, e = 6;
  const r = bench().run((c, e) => ({ a0: camPressure(c, 5, 0.3, 0), a: camPressure(c, 5, 0.3, e), s: camS(c, 0.3)[0], k0: camCheck(c, 5).alpha, rise: Math.max(...[...Array(100)].map((_, i) => Math.abs(camPressure(c, 5, i / 100, e)))) }), cam, e);
  close(r.a, Math.atan2(12 / beta - e, Math.sqrt(25 * 25 - e * e) + r.s), 1e-12);
  assert.ok(r.a < r.a0 && r.rise < r.k0);
});

test('offset follower on the bench: the roller centre stays on the pitch curve, e off the line through the cam centre', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, f] = insertTemplate('valve', 0, 0); f.e = 6; solve(); const out = [];
    for (const deg of [0, 40, 100, 200]) { clock = deg * Math.PI / 180 / c.w; tmmStep(); const u = [Math.cos(f.dir), Math.sin(f.dir)], al = f.x * u[0] + f.y * u[1], pe = -f.x * u[1] + f.y * u[0], s = camS(c, linkTh(c) - f.dir)[0]; out.push([al - s, pe]); }
    return out;
  });
  for (const [d0, pe] of r) { close(d0, Math.sqrt(23 * 23 - 36), 1e-9); close(pe, 6, 1e-9); }
});

/* ---- flat and swinging followers, Geneva and ratchet ---- */
test('flat-faced follower: the contact point lies s′ off the axis, the pressure angle is zero, and a small base circle is flagged', () => {
  const r = bench().run(() => {
    const c = { r: 20, h: 8, law: 'harm', b1: 90, bd: 0, b2: 90 }, f = { kind: 'flat', dir: 0 }, P = camPitch(c, f, [0, 0], 360), k = 30, [s, d1] = camS(c, 2 * Math.PI * k / 360), phi = 2 * Math.PI * k / 360;
    const cs = Math.cos(phi), sn = Math.sin(phi), ax = P[k][0] * cs - P[k][1] * sn, off = P[k][0] * sn + P[k][1] * cs;   // back into the follower's frame
    return { ax, off, s, d1, ok: camFollowerCheck(c, f, [0, 0]), bad: camFollowerCheck({ ...c, r: 6, h: 14, b1: 40, b2: 40 }, f, [0, 0]) };
  });
  close(r.ax, 20 + r.s, 1e-9); close(Math.abs(r.off), Math.abs(r.d1), 1e-9);
  assert.equal(r.ok.alpha, 0); assert.ok(r.ok.rho > 0 && r.bad.rho < 0);      // ρ = r + s + s″
});

test('swinging follower: the roller starts on the base circle, the arm turns by s/L, and the pressure angle is found from the pitch curve', () => {
  const r = bench().run(() => {
    resetScene(1); const [c, f] = insertTemplate('camrocker', 0, 0); solve();
    const e0 = jointPos(f, 1), d0 = Math.hypot(e0.x - c.x, e0.y - c.y), a0 = f.dir, out = { pairs: pairs.map(q => q.type), W: tmmInfo.groups.map(g => g.W), warn: warnings.map(w => w.code), d0 };
    clock = (100 * Math.PI / 180) / c.w; tmmStep(); out.top = Math.abs(wrap(f.dir - a0)) * f.len;                 // on the top dwell: the full lift along the arc
    const k = camFollowerCheck(c, folOf(f), [c.x, c.y]); out.alpha = k.alpha; out.rho = k.rho; out.series = tmmSeries(f).series.map(s => s.name);
    return out;
  });
  assert.deepEqual(r.pairs, ['H']); assert.deepEqual(r.W, [1]); assert.deepEqual(r.warn, []);
  close(r.d0, 23, 1e-9); close(r.top, 8, 1e-9);
  assert.ok(r.alpha > 0.05 && r.alpha < Math.PI / 4 && r.rho > 5); assert.deepEqual(r.series, ['s', 'v', 'a', 'α']);
});

test('Geneva drive, z = 4: 90° per crank turn, moving for a quarter of it, top speed ω·λ/(1 − λ) on the line of centres', () => {
  const lam = Math.SQRT1_2;
  const r = bench().run(() => {
    const at = f => genevaTurn(4, f), h = 1e-5;
    return { a: [at(-3), at(-Math.PI / 4 + 1e-9), at(0), at(Math.PI / 4 - 1e-9), at(3), at(3 + 2 * Math.PI)], w: -(at(h).angle - at(-h).angle) / (2 * h), mid: at(0.3).angle };
  });
  close(r.a[0].angle, Math.PI / 4); assert.equal(r.a[0].moving, false);
  close(r.a[1].angle, Math.PI / 4, 1e-6); close(r.a[2].angle, 0, 0, 1e-12); close(r.a[3].angle, -Math.PI / 4, 1e-6);
  close(r.a[4].angle, -Math.PI / 4); close(r.a[5].angle, -Math.PI / 4 - Math.PI / 2, 1e-12);                       // a quarter turn on, the other way
  close(r.w, lam / (1 - lam), 1e-6);                                                                               // 2.414
  close(r.mid, Math.atan2(-lam * Math.sin(0.3), 1 - lam * Math.cos(0.3)), 1e-12);                                  // the slot keeps looking at the pin
});

test('Geneva wheel from links: snaps to a = r/sin(π/z), is driven by the crank pin, and its slot follows the pin while engaged', () => {
  const r = bench().run(() => {
    resetScene(1); const c = addPart('tcrank', { x: 0, y: 0, len: 20, dir: Math.PI, motor: { rpm: 30, tq: 2 } }), g = addPart('tgeneva', { x: 31, y: 2, z: 4 });
    tmmAttach([g.id]); solve(); const a = Math.hypot(g.x, g.y), out = { a, pairs: pairs.map(q => [q.type, q.ja]), W: tmmInfo.groups.map(x => x.W), rows: [] };
    const line = Math.atan2(g.y, g.x);
    for (const deg of [0, 20, 40, 90, 180, 320, 360]) { c.dir = line + deg * Math.PI / 180; clock = 0; tmmStep(); const pin = jointPos(c, 1), toPin = Math.atan2(pin.y - g.y, pin.x - g.x); out.rows.push([deg, Math.abs(Math.sin(2 * (g.dir - toPin))), g.dir]); }
    return out;
  });
  close(r.a, 20 / Math.SQRT1_2, 1e-9); assert.deepEqual(r.pairs, [['H', 1]]); assert.deepEqual(r.W, [1]);
  for (const [deg, mis] of r.rows) if (deg < 45 || deg > 315) close(mis, 0, 0, 1e-9);                             // some slot points at the pin (slots are 90° apart)
  close(Math.abs(Math.sin(2 * (r.rows[3][2] - r.rows[4][2]))), 0, 0, 1e-9);                                       // locked between 90° and 180°
});

test('ratchet from links: the wheel follows the rocker one way and stands on the way back; over a turn it gains the rocker\'s swing', () => {
  const r = bench().run(() => {
    resetScene(1); const m = insertTemplate('ratchetlinks', 0, 0), c = m[0], rk = m[3], w = m[4]; solve();
    const out = { pairs: pairs.filter(q => q.type === 'H').length, W: tmmInfo.groups.map(g => g.W), ok: tmmInfo.ok }; let acc = 0, back = 0, prev = w.dir, lo = Infinity, hi = -Infinity, rd = rk.dir, ru = 0;
    for (let k = 1; k <= 360; k++) { clock = k * (Math.PI / 180) / c.w; tmmStep(); const d = wrap(w.dir - prev); prev = w.dir; if (d < -1e-12) back++; acc += d; const dr = wrap(rk.dir - rd); rd = rk.dir; ru += dr; lo = Math.min(lo, ru); hi = Math.max(hi, ru); }
    return { ...out, acc, back, swing: hi - lo };
  });
  assert.equal(r.pairs, 1); assert.deepEqual(r.W, [1]); assert.ok(r.ok);
  assert.equal(r.back, 0); close(r.acc, r.swing, 2e-2); assert.ok(r.swing > 0.5);
});
