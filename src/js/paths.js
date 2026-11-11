/* Gear Bench — outlines: every part's shape as a cached Path2D, plus belt and chain routing. */
'use strict';

const pathCache = new Map();
const cached = (key, build) => { if (!pathCache.has(key)) pathCache.set(key, build()); return pathCache.get(key); };

// involute tooth outline of z teeth; tooth k is centred on angle k * 2π/z
function outline(p, z, add, ded) {
  const r = M * z / 2, rb = r * Math.cos(ALPHA), ra = r + add, rf = r - ded;
  const base = Math.PI / (2 * z) + INV_A;
  const inv = q => { if (q <= rb) return 0; const t = Math.sqrt((q / rb) ** 2 - 1); return t - Math.atan(t); };
  const beta = q => Math.max(0, base - inv(q));
  const rs = Math.min(ra, Math.max(rb, rf)), N = 7;
  let prev = 0;
  for (let k = 0; k < z; k++) {
    const th = TAU * k / z, a0 = th - beta(rs);
    if (k === 0) p.moveTo(rf * Math.cos(a0), rf * Math.sin(a0)); else p.arc(0, 0, rf, prev, a0);
    for (let i = 0; i <= N; i++) { const q = rs + (ra - rs) * i / N, a = th - beta(q); p.lineTo(q * Math.cos(a), q * Math.sin(a)); }
    p.arc(0, 0, ra, th - beta(ra), th + beta(ra));
    for (let i = N; i >= 0; i--) { const q = rs + (ra - rs) * i / N, a = th + beta(q); p.lineTo(q * Math.cos(a), q * Math.sin(a)); }
    prev = th + beta(rs);
    p.lineTo(rf * Math.cos(prev), rf * Math.sin(prev));
  }
  p.arc(0, 0, rf, prev, TAU - beta(rs)); p.closePath();
}
const circle = (p, r, x = 0, y = 0) => { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); };
const boreR = r => Math.max(2.2, Math.min(r * 0.2, 6));
function borePath(p, bore) { // bore with a keyway, so rotation shows
  const kw = bore * 0.55, kh = bore * 0.3, d = Math.asin(kw / 2 / bore);
  p.moveTo(bore * Math.cos(d), bore * Math.sin(d));
  p.arc(0, 0, bore, d, TAU - d);
  p.lineTo(bore + kh, -kw / 2); p.lineTo(bore + kh, kw / 2); p.closePath();
}
function holes(p, hub, rim, n) {
  if (rim - hub <= 8) return;
  const rc = (hub + rim) / 2, hr = Math.min((rim - hub) / 2 * 0.86, Math.PI * rc / n * 0.72);
  for (let k = 0; k < n; k++) { const a = TAU * (k + 0.5) / n; circle(p, hr, rc * Math.cos(a), rc * Math.sin(a)); }
}
const polar = (p, pts) => { pts.forEach(([q, t], i) => { const x = q * Math.cos(t), y = q * Math.sin(t); if (i) p.lineTo(x, y); else p.moveTo(x, y); }); p.closePath(); };

