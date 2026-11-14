/* Gear Bench — mechanisms on the bench: links are parts, pairs join their joints.
   A link's pose is x, y (its first joint) and dir (its angle); joints are points in the link's own frame, in mm.
   pivot and guide are the frame. A crank (tcrank) turns about its first joint with the speed the drive solver gives it,
   from the shaft it is keyed to or from its own motor, so for the linkage it is a frame that moves.
   Every other link is found each frame from the pair equations (linkage.js), starting from where it stood. */
'use strict';

const FOLLOW_L = 34;
const BAR = ['tcrank', 'trod', 'trocker', 'tcoul'], SLIDES = ['tslider', 'tstone'], RAILS = ['guide', 'tcoul'];
// links whose pose is given rather than solved: the frame, the driven links, and a follower riding a cam
const camOf = p => { const q = pairs.find(x => x.type === 'H' && x.b === p.id); return q ? byId(q.a) : null; };
const linkFixed = p => ty(p, 'pivot', 'guide', 'tcrank', 'tcam') || (p.type === 'tfollow' && !!camOf(p));
const linkTh = p => isDriver(p) ? p.dir + (p.w || 0) * (clock + jit) : p.dir || 0;
// joints in the link's own frame
function jointsOf(p) {
  if (BAR.includes(p.type)) return [[0, 0], [p.len, 0]];
  if (p.type === 'tplate') return [...Array(p.n)].map((_, k) => [p.r * (1 - Math.cos(TAU * k / p.n)), -p.r * Math.sin(TAU * k / p.n)]);   // on a circle of radius r through the first joint
  if (p.type === 'tfollow') return [[0, 0], [FOLLOW_L, 0]];   // roller centre and the far end of the stem
  return p.type === 'guide' ? [] : [[0, 0]];
}
const toWorldOf = (p, q) => { const th = linkTh(p), c = Math.cos(th), s = Math.sin(th); return { x: p.x + c * q[0] - s * q[1], y: p.y + s * q[0] + c * q[1] }; };
const jointPos = (p, k) => toWorldOf(p, jointsOf(p)[k]);
// the stretch of a rail a slider may sit on, along the rail's own x
const railSpan = p => p.type === 'guide' ? [-p.len / 2, p.len / 2] : [0, p.len];
// where a point lies on a rail: al along it, pe across it
const onRail = (r, pt) => { const th = linkTh(r), dx = pt.x - r.x, dy = pt.y - r.y; return { al: dx * Math.cos(th) + dy * Math.sin(th), pe: -dx * Math.sin(th) + dy * Math.cos(th) }; };
const pairsOf = p => pairs.filter(q => q.a === p.id || q.b === p.id);
function addPair(type, a, ja, b, jb, turn) { const q = { id: nextId++, type, a: a.id, ja: ja || 0, b: b.id, jb: jb || 0, turn: turn || 0 }; pairs.push(q); return q; }

/* ---------- pose ---------- */
let tmmInfo = { ok: true, groups: [], of: new Map() };
function tmmMech() {
  const L = parts.filter(isLink), used = new Set(pairs.flatMap(q => [q.a, q.b]));
  const mech = { scale: 30, links: [], pairs: [], q0: [], moving: [] };
  for (const p of L) {
    if (linkFixed(p)) mech.links.push({ id: p.id, ground: true, pose: [p.x, p.y, linkTh(p)] });
    else if (used.has(p.id)) { mech.links.push({ id: p.id }); mech.moving.push(p); mech.q0.push(p.x, p.y, p.dir); }
  }
  for (const q of pairs) {
    const a = byId(q.a), b = byId(q.b); if (!a || !b || (linkFixed(a) && linkFixed(b))) continue;
    if (q.type === 'H') continue;   // a cam places its follower directly, see tmmFollow()
    if (q.type === 'P') mech.pairs.push({ type: 'P', a: a.id, b: b.id, pa: [0, 0], pb: jointsOf(b)[q.jb] || [0, 0], ua: [1, 0], turn: q.turn });
    else mech.pairs.push({ type: q.type, a: a.id, b: b.id, pa: jointsOf(a)[q.ja] || [0, 0], pb: jointsOf(b)[q.jb] || [0, 0], turn: q.turn });
  }
  return mech;
}
/* Put every free link where its pairs say. False when the links cannot reach: a dead point passed the wrong way,
   a crank too long for its chain, a rod pulled off its slider's stroke. The links then stay where they were. */
