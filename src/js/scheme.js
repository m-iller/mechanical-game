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
    case 'tcrank': seg(0, 0, g.len, 0, 2.6 / s); if (!paired.has(0)) { ctx.lineWidth = thin; ctx.save(); ctx.rotate(-th); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4.5, 8); ctx.lineTo(4.5, 8); ctx.closePath(); ctx.stroke(); hatchUnder(-6.5, 6.5, 8); ctx.restore(); } break;
    case 'trod': case 'trocker': seg(0, 0, g.len, 0); break;
    case 'tcoul': seg(0, -1.8, g.len, -1.8, thin * 1.4); seg(0, 1.8, g.len, 1.8, thin * 1.4); seg(0, -1.8, 0, 1.8, thin * 1.4); seg(g.len, -1.8, g.len, 1.8, thin * 1.4); break;
    case 'tslider': box(8, 4.5); break;
    case 'tstone': box(5.5, 3.6); break;
    case 'tplate': {
      ctx.beginPath(); js.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
      ctx.globalAlpha *= 0.14; ctx.fill(); ctx.globalAlpha /= 0.14; ctx.lineWidth = w; ctx.stroke(); break;
    }
  }
  ctx.restore();
  js.forEach((_, k) => { // hinge circles in bench coordinates
    const q = jointPos(g, k), on = paired.has(k) || (g.type === 'tcrank' && k === 0) || g.type === 'pivot';
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
  else ctx.rect(-10.5, -7, 21, 14);
  ctx.stroke(); ctx.restore();
}