const spurPath = z => cached('s' + z, () => {
  const p = new Path2D(), r = M * z / 2, bore = boreR(r);
  outline(p, z, M, 1.25 * M); borePath(p, bore); holes(p, bore * 2.1, r - 3.45 * M, z >= 50 ? 6 : 5);
  return p;
});
// ring gear: teeth on the inside (z) and on the outside (z + 2 * RING_T)
const ringPath = z => cached('r' + z, () => { const p = new Path2D(); outline(p, z + 2 * RING_T, M, 1.25 * M); outline(p, z, 1.25 * M, M); return p; });
const diffPath = z => cached('d' + z, () => { const p = new Path2D(); outline(p, z, M, 1.25 * M); circle(p, M * z / 2 - 3.2 * M - 1.5); return p; });
// a plain disc with a keyed bore, optional lightening holes, and radial tick marks as a separate path
const discPath = (r, n = 0, ticks = 0, inner = 0.6) => cached(`o${r}/${n}/${ticks}/${inner}`, () => {
  const fill = new Path2D(), lines = new Path2D(), bore = boreR(r);
  circle(fill, r); borePath(fill, bore); if (n) holes(fill, bore * 2.1, r - 2.5, n);
  for (let k = 0; k < ticks; k++) { const a = TAU * k / ticks, c = Math.cos(a), s = Math.sin(a); lines.moveTo(r * inner * c, r * inner * s); lines.lineTo(r * c, r * s); }
  if (ticks) circle(lines, r * inner);
  return { fill, lines };
});
const bevelPath = z => discPath(M * z / 2, 0, z, 2 / 3);
const pulleyPath = d => cached('u' + d, () => {
  const r = d / 2, fill = new Path2D(), lines = new Path2D(), bore = boreR(r);
  circle(fill, r + 1.5); borePath(fill, bore); holes(fill, bore * 2.1, r - 3, 5); circle(lines, r);
  return { fill, lines };
});
const sprocketPath = z => cached('k' + z, () => { // roller seats sit at phase + k * pitch
  const p = new Path2D(), r = z * CP / TAU, pt = TAU / z, rr = CP * 0.28, tip = r + 0.3 * CP, pts = [];
  for (let k = 0; k < z; k++) { const a = k * pt; pts.push([r - rr, a - 0.1 * pt], [r - rr, a + 0.1 * pt], [r + 0.4, a + 0.26 * pt], [tip, a + 0.42 * pt], [tip, a + 0.58 * pt], [r + 0.4, a + 0.74 * pt]); }
  polar(p, pts);
  const bore = boreR(r); borePath(p, bore); holes(p, bore * 2.1, r - rr - 3, 5);
  return p;
});
const flywheelPath = d => cached('f' + d, () => {
  const p = new Path2D(), r = d / 2, ro = r - Math.max(6, r * 0.24), ri = r * 0.3;
  circle(p, r); borePath(p, boreR(r));
  for (let k = 0; k < 6; k++) { const a0 = TAU * k / 6 + 0.16, a1 = TAU * (k + 1) / 6 - 0.16; p.moveTo(ro * Math.cos(a0), ro * Math.sin(a0)); p.arc(0, 0, ro, a0, a1); p.arc(0, 0, ri, a1 - 0.2, a0 + 0.2, true); p.closePath(); }
  return p;
});
// sawtooth wheel radius at wheel-frame angle a; the ramp direction decides which way it can turn under the pawl
const ratchetR = (g, a) => RO(g) - 3.2 + 3.2 * mod((g.on ? 1 : -1) * a * g.z / TAU, 1);
const ratchetPath = (z, s) => cached(`t${z}/${s}`, () => {
  const p = new Path2D(), ra = M * z / 2, rf = ra - 3.2, pt = TAU / z, pts = [];
  for (let k = 0; k < z; k++) pts.push(s < 0 ? [rf, k * pt] : [ra, k * pt], s < 0 ? [ra, k * pt] : [rf, k * pt]);
  polar(p, pts); const bore = boreR(ra); borePath(p, bore); holes(p, bore * 2.1, rf - 2, 4);
  return p;
});
const camLift = (h, a) => { a = wrap(a); return Math.abs(a) < TAU / 3 ? h * Math.cos(0.75 * a) ** 2 : 0; };
const camPath = h => cached('c' + h, () => {
  const p = new Path2D(), pts = [];
  for (let i = 0; i < 120; i++) { const a = TAU * i / 120; pts.push([CB + camLift(h, a), a]); }
  polar(p, pts); borePath(p, 3.2);
  return p;
});
const genevaPath = n => cached('g' + n, () => { // slot 0 points along +x
  const p = new Path2D(), c = GA / Math.sin(Math.PI / n), b = c * Math.cos(Math.PI / n), s0 = c - GA - 1.4, w = 3.8, rl = GA - 3, pts = [], st = TAU / n;
  for (let i = 0; i < 1440; i++) {
    const a = TAU * i / 1440, ds = wrap(a - st * Math.round(a / st)), dc = wrap(a - st * (Math.floor(a / st) + 0.5));
    let R = b;
    if (Math.abs(Math.tan(ds)) < w / (2 * s0)) R = Math.min(R, s0 / Math.cos(ds));
    const off = c * Math.sin(dc); if (Math.abs(off) < rl) R = Math.min(R, c * Math.cos(dc) - Math.sqrt(rl * rl - off * off));
    pts.push([R, a]);
  }
  polar(p, pts); circle(p, 2.4);
  return p;
});
function genevaPsi(g) { // wheel angle as a function of the driver angle
  const n = g.z, c = gvc(g), al = angle(g) - g.dir, t = Math.floor((al + Math.PI) / TAU), aw = al - TAU * t, a0 = Math.PI / 2 - Math.PI / n;
  const be = Math.abs(aw) <= a0 ? Math.atan2(GA * Math.sin(aw), c - GA * Math.cos(aw)) : Math.sign(aw) * Math.PI / n;
  return g.dir + Math.PI - be - t * TAU / n;
}
const pistonX = g => { const a = angle(g) - g.dir, r = g.r, l = rodL(g); return r * Math.cos(a) + Math.sqrt(l * l - (r * Math.sin(a)) ** 2); };
// worm thread ridges sit at these positions along the worm axis, measured from its middle
const wormRidge = w => mod(-angle(w) * w.zw * M / 2, PM);