// a follower sits on its cam: on the ray from the cam's centre along the follower's own direction, at the pitch radius for the cam's angle
function tmmFollow() {
  for (const q of pairs) if (q.type === 'H') { const c = byId(q.a), f = byId(q.b); if (!c || !f) continue; const R = c.r + (f.rr || 0) + camS(c, linkTh(c) - f.dir)[0]; f.x = c.x + R * Math.cos(f.dir); f.y = c.y + R * Math.sin(f.dir); }
}
function tmmStep() {
  tmmFollow();
  const mech = tmmMech(); if (!mech.moving.length || !mech.pairs.length) return true;
  const r = solveNL(linkage(mech).eqs, mech.q0, { tol: 1e-9, max: 40 });
  if (r.res > 1e-4) return false;
  mech.moving.forEach((p, i) => { p.x = r.x[3 * i]; p.y = r.x[3 * i + 1]; p.dir = wrap(r.x[3 * i + 2]); });
  return true;
}
/* Structure of each connected mechanism: n moving links, p5 lower pairs, W = 3n − 2·p5 (Chebyshev), and how many links are driven.
   A crank counts as a moving link with a hinge on the frame, and as one driven link. */
function tmmAnalyze() {
  const L = parts.filter(p => isLink(p) && !ty(p, 'pivot', 'guide')), par = new Map(L.map(p => [p.id, p.id])), find = i => { while (par.get(i) !== i) i = par.get(i); return i; };
  for (const q of pairs) if (par.has(q.a) && par.has(q.b)) par.set(find(q.a), find(q.b));
  const groups = new Map(), of = new Map();
  for (const p of L) { const r = find(p.id); if (!groups.has(r)) groups.set(r, { ids: [], n: 0, p5: 0, p4: 0, pf: 0, drivers: 0 }); const g = groups.get(r); g.ids.push(p.id); g.n++; of.set(p.id, g); if (isDriver(p)) { g.p5++; g.drivers++; } }
  for (const q of pairs) { const g = of.get(q.a) || of.get(q.b); if (!g) continue; if (q.type === 'F') g.pf++; else if (q.type === 'H') { g.p4++; g.p5++; } else g.p5++; }   // a follower brings its own guide on the frame
  const out = [...groups.values()].filter(g => g.p5 + g.pf > 0);
  for (const g of out) { g.n -= g.pf; g.W = 3 * g.n - 2 * g.p5 - g.p4; }
  tmmInfo = { ok: tmmStepOk(), groups: out, of };
}
/* Assur groups of one mechanism: with the frame and the driven links known, peel off the smallest sets of links
   whose freedoms are exactly used up by their pairs (3·n − 2·p5 = 0). Two links with three pairs is a class II group (a dyad),
   four links with six pairs class III. Returns { groups: [{ ids, cls }], left: [ids] } — left is what no group takes. */
function tmmAssur(g) {
  const known = new Set(parts.filter(p => isLink(p) && linkFixed(p)).map(p => p.id)), rest = g.ids.filter(id => !known.has(id)), groups = [];
  const dof = S => { const In = id => S.has(id), ok = id => S.has(id) || known.has(id); let d = 3 * S.size; for (const q of pairs) if ((In(q.a) && ok(q.b)) || (In(q.b) && ok(q.a))) d -= q.type === 'F' ? 3 : q.type === 'H' ? 1 : 2; return d; };
  const combos = (arr, k, start = 0, cur = []) => k === 0 ? [cur] : arr.slice(start).flatMap((x, i) => combos(arr, k - 1, start + i + 1, [...cur, x]));
  for (let found = true; found && rest.length;) {
    found = false;
    for (let k = 1; k <= Math.min(4, rest.length) && !found; k++) for (const c of combos(rest, k)) if (dof(new Set(c)) === 0) {
      groups.push({ ids: c, cls: k === 2 ? 'II' : k === 4 ? 'III' : k === 1 ? 'II' : 'III' }); c.forEach(id => { known.add(id); rest.splice(rest.indexOf(id), 1); }); found = true; break;
    }
  }
  return { groups, left: rest };
}
// do the links, as they stand, satisfy their pairs?
function tmmStepOk() { const mech = tmmMech(); if (!mech.pairs.length) return true; return Math.max(...linkage(mech).eqs(mech.q0).map(Math.abs), 0) < 1e-3; }

