// src/routes/share.js
const express = require('express');
const router = express.Router();
const Clip = require('../models/Clip');
const { shareAccessLimiter } = require('../middleware/rateLimit');
const { verifyPassword } = require('../utils/password');

function isExpired(row) {
  return !!row.expires_at && new Date(row.expires_at) < new Date();
}

function isBurned(row) {
  return !!row.is_one_time && Number(row.read_count) > 0;
}

// Public metadata (no content leaks)
router.get('/:token/meta', shareAccessLimiter, async (req, res) => {
  const row = await Clip.findByShareToken(String(req.params.token));
  if (!row || !row.share_enabled) {
    return res.status(404).json({ error: 'This share link does not exist' });
  }
  if (isExpired(row)) return res.status(410).json({ error: 'This share link has expired', expired: true });
  if (isBurned(row)) return res.status(410).json({ error: 'This one-time link has already been used', burned: true });
  res.json(Clip.shareMeta(row));
});

// Access the content (verifies password, burns one-time links atomically)
router.post('/:token/access', shareAccessLimiter, async (req, res) => {
  const row = await Clip.findByShareToken(String(req.params.token));
  if (!row || !row.share_enabled) {
    return res.status(404).json({ error: 'This share link does not exist' });
  }
  if (isExpired(row)) return res.status(410).json({ error: 'This share link has expired', expired: true });
  if (isBurned(row)) return res.status(410).json({ error: 'This one-time link has already been used', burned: true });

  if (row.password_hash) {
    const password = (req.body || {}).password;
    if (typeof password !== 'string' || !password) {
      return res.status(401).json({ error: 'Password required', needsPassword: true });
    }
    if (!verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password', needsPassword: true });
    }
  }

  // For one-time links, mark consumed atomically before revealing content
  if (row.is_one_time && !(await Clip.consumeOneTime(row.id))) {
    return res.status(410).json({ error: 'This one-time link has already been used', burned: true });
  }

  await Clip.registerView(row.id);
  await Clip.log(null, 'share_access', `clip ${row.id}`, req.ip);

  res.json({
    title: row.title,
    content: row.content,
    contentType: row.content_type,
    language: row.language || null,
    consumed: !!row.is_one_time,
    expiresAt: row.expires_at || null,
  });
});

module.exports = router;
