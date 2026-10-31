// src/app.js
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const clipRoutes = require('./routes/clips');
const shareRoutes = require('./routes/share');
const { globalLimiter } = require('./middleware/rateLimit');
const { db } = require('./config/database');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'manifest-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'frame-ancestors': ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(compression());
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(globalLimiter);

  // Static assets with sane caching
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders(res, filePath) {
        const base = path.basename(filePath);
        if (base === 'index.html' || base === 'sw.js' || base === 'manifest.webmanifest') {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}vendor${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=604800');
        } else if (/\.[a-f0-9]{8}\./.test(base)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    })
  );

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/clips', clipRoutes);
  app.use('/api/share', shareRoutes);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
  });

  app.get('/ready', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'degraded', error: err.message });
    }
  });

  // API 404s must be JSON, never the SPA
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // SPA fallback (client-side routes like /s/:token)
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!req.accepts('html')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Malformed JSON / generic errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large' || err.status === 413) {
      return res.status(err.status === 413 ? 413 : 400).json({ error: 'Invalid request body' });
    }
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
