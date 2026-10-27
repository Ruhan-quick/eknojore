// Builds the site into _site/.
//
//   node scripts/build.mjs           production build (URL from site.config.json, else $SITE_URL)
//   node scripts/build.mjs --local   build for http://localhost:8080/
//
// Every editions/*.html file becomes editions/YYYY-MM-DD/; the newest one is also the home
// page. Edition files keep their own design: the build only adds the site header, footer,
// prev/next links and meta tags around them. Files starting with "_" are treated as drafts.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDITIONS_DIR, OUT_DIR, SRC_DIR, bnDate, bnDay, bnMonth, bnMonthYear, bnNum, esc, extractFonts,
  loadConfig, parseEdition,
} from './lib.mjs';

const config = loadConfig();
const port = process.env.PORT || 8080;
const rawUrl = process.argv.includes('--local')
  ? `http://localhost:${port}/`
  : config.url || process.env.SITE_URL || `http://localhost:${port}/`;
const siteUrl = rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`;
const base = new URL(siteUrl).pathname; // '/', or '/repo-name/' on a GitHub project site
const href = (p = '') => base + p; // link within the site
const abs = (p = '') => new URL(p, siteUrl).href; // absolute URL for feeds and social cards

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// ---------- Editions, newest first ----------

const editions = (existsSync(EDITIONS_DIR) ? readdirSync(EDITIONS_DIR) : [])
  .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
  .map((file) => {
    const html = readFileSync(path.join(EDITIONS_DIR, file), 'utf8');
    const ed = { file, html, ...parseEdition(html, file) };
    if (!ed.date) fail(`editions/${file}: can't tell its date. Name it YYYY-MM-DD.html or add <meta name="edition-date" content="YYYY-MM-DD">.`);
    ed.path = `editions/${ed.date}/`;
    ed.lead = ed.headlines[0] || ed.title;
    ed.published ||= `${ed.date}T00:00:00${config.utcOffset}`;
    if (Number.isNaN(Date.parse(ed.published))) fail(`editions/${file}: edition-published "${ed.published}" is not a valid date-time.`);
    return ed;
  })
  .sort((a, b) => b.date.localeCompare(a.date));

if (!editions.length) fail('No editions in editions/. Add one with: npm run add-edition -- <file.html>');
for (let i = 1; i < editions.length; i++) {
  if (editions[i].date === editions[i - 1].date) fail(`Two editions for ${editions[i].date}: ${editions[i - 1].file} and ${editions[i].file}`);
}

const latest = editions[0];

// ---------- Shared pieces ----------

const NAV = [['', 'আজকের খবর'], ['archive/', 'আর্কাইভ'], ['about/', 'পরিচিতি']];

const brand = () => `<a class="ekn-brand" href="${href()}"><span class="ekn-logo" aria-hidden="true"></span>${esc(config.name)}</a>`;

const topBar = (active) => `<header class="ekn-bar"><div class="ekn-bar-in">
${brand()}
<nav class="ekn-nav" aria-label="প্রধান মেনু">${NAV.map(([p, label]) =>
  `<a href="${href(p)}"${p === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
</div></header>`;

const siteFooter = () => `<footer class="ekn-foot"><div class="ekn-foot-in">
<div>${brand()}<p>${esc(config.tagline)}</p></div>
<nav aria-label="ফুটার মেনু"><a href="${href('archive/')}">আর্কাইভ</a><a href="${href('about/')}">পরিচিতি</a><a href="${href('feed.xml')}">আরএসএস ফিড</a></nav>
<p class="ekn-copy">© ${bnNum(latest.date.slice(0, 4))} ${esc(config.name)}</p>
</div></footer>`;

const card = (ed) => `<a class="ekn-card" href="${href(ed.path)}">
<span class="ekn-cal" aria-hidden="true"><span>${bnMonth(ed.date)}</span><b>${bnDay(ed.date)}</b></span>
<span class="ekn-card-body">
<span class="ekn-card-meta">${bnDate(ed.date, { weekday: true })}${ed === latest ? '<em>সর্বশেষ</em>' : ''}</span>
<strong>${esc(ed.lead)}</strong>
${ed.headlines.length > 1 ? `<span class="ekn-card-more">${esc(ed.headlines.slice(1, 4).join(' · '))}</span>` : ''}
</span></a>`;

const sectionHead = (title, id = '') => `<div class="ekn-head"><h2${id ? ` id="${id}"` : ''}>${title}</h2><span class="ekn-rule"></span></div>`;

function headTags({ path: p, title, description, image, published, noindex }) {
  const url = p == null ? null : abs(p);
  const tags = [
    url && `<link rel="canonical" href="${esc(url)}">`,
    `<link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml">`,
    `<link rel="alternate" type="application/rss+xml" title="${esc(config.name)}" href="${href('feed.xml')}">`,
    `<link rel="stylesheet" href="${href('assets/site.css')}">`,
    `<meta name="theme-color" content="${esc(config.themeColor)}">`,
    noindex && '<meta name="robots" content="noindex">',
    `<meta property="og:site_name" content="${esc(config.name)}">`,
    `<meta property="og:locale" content="${esc(config.locale)}">`,
    `<meta property="og:type" content="${published ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    url && `<meta property="og:url" content="${esc(url)}">`,
    image && `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    published && `<meta property="article:published_time" content="${esc(published)}">`,
  ];
  if (published) {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: title,
      description,
      inLanguage: config.lang,
      datePublished: published,
      ...(image && { image: [image] }),
      ...(url && { mainEntityOfPage: url }),
      publisher: { '@type': 'Organization', name: config.name },
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.filter(Boolean).join('\n');
}