addCheck('cam', () => {
  const out = [];
  for (const c of parts) if (c.type === 'tcam') {
    const f = parts.find(p => p.type === 'tfollow' && camOf(p) === c), rr = f ? f.rr || 0 : 0, k = camCheck(c, rr);
    if (!camPlan(c).fits) out.push({ level: 'error', code: 'w.camPlan', text: t('w.camPlan', { a: c.name }), ids: [c.id] });
    if (k.alpha > Math.PI / 6 + 1e-9) out.push({ level: 'warn', code: 'w.camAngle', text: t('w.camAngle', { a: c.name, d: fmtNum(k.alpha * 180 / Math.PI, 3), r: fmtNum(k.rmin, 3) }), ids: [c.id] });
    if (rr && k.rho <= rr) out.push({ level: 'warn', code: 'w.camCurv', text: t('w.camCurv', { a: c.name, d: fmtNum(k.rho, 3) }), ids: [c.id] });
    if ((c.law || 'cyc') === 'lin') out.push({ level: 'info', code: 'w.camShock', text: t('w.camShock', { a: c.name }), ids: [c.id] });
  }
  return out;
});
addCheck('linkage', () => {
  const out = [];
  if (!tmmInfo.ok) out.push({ level: 'error', code: 'w.linkOpen', text: t('w.linkOpen'), ids: [] });
  for (const g of tmmInfo.groups) {
    const free = g.W - g.drivers, a = nameOf(g.ids);
    if (g.p4 && free === 0) continue;
    if (free > 0) out.push({ level: 'warn', code: 'w.linkFree', text: t('w.linkFree', { a, W: g.W, d: g.drivers }), ids: g.ids });
    else if (free < 0) out.push({ level: 'warn', code: 'w.linkOver', text: t('w.linkOver', { a, W: g.W, d: g.drivers }), ids: g.ids });
  }
  return out;
});

/* ---------- making and breaking pairs ---------- */
const NEAR_MM = 0.6;
// every joint of every link except those in skip: { p, k, x, y }
const allJoints = skip => parts.filter(p => isLink(p) && !skip.has(p.id)).flatMap(p => jointsOf(p).map((_, k) => ({ p, k, ...jointPos(p, k) })));
// links already hinged together at joint k of p, through any chain of pairs at that point
function pinMates(p, k) {
  const seen = new Set([p.id + ':' + k]), todo = [[p.id, k]];
  while (todo.length) { const [id, j] = todo.pop(); for (const q of pairs) if (q.type !== 'P') for (const [x, jx, y, jy] of [[q.a, q.ja, q.b, q.jb], [q.b, q.jb, q.a, q.ja]]) if (x === id && jx === j && !seen.has(y + ':' + jy)) { seen.add(y + ':' + jy); todo.push([y, jy]); } }
  return seen;
}
/* Take the given links off everything they are not moving together with. With joint k given, only that joint of the one link lets go. */
function tmmDetach(ids, k) {
  const set = new Set(ids);
  pairs = pairs.filter(q => {
    const ina = set.has(q.a), inb = set.has(q.b); if (ina === inb) return true;
    if (k == null) return false;
    return !(q.type !== 'P' && ((ina && q.ja === k) || (inb && q.jb === k)));
  });
}
/* Make the pairs the given links have earned by where they now lie: a joint on a joint is a revolute pair,
   a slider or stone on a guide or slotted link is a prismatic one. One link joins a hinge that already exists through one pair only. */
