// src/server.js
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./app');
const maintenance = require('./services/maintenance');

const PORT = Number(process.env.PORT || 3000);
const TLS_PORT = Number(process.env.TLS_PORT || 443);
const CERT_PATH = process.env.TLS_CERT_PATH || path.join(__dirname, '..', 'certs', 'cert.pem');
const KEY_PATH = process.env.TLS_KEY_PATH || path.join(__dirname, '..', 'certs', 'key.pem');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set in production (see .env)');
  process.exit(1);
}

const app = createApp();
const hasTLS = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);
const servers = [];

function shutdown() {
  console.log('Shutting down gracefully...');
  maintenance.stop();
  for (const s of servers) {
    try {
      s.close(() => process.exit(0));
    } catch {
      /* noop */
    }
  }
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

if (hasTLS) {
  const tlsOptions = {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
    minVersion: 'TLSv1.2',
  };
  const httpsServer = https.createServer(tlsOptions, app);
  httpsServer.keepAliveTimeout = 65000;
  httpsServer.headersTimeout = 66000;
  httpsServer.listen(TLS_PORT, () => {
    console.log(`HTTPS server listening on port ${TLS_PORT}`);
  });
  servers.push(httpsServer);

  const httpServer = http.createServer((req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const target = TLS_PORT === 443 ? `https://${host}${req.url}` : `https://${host}:${TLS_PORT}${req.url}`;
    res.writeHead(301, { Location: target });
    res.end();
  });
  httpServer.listen(PORT === TLS_PORT ? 80 : PORT, () => {
    console.log(`HTTP redirect server listening on port ${PORT === TLS_PORT ? 80 : PORT}`);
  });
  servers.push(httpServer);

  maintenance.start();
} else {
  const httpServer = http.createServer(app);
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  httpServer.listen(PORT, () => {
    console.log(`Online Clipboard listening on http://localhost:${PORT}`);
  });
  servers.push(httpServer);
  maintenance.start();
}
