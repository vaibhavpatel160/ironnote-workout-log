import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'workouts.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
};

function readSavedState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch {
    // Ignore corrupted state file
  }
  return { bodyweight: 175, theme: 'notebook', workouts: [] };
}

function writeSavedState(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function createAppServer() {
  return http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Lightweight JSON sync endpoint
    if (reqUrl.pathname === '/api/state') {
      if (req.method === 'GET') {
        const state = readSavedState();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(state));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 2_000_000) req.destroy();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (!parsed || !Array.isArray(parsed.workouts)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid payload' }));
              return;
            }
            writeSavedState({
              bodyweight: Number(parsed.bodyweight) || 175,
              theme: parsed.theme === 'dark' ? 'dark' : 'notebook',
              workouts: parsed.workouts,
              updatedAt: Date.now()
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Malformed JSON' }));
          }
        });
        return;
      }
    }

    // Static file serving
    let relPath = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname;
    const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    const fullPath = path.join(__dirname, safePath);

    if (!fullPath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(fullPath).pipe(res);
    });
  });
}

function getLocalLanIp() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const server = createAppServer();
  server.listen(port, '0.0.0.0', () => {
    const lanIp = getLocalLanIp();
    console.log(`\nIronNote Workout Tracker running!`);
    console.log(`  Local:   http://localhost:${port}`);
    if (lanIp) {
      console.log(`  Phone:   http://${lanIp}:${port}  (open on same Wi-Fi, then Add to Home Screen)`);
    }
    console.log('');
  });
}
