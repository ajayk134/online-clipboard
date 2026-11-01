// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    return 'dev-only-secret';
  }
  return secret;
}

function signToken(user) {
  return jwt.sign({ sub: Number(user.id), ver: Number(user.token_version || 0) }, getSecret(), {
    expiresIn: '7d',
    issuer: 'online-clipboard',
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { issuer: 'online-clipboard' });
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const user = await User.findById(payload.sub);
  if (!user || Number(user.token_version || 0) !== Number(payload.ver)) {
    return res.status(401).json({ error: 'Session is no longer valid' });
  }
  req.user = user;
  next();
}

module.exports = { authenticate, signToken, verifyToken };
