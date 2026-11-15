/* Gear Bench — the top view drawn somewhere other than the screen: into a small canvas (icons, previews, PNG export)
   or into SVG text. The drawing code itself is draw.js and scheme.js, untouched: it paints into whatever `ctx` names. */
'use strict';

/* Run fn with the top view set up for a target w × h pixels wide. Everything the drawing reads from globals is put back after. */
function withTarget(target, w, h, mode, fn) {
  const keep = { W, H, ctx, viewMode, drawFor, cx: view.cx, cy: view.cy, scale: view.scale };
  W = w; H = h; ctx = target; viewMode = 'top'; drawFor = mode;
  try { return fn(); } finally { W = keep.W; H = keep.H; ctx = keep.ctx; viewMode = keep.viewMode; drawFor = keep.drawFor; view.cx = keep.cx; view.cy = keep.cy; view.scale = keep.scale; }
}
// the top view as a canvas: w × h CSS pixels at `px` device pixels each. refit: frame all the parts instead of keeping the screen's view
function snapshot(w, h, px = 2, mode = 'export', refit = true) {
  const c = document.createElement('canvas'); c.width = Math.round(w * px); c.height = Math.round(h * px);
  const g = c.getContext('2d');
  withTarget(g, w, h, mode, () => {
    if (refit) { fit(); if (mode === 'icon') view.scale = w < 100 ? Math.min(view.scale * 1.12, 12) : view.scale * 0.86; }
    g.setTransform(px, 0, 0, px, 0, 0); if (mode !== 'icon') { g.fillStyle = C.paper; g.fillRect(0, 0, w, h); }
    drawTop(px, view.scale, 0);
  });
  return c;
}

/* ---------- SVG ----------
   A stand-in for CanvasRenderingContext2D that writes SVG. It covers what the drawing code uses: paths (lines, arcs, quadratic
   curves, rectangles), Path2D outlines built through RecPath, fills and strokes with dashes, text with a halo, clipping,
   transparency, one linear gradient. Every transform in the drawing is a move, a turn and an even scale, so points are written
   already transformed and line widths are scaled with them. Shadows are left out. */
