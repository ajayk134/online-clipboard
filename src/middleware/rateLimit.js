// src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const disabled = () => process.env.RATE_LIMIT_DISABLED === '1';

function limiter(options) {
  if (disabled()) return (req, res, next) => next();
  return rateLimit(options);
}

const globalLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, try again later' },
});

const writeLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

const shareAccessLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts to access shared links, try again later' },
});

module.exports = { globalLimiter, authLimiter, writeLimiter, shareAccessLimiter };
