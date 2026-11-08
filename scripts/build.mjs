// Builds www/index.html from the source files in src/ (run: npm run build).
// The app ships as one file so it opens fast and works offline; the source is split by feature to keep it tidy.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const read = p => readFileSync(join(src, p), 'utf8');
const list = dir => readdirSync(join(src, dir)).filter(f => !f.startsWith('.')).sort();

const css = list('css').map(f => `/* ===== ${f} ===== */\n${read(join('css', f))}`).join('\n');
const js = list('js').map(f => `  /* ===== ${f} ===== */\n${read(join('js', f))}`).join('\n');
const indent = (s, n) => s.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');

const html = `${read('head.html')}  <style>\n${indent(css, 4).replace(/\s+$/, '')}\n  </style>\n</head>\n${read('body.html').replace(/\s+$/, '')}\n<script>\n${js.replace(/\s+$/, '')}\n</script>\n</body>\n</html>\n`;
writeFileSync(join(root, 'www', 'index.html'), html);
console.log(`Built www/index.html (${Math.round(html.length / 1024)} KB, ${list('css').length} style files, ${list('js').length} script files)`);
