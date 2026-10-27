// Shared helpers for the build, add-edition and serve scripts. No dependencies.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EDITIONS_DIR = path.join(ROOT, 'editions');
export const SRC_DIR = path.join(ROOT, 'src');
export const OUT_DIR = path.join(ROOT, '_site');

export const loadConfig = () => JSON.parse(readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

// ---------- Text ----------

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Inner HTML -> plain text (tags stripped, entities decoded, whitespace collapsed).
export const text = (html) => String(html)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENTITIES[e.toLowerCase()] ?? m;
  })
  .replace(/\s+/g, ' ')
  .trim();

// ---------- Bengali dates ----------

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

export const bnNum = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[d]);

const utc = (date) => new Date(`${date}T00:00:00Z`);

// '2026-10-27' -> 'মঙ্গলবার, ২৭ অক্টোবর ২০২৬' (parts can be switched off)
export function bnDate(date, { weekday = false, year = true } = {}) {
  const d = utc(date);
  let s = `${bnNum(d.getUTCDate())} ${BN_MONTHS[d.getUTCMonth()]}`;
  if (year) s += ` ${bnNum(d.getUTCFullYear())}`;
  return weekday ? `${BN_WEEKDAYS[d.getUTCDay()]}, ${s}` : s;
}
export const bnDay = (date) => bnNum(utc(date).getUTCDate());
export const bnMonth = (date) => BN_MONTHS[utc(date).getUTCMonth()];
export const bnWeekday = (date) => BN_WEEKDAYS[utc(date).getUTCDay()];
export const bnMonthYear = (date) => `${bnMonth(date)} ${bnNum(utc(date).getUTCFullYear())}`;

// ---------- Editions ----------

// Value of <meta name|property="key" content="..."> regardless of attribute order.
export function getMeta(html, key) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = (a) => tag.match(new RegExp(`\\b${a}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2];
    if ((attr('name') ?? attr('property'))?.toLowerCase() === key) return text(attr('content') ?? '');
  }
  return null;
}

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function isoDate(y, m, d) {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return !Number.isNaN(utc(s).getTime()) && utc(s).toISOString().startsWith(s) ? s : null;
}

// An edition's date comes from <meta name="edition-date">, else the file name:
// '2026-10-27.html' or 'ajker-khobor-27-oct-2026.html'.
export function detectDate(html, file) {
  const meta = getMeta(html, 'edition-date');
  if (meta) return /^\d{4}-\d{2}-\d{2}$/.test(meta) ? isoDate(...meta.split('-')) : null;
  const name = path.basename(file).toLowerCase();
  let m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isoDate(m[1], m[2], m[3]);
  m = name.match(/(\d{1,2})-([a-z]{3})[a-z]*-(\d{4})/);
  if (m && EN_MONTHS.includes(m[2])) return isoDate(m[3], EN_MONTHS.indexOf(m[2]) + 1, m[1]);
  return null;
}

export function parseEdition(html, file) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  return {
    date: detectDate(html, file),
    title: text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description: getMeta(html, 'description') ?? '',
    published: getMeta(html, 'edition-published'),
    headlines: [...body.matchAll(/<h[34][^>]*>([\s\S]*?)<\/h[34]>/gi)].map((m) => text(m[1])).filter(Boolean),
    image: text(body.match(/<img\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1] ?? '') || null,
  };
}

// ---------- Fonts ----------

const FONT_DATA_RE = /url\(\s*(["']?)data:(?:font\/|application\/(?:x-)?font-?)(woff2|woff|ttf|otf|truetype|opentype|sfnt)[^;,]*;base64,([A-Za-z0-9+/=\s]+)\1\s*\)/gi;
const FONT_EXT = { woff2: 'woff2', woff: 'woff', ttf: 'ttf', truetype: 'ttf', sfnt: 'ttf', otf: 'otf', opentype: 'otf' };

// Moves base64 fonts out of @font-face rules. `save(name, bytes)` stores each file and
// the rule is pointed at `${urlPrefix}${name}`. Names are content-addressed, so a font
// embedded in every edition ends up as one file that browsers cache across days.
export function extractFonts(html, urlPrefix, save) {
  let count = 0;
  const out = html.replace(/@font-face\s*\{[^}]*\}/gi, (rule) => {
    const family = rule.match(/font-family\s*:\s*["']?([^;"'}]+)/i)?.[1].trim() ?? 'font';
    const weight = rule.match(/font-weight\s*:\s*([^;}]+)/i)?.[1].trim().replace(/\s+/g, '_') ?? '400';
    const style = /font-style\s*:\s*italic/i.test(rule) ? '-italic' : '';
    const subset = /unicode-range/i.test(rule) ? (/U\+0+-0*FF\b/i.test(rule) ? '-latin' : '-subset') : '';
    const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font';
    return rule.replace(FONT_DATA_RE, (_, quote, type, b64) => {
      const bytes = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
      const name = `${slug}-${weight}${style}${subset}-${hash}.${FONT_EXT[type.toLowerCase()]}`;
      save(name, bytes);
      count++;
      return `url("${urlPrefix}${name}")`;
    });
  });
  return { html: out, count };
}
