// Make or read a private trip file for "Import from link".
// The file is encrypted (AES-256-GCM); only the full link (with the key after #k=) can open it.
//   node scripts/private-trip.mjs encrypt trip.csv "Trip name" [key]   -> writes www/p/<id>.enc, prints the link
//   node scripts/private-trip.mjs decrypt www/p/<id>.enc <key>          -> prints the CSV
// Keep the link to yourself: anyone with the whole link can read the trip.
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const [cmd, a, b, c] = process.argv.slice(2);
const SITE = process.env.MAPPIN_SITE || 'https://charizhard.github.io/mappin/';

if (cmd === 'encrypt') {
  const csv = fs.readFileSync(a, 'utf8');
  const keyB64 = c || b64u(crypto.getRandomValues(new Uint8Array(32)));
  const id = process.env.TRIP_ID || b64u(crypto.getRandomValues(new Uint8Array(12)));
  const key = await crypto.subtle.importKey('raw', unb64u(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ title: b || '', csv, updated: new Date().toISOString() }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const out = path.join('www', 'p', `${id}.enc`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ v: 1, iv: b64u(iv), ct: b64u(ct) }));
  console.log(JSON.stringify({ file: out, id, key: keyB64, link: `${SITE}p/${id}.enc#k=${keyB64}` }));
} else if (cmd === 'decrypt') {
  const box = JSON.parse(fs.readFileSync(a, 'utf8'));
  const key = await crypto.subtle.importKey('raw', unb64u(b), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(box.iv) }, key, unb64u(box.ct));
  const j = JSON.parse(new TextDecoder().decode(plain));
  process.stdout.write(j.csv);
} else {
  console.log('Usage: node scripts/private-trip.mjs encrypt <trip.csv> "<title>" [key] | decrypt <file.enc> <key>');
}