function tmmAttach(ids) {
  const set = new Set(ids), made = [];
  for (const id of ids) {
    const p = byId(id); if (!p || !isLink(p)) continue;
    jointsOf(p).forEach((_, k) => {
      const at = jointPos(p, k), mates = pinMates(p, k);
      const hits = allJoints(new Set([p.id])).filter(j => Math.hypot(j.x - at.x, j.y - at.y) < NEAR_MM && !mates.has(j.p.id + ':' + j.k) && !(linkFixed(p) && linkFixed(j.p)));
      if (hits.length) { const j = hits.find(h => linkFixed(h.p)) || hits[0]; made.push(addPair('R', j.p, j.k, p, k)); }
    });
    if (p.type === 'tfollow' && !camOf(p)) { // a follower dropped beside a cam rides it, pointing away from the cam's centre
      const c = parts.find(o => o.type === 'tcam' && Math.hypot(o.x - p.x, o.y - p.y) < o.r + o.h + (p.rr || 0) + 14);
      if (c) { p.dir = Math.atan2(p.y - c.y, p.x - c.x); made.push(addPair('H', c, 0, p, 0)); }
    }
    const rails = SLIDES.includes(p.type) ? parts.filter(r => RAILS.includes(r.type) && r.id !== p.id).map(r => [r, p]) : RAILS.includes(p.type) ? parts.filter(s => SLIDES.includes(s.type)).map(s => [p, s]) : [];
    for (const [r, s] of rails) {
      if (pairs.some(q => q.type === 'P' && q.b === s.id)) continue;
      const f = onRail(r, s), [lo, hi] = railSpan(r);
      if (Math.abs(f.pe) < NEAR_MM && f.al >= lo - NEAR_MM && f.al <= hi + NEAR_MM) { s.dir = linkTh(r); made.push(addPair('P', r, 0, s, 0, 0)); }
    }
  }
  return made;
}
/* Where a dragged link should land: on the nearest joint of another link, or for a slider on the nearest rail.
   k: the joint being dragged (its position is x, y); null for the whole link, whose joints are tried in turn. */
function tmmSnap(g, x, y, k, skip, near) {
  const others = allJoints(skip), js = jointsOf(g), th = linkTh(g), c = Math.cos(th), s = Math.sin(th);
  let best = null;
  for (let i = 0; i < js.length; i++) {
    if (k != null && i !== k) continue;
    const jx = k != null ? x : x + c * js[i][0] - s * js[i][1], jy = k != null ? y : y + s * js[i][0] + c * js[i][1];
    for (const o of others) { const d = Math.hypot(o.x - jx, o.y - jy); if (d < near && (!best || d < best.d)) best = { d, dx: o.x - jx, dy: o.y - jy }; }
  }
  if (!best && k == null && SLIDES.includes(g.type)) for (const r of parts) if (RAILS.includes(r.type) && !skip.has(r.id)) {
    const f = onRail(r, { x, y }), [lo, hi] = railSpan(r);
    if (Math.abs(f.pe) < near && f.al >= lo && f.al <= hi) { const t2 = linkTh(r); best = { d: Math.abs(f.pe), dx: f.pe * Math.sin(t2), dy: -f.pe * Math.cos(t2) }; break; }
  }
  return best ? { x: x + best.dx, y: y + best.dy } : { x, y };
}
// which piece of a link is under the point: a joint's index, 'body', or null
function tmmHit(g, w, r = 3.2) {
  const js = jointsOf(g);
  for (let k = js.length - 1; k >= 0; k--) { const q = jointPos(g, k); if (Math.hypot(w.x - q.x, w.y - q.y) < r) return k; }
  const f = onRail(g, w);
  if (g.type === 'guide') return Math.abs(f.pe) < r && Math.abs(f.al) <= g.len / 2 ? 'body' : null;
  if (BAR.includes(g.type)) return Math.abs(f.pe) < r && f.al > 0 && f.al < g.len ? 'body' : null;
  if (SLIDES.includes(g.type)) return Math.abs(f.al) < 8 && Math.abs(f.pe) < 5 ? 'body' : null;
  if (g.type === 'pivot') return f.pe > -2 && f.pe < 10 && Math.abs(f.al) < 6 ? 'body' : null;
  if (g.type === 'tcam') return Math.hypot(w.x - g.x, w.y - g.y) < g.r + g.h ? 'body' : null;
  if (g.type === 'tfollow') return Math.abs(f.pe) < r && f.al > -(g.rr || 0) - 2 && f.al < FOLLOW_L ? 'body' : null;
  if (g.type === 'tplate') { const c = toWorldOf(g, [g.r, 0]); return Math.hypot(w.x - c.x, w.y - c.y) < g.r ? 'body' : null; }
  return null;
}
