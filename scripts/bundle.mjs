// Inlines the stylesheet and every script of src/index.html into one self-contained file: dist/gear-bench.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const html = src('index.html')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${src('style.css')}</style>`)
  .replace(/<script src="([^"]+)"><\/script>\n?/g, (m, f) => `<script>\n${src(f)}</script>\n`);
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/gear-bench.html', import.meta.url), html);
console.log(`dist/gear-bench.html  ${(html.length / 1024).toFixed(0)} kB`);