class SvgCtx {
  constructor(w, h) {
    this.w = w; this.h = h; this.out = []; this.defs = []; this.m = [1, 0, 0, 1, 0, 0]; this.stack = []; this.d = ''; this.has = false; this.open = 0; this.ids = 0;
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.globalAlpha = 1; this.lineJoin = 'miter'; this.lineCap = 'butt'; this.dash = []; this.lineDashOffset = 0;
    this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.shadowColor = ''; this.shadowBlur = 0; this.shadowOffsetY = 0;
    this.meter = document.createElement('canvas').getContext('2d'); this.canvas = { width: w, height: h };
  }
  /* state */
  save() { this.stack.push({ m: this.m.slice(), open: this.open, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, lineJoin: this.lineJoin, lineCap: this.lineCap, dash: this.dash.slice(), lineDashOffset: this.lineDashOffset, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline }); }
  restore() { const s = this.stack.pop(); if (!s) return; while (this.open > s.open) { this.out.push('</g>'); this.open--; } Object.assign(this, s); }
  setTransform(a, b, c, d, e, f) { this.m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; }
  getTransform() { const [a, b, c, d, e, f] = this.m; return { a, b, c, d, e, f }; }
  transform(a, b, c, d, e, f) { const m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  rotate(t) { const c = Math.cos(t), s = Math.sin(t); this.transform(c, s, -s, c, 0, 0); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  setLineDash(a) { this.dash = a.slice(); }
  /* geometry */
  get k() { return Math.hypot(this.m[0], this.m[1]); }
  get rot() { return Math.atan2(this.m[1], this.m[0]); }
  pt(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  n(v) { return +v.toFixed(2); }
  P(x, y) { const p = this.pt(x, y); return `${this.n(p[0])} ${this.n(p[1])}`; }
  beginPath() { this.d = ''; this.has = false; }
  moveTo(x, y) { this.d += `M${this.P(x, y)}`; this.has = true; }
  lineTo(x, y) { this.d += `${this.has ? 'L' : 'M'}${this.P(x, y)}`; this.has = true; }
  closePath() { if (this.has) this.d += 'Z'; }
  rect(x, y, w, h) { this.d += `M${this.P(x, y)}L${this.P(x + w, y)}L${this.P(x + w, y + h)}L${this.P(x, y + h)}Z`; this.has = true; }
  quadraticCurveTo(cx, cy, x, y) { this.d += `Q${this.P(cx, cy)} ${this.P(x, y)}`; this.has = true; }
  arc(x, y, r, a0, a1, ccw) { this.d += this.arcD(x, y, r, a0, a1, ccw, this.has); this.has = true; }
  arcD(x, y, r, a0, a1, ccw, joined) {
    const TAU2 = 2 * Math.PI; let sweep = ccw ? a0 - a1 : a1 - a0;
    if (Math.abs(sweep) >= TAU2 - 1e-9) sweep = TAU2; else { sweep = ((sweep % TAU2) + TAU2) % TAU2; }
    const dir = ccw ? -1 : 1, R = this.n(r * this.k), at = a => this.P(x + r * Math.cos(a), y + r * Math.sin(a)); let s = `${joined ? 'L' : 'M'}${at(a0)}`;
    const steps = sweep > Math.PI * 1.999 ? 2 : 1;
    for (let i = 1; i <= steps; i++) { const part = sweep / steps, a = a0 + dir * part * i; s += `A${R} ${R} 0 ${part > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${at(a)}`; }
    return s;
  }
  pathD(p) { let s = '', has = false; for (const c of p.cmd || []) { if (c[0] === 'M') { s += `M${this.P(c[1], c[2])}`; has = true; } else if (c[0] === 'L') { s += `${has ? 'L' : 'M'}${this.P(c[1], c[2])}`; has = true; } else if (c[0] === 'A') { s += this.arcD(c[1], c[2], c[3], c[4], c[5], c[6], has); has = true; } else if (has) s += 'Z'; } return s; }
  /* painting */
  paint(v) { return v && typeof v === 'object' ? `url(#${v.id})` : v; }
  alpha() { return this.globalAlpha < 0.999 ? ` opacity="${this.n(this.globalAlpha)}"` : ''; }
  fill(a, b) { const path = a && typeof a === 'object' ? a : null, rule = path ? b : a, d = path ? this.pathD(path) : this.d; if (d) this.out.push(`<path d="${d}" fill="${this.paint(this.fillStyle)}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${this.alpha()}/>`); }
  stroke(path) {
    const d = path ? this.pathD(path) : this.d; if (!d) return; const k = this.k, dash = this.dash.length ? ` stroke-dasharray="${this.dash.map(v => this.n(v * k)).join(' ')}"${this.lineDashOffset ? ` stroke-dashoffset="${this.n(this.lineDashOffset * k)}"` : ''}` : '';
    this.out.push(`<path d="${d}" fill="none" stroke="${this.paint(this.strokeStyle)}" stroke-width="${this.n(this.lineWidth * k)}"${this.lineJoin !== 'miter' ? ` stroke-linejoin="${this.lineJoin}"` : ''}${this.lineCap !== 'butt' ? ` stroke-linecap="${this.lineCap}"` : ''}${dash}${this.alpha()}/>`);
  }
  fillRect(x, y, w, h) { const d = this.d, has = this.has; this.d = ''; this.has = false; this.rect(x, y, w, h); this.fill(); this.d = d; this.has = has; }
  strokeRect(x, y, w, h) { const d = this.d, has = this.has; this.d = ''; this.has = false; this.rect(x, y, w, h); this.stroke(); this.d = d; this.has = has; }
  clearRect() {}
  clip() { const id = 'c' + (++this.ids); this.defs.push(`<clipPath id="${id}"><path d="${this.d}"/></clipPath>`); this.out.push(`<g clip-path="url(#${id})">`); this.open++; }
  group(opacity) { this.out.push(`<g opacity="${opacity}">`); }
  groupEnd() { this.out.push('</g>'); }
  drawImage() {}
  createLinearGradient(x0, y0, x1, y1) { const id = 'g' + (++this.ids), a = this.pt(x0, y0), b = this.pt(x1, y1), stops = [], defs = this.defs, i = defs.length; defs.push(''); const n = v => +v.toFixed(2);
    return { id, addColorStop(o, c) { stops.push(`<stop offset="${o}" stop-color="${c}"/>`); defs[i] = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}">${stops.join('')}</linearGradient>`; } }; }
  /* text */
  measureText(s) { this.meter.font = this.font; return this.meter.measureText(s); }
  text(s, x, y, extra) {
    const f = /^(?:(\d+)\s+)?([\d.]+)px\s+(.+)$/.exec(this.font.trim()) || [0, '', '10', 'sans-serif'], p = this.pt(x, y), k = this.k, deg = this.rot * 180 / Math.PI;
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' || this.textAlign === 'end' ? 'end' : 'start', dy = this.textBaseline === 'middle' ? 0.35 : this.textBaseline === 'top' ? 0.8 : this.textBaseline === 'bottom' ? -0.2 : 0, size = +f[2] * k;
    const esc = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.out.push(`<text x="${this.n(p[0])}" y="${this.n(p[1] + dy * size)}" font-family="${f[3].replace(/"/g, "'")}" font-size="${this.n(size)}"${f[1] ? ` font-weight="${f[1]}"` : ''} text-anchor="${anchor}"${Math.abs(deg) > 0.01 ? ` transform="rotate(${this.n(deg)} ${this.n(p[0])} ${this.n(p[1])})"` : ''}${extra}${this.alpha()}>${esc}</text>`);
  }
  fillText(s, x, y) { this.text(s, x, y, ` fill="${this.paint(this.fillStyle)}"`); }
  strokeText(s, x, y) { this.text(s, x, y, ` fill="none" stroke="${this.paint(this.strokeStyle)}" stroke-width="${this.n(this.lineWidth * this.k)}" stroke-linejoin="round"`); }
  toString() { while (this.open > 0) { this.out.push('</g>'); this.open--; } return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}"><defs>${this.defs.join('')}</defs>${this.out.join('')}</svg>`; }
}
// the top view as SVG text, w × h units, framed on all the parts
function snapshotSvg(w, h) {
  const g = new SvgCtx(w, h);
  withTarget(g, w, h, 'export', () => { fit(); g.fillStyle = C.paper; g.fillRect(0, 0, w, h); drawTop(1, view.scale, 0); });
  return g.toString();
}

/* ---------- scratch scenes ----------
   Icons of parts and previews of the demo scenes are drawn from real scenes: the bench is put aside, the scene is built and
   solved, its picture taken, and the bench is put back exactly as it stood (clock included). Nothing of it reaches the undo history. */
function withScratch(fn) {
  const keepScene = JSON.stringify(serialize()), keep = { clock, activeLayer, running, sel: [...sel], selPipe, outId, mute: hist.mute, gen: sceneGen, v: { ...view } };
  hist.mute = true;
  try { return fn(); }
  finally {
    load(JSON.parse(keepScene)); activeLayer = Math.min(keep.activeLayer, layerCount - 1); running = keep.running; sel = new Set(keep.sel); selPipe = keep.selPipe; Object.assign(view, keep.v);
    place(); solve(); hist.mute = keep.mute;
  }
}
