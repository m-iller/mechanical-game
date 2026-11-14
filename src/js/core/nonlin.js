/* Gear Bench core — small nonlinear systems. Closed kinematic chains, hydraulic networks and cross-domain loops
   all come down to F(x) = 0 with a handful of unknowns. No DOM here. */
'use strict';

// A·x = b by Gaussian elimination with partial pivoting; null when the matrix is singular
function linSolve(A, b) {
  const n = b.length, M2 = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M2[r][c]) > Math.abs(M2[p][c])) p = r;
    if (Math.abs(M2[p][c]) < 1e-14) return null;
    [M2[c], M2[p]] = [M2[p], M2[c]];
    for (let r = c + 1; r < n; r++) { const f = M2[r][c] / M2[c][c]; if (f) for (let k = c; k <= n; k++) M2[r][k] -= f * M2[c][k]; }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M2[r][n]; for (let k = r + 1; k < n; k++) s -= M2[r][k] * x[k]; x[r] = s / M2[r][r]; }
  return x;
}
const numJac = (F, x, f0, h = 1e-7) => { const J = f0.map(() => new Array(x.length)); for (let j = 0; j < x.length; j++) { const xj = x[j], d = h * Math.max(1, Math.abs(xj)); x[j] = xj + d; const f1 = F(x); x[j] = xj; for (let i = 0; i < f0.length; i++) J[i][j] = (f1[i] - f0[i]) / d; } return J; };
const norm2 = v => v.reduce((s, a) => s + a * a, 0);

/* Levenberg–Marquardt on F(x) = 0 with a numeric Jacobian. Works for square systems and for ones with redundant equations
   (more equations than unknowns), and does not blow up near a singular position: the damping grows instead.
   Returns { x, ok, iters, res } — res is the largest residual left. */
function solveNL(F, x0, opt = {}) {
  const tol = opt.tol || 1e-10, max = opt.max || 60; let x = x0.slice(), f = F(x), lam = 1e-8, it = 0;
  const worst = v => v.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
  for (; it < max && worst(f) > tol; it++) {
    const J = numJac(F, x, f), n = x.length, A = [], g = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { A.push(new Array(n).fill(0)); for (let k = 0; k < f.length; k++) { g[i] += J[k][i] * f[k]; for (let j = 0; j <= i; j++) A[i][j] += J[k][i] * J[k][j]; } }
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) A[j][i] = A[i][j];
    let stepped = false;
    for (let tries = 0; tries < 12 && !stepped; tries++) {
      const B = A.map((r, i) => r.map((v, j) => i === j ? v * (1 + lam) + lam * 1e-6 : v)), dx = linSolve(B, g.map(v => -v));
      if (dx) { const xn = x.map((v, i) => v + dx[i]), fn = F(xn); if (norm2(fn) < norm2(f)) { x = xn; f = fn; lam = Math.max(lam / 4, 1e-12); stepped = true; continue; } }
      lam *= 8;
    }
    if (!stepped) break;
  }
  const res = worst(f);
  return { x, ok: res <= Math.max(tol, 1e-8), iters: it, res };
}