// Root-absolute links ("/assets/…") in edition and page files → the site's base path.
const rebase = (html) => base === '/' ? html : html
  .replace(/(\s(?:href|src|poster|action)\s*=\s*["'])\/(?!\/)/gi, (_, attr) => attr + base)
  .replace(/url\(\s*(["']?)\/(?!\/)/gi, (_, quote) => `url(${quote}${base}`);

const setTitle = (html, title) => /<title[^>]*>[\s\S]*?<\/title>/i.test(html)
  ? html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, () => `<title>${esc(title)}</title>`)
  : html.replace(/<\/head>/i, () => `<title>${esc(title)}</title>\n</head>`);

// ---------- Edition pages ----------

const fontsOut = path.join(OUT_DIR, 'assets', 'fonts');

const pager = (older, newer) => !older && !newer ? '' : `<nav class="ekn-pager" aria-label="অন্যান্য সংস্করণ">
${older ? `<a class="ekn-prev" href="${href(older.path)}"><span>← আগের সংস্করণ</span><b>${bnDate(older.date, { weekday: true })}</b></a>` : ''}
${newer ? `<a class="ekn-next" href="${href(newer.path)}"><span>পরের সংস্করণ →</span><b>${bnDate(newer.date, { weekday: true })}</b></a>` : ''}
</nav>`;

const moreEditions = () => editions.length < 2 ? '' : `<section class="ekn-more" aria-labelledby="ekn-more-h">
${sectionHead('আগের সংস্করণ', 'ekn-more-h')}
<div class="ekn-cards">${editions.slice(1, 1 + config.recentEditions).map(card).join('\n')}</div>
<a class="ekn-all" href="${href('archive/')}">সব সংস্করণ দেখুন →</a>
</section>`;

function renderEdition(ed, i, home) {
  const title = home
    ? `${config.name} · ${ed.title}`
    : ed.title.includes(config.name) ? ed.title : `${ed.title} | ${config.name}`;
  const description = ed.description || config.tagline;

  // Editions dropped straight into editions/ may still carry base64 fonts.
  let html = extractFonts(ed.html, '/assets/fonts/', (name, bytes) => {
    const file = path.join(fontsOut, name);
    if (!existsSync(file)) writeFileSync(file, bytes);
  }).html;

  html = rebase(html)
    .replace(/@font-face\s*\{(?![^}]*font-display)/gi, '@font-face{font-display:swap;')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>\s*|<meta\b[^>]*(?:property=["']og:|name=["']twitter:)[^>]*>\s*/gi, '');
  html = setTitle(html, title);

  const head = headTags({
    path: home ? '' : ed.path,
    title: home ? title : ed.title,
    description,
    image: ed.image,
    published: home ? null : ed.published,
  });
  const after = home ? moreEditions() : pager(editions[i + 1], editions[i - 1]);

  return html
    .replace(/<\/head>/i, () => `${head}\n</head>`)
    .replace(/<body[^>]*>/i, (tag) => `${tag}\n${topBar(home ? '' : null)}`)
    .replace(/<\/body>/i, () => `${after}\n${siteFooter()}\n</body>`);
}

// ---------- Site pages ----------

const mast = (pill, title, sub) => `<header class="ekn-mast">
<span class="ekn-pill">${pill}</span>
<h1>${title}</h1>
${sub ? `<p>${sub}</p>` : ''}
</header>`;

const shell = ({ path: p, active = null, title, description, body, noindex = false }) => `<!doctype html>
<html lang="${esc(config.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${headTags({ path: p, title, description, noindex })}
</head>
<body class="ekn-shell">
${topBar(active)}
<main class="ekn-main">
${body}
</main>
${siteFooter()}
</body>
</html>
`;

const byMonth = Map.groupBy(editions, (ed) => ed.date.slice(0, 7));

const archivePage = shell({
  path: 'archive/',
  active: 'archive/',
  title: `আর্কাইভ | ${config.name}`,
  description: `${config.name}-এর সব সংস্করণ, তারিখ অনুযায়ী।`,
  body: `${mast('আর্কাইভ', 'সব সংস্করণ', `মোট ${bnNum(editions.length)}টি সংস্করণ · সর্বশেষ ${bnDate(latest.date, { weekday: true })}`)}
<div class="ekn-sec">
${[...byMonth.values()].map((eds) => `<section class="ekn-month">
${sectionHead(bnMonthYear(eds[0].date))}
<div class="ekn-cards">${eds.map(card).join('\n')}</div>
</section>`).join('\n')}
</div>`,
});

const aboutPage = shell({
  path: 'about/',
  active: 'about/',
  title: `পরিচিতি | ${config.name}`,
  description: config.tagline,
  body: `${mast('পরিচিতি', `${esc(config.name)} সম্পর্কে`, esc(config.tagline))}
<div class="ekn-sec"><div class="ekn-prose">
${rebase(readFileSync(path.join(SRC_DIR, 'pages', 'about.html'), 'utf8'))}
</div></div>`,
});

const notFoundPage = shell({
  path: null,
  title: `পাতাটি পাওয়া যায়নি | ${config.name}`,
  description: 'এই ঠিকানায় কোনো পাতা নেই।',
  noindex: true,
  body: `${mast('৪০৪', 'পাতাটি পাওয়া যায়নি', 'ঠিকানাটি ভুল হতে পারে, অথবা পাতাটি সরিয়ে নেওয়া হয়েছে।')}
<div class="ekn-sec"><div class="ekn-btns">
<a class="ekn-btn" href="${href()}">আজকের খবর পড়ুন</a>
<a class="ekn-btn ekn-btn-alt" href="${href('archive/')}">আর্কাইভ দেখুন</a>
</div></div>`,
});

// ---------- Feed, sitemap, robots ----------

const rfc822 = (iso) => new Date(iso).toUTCString();
const cdata = (s) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(config.name)}</title>
<link>${abs()}</link>
<description>${esc(config.tagline)}</description>
<language>${esc(config.lang)}</language>
<lastBuildDate>${rfc822(latest.published)}</lastBuildDate>
<atom:link href="${abs('feed.xml')}" rel="self" type="application/rss+xml"/>
${editions.slice(0, config.feedItems).map((ed) => `<item>
<title>${esc(ed.title)}</title>
<link>${abs(ed.path)}</link>
<guid isPermaLink="true">${abs(ed.path)}</guid>
<pubDate>${rfc822(ed.published)}</pubDate>
<description>${cdata(`${ed.description ? `<p>${esc(ed.description)}</p>` : ''}<ul>${ed.headlines.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`)}</description>
</item>`).join('\n')}
</channel>
</rss>
`;

const sitemapUrls = [['', latest.date], ['archive/', latest.date], ['about/'], ...editions.map((ed) => [ed.path, ed.date])];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(([p, date]) => `<url><loc>${abs(p)}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;

// ---------- Write _site/ ----------

rmSync(OUT_DIR, { recursive: true, force: true });
cpSync(path.join(SRC_DIR, 'assets'), path.join(OUT_DIR, 'assets'), { recursive: true });
cpSync(path.join(SRC_DIR, 'favicon.svg'), path.join(OUT_DIR, 'favicon.svg'));
mkdirSync(fontsOut, { recursive: true });

const write = (p, content) => {
  const file = path.join(OUT_DIR, p);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
};

editions.forEach((ed, i) => write(`${ed.path}index.html`, renderEdition(ed, i, false)));
write('index.html', renderEdition(latest, 0, true));
write('archive/index.html', archivePage);
write('about/index.html', aboutPage);
write('404.html', notFoundPage);
write('feed.xml', feed);
write('sitemap.xml', sitemap);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${abs('sitemap.xml')}\n`);
write('.nojekyll', '');

console.log(`✓ Built ${editions.length} edition(s) → _site/  (latest: ${latest.date}, site: ${siteUrl})`);
