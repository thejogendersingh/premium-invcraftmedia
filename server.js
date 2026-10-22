const http = require('http');
const fs = require('fs');
const path = require('path');

// Prefer process.cwd() (used in Vercel serverless environment), fallback to __dirname
const ROOT = fs.existsSync(path.join(process.cwd(), 'index.html'))
  ? process.cwd()
  : __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function handleRequest(req, res) {
  let requestedPath = '';
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const pathParam = urlObj.searchParams.get('path');
    if (pathParam !== null && pathParam !== undefined) {
      requestedPath = pathParam;
    } else {
      requestedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || urlObj.pathname;
    }
    requestedPath = decodeURIComponent(requestedPath);
  } catch (e) {
    requestedPath = req.url || '';
  }

  // Strip leading slashes
  let relativePath = requestedPath.replace(/^\/+/, '');
  if (!relativePath || relativePath === '' || relativePath === 'server.js') {
    relativePath = 'index.html';
  }

  // Prevent directory traversal
  const safeRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(ROOT, safeRelative);

  // If directory, check for index.html inside
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Fallbacks: .html extension or index.html
  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (!path.extname(filePath)) {
      filePath = path.join(ROOT, 'index.html');
    }
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`
      });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

// Export request handler for Vercel Serverless Function
module.exports = handleRequest;

// If executed directly (e.g. `node server.js` for local development), start listener
if (require.main === module) {
  const server = http.createServer(handleRequest);

  function startServer(port) {
    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
  }

  const defaultPort = parseInt(process.env.PORT, 10) || 5173;
  startServer(defaultPort);
}
