// Inlines src/style.css and src/app.js into one self-contained HTML file: dist/gear-bench.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const html = src('index.html')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${src('style.css')}</style>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${src('app.js')}</script>`);
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/gear-bench.html', import.meta.url), html);
console.log(`dist/gear-bench.html  ${(html.length / 1024).toFixed(0)} kB`);
