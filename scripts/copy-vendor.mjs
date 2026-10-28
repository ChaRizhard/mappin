// Copies the libraries Mappin uses from node_modules into www/vendor so the app works offline
// and inside the phone apps. Run with: npm run vendor (after npm install).
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'www', 'vendor');

if (!existsSync(nm)) {
  console.error('node_modules not found. Run "npm install" first.');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (from, to) => {
  const src = join(nm, from);
  if (!existsSync(src)) { console.warn('  missing:', from); return; }
  mkdirSync(dirname(join(out, to)), { recursive: true });
  cpSync(src, join(out, to), { recursive: true });
};

// Map library
copy('leaflet/dist/leaflet.js', 'leaflet/leaflet.js');
copy('leaflet/dist/leaflet.css', 'leaflet/leaflet.css');
copy('leaflet/dist/images', 'leaflet/images');
// CSV reader and drag-and-drop
copy('papaparse/papaparse.min.js', 'papaparse.min.js');
copy('sortablejs/Sortable.min.js', 'Sortable.min.js');
// Icons
copy('@fortawesome/fontawesome-free/css/all.min.css', 'fontawesome/css/all.min.css');
copy('@fortawesome/fontawesome-free/webfonts', 'fontawesome/webfonts');

// Inter font (weights 300-700), woff2 only
const interDir = join(nm, '@fontsource', 'inter');
if (existsSync(interDir)) {
  let css = '';
  for (const w of [300, 400, 500, 600, 700]) {
    const f = join(interDir, `${w}.css`);
    if (existsSync(f)) css += readFileSync(f, 'utf8').replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, '') + '\n';
  }
  mkdirSync(join(out, 'inter', 'files'), { recursive: true });
  writeFileSync(join(out, 'inter', 'inter.css'), css);
  const used = new Set([...css.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)].map(m => m[1]));
  for (const file of used) {
    const src = join(interDir, 'files', file);
    if (existsSync(src)) cpSync(src, join(out, 'inter', 'files', file));
  }
}

// List of files for the website's offline cache
const list = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else list.push(relative(out, p).split('\\').join('/'));
  }
};
walk(out);
writeFileSync(join(out, 'files.json'), JSON.stringify(list.filter(f => f !== 'files.json'), null, 0));
console.log(`Copied ${list.length} library files into www/vendor`);
