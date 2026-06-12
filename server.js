const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Static files
  if (req.method === 'GET' && pathname === '/') {
    return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  if (req.method === 'GET' && (pathname === '/main.js' || pathname === '/styles.css')) {
    return serveStatic(res, path.join(PUBLIC_DIR, pathname.slice(1)));
  }

  // GET /api/products
  if (req.method === 'GET' && pathname === '/api/products') {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('product-') && f.endsWith('.json'));
    const products = files.map(f => {
      const slug = f.replace('product-', '').replace('.json', '');
      try {
        const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
        return { slug, displayName: d.meta?.displayName || slug };
      } catch { return { slug, displayName: slug }; }
    });
    return json(res, products);
  }

  // GET /api/fields
  if (req.method === 'GET' && pathname === '/api/fields') {
    try {
      const data = fs.readFileSync(path.join(DATA_DIR, 'fields.json'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(data);
    } catch { return json(res, { error: 'fields.json not found' }, 500); }
  }

  // GET /api/product/:slug
  const getMatch = pathname.match(/^\/api\/product\/([^/]+)$/);
  if (req.method === 'GET' && getMatch) {
    const slug = getMatch[1];
    const file = path.join(DATA_DIR, `product-${slug}.json`);
    try {
      const data = fs.readFileSync(file, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(data);
    } catch { return json(res, { error: 'Not found' }, 404); }
  }

  // POST /api/product/:slug
  const postMatch = pathname.match(/^\/api\/product\/([^/]+)$/);
  if (req.method === 'POST' && postMatch) {
    const slug = postMatch[1];
    const file = path.join(DATA_DIR, `product-${slug}.json`);
    try {
      const body = await readBody(req);
      fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf8');
      return json(res, { ok: true });
    } catch (e) { return json(res, { error: e.message }, 400); }
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`G2 app running at http://localhost:${PORT}`));