function hull(p) {
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/* A belt or chain around any number of wheels follows the convex hull of their pitch circles.
   Returns the wrapped arcs in travel order (the belt runs with increasing angle), the path, its length,
   and for each wheel where its arc sits along the path. Wheels inside the hull are not touched.
   Two wheels may also be joined by a crossed belt, which turns the second one the other way. */
function route(ws, crossed) {
  if (ws.length < 2) return null;
  const arcs = [];
  if (ws.length === 2 && crossed) {
    const [a, b] = ws, ra = RO(a), rb = RO(b), d = dist(a, b);
    if (d <= ra + rb + 0.5) return null;
    const phi = Math.atan2(b.y - a.y, b.x - a.x), be = Math.acos((ra + rb) / d);
    arcs.push({ w: a, a0: phi + be, a1: phi + TAU - be, s: 1 }, { w: b, a0: phi - be + Math.PI, a1: phi + be - Math.PI, s: -1 });
  } else {
    const sup = (w, f) => w.x * Math.cos(f) + w.y * Math.sin(f) + RO(w), f0 = 0.1234;
    let cur = ws.reduce((m, w) => sup(w, f0) > sup(m, f0) ? w : m), phi = f0, total = 0; const tr = [];
    for (let guard = 0; guard < ws.length * 4 + 4; guard++) {
      let best = null, bd = Infinity;
      for (const j of ws) {
        if (j === cur) continue;
        const d = dist(cur, j), q = (RO(cur) - RO(j)) / d; if (!(d > 1e-6) || Math.abs(q) >= 1) continue;
        const delta = mod(Math.atan2(j.y - cur.y, j.x - cur.x) - Math.acos(q) - phi, TAU);
        if (delta > 1e-7 && delta < bd) { bd = delta; best = j; }
      }
      if (!best || total + bd >= TAU - 1e-9) break;
      phi += bd; total += bd; tr.push({ ang: phi, to: best }); cur = best;
    }
    if (tr.length < 2) return null;
    tr.forEach((t, k) => arcs.push({ w: t.to, a0: t.ang, a1: k + 1 < tr.length ? tr[k + 1].ang : tr[0].ang + TAU, s: 1 }));
  }
  const path = new Path2D(), on = new Map(), pt = (c, a) => [c.w.x + RO(c.w) * Math.cos(a), c.w.y + RO(c.w) * Math.sin(a)];
  let L = 0;
  arcs.forEach((c, k) => {
    const len = RO(c.w) * Math.abs(c.a1 - c.a0), nx = arcs[(k + 1) % arcs.length], e = pt(c, c.a1), b = pt(nx, nx.a0);
    path.arc(c.w.x, c.w.y, RO(c.w), c.a0, c.a1, c.s < 0);
    on.set(c.w.id, { sMid: L + len / 2, mid: (c.a0 + c.a1) / 2, wrap: Math.abs(c.a1 - c.a0), s: c.s });
    L += len + Math.hypot(b[0] - e[0], b[1] - e[1]);
  });
  path.closePath();
  return { arcs, path, L, on };
}
