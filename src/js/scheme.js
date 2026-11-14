/* Gear Bench — kinematic-scheme symbols for the top view, after GOST 2.770-68 (elements of kinematic schemes).
   The top view looks along the shafts, so wheels are their pitch circles, a belt is a thin line, a chain a dash-dot line,
   a part fixed on its shaft carries a cross, a held part stands on a ground hatch. A thin radius shows the rotation.
   Crank, cam, Geneva drive, ratchet and differential keep their drawn shape until they are rebuilt from links (phase 2). */
'use strict';

function schemePart(g, s) {
  if (ty(g, 'crank', 'cam', 'geneva', 'ratchet', 'diff')) return false;
  const col = collide.has(g.id) ? C.jam : g.motor ? C.brass : C.ink, w = 2 / s, thin = 1 / s, an = angle(g), R = RO(g);
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ring = (r, lw = w, dash) => { ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); };
  const seg = (x0, y0, x1, y1, lw = w) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const spoke = (r0, r1) => seg(g.x + r0 * Math.cos(an), g.y + r0 * Math.sin(an), g.x + r1 * Math.cos(an), g.y + r1 * Math.sin(an), thin);
  const local = fn => { ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.dir || 0); fn(); ctx.restore(); };
  switch (g.type) {
    case 'spur': case 'sprocket': case 'pulley': case 'fric': ring(R); spoke(0, R); break;
    case 'bevel': ring(R); ring(R * 2 / 3, thin); spoke(0, R); break;
    case 'ring': ring(RI(g)); ring(R, thin); spoke(RI(g), R); break;
    case 'flywheel': ring(R - 1.5, 4 / s); spoke(0, R); break;
    case 'emotor': {
      ring(R); spoke(R * 0.72, R);
      ctx.font = `600 ${R * 0.8}px ${C.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', g.x, g.y + R * 0.04);
      break;
    }
    case 'machine': ctx.strokeRect(g.x - R, g.y - R, 2 * R, 2 * R); seg(g.x - R, g.y - R, g.x + R, g.y + R, thin); seg(g.x - R, g.y + R, g.x + R, g.y - R, thin); break;
    case 'brake': { // drum with two shoes; filled shoes when applied
      ring(R); spoke(0, R);
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.rect(g.x + sd * (R + 2.5) - 1.5, g.y - 5, 3, 10); if (g.on) ctx.fill(); ctx.lineWidth = thin; ctx.stroke(); }
      break;
    }
    case 'clutch': ring(R); ring(Math.max(3, R - 4), w, g.on ? null : [4 / s, 3 / s]); spoke(0, R); break;
    case 'carrier': {
      for (let k = 0; k < g.n; k++) { const q = pinPos(g, k); seg(g.x, g.y, q.x, q.y); ctx.beginPath(); ctx.arc(q.x, q.y, 2.2, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = thin; ctx.stroke(); ctx.fillStyle = col; }
      ctx.beginPath(); ctx.arc(g.x, g.y, 2.6, 0, TAU); ctx.fill();
      break;
    }
    case 'rack': { // pitch line with the body under it; ticks travel with the rack
      const L = rackLen(g), o = mod(an, 4 * PM);
      local(() => { ctx.strokeRect(-L / 2, -RB - 2.5, L, RB + 2.5); for (let x = -L / 2 + o; x < L / 2; x += 4 * PM) if (x > -L / 2) seg(x, 0, x, -3, thin); });
      break;
    }
    case 'worm': { // cylinder on its axis, thread as slanted lines
      const o = wormRidge(g);
      local(() => {
        seg(-WL / 2 - 9, 0, WL / 2 + 9, 0); ctx.lineWidth = w; ctx.strokeRect(-WL / 2, -WO, WL, 2 * WO);
        ctx.save(); ctx.beginPath(); ctx.rect(-WL / 2, -WO, WL, 2 * WO); ctx.clip();
        for (let j = -4; j <= 4; j++) { const c = o + j * PM; seg(c - 1.2 * g.zw, -WO, c + 1.2 * g.zw, WO, thin); }
        ctx.restore();
      });
      break;
    }
    case 'hshaft': { // shaft line in two plain bearings
      const o = mod(an * 6 / TAU, 1) * 12 - 6;
      local(() => { seg(-g.len / 2, 0, g.len / 2, 0, 2.6 / s); for (const sd of [-1, 1]) for (const y of [-3, 3]) seg(sd * (g.len / 2 - 7), y, sd * (g.len / 2 - 1), y); seg(o, -1.6, o, 1.6, thin); });
      break;
    }
    case 'hbevel': { const r = M * g.z / 2; local(() => { ctx.beginPath(); ctx.moveTo(-7, -r * 0.66); ctx.lineTo(0, -r); ctx.lineTo(0, r); ctx.lineTo(-7, r * 0.66); ctx.closePath(); ctx.stroke(); seg(0, 0, 12, 0); }); break; }
    default: ctx.restore(); return false;
  }
  if (isVert(g) && !ty(g, 'carrier', 'ring')) {
    const fixed = !g.loose && !g.mount && parts.some(q => isShaft(q) && same(q, g) && covers(q, g.layer));
    if (fixed) { const k = 2.4; seg(g.x - k, g.y - k, g.x + k, g.y + k, thin * 1.4); seg(g.x - k, g.y + k, g.x + k, g.y - k, thin * 1.4); }   // fixed on its shaft
  }
  if (g.held) { // ground: a short bar with hatching under the centre
    const y = g.y + Math.min(R, 9) * 0.5 + 3; seg(g.x - 6, y, g.x + 6, y);
    for (let x = -6; x <= 4; x += 3.3) seg(g.x + x, y, g.x + x - 2.4, y + 3, thin);
    seg(g.x, g.y, g.x, y, thin);
  }
  ctx.restore(); return true;
}
// a belt is a continuous thin line, a chain a dash-dot line; the dashes travel with it
function schemeLink(L, s) {
  const R = L.route; if (!R) return;
  ctx.save(); ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.lineWidth = 1.3 / s;
  if (L.kind === 'chain') { const pp = R.L / Math.max(1, Math.round(R.L / 16)); ctx.setLineDash([pp * 0.55, pp * 0.15, pp * 0.15, pp * 0.15]); ctx.lineDashOffset = -mod(linkPos(L) * CP, pp); }
  else { const pp = R.L / Math.max(1, Math.round(R.L / 24)); ctx.stroke(R.path); ctx.strokeStyle = C.paper; ctx.lineWidth = 0.7 / s; ctx.setLineDash([pp * 0.12, pp * 0.88]); ctx.lineDashOffset = -mod(linkPos(L), pp); }
  ctx.stroke(R.path); ctx.restore();
}

/* ---------- links of mechanisms, after GOST 2.770-68 ----------
   A link is a line between its joints; a joint in a pair is an open circle (hinge), a free joint a small dot.
   The frame is hatched: a hinge support for pivot, a hatched line for a guide. A slider is a box on its line,
   a slotted link a double line, a link with several joints a hatched polygon. */
function tmmDraw(g, s) {
  const col = collide.has(g.id) ? C.jam : g.motor ? C.brass : C.ink, w = 2 / s, thin = 1 / s, th = linkTh(g), js = jointsOf(g);
  const paired = new Set(pairs.filter(q => q.type !== 'P').flatMap(q => [q.a === g.id ? q.ja : -1, q.b === g.id ? q.jb : -1]));
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(th);
  const seg = (x0, y0, x1, y1, lw = w) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const hatchUnder = (x0, x1, y) => { seg(x0, y, x1, y); for (let x = x0 + 1; x <= x1; x += 3.2) seg(x, y, x - 2.4, y + 3, thin); };
  const box = (hw, hh) => { ctx.fillStyle = C.paper; ctx.fillRect(-hw, -hh, 2 * hw, 2 * hh); ctx.lineWidth = w; ctx.strokeRect(-hw, -hh, 2 * hw, 2 * hh); ctx.fillStyle = col; };
  switch (g.type) {
    case 'pivot': ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4.5, 8); ctx.lineTo(4.5, 8); ctx.closePath(); ctx.stroke(); hatchUnder(-6.5, 6.5, 8); break;
    case 'guide': hatchUnder(-g.len / 2, g.len / 2, 0); break;
    case 'tcam': { // the cam's working surface, with a mark at the start of the rise
      const pts = camProfile(g, (parts.find(p => p.type === 'tfollow' && camOf(p) === g) || {}).rr || 0, 120);
      ctx.beginPath(); pts.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.globalAlpha *= 0.1; ctx.fill(); ctx.globalAlpha /= 0.1; ctx.lineWidth = w; ctx.stroke();
      seg(0, 0, pts[0][0], pts[0][1], thin); break;
    }
    case 'tfollow': { // roller, stem, and the frame's guide around the stem
      const rr = g.rr || 0; if (rr) { ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = w; ctx.stroke(); ctx.fillStyle = col; }
      seg(rr, 0, FOLLOW_L, 0); if (camOf(g)) for (const sd of [-1, 1]) { seg(FOLLOW_L * 0.5, sd * 2.6, FOLLOW_L * 0.85, sd * 2.6); for (let x = FOLLOW_L * 0.5 + 1; x < FOLLOW_L * 0.85; x += 3) seg(x, sd * 2.6, x + 2, sd * 5.2, thin); }
      break;
    }
    case 'tcrank': seg(0, 0, g.len, 0, 2.6 / s); if (!paired.has(0)) { ctx.lineWidth = thin; ctx.save(); ctx.rotate(-th); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4.5, 8); ctx.lineTo(4.5, 8); ctx.closePath(); ctx.stroke(); hatchUnder(-6.5, 6.5, 8); ctx.restore(); } break;
    case 'trod': case 'trocker': seg(0, 0, g.len, 0); break;
    case 'tcoul': seg(0, -1.8, g.len, -1.8, thin * 1.4); seg(0, 1.8, g.len, 1.8, thin * 1.4); seg(0, -1.8, 0, 1.8, thin * 1.4); seg(g.len, -1.8, g.len, 1.8, thin * 1.4); break;
    case 'tslider': box(8, 4.5); break;
    case 'hcyl': hydCylDraw(g, s, col); break;
    case 'tstone': box(5.5, 3.6); break;
    case 'tplate': {
      ctx.beginPath(); js.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
      ctx.globalAlpha *= 0.14; ctx.fill(); ctx.globalAlpha /= 0.14; ctx.lineWidth = w; ctx.stroke(); break;
    }
  }
  ctx.restore();
  js.forEach((_, k) => { // hinge circles in bench coordinates
    const q = jointPos(g, k), on = paired.has(k) || (isDriver(g) && k === 0) || g.type === 'pivot';
    ctx.beginPath(); ctx.arc(q.x, q.y, on ? 2.3 : 1.3, 0, TAU); ctx.fillStyle = on ? C.paper : col; ctx.fill(); ctx.lineWidth = on ? 1.6 / s : thin; ctx.stroke();
  });
  ctx.restore();
}
// outline that marks a picked link
function tmmOutline(g) {
  const js = jointsOf(g); ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(linkTh(g)); ctx.beginPath();
  if (g.type === 'guide') ctx.rect(-g.len / 2 - 2, -3, g.len + 4, 9);
  else if (BAR.includes(g.type)) ctx.rect(-4.5, -4.5, g.len + 9, 9);
  else if (g.type === 'tplate') ctx.arc(g.r, 0, g.r + 4.5, 0, TAU);
  else if (g.type === 'pivot') ctx.rect(-8, -4, 16, 17);
  else if (g.type === 'tcam') ctx.arc(0, 0, g.r + g.h + 3, 0, TAU);
  else if (g.type === 'tfollow') ctx.rect(-(g.rr || 0) - 3, -6.5, FOLLOW_L + (g.rr || 0) + 6, 13);
  else ctx.rect(-10.5, -7, 21, 14);
  ctx.stroke(); ctx.restore();
}

/* ---------- hydraulic drive, after GOST 2.781-96 (valves) and 2.782-96 (pumps, motors, cylinders) ---------- */
// colour of a line by its pressure: blue at the tank, through green and amber, to red at the highest pressure on the bench
const pColor = p => `hsl(${Math.round(215 - 215 * Math.max(0, Math.min(1, p / hyd.pmax)))}, 72%, 44%)`;
function hydDraw(g, s) {
  const col = collide.has(g.id) ? C.jam : C.ink, w = 2 / s, thin = 1 / s, r = hyd.part.get(g.id) || {};
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.dir || 0); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w;
  const seg = (x0, y0, x1, y1, lw = w) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const tri = (x0, y0, x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill(); };
  const arrow = (x0, y0, x1, y1) => { seg(x0, y0, x1, y1, thin * 1.3); const a = Math.atan2(y1 - y0, x1 - x0), h = 2.4; tri(x1, y1, x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45), x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); };
  const disc = rad => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = w; ctx.stroke(); ctx.fillStyle = col; };
  switch (g.type) {
    case 'htank': seg(0, 0, 0, 5); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-7, 1.5); ctx.lineTo(-7, 8); ctx.lineTo(7, 8); ctx.lineTo(7, 1.5); ctx.stroke(); break;
    case 'hpump': case 'hmotor': {
      seg(-11, 0, -8, 0); seg(8, 0, 11, 0); disc(8);
      if (g.type === 'hpump') tri(8, 0, 3.6, -2.7, 3.6, 2.7); else tri(-3.6, 0, -8, -2.7, -8, 2.7);
      const an = angle(g) - (g.dir || 0); seg(0, 0, 3.2 * Math.cos(an), 3.2 * Math.sin(an), thin);   // turns with the shaft
      break;
    }
    case 'hrelief': {
      seg(-9, 0, -6, 0); seg(6, 0, 9, 0); ctx.fillStyle = r.Q > 1e-7 ? C.brass : C.paper; ctx.fillRect(-6, -6, 12, 12); ctx.fillStyle = col; ctx.lineWidth = w; ctx.strokeRect(-6, -6, 12, 12);
      arrow(-4.5, r.Q > 1e-7 ? 0 : -2.6, 4.5, r.Q > 1e-7 ? 0 : -2.6);                                // the arrow sits off the line while shut
      ctx.lineWidth = thin; ctx.beginPath(); ctx.moveTo(0, -6); for (let i = 0; i < 5; i++) ctx.lineTo(i % 2 ? 1.8 : -1.8, -7 - i * 1.3); ctx.stroke();
      ctx.setLineDash([1.5, 1.2]); ctx.beginPath(); ctx.moveTo(-7.5, 0); ctx.lineTo(-7.5, 8); ctx.lineTo(0, 8); ctx.lineTo(0, 6); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'hvalve': { // three boxes: P→A and B→T, all shut, P→B and A→T; the live one is filled
      for (const [k, cx] of [[1, -12], [0, 0], [-1, 12]]) { ctx.fillStyle = (g.pos || 0) === k ? C.brass : C.paper; ctx.globalAlpha *= (g.pos || 0) === k ? 0.55 : 1; ctx.fillRect(cx - 6, -6, 12, 12); ctx.globalAlpha /= (g.pos || 0) === k ? 0.55 : 1; ctx.fillStyle = col; ctx.lineWidth = (g.pos || 0) === k ? w * 1.3 : thin * 1.3; ctx.strokeRect(cx - 6, -6, 12, 12); }
      arrow(-16, 6, -16, -6); arrow(-8, -6, -8, 6); arrow(8, 6, 16, -6); arrow(8, -6, 16, 6);
      for (const [px, py] of [[-4, 6], [4, 6], [-4, -6], [4, -6]]) { const iy = py > 0 ? 3 : -3; seg(px, py, px, iy, thin * 1.3); seg(px - 1.6, iy, px + 1.6, iy, thin * 1.3); seg(px, py, px, py > 0 ? 9 : -9); }
      break;
    }
    case 'hthrottle': seg(-9, 0, 9, 0); ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, -7.5, 5.2, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7.5, 5.2, 1.25 * Math.PI, 1.75 * Math.PI); ctx.stroke(); arrow(-5, 5, 5, -5); break;
    case 'hcheck': seg(-9, 0, -1.6, 0); seg(3.4, 0, 9, 0); seg(-4.5, -3.6, -0.6, -1.3, thin * 1.3); seg(-4.5, 3.6, -0.6, 1.3, thin * 1.3); ctx.beginPath(); ctx.arc(1.2, 0, 2.2, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = w; ctx.stroke(); break;
    case 'hnode': ctx.beginPath(); ctx.arc(0, 0, 1.9, 0, TAU); ctx.fill(); break;
  }
  ctx.restore();
  hydPorts(g, s);
}
// port marks; while a pipe is being laid they are rings to aim at
function hydPorts(g, s) {
  if (g.type === 'hnode') return;
  portsOf(g).forEach((q, k) => { const P = portPos(g, k); ctx.beginPath(); ctx.arc(P.x, P.y, pipeDraft ? 2.6 : 1.3, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.strokeStyle = pipeDraft ? C.select : C.ink; ctx.lineWidth = (pipeDraft ? 1.6 : 1) / s; ctx.stroke(); });
}
// barrel, piston and rod of a cylinder in the link's frame (x from pin to pin); chambers tinted by their pressure
function hydCylDraw(g, s, col) {
  const L0 = CYL_L0(g), xp = 8 + (g.s || 0), w = 2 / s, r = hyd.part.get(g.id);
  if (r && hyd.ok) { ctx.globalAlpha *= 0.4; ctx.fillStyle = pColor(r.pA); ctx.fillRect(3, -5, xp - 3, 10); ctx.fillStyle = pColor(r.pB); ctx.fillRect(xp, -5, L0 - 5 - xp, 10); ctx.globalAlpha /= 0.4; }
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.strokeRect(3, -5, L0 - 8, 10);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3, 0); ctx.moveTo(xp, -5); ctx.lineTo(xp, 5); ctx.stroke();
  ctx.lineWidth = 2.6 / s; ctx.beginPath(); ctx.moveTo(xp, 0); ctx.lineTo(g.len, 0); ctx.stroke();
  for (const q of portsOf(g)) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(q[1], 5); ctx.lineTo(q[1], 5.5); ctx.stroke(); }
}
/* Pipes of one layer in the top view. Line kinds after GOST 2.784-96: working lines solid, pilot lines long dashes, drain short dashes.
   The line's colour is its pressure; light marks run along it at the speed of the flow and stand still where nothing flows. */
function pipesDraw(layer, s) {
  for (const q of pipes) {
    const a = byId(q.a); if (!a || a.layer !== layer) continue;
    const P = pipePath(q), r = hyd.pipe.get(q.id), wire = isWire(q), lw = wire ? 1.8 / s : (2 + Math.min(3, q.d / 8)) / s, flow = r && (hyd.ok || r.el || r.gas) && Math.abs(r.Q) > 1e-8, hue = wire ? C.brass : r && (hyd.ok || r.gas) ? pColor((r.pa + r.pb) / 2) : C.muted;
    const path = () => { ctx.beginPath(); P.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    if (selPipe === q.id) { ctx.strokeStyle = C.select; ctx.lineWidth = lw + 4 / s; path(); ctx.stroke(); }
    ctx.strokeStyle = hue; ctx.lineWidth = lw; ctx.globalAlpha *= flow ? 1 : 0.6;
    ctx.setLineDash(q.kind === 'pilot' ? [8 / s, 4 / s] : q.kind === 'drain' ? [3 / s, 3 / s] : []); path(); ctx.stroke(); ctx.setLineDash([]);
    if (flow) { // running marks and an arrowhead in the direction of the flow
      ctx.strokeStyle = C.paper; ctx.lineWidth = lw * 0.5; ctx.setLineDash([3 / s, 9 / s]); ctx.lineDashOffset = -(q.ph || 0) * 60 / s; path(); ctx.stroke(); ctx.setLineDash([]);
      let best = 1, bl = 0; for (let i = 1; i < P.length; i++) { const L = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); if (L > bl) { bl = L; best = i; } }
      const A = P[best - 1], B = P[best], sg = r.Q > 0 ? 1 : -1, an = Math.atan2((B.y - A.y) * sg, (B.x - A.x) * sg), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, h = 7 / s;
      ctx.fillStyle = ctx.strokeStyle = hue; ctx.beginPath(); ctx.moveTo(mx + h * Math.cos(an), my + h * Math.sin(an)); ctx.lineTo(mx + h * 0.8 * Math.cos(an + 2.5), my + h * 0.8 * Math.sin(an + 2.5)); ctx.lineTo(mx + h * 0.8 * Math.cos(an - 2.5), my + h * 0.8 * Math.sin(an - 2.5)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  if (pipeDraft && pipeDraft.a != null && byId(pipeDraft.a).layer === layer) { // the pipe being laid
    const a = portPos(byId(pipeDraft.a), pipeDraft.pa), P = [a, ...pipeDraft.pts.map(v => ({ x: v[0], y: v[1] })), ...(pipeDraft.cur ? [pipeDraft.cur] : [])];
    ctx.save(); ctx.strokeStyle = C.select; ctx.lineWidth = 2 / s; ctx.setLineDash([5 / s, 3 / s]); ctx.beginPath(); P.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.stroke(); ctx.restore();
  }
}
// pipes in the side view: from port to port across the layers
function pipesSide(s) {
  for (const q of pipes) {
    const a = byId(q.a), b = byId(q.b); if (!a || !b) continue; const P = pipePath(q), r = hyd.pipe.get(q.id), za = a.layer * LP + FW / 2, zb = b.layer * LP + FW / 2;
    ctx.strokeStyle = r && hyd.ok ? pColor((r.pa + r.pb) / 2) : C.muted; ctx.lineWidth = 1.6 / s; ctx.globalAlpha = 0.85;
    ctx.beginPath(); P.forEach((v, i) => { const z = i === P.length - 1 ? zb : za; i ? ctx.lineTo(v.x, -z) : ctx.moveTo(v.x, -z); }); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
// pressure scale, in screen space
function hydLegend(x, y) {
  if (!(hyd.has || hyd.gas) || !pipes.length) return;
  const w = 120, g = ctx.createLinearGradient(x, 0, x + w, 0); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, pColor(hyd.pmax * i / 6));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, 7); ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, 7);
  ctx.font = `11px ${C.mono}`; ctx.textBaseline = 'top'; ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText('0', x, y + 10); ctx.textAlign = 'right'; ctx.fillText(fmtU(hyd.pmax, 'bar'), x + w, y + 10);
}

/* ---------- sources and consumers ---------- */
// engine, hand crank, weight, spring, generator, heater, hoist: the same symbol in both looks of the top view
function ioDraw(g, s) {
  if (!IO_ROUND.includes(g.type)) return false;
  const col = collide.has(g.id) ? C.jam : g.motor ? C.brass : C.ink, w = 2 / s, thin = 1 / s, R = g.d / 2, an = angle(g);
  ctx.save(); ctx.translate(g.x, g.y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w;
  const seg = (x0, y0, x1, y1, lw = w) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const disc = (r, fill = C.paper) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = w; ctx.stroke(); ctx.fillStyle = col; };
  const letter = (ch, k = 0.8) => { ctx.font = `600 ${R * k}px ${C.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 0, R * 0.04); };
  const spoke = (r0, r1) => seg(r0 * Math.cos(an), r0 * Math.sin(an), r1 * Math.cos(an), r1 * Math.sin(an), thin);
  const drum = down => { // drum with a rope and a mass on it; the mass rides up and down a little as the drum turns
    disc(R); spoke(0, R); const y = R + 14 + 6 * Math.sin(an * 0.2); seg(R, 0, R, y, thin * 1.4); ctx.fillStyle = C.paper; ctx.fillRect(R - 5, y, 10, 8); ctx.lineWidth = w; ctx.strokeRect(R - 5, y, 10, 8); ctx.fillStyle = col;
    const ay = y + 12; seg(R, ay, R, ay + 6, thin); seg(R, down ? ay + 6 : ay, R - 1.6, down ? ay + 3.5 : ay + 2.5, thin); seg(R, down ? ay + 6 : ay, R + 1.6, down ? ay + 3.5 : ay + 2.5, thin);
  };
  switch (g.type) {
    case 'engine': { // a circle with a cylinder and piston in it
      disc(R); const pw = R * 0.5, y = -R * 0.15 + R * 0.22 * Math.cos(an); ctx.lineWidth = thin * 1.4; ctx.strokeRect(-pw / 2, -R * 0.62, pw, R * 0.9);
      ctx.fillRect(-pw / 2, y - R * 0.1, pw, R * 0.2); seg(0, y, R * 0.22 * Math.sin(an), R * 0.5, thin * 1.4); ctx.beginPath(); ctx.arc(0, R * 0.5, R * 0.22, 0, TAU); ctx.lineWidth = thin; ctx.stroke(); break;
    }
    case 'generator': { // G in a circle, with a lamp that glows with the power going out
      disc(R); letter('G'); spoke(R * 0.72, R); const r = elec.gen.get(g.id), k = r ? Math.min(1, r.ratio) : 0, lx = R * 0.95, ly = -R * 0.95;
      ctx.beginPath(); ctx.arc(lx, ly, 4, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.globalAlpha *= k; ctx.fillStyle = C.brass; ctx.fill(); ctx.globalAlpha /= k || 1; ctx.lineWidth = thin * 1.3; ctx.stroke();
      if (k > 0.05) for (let i = 0; i < 8; i++) { const a = TAU * i / 8; seg(lx + 5.5 * Math.cos(a), ly + 5.5 * Math.sin(a), lx + (6.5 + 3 * k) * Math.cos(a), ly + (6.5 + 3 * k) * Math.sin(a), thin); }
      ctx.fillStyle = col; break;
    }
    case 'heater': { // a resistor in a box; the box reddens as it heats
      const k = Math.max(0, Math.min(1, ((g.T == null ? T_AMB : g.T) - T_AMB) / 380)); ctx.fillStyle = C.paper; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.globalAlpha *= 0.75 * k; ctx.fillStyle = C.jam; ctx.fillRect(-R, -R, 2 * R, 2 * R); ctx.globalAlpha /= 0.75 * k || 1; ctx.lineWidth = w; ctx.strokeRect(-R, -R, 2 * R, 2 * R);
      ctx.lineWidth = thin * 1.5; ctx.beginPath(); ctx.moveTo(-R * 0.75, 0); for (let i = 0; i <= 6; i++) ctx.lineTo(-R * 0.6 + R * 0.2 * i, i % 2 ? R * 0.3 : -R * 0.3); ctx.lineTo(R * 0.75, 0); ctx.stroke(); ctx.fillStyle = col;
      if (g.load) { ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill(); spoke(0, R * 0.9); } break;
    }
    case 'hoist': drum(false); break;
    case 'weight': drum(true); break;
    case 'hand': disc(Math.max(3, R * 0.3)); seg(0, 0, R * Math.cos(an), R * Math.sin(an)); ctx.beginPath(); ctx.arc(R * Math.cos(an), R * Math.sin(an), 2.4, 0, TAU); ctx.fill(); break;
    case 'spring': { disc(R); ctx.lineWidth = thin * 1.5; ctx.beginPath(); for (let i = 0; i <= 60; i++) { const a = an + i * 0.28, r = R * 0.12 + R * 0.72 * i / 60; i ? ctx.lineTo(r * Math.cos(a), r * Math.sin(a)) : ctx.moveTo(r * Math.cos(a), r * Math.sin(a)); } ctx.stroke(); break; }
  }
  ctx.restore();
  if (portsOf(g).length) hydPorts(g, s);
  return true;
}
