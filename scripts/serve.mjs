// Serves _site/ at http://localhost:8080/ (or $PORT) the way GitHub Pages does.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { OUT_DIR } from './lib.mjs';

const port = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

if (!existsSync(OUT_DIR)) {
  console.error('✗ _site/ not found. Run `npm run build` first (or just `npm start`).');
  process.exit(1);
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  let file = path.resolve(OUT_DIR, `.${decodeURIComponent(pathname)}`);
  if (file !== OUT_DIR && !file.startsWith(OUT_DIR + path.sep)) return res.writeHead(403).end();

  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!pathname.endsWith('/')) return res.writeHead(301, { Location: `${pathname}/` }).end();
    file = path.join(file, 'index.html');
  }
  let status = 200;
  if (!existsSync(file)) [status, file] = [404, path.join(OUT_DIR, '404.html')];

  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Serving _site/ at http://localhost:${port}/  (Ctrl+C to stop)`));
