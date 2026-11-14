/* Gear Bench — drawing: the top view, the side view above it, labels and dimensions. */
'use strict';

const cv = document.getElementById('cv'), mainCtx = cv.getContext('2d'), sheet = document.getElementById('sheet');
let ctx = mainCtx;                     // the drawing functions below paint into whichever context this names
const ghost = document.createElement('canvas'), ghostCtx = ghost.getContext('2d');
const FADE = 0.3;                       // opacity of the layers that are not active
let W = 300, H = 300, C = {}, boxSel = null;

function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['paper', 'panel', 'ink', 'muted', 'line', 'grid', 'grid-major', 'steel-a', 'steel-b', 'idle', 'shaft', 'brass', 'select', 'jam', 'mono']) C[k] = cs.getPropertyValue('--' + k).trim();
}
const hex = c => { c = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) || 0); };
const tone = l => { const A = hex(C['steel-a']), B = hex(C['steel-b']), k = layerCount > 1 ? l / (layerCount - 1) : 0; return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; };
const fillOf = p => isDriven(p) ? tone(p.layer) : C.idle;
function resize() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  W = sheet.clientWidth; H = sheet.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}

/* ---------- view ---------- */
function bandH() {
  if (viewMode === 'top') return 0; if (viewMode === 'side') return H;
  return Math.round(Math.max(96, Math.min(H * 0.45, (layerCount * LP + 26) * view.scale + 46)));
}
const topMid = () => { const b = bandH(); return b + (H - b) / 2; };
const baseY = () => bandH() - 26;
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / view.scale + view.cx, y: (sy - topMid()) / view.scale + view.cy });
function fit() {
  const vis = parts.filter(shown);
  if (!vis.length) { view.cx = view.cy = 0; view.scale = 3; return; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const box = (x, y, rx, ry) => { x0 = Math.min(x0, x - rx - 10); x1 = Math.max(x1, x + rx + 10); y0 = Math.min(y0, y - ry - 10); y1 = Math.max(y1, y + ry + 10); };
  for (const p of vis) {
    const c = Math.cos(p.dir || 0), s = Math.sin(p.dir || 0), b = boxOf(p), r = tipR(p), e = reach(p);
    if (b) box(p.x, p.y, Math.abs(c) * b[0] + Math.abs(s) * b[1], Math.abs(s) * b[0] + Math.abs(c) * b[1]);
    else { box(p.x, p.y, r, r); if (e) box(p.x + c * e, p.y + s * e, 8, 8); }
  }
  view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
  const sx = W / (x1 - x0);
  if (viewMode === 'side') view.scale = Math.min(sx, (H - 80) / (layerCount * LP + 30));
  else view.scale = Math.min(sx, (viewMode === 'top' ? H - 30 : H * 0.56) / (y1 - y0));
  view.scale = Math.max(0.5, Math.min(7, view.scale));
}
function zoomAt(sx, sy, f) {
  const side = sy < bandH(), w = toWorld(sx, sy);
  view.scale = Math.max(0.5, Math.min(12, view.scale * f));
  view.cx = w.x - (sx - W / 2) / view.scale;
  if (!side) view.cy = w.y - (sy - topMid()) / view.scale;
}

/* ---------- shared pieces ---------- */
const CHAINLINE = s => [9 / s, 3 / s, 1.5 / s, 3 / s];
function gridX(s, x0, x1, y0, y1, step, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 1 / s; ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  ctx.stroke();
}
/* A bevel gear whose axis lies in the layer, as a short cone around that axis. P projects (x, y, z) to the view;
   face(a) says whether the tooth at angle a around the axis is on the side the viewer sees. */
function cone(p, s, P, face, endVis, zax, fill, ink) {
  const r = M * p.z / 2, c = Math.cos(p.dir), sn = Math.sin(p.dir), pa = angle(p), f = Math.min(7, r * 0.6);
  const pt = (sd, rho, a) => P(p.x + c * sd - sn * rho * Math.cos(a), p.y + sn * sd + c * rho * Math.cos(a), zax + rho * Math.sin(a));
  const line = (A, B, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); };
  ctx.strokeStyle = C.shaft; ctx.lineCap = 'butt'; line(pt(0, 0, 0), pt(12, 0, 0), 4.4);
  const pts = [], n = 28;
  for (let i = 0; i < n; i++) { const a = TAU * i / n; pts.push(pt(-f, r * 0.66, a), pt(0, r, a), pt(3, r * 0.9, a)); }
  const h = hull(pts);
  ctx.beginPath(); h.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath();
  for (let j = 0; j < p.z; j++) { const a = pa + TAU * j / p.z; if (face(a)) { const A = pt(-f, r * 0.66, a), B = pt(0, r, a); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } }
  ctx.lineWidth = 0.8 / s; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
  if (endVis) {
    ctx.beginPath(); for (let i = 0; i < n; i++) { const q = pt(3, r * 0.9, TAU * i / n); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.2 / s; ctx.stroke();
    const A = pt(3, 2.4, pa), B = pt(3, r * 0.75, pa); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  }
}
function drawLinkTop(L) {
  const R = L.route; if (!R) return;
  if (schemeMode) return schemeLink(L, view.scale);
  ctx.save(); ctx.lineJoin = 'round';
  if (L.kind === 'belt') {
    const pp = R.L / Math.max(1, Math.round(R.L / 9));
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.stroke(R.path);
    ctx.strokeStyle = C.paper; ctx.globalAlpha = 0.65; ctx.lineWidth = 1.1; ctx.setLineDash([pp * 0.3, pp * 0.7]); ctx.lineDashOffset = -mod(linkPos(L), pp); ctx.stroke(R.path);
  } else {
    const pp = R.L / Math.max(1, Math.round(R.L / CP));
    ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 3.8; ctx.stroke(R.path);
    ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineWidth = 3.2; ctx.setLineDash([0.01, pp - 0.01]); ctx.lineDashOffset = -mod(linkPos(L), 1) * pp; ctx.stroke(R.path);
    ctx.strokeStyle = C.paper; ctx.lineWidth = 1.2; ctx.stroke(R.path);
  }
  ctx.restore();
}

/* ---------- top view ---------- */
function drawTop(dpr, s, bh) {
  const mid = bh + (H - bh) / 2;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.rect(0, bh, W, H - bh); ctx.clip();
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - view.cx * s), dpr * (mid - view.cy * s));
  const a = toWorld(0, bh), b = toWorld(W, H);
  const rows = (step, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1 / s; ctx.beginPath(); for (let y = Math.ceil(a.y / step) * step; y <= b.y; y += step) { ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); } ctx.stroke(); };
  if (s * 10 >= 7) { gridX(s, a.x, b.x, a.y, b.y, 10, C.grid); rows(10, C.grid); }
  gridX(s, a.x, b.x, a.y, b.y, 50, C['grid-major']); rows(50, C['grid-major']);
  const shadow = on => { if (on) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10 * dpr; ctx.shadowOffsetY = 3 * dpr; } else ctx.shadowColor = 'transparent'; };
  const gearAt = (x, y, ang, path, fill, ink, lw, sh) => { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); shadow(sh); ctx.fillStyle = fill; ctx.fill(path, 'evenodd'); shadow(false); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(path); ctx.restore(); };
  const detail = (x, y, ang, path, ink) => { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = ink; ctx.lineWidth = 0.8 / s; ctx.globalAlpha = 0.6; ctx.stroke(path); ctx.restore(); };
  const dot = (x, y, r, f) => { ctx.fillStyle = f; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const part = g => {
    if (isLink(g)) { tmmDraw(g, s); return; }       // links of mechanisms are always scheme symbols
    if (isHyd(g)) { hydDraw(g, s); return; }        // and so are hydraulic parts
    if (ioDraw(g, s)) return;
    if (schemeMode && schemePart(g, s)) return;   // kinematic-scheme symbol instead of the drawn shape
    const bad = collide.has(g.id), ink = bad ? C.jam : C.ink, lw = (bad ? 2 : 1.2) / s, fill = fillOf(g), sh = g.layer > 0, main = g.motor ? C.brass : fill, an = angle(g);
    // draw in the part's own frame: origin at its centre, x axis along its direction
    const local = fn => { ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.dir || 0); ctx.lineJoin = 'round'; fn(); ctx.restore(); };
    const box = (x, y, w, h, f) => { ctx.fillStyle = f; ctx.fillRect(x, y, w, h); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); };
    switch (g.type) {
      case 'rack': {
        const L = rackLen(g), o = mod(an, PM), yr = -1.25 * M, yb = yr - RB, p = new Path2D();
        p.moveTo(-L / 2 - PM, yb); p.lineTo(-L / 2 - PM, yr);
        for (let c = o - PM * Math.ceil((L / 2 + PM) / PM); c < L / 2 + PM; c += PM) { p.lineTo(c - 2.48, yr); p.lineTo(c - 0.84, M); p.lineTo(c + 0.84, M); p.lineTo(c + 2.48, yr); }
        p.lineTo(L / 2 + PM, yr); p.lineTo(L / 2 + PM, yb); p.closePath();
        local(() => {
          ctx.save(); ctx.beginPath(); ctx.rect(-L / 2, yb - 1, L, RB + 2.25 * M + 2); ctx.clip();
          ctx.fillStyle = fill; ctx.fill(p); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke(p); ctx.restore();
          ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(-L / 2, yb); ctx.lineTo(-L / 2, yr); ctx.moveTo(L / 2, yb); ctx.lineTo(L / 2, yr); ctx.stroke();
          ctx.fillStyle = C.shaft; ctx.fillRect(-L / 2 - 2, yb - 2.5, 8, 5); ctx.fillRect(L / 2 - 6, yb - 2.5, 8, 5);
          ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8 / s; ctx.setLineDash(CHAINLINE(s)); ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
        });
        return;
      }
      case 'worm': { // threaded cylinder on its own short shaft
        const sl = 1.1 * g.zw, o = wormRidge(g);
        local(() => {
          ctx.fillStyle = C.shaft; ctx.fillRect(-WL / 2 - 9, -2.2, WL + 18, 4.4); ctx.fillRect(-WL / 2 - 9, -4, 4, 8); ctx.fillRect(WL / 2 + 5, -4, 4, 8);
          shadow(sh); ctx.fillStyle = main; ctx.fillRect(-WL / 2, -WO, WL, 2 * WO); shadow(false);
          ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.strokeRect(-WL / 2, -WO, WL, 2 * WO);
          ctx.beginPath(); ctx.rect(-WL / 2, -WO, WL, 2 * WO); ctx.clip();
          ctx.beginPath(); for (let j = -4; j <= 4; j++) { const c = o + j * PM; ctx.moveTo(c - sl, -WO); ctx.lineTo(c + sl, WO); }
          ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7; ctx.stroke();
        });
        return;
      }
      case 'hshaft': { // a shaft lying in the layer, with a bearing block at each end
        const o = mod(an * 6 / TAU, 1) * 6;
        local(() => {
          ctx.fillStyle = C.shaft; ctx.fillRect(-g.len / 2 - 2, -5, 5, 10); ctx.fillRect(g.len / 2 - 3, -5, 5, 10);
          box(-g.len / 2, -2.4, g.len, 4.8, g.motor ? C.brass : isDriven(g) ? C.shaft : C.idle);
          ctx.save(); ctx.beginPath(); ctx.rect(-g.len / 2, -2.4, g.len, 4.8); ctx.clip(); ctx.strokeStyle = C.paper; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.7; ctx.beginPath();
          for (let x = -g.len / 2 - 6 + o; x < g.len / 2; x += 6) { ctx.moveTo(x, -2.4); ctx.lineTo(x + 2.4, 2.4); } ctx.stroke(); ctx.restore();
        });
        return;
      }
      case 'hbevel': cone(g, s, (x, y) => [x, y], a => Math.sin(a) > 0, false, 0, main, ink); return;
      case 'shaft': return;
    }
    switch (g.type) {
      case 'spur': gearAt(g.x, g.y, an, spurPath(g.z), main, ink, lw, sh); break;
      case 'ring': gearAt(g.x, g.y, an, ringPath(g.z), main, ink, lw, sh); break;
      case 'bevel': { const bp = bevelPath(g.z); gearAt(g.x, g.y, an, bp.fill, main, ink, lw, sh); detail(g.x, g.y, an, bp.lines, ink); break; }
      case 'pulley': { const pp = pulleyPath(g.d); gearAt(g.x, g.y, an, pp.fill, main, ink, lw, sh); detail(g.x, g.y, 0, pp.lines, ink); break; }
      case 'fric': { const fp = discPath(g.d / 2, 4, 0); gearAt(g.x, g.y, an, fp.fill, main, ink, lw, sh); ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(g.x, g.y, g.d / 2 - 1.1, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; break; }
      case 'sprocket': gearAt(g.x, g.y, an, sprocketPath(g.z), main, ink, lw, sh); break;
      case 'flywheel': gearAt(g.x, g.y, an, flywheelPath(g.d), main, ink, lw, sh); break;
      case 'emotor': { // stator with the motor letter, rotor turning inside
        const r = g.d / 2;
        ctx.save(); shadow(sh); ctx.fillStyle = C.brass; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill(); shadow(false); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
        gearAt(g.x, g.y, an, discPath(Math.round(r * 0.55)).fill, fill, ink, lw, false);
        ctx.fillStyle = ink; ctx.font = `600 ${r * 0.36}px ${C.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', g.x, g.y - r * 0.77);
        break;
      }
      case 'machine': { // a plain box: whatever machine takes the power
        const r = g.d / 2;
        ctx.save(); shadow(sh); ctx.fillStyle = fill; ctx.fillRect(g.x - r, g.y - r, 2 * r, 2 * r); shadow(false); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.strokeRect(g.x - r, g.y - r, 2 * r, 2 * r); ctx.restore();
        gearAt(g.x, g.y, an, discPath(Math.round(r * 0.4)).fill, fill, ink, lw, false);
        break;
      }
      case 'carrier': { // hub, arms and pins; gears dropped on a pin ride with it
        ctx.save(); ctx.lineCap = 'round'; shadow(sh);
        for (const pass of [[9, ink], [9 - 2 * lw, main]]) { ctx.strokeStyle = pass[1]; ctx.lineWidth = pass[0]; ctx.beginPath(); for (let k = 0; k < g.n; k++) { const q = pinPos(g, k); ctx.moveTo(g.x, g.y); ctx.lineTo(q.x, q.y); } ctx.stroke(); shadow(false); }
        ctx.restore();
        gearAt(g.x, g.y, an, discPath(HUB).fill, main, ink, lw, false);
        break;
      }
      case 'diff': { // housing with its cross pin and two pinions; the upper side gear sits in the middle
        const ri = RO(g) - 3.2 * M - 1.5, sg = discPath(Math.round(ri * 0.44), 0, 12, 0.55);
        dot(g.x, g.y, ri, C.idle);
        gearAt(g.x, g.y, an, diffPath(g.z), main, ink, lw, sh);
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(an);
        ctx.strokeStyle = C.shaft; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-ri, 0); ctx.lineTo(ri, 0); ctx.stroke();
        for (const sd of [-1, 1]) box(sd * ri * 0.7 - 3.5, -5, 7, 10, fill);
        ctx.restore();
        gearAt(g.x, g.y, angle(g.b), sg.fill, fill, ink, lw, false); detail(g.x, g.y, angle(g.b), sg.lines, ink);
        break;
      }
      case 'crank': { // crank disc, connecting rod, piston in its cylinder
        const r = g.r, l = rodL(g), al = an - g.dir, x = pistonX(g);
        local(() => {
          ctx.fillStyle = C.idle; ctx.fillRect(l - r - 5, -8, 2 * r + 18, 16);
          ctx.strokeStyle = ink; ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.moveTo(l - r - 5, -8); ctx.lineTo(l + r + 13, -8); ctx.lineTo(l + r + 13, 8); ctx.lineTo(l - r - 5, 8); ctx.stroke();
          box(x - 4, -7, 12, 14, fill); ctx.beginPath(); ctx.moveTo(x + 5, -7); ctx.lineTo(x + 5, 7); ctx.stroke();
        });
        gearAt(g.x, g.y, an, discPath(r + 4).fill, main, ink, lw, sh);
        local(() => {
          ctx.strokeStyle = C.shaft; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(r * Math.cos(al), r * Math.sin(al)); ctx.lineTo(x, 0); ctx.stroke();
          dot(r * Math.cos(al), r * Math.sin(al), 2.2, ink); dot(x, 0, 2, ink);
        });
        break;
      }
      case 'cam': { // cam and a follower in a fixed guide
        const tp = CB + camLift(g.h, g.dir - an), len = g.h + 26;
        local(() => { ctx.fillStyle = C.shaft; ctx.fillRect(CB + g.h + 10, -5.5, 8, 11); box(tp, -2, len, 4, fill); dot(tp + 1.2, 0, 2.6, ink); });
        gearAt(g.x, g.y, an, camPath(g.h), main, ink, lw, sh);
        break;
      }
      case 'geneva': { // driver disc with its pin, and the slotted wheel it indexes
        const c = gvc(g);
        gearAt(g.x, g.y, an, discPath(GA + 3).fill, main, ink, lw, sh);
        ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(g.x, g.y, GA - 3.5, 0, TAU); ctx.stroke();
        gearAt(g.x + c * Math.cos(g.dir), g.y + c * Math.sin(g.dir), genevaPsi(g), genevaPath(g.z), fill, ink, lw, sh);
        dot(g.x + GA * Math.cos(an), g.y + GA * Math.sin(an), 1.9, ink);
        break;
      }
      case 'ratchet': { // sawtooth wheel and a pawl that rides over the teeth
        const s2 = g.on ? 1 : -1, ra = RO(g), tp = -Math.PI / 4, rt = ratchetR(g, tp - an), pv = tp - s2 * 0.55;
        gearAt(g.x, g.y, an, ratchetPath(g.z, s2), main, ink, lw, sh);
        const px = g.x + (ra + 5) * Math.cos(pv), py = g.y + (ra + 5) * Math.sin(pv);
        ctx.strokeStyle = C.shaft; ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(g.x + rt * Math.cos(tp), g.y + rt * Math.sin(tp)); ctx.stroke(); ctx.lineCap = 'butt';
        dot(px, py, 2.4, ink);
        break;
      }
      case 'clutch': { // lower plate turns with the shaft below, upper plate with the shaft above
        const r = g.d / 2, lo = discPath(r, 0, 12, 0.72), up = discPath(Math.max(4, r - 4), 3);
        gearAt(g.x, g.y, an, lo.fill, main, ink, lw, sh); detail(g.x, g.y, an, lo.lines, ink);
        if (!g.on) ctx.setLineDash([3, 2]);
        gearAt(g.x, g.y, angle(g.o), up.fill, g.o.w ? tone(g.layer) : C.idle, ink, lw, false); ctx.setLineDash([]);
        break;
      }
      case 'brake': { // disc and a fixed caliper
        const r = g.d / 2;
        gearAt(g.x, g.y, an, discPath(r, 6).fill, main, ink, lw, sh);
        box(g.x - 6, g.y - r - 3.5, 12, 11, g.on ? C.jam : C.idle);
        break;
      }
    }
    if (g.held) { ctx.strokeStyle = C.jam; ctx.lineWidth = 2 / s; ctx.setLineDash([4 / s, 3 / s]); ctx.beginPath(); ctx.arc(g.x, g.y, tipR(g) + 1.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    if (kind(g) === 'gear' || ty(g, 'bevel', 'sprocket')) { // pitch circle as a chain line, the way a drawing shows it
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8 / s; ctx.setLineDash(CHAINLINE(s));
      ctx.beginPath(); ctx.arc(g.x, g.y, RO(g), 0, TAU); if (g.type === 'ring') { ctx.moveTo(g.x + RI(g), g.y); ctx.arc(g.x, g.y, RI(g), 0, TAU); } ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  };
  const layerParts = l => {
    for (const g of parts) if (g.layer === l && !isShaft(g)) part(g);
    for (const L of links) { const w = byId(L.ids[0]); if (w && w.layer === l) drawLinkTop(L); }
    pipesDraw(l, s);
    for (const g of parts) if (g.layer === l && g.type === 'hcyl') hydPorts(g, s);
  };
  // layers other than the active one are painted on a second canvas and laid over as one faded sheet
  const faded = ls => {
    ls = ls.filter(layerShown); if (!ls.length) return;
    if (ghost.width !== cv.width || ghost.height !== cv.height) { ghost.width = cv.width; ghost.height = cv.height; }
    const tf = mainCtx.getTransform(); ghostCtx.setTransform(1, 0, 0, 1, 0, 0); ghostCtx.clearRect(0, 0, ghost.width, ghost.height); ghostCtx.setTransform(tf);
    ctx = ghostCtx; try { ls.forEach(layerParts); } finally { ctx = mainCtx; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = FADE; ctx.drawImage(ghost, 0, 0); ctx.restore();
  };
  const all = [...Array(layerCount).keys()];
  faded(all.filter(l => l < activeLayer)); if (layerShown(activeLayer)) layerParts(activeLayer); faded(all.filter(l => l > activeLayer));
  // shafts and carrier pins poke through everything above them
  for (const g of parts) {
    if (!shown(g)) continue;
    ctx.globalAlpha = onActive(g) ? 1 : FADE;
    if (g.type === 'carrier') for (let k = 0; k < g.n; k++) { const q = pinPos(g, k); dot(q.x, q.y, 2.6, C.shaft); dot(q.x, q.y, 1.1, C.paper); }
    if (isShaft(g)) {
      const an = angle(g); dot(g.x, g.y, 3, g.motor ? C.brass : collide.has(g.id) ? C.jam : C.shaft);
      ctx.strokeStyle = C.paper; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + 3 * Math.cos(an), g.y + 3 * Math.sin(an)); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (showDims) { // centre distances of every mesh
    ctx.save(); ctx.strokeStyle = C.select; ctx.fillStyle = C.select; ctx.lineWidth = 1 / s;
    for (const m of meshes) if (shown(m.a) && shown(m.b) && isVert(m.a)) { ctx.beginPath(); ctx.moveTo(m.a.x, m.a.y); ctx.lineTo(m.b.x, m.b.y); ctx.stroke(); dot(m.a.x, m.a.y, 1.2, C.select); dot(m.b.x, m.b.y, 1.2, C.select); }
    ctx.restore();
  }
  for (const g of selParts()) {
    ctx.strokeStyle = C.select; ctx.lineWidth = 2 / s;
    const b = boxOf(g);
    if (isLink(g)) { tmmOutline(g); tmmDrawPath(g, s); continue; }
    if (b) { ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.dir); const y0 = g.type === 'rack' ? -1.25 * M - RB - 2 : -b[1] - 2, hh = g.type === 'rack' ? RB + 2.25 * M + 4 : 2 * b[1] + 4, x0 = g.type === 'hbevel' ? -9 : -b[0] - 2, ww = g.type === 'hbevel' ? 24 : 2 * b[0] + 4; ctx.strokeRect(x0, y0, ww, hh); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(g.x, g.y, tipR(g) + 1.6, 0, TAU); ctx.stroke(); }
  }
  /* labels and dimensions, in screen space */
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `500 12px ${C.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const text = (str, x, y, col) => { ctx.strokeStyle = C.paper; ctx.lineWidth = 4; ctx.strokeText(str, x, y); ctx.fillStyle = col; ctx.fillText(str, x, y); };
  const X = x => (x - view.cx) * s + W / 2, Y = y => (y - view.cy) * s + mid, out = outPart();
  for (const g of [...parts].sort((p, q) => p.layer - q.layer)) {
    if (!shown(g) || (isShaft(g) && !sel.has(g.id) && !g.motor) || g.mount) continue;
    const b = boxOf(g), off = (b ? b[1] : tipR(g)) * s + 13, n = b ? [-Math.sin(g.dir), Math.cos(g.dir)] : [0, 1];
    const up = b ? -1 : g.layer ? -1 : 1, sx = X(g.x) + n[0] * up * off, sy = Y(g.y) + n[1] * up * off + (b || !g.layer ? 0 : 8 - (g.layer - 1) * 14);
    const str = [g.label ? `${g.name} ${g.label}` : g.name, sizeText(g), showDims && diaText(g), speedText(g, true), g === out ? 'OUT' : g.motor ? 'M' : ''].filter(Boolean).join('  ');
    ctx.globalAlpha = onActive(g) ? 1 : 0.45;
    text(str, sx, sy, collide.has(g.id) ? C.jam : g.motor ? C.brass : g === out ? C.select : C.ink);
  }
  ctx.globalAlpha = 1;
  if (showDims) for (const m of meshes) if (shown(m.a) && shown(m.b) && isVert(m.a)) text(`a ${dist(m.a, m.b).toFixed(dist(m.a, m.b) % 1 ? 1 : 0)}`, X((m.a.x + m.b.x) / 2), Y((m.a.y + m.b.y) / 2), C.select);
  hydLegend(W - 136, bh + 30);
  if (boxSel) { ctx.strokeStyle = C.select; ctx.lineWidth = 1; ctx.setLineDash([5, 3]); ctx.strokeRect(boxSel.x0, boxSel.y0, boxSel.x1 - boxSel.x0, boxSel.y1 - boxSel.y0); ctx.setLineDash([]); ctx.globalAlpha = 0.08; ctx.fillStyle = C.select; ctx.fillRect(boxSel.x0, boxSel.y0, boxSel.x1 - boxSel.x0, boxSel.y1 - boxSel.y0); ctx.globalAlpha = 1; }
  ctx.restore();
}

/* ---------- side view ---------- */
function drawSide(dpr, s, bh) {
  const by = bh - 26;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.rect(0, 0, W, bh); ctx.clip();
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - view.cx * s), dpr * by); // world here is (x, -z)
  const x0 = view.cx - W / 2 / s, x1 = view.cx + W / 2 / s, yTop = -by / s;
  if (s * 10 >= 7) gridX(s, x0, x1, yTop, BASE, 10, C.grid);
  gridX(s, x0, x1, yTop, BASE, 50, C['grid-major']);
  ctx.strokeStyle = C.line; ctx.lineWidth = 0.8 / s; ctx.setLineDash(CHAINLINE(s)); ctx.beginPath();
  for (let l = 0; l < layerCount; l++) { ctx.moveTo(x0, -l * LP); ctx.lineTo(x1, -l * LP); } ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4 / s; ctx.beginPath(); ctx.moveTo(x0, BASE); ctx.lineTo(x1, BASE); ctx.stroke();
  ctx.lineWidth = 0.7 / s; ctx.globalAlpha = 0.5; ctx.beginPath();
  for (let x = Math.floor(x0 / 5) * 5; x <= x1; x += 5) { ctx.moveTo(x, BASE); ctx.lineTo(x - 3, BASE + 3); } ctx.stroke(); ctx.globalAlpha = 1;

  const rect = (x, r, z0, z1, fill, ink) => { ctx.fillStyle = fill; ctx.fillRect(x - r, -z1, 2 * r, z1 - z0); ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.strokeRect(x - r, -z1, 2 * r, z1 - z0); };
  const teeth = (x, r, z, ang, z0, z1, ink) => {
    ctx.beginPath(); for (let j = 0; j < z; j++) { const a = ang + TAU * j / z; if (Math.sin(a) > 0) { const X = x + r * Math.cos(a); ctx.moveTo(X, -z0); ctx.lineTo(X, -z1); } }
    ctx.strokeStyle = ink; ctx.lineWidth = 0.8 / s; ctx.globalAlpha *= 0.55; ctx.stroke(); ctx.globalAlpha /= 0.55;
  };
  const hatch = (xa, w, z0, z1, fill, ink) => { // a wall shown in section
    ctx.fillStyle = fill; ctx.fillRect(xa, -z1, w, z1 - z0);
    ctx.save(); ctx.beginPath(); ctx.rect(xa, -z1, w, z1 - z0); ctx.clip();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.7 / s; ctx.globalAlpha *= 0.6; ctx.beginPath();
    for (let k = -FW; k < w + FW; k += 2) { ctx.moveTo(xa + k, -z0); ctx.lineTo(xa + k + FW, -z1); } ctx.stroke(); ctx.restore();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.strokeRect(xa, -z1, w, z1 - z0);
  };
  const dim = l => { ctx.globalAlpha = !layerShown(l) ? 0.18 : l === activeLayer ? 1 : 0.5; };
  ctx.fillStyle = C.select; ctx.globalAlpha = 0.08; ctx.fillRect(x0, -(activeLayer * LP + FW + 4), x1 - x0, FW + 8); ctx.globalAlpha = 1;   // the active layer's band
  const order = [...parts].sort((p, q) => p.y - q.y || p.layer - q.layer);
  // shafts first: each runs through the layers it spans, in a bearing at both ends
  const bearing = (x, z) => { ctx.fillStyle = C.panel; ctx.strokeStyle = C.ink; ctx.lineWidth = 1 / s; for (const sd of [-1, 1]) { ctx.fillRect(x + sd * 4.6 - 1.8, -z - 1.6, 3.6, 3.2); ctx.strokeRect(x + sd * 4.6 - 1.8, -z - 1.6, 3.6, 3.2); } };
  const covered = p => parts.some(q => isShaft(q) && same(q, p) && covers(q, p.layer));
  for (const g of order) {
    if (isShaft(g)) {
      ctx.globalAlpha = !shown(g) ? 0.18 : onActive(g) ? 1 : 0.5;
      const z0 = g.l0 * LP - 3.5, z1 = g.l1 * LP + FW + 3.5, col = g.motor ? C.brass : collide.has(g.id) ? C.jam : g.w ? C.shaft : C.muted;
      ctx.fillStyle = col; ctx.fillRect(g.x - 2.4, -z1, 4.8, z1 - z0);
      const an = angle(g); ctx.strokeStyle = C.paper; ctx.lineWidth = 0.8; ctx.beginPath(); // a keyway line that sweeps across as the shaft turns
      if (Math.sin(an) > 0) { const kx = g.x + 2.4 * Math.cos(an); ctx.moveTo(kx, -z0); ctx.lineTo(kx, -z1); } ctx.stroke();
      bearing(g.x, z0 + 1.6); bearing(g.x, z1 - 1.6);
      if (sel.has(g.id)) { ctx.strokeStyle = C.select; ctx.lineWidth = 2 / s; ctx.strokeRect(g.x - 4, -z1 - 1, 8, z1 - z0 + 2); }
    } else if (isVert(g) && !g.mount && !covered(g)) { // a part with no shaft through it turns on its own stub axle
      dim(g.layer); const zb = g.layer * LP; ctx.fillStyle = C.muted; ctx.fillRect(g.x - 1.6, -(zb + FW + 2), 3.2, FW + 4);
    }
  }
  for (const g of order) if (g.type === 'carrier') { // pins reach every layer that has a gear on them
    const ls = parts.filter(q => q.mount && q.mount.c === g.id).map(q => q.layer), lo = Math.min(g.layer, ...ls), hi = Math.max(g.layer, ...ls);
    dim(g.layer); ctx.fillStyle = C.shaft;
    for (let k = 0; k < g.n; k++) { const q = pinPos(g, k); ctx.fillRect(q.x - 1.3, -(hi * LP + FW + 1.5), 2.6, (hi - lo) * LP + FW + 3); }
  }
  for (const g of order) {
    if (isShaft(g)) continue;
    dim(g.layer);
    if (isHyd(g) && !isLink(g)) { rect(g.x, g.type === 'hvalve' ? 18 : g.type === 'hnode' ? 2.5 : 9, g.layer * LP + 1.5, g.layer * LP + FW - 1.5, fillOf(g), C.ink); if (sel.has(g.id)) { ctx.strokeStyle = C.select; ctx.lineWidth = 2 / s; ctx.strokeRect(g.x - 11, -(g.layer * LP + FW), 22, FW); } continue; }
    if (IO_ROUND.includes(g.type)) { rect(g.x, g.d / 2, g.layer * LP, g.layer * LP + FW, g.motor ? C.brass : fillOf(g), C.ink); continue; }
    if (isLink(g)) { // a link is a thin plate over the span of its joints
      const xs = g.type === 'guide' ? [g.x - Math.abs(Math.cos(g.dir)) * g.len / 2, g.x + Math.abs(Math.cos(g.dir)) * g.len / 2] : jointsOf(g).map((_, k) => jointPos(g, k).x), lo = Math.min(...xs), hi = Math.max(...xs), hw = Math.max(SLIDES.includes(g.type) ? 8 : 2.5, (hi - lo) / 2);
      rect((lo + hi) / 2, hw, g.layer * LP + 3, g.layer * LP + FW - 3, g.type === 'pivot' || g.type === 'guide' ? C.muted : fillOf(g), C.ink);
      if (sel.has(g.id)) { ctx.strokeStyle = C.select; ctx.lineWidth = 2 / s; ctx.strokeRect((lo + hi) / 2 - hw - 1.5, -(g.layer * LP + FW - 1.5), 2 * hw + 3, FW - 3); }
      continue;
    }
    const zb = g.layer * LP, bad = collide.has(g.id), ink = bad ? C.jam : C.ink, fill = fillOf(g), main = g.motor ? C.brass : fill, an = angle(g);
    const c = Math.cos(g.dir || 0), ac = Math.abs(c), as = Math.abs(Math.sin(g.dir || 0)), zc = zb + FW / 2;
    switch (g.type) {
      case 'ring': { const ro = tipR(g), ri = RI(g) - M; hatch(g.x - ro, ro - ri, zb, zb + FW, main, ink); hatch(g.x + ri, ro - ri, zb, zb + FW, main, ink); ctx.strokeStyle = ink; ctx.lineWidth = 1 / s; ctx.beginPath(); ctx.moveTo(g.x - ri, -zb); ctx.lineTo(g.x + ri, -zb); ctx.stroke(); break; }
      case 'bevel': {
        const rg = RO(g);
        ctx.beginPath(); ctx.moveTo(g.x - rg, -zb); ctx.lineTo(g.x + rg, -zb); ctx.lineTo(g.x + rg, -(zb + 3)); ctx.lineTo(g.x + rg * 2 / 3, -(zb + 6)); ctx.lineTo(g.x - rg * 2 / 3, -(zb + 6)); ctx.lineTo(g.x - rg, -(zb + 3)); ctx.closePath();
        ctx.fillStyle = main; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.2 / s; ctx.stroke(); ctx.beginPath();
        for (let j = 0; j < g.z; j++) { const a = an + TAU * j / g.z; if (Math.sin(a) > 0) { const k = Math.cos(a); ctx.moveTo(g.x + rg * k, -(zb + 3)); ctx.lineTo(g.x + rg * 2 / 3 * k, -(zb + 6)); } }
        ctx.lineWidth = 0.8 / s; ctx.globalAlpha *= 0.55; ctx.stroke(); break;
      }
      case 'hbevel': cone(g, s, (x, y, z) => [x, -z], a => c * Math.cos(a) > 0 || as > 0.7, Math.sin(g.dir) > 0.05, zb + 3 + M * g.z / 2, main, ink); break;
      case 'worm': case 'hshaft': {
        const len = g.type === 'worm' ? WL : g.len, r = g.type === 'worm' ? WO : 2.4, hx = ac * len / 2 + as * r;
        if (g.type === 'worm') { ctx.fillStyle = C.shaft; ctx.fillRect(g.x - hx - 8 * ac, -(zc + 2.2), 2 * hx + 16 * ac, 4.4); }
        rect(g.x, hx, zc - r, zc + r, g.type === 'worm' ? main : g.motor ? C.brass : g.w ? C.shaft : C.idle, ink);
        if (g.type === 'worm' && ac > 0.3) {
          const o = wormRidge(g); ctx.beginPath();
          for (let j = -4; j <= 4; j++) { const a = o + j * PM; if (Math.abs(a) < WL / 2) { ctx.moveTo(g.x + c * a, -(zc - WO)); ctx.lineTo(g.x + c * a, -(zc + WO)); } }
          ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.globalAlpha *= 0.6; ctx.stroke();
        }
        break;
      }
      case 'rack': rect(g.x, halfW(g), zb + 1, zb + FW - 1, fill, ink); break;
      case 'emotor': rect(g.x, g.d / 2, zb, zb + FW, C.brass, ink); break;
      case 'machine': rect(g.x, g.d / 2, zb, zb + FW, fill, ink); break;
      case 'pulley': case 'fric': {
        const r = g.d / 2, e = g.type === 'pulley' ? 1.5 : 0;
        rect(g.x, r + e, zb, zb + FW, main, ink); teeth(g.x, r, 6, an, zb + 1.5, zb + FW - 1.5, ink);
        if (e) { ctx.beginPath(); for (const z of [zb + 1.5, zb + FW - 1.5]) { ctx.moveTo(g.x - r - e, -z); ctx.lineTo(g.x + r + e, -z); } ctx.stroke(); }
        break;
      }
      case 'sprocket': rect(g.x, 5, zb + 1, zb + FW - 1, main, ink); rect(g.x, tipR(g), zb + 3.5, zb + 6.5, main, ink); teeth(g.x, tipR(g), g.z, an, zb + 3.5, zb + 6.5, ink); break;
      case 'carrier': rect(g.x, g.r + 4, zb + 3, zb + 7, main, ink); rect(g.x, HUB, zb + 1, zb + FW - 1, main, ink); break;
      case 'diff': { // housing in section, side gears top and bottom, pinions on the cross pin
        const ro = tipR(g), ri = RO(g) - 3.2 * M - 1.5, ca = Math.cos(an);
        ctx.fillStyle = C.idle; ctx.fillRect(g.x - ri, -(zb + FW), 2 * ri, FW);
        rect(g.x, ri * 0.44, zb + 0.8, zb + 3.4, fill, ink); rect(g.x, ri * 0.44, zb + FW - 3.4, zb + FW - 0.8, fill, ink);
        ctx.fillStyle = C.shaft; ctx.fillRect(g.x - ri * Math.abs(ca), -(zc + 0.8), 2 * ri * Math.abs(ca), 1.6);
        for (const sd of [-1, 1]) rect(g.x + sd * ri * 0.7 * ca, 2.4, zb + 3, zb + FW - 3, fill, ink);
        hatch(g.x - ro, ro - ri, zb, zb + FW, main, ink); hatch(g.x + ri, ro - ri, zb, zb + FW, main, ink);
        break;
      }
      case 'crank': {
        const l = rodL(g), x = pistonX(g);
        rect(g.x + c * (l + 4), ac * (g.r + 9) + as * 8, zb, zb + FW, C.idle, ink);
        rect(g.x + c * (x + 2), ac * 6 + as * 7, zb + 1, zb + FW - 1, fill, ink);
        ctx.strokeStyle = C.shaft; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(g.x + g.r * Math.cos(an), -zc); ctx.lineTo(g.x + c * x, -zc); ctx.stroke();
        rect(g.x, g.r + 4, zb + 2, zb + FW - 2, main, ink);
        break;
      }
      case 'cam': { const tp = CB + camLift(g.h, g.dir - an), len = g.h + 26; rect(g.x + c * (tp + len / 2), ac * len / 2 + as * 2, zb + 3.5, zb + 6.5, fill, ink); rect(g.x, CB + g.h / 2, zb + 2, zb + FW - 2, main, ink); break; }
      case 'geneva': rect(g.x + c * gvc(g), gvb(g), zb + 4.5, zb + 8.5, fill, ink); rect(g.x, GA + 3, zb + 0.5, zb + 4, main, ink); break;
      case 'clutch': {
        const r = g.d / 2, r2 = Math.max(4, r - 4), lift = g.on ? 0 : 1.6;
        rect(g.x, r, zb + 1, zb + 4.6, main, ink); teeth(g.x, r, 12, an, zb + 1, zb + 4.6, ink);
        rect(g.x, r2, zb + 4.6 + lift, zb + 8.2 + lift, g.o.w ? tone(g.layer) : C.idle, ink); teeth(g.x, r2, 3, angle(g.o), zb + 4.6 + lift, zb + 8.2 + lift, ink);
        break;
      }
      case 'brake': rect(g.x, g.d / 2, zb + 3.5, zb + 6.5, main, ink); teeth(g.x, g.d / 2, 6, an, zb + 3.5, zb + 6.5, ink); rect(g.x, 4, zb + 1.5, zb + 3.5, g.on ? C.jam : C.idle, ink); rect(g.x, 4, zb + 6.5, zb + 8.5, g.on ? C.jam : C.idle, ink); break;
      default: rect(g.x, tipR(g), zb, zb + FW, main, ink); teeth(g.x, tipR(g), ty(g, 'flywheel') ? 6 : g.z, an, zb, zb + FW, ink);
    }
    dim(g.layer);
    if (sel.has(g.id)) { const r = halfW(g) + 1.5; ctx.strokeStyle = C.select; ctx.lineWidth = 2 / s; ctx.strokeRect(g.x - r, -(zb + FW + 1.5), 2 * r, FW + 3); }
  }
  for (const L of links) { // belts and chains seen edge-on
    const ws = L.ids.map(byId); if (!L.route || !ws[0]) continue;
    dim(ws[0].layer);
    const zb = ws[0].layer * LP, xa = Math.min(...ws.map(w => w.x - RO(w))), xb = Math.max(...ws.map(w => w.x + RO(w))), belt = L.kind === 'belt';
    const z0 = belt ? zb + 2.2 : zb + 3.2, z1 = belt ? zb + FW - 2.2 : zb + 6.8;
    ctx.fillStyle = C.ink; ctx.globalAlpha *= belt ? 0.85 : 0.5; ctx.fillRect(xa, -z1, xb - xa, z1 - z0);
  }
  ctx.globalAlpha = 1; pipesSide(s);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `500 12px ${C.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let l = 0; l < layerCount; l++) { const y = by - (l * LP + FW / 2) * s; ctx.strokeStyle = C.paper; ctx.lineWidth = 4; const lb = layerLabel(l) + (lockedLayers.has(l) ? ' ⊘' : ''); ctx.strokeText(lb, 10, y); ctx.fillStyle = l === activeLayer ? C.select : C.muted; ctx.fillText(lb, 10, y); }
  ctx.restore();
}

function draw(ts) {
  const dpr = cv.width / W, s = view.scale, bh = bandH();
  jit = lockMsg && running ? 0.0005 * Math.sin(ts * 0.035) : 0; // a jammed train shivers instead of turning
  if (jit) place();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  if (bh > 0) drawSide(dpr, s, bh);
  if (bh < H) drawTop(dpr, s, bh);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (bh > 0 && bh < H) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, bh); ctx.lineTo(W, bh); ctx.stroke(); }
  ctx.font = `500 11px ${C.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.muted;
  if (bh > 0) ctx.fillText(t('view.sideCap'), W - 10, 16);
  if (bh < H) ctx.fillText(t('view.topCap'), W - 10, bh + 16);
  jit = 0;
}
