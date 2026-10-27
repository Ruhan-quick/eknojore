// Imports a finished edition into editions/YYYY-MM-DD.html.
//
//   npm run add-edition -- <file.html> [--date YYYY-MM-DD] [--force]
//
// Embedded base64 fonts are moved to src/assets/fonts/ (shared by all editions), and an
// <meta name="edition-date"> tag is added so the date no longer depends on the file name.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EDITIONS_DIR, SRC_DIR, bnDate, detectDate, extractFonts, getMeta } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--date');

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!input) fail('Usage: npm run add-edition -- <file.html> [--date YYYY-MM-DD] [--force]');
if (!existsSync(input)) fail(`File not found: ${input}`);

let html = readFileSync(input, 'utf8');
const date = option('--date') ?? detectDate(html, input);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  fail(`Can't tell which day "${path.basename(input)}" is for. Pass it explicitly: --date YYYY-MM-DD`);
}

const dest = path.join(EDITIONS_DIR, `${date}.html`);
if (existsSync(dest) && path.resolve(dest) !== path.resolve(input) && !flag('--force')) {
  fail(`editions/${date}.html already exists. Re-run with --force to replace it.`);
}

const fontsDir = path.join(SRC_DIR, 'assets', 'fonts');
mkdirSync(fontsDir, { recursive: true });
const fonts = extractFonts(html, '/assets/fonts/', (name, bytes) => {
  const file = path.join(fontsDir, name);
  if (!existsSync(file)) writeFileSync(file, bytes);
});
html = fonts.html;

if (!getMeta(html, 'edition-date')) {
  const tag = `<meta name="edition-date" content="${date}">`;
  html = /<meta\s+charset[^>]*>/i.test(html)
    ? html.replace(/<meta\s+charset[^>]*>/i, (m) => `${m}\n${tag}`)
    : html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`);
}

mkdirSync(EDITIONS_DIR, { recursive: true });
writeFileSync(dest, html);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`✓ ${bnDate(date, { weekday: true })} → editions/${date}.html (${kb(Buffer.byteLength(html))})`);
if (fonts.count) console.log(`  moved ${fonts.count} embedded font(s) to src/assets/fonts/`);
