// src/routes/clips.js
const express = require('express');
const router = express.Router();
const Clip = require('../models/Clip');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const {
  validateClipPayload,
  sanitizeClipOutput,
  sanitizeRichText,
  normalizeTags,
  parseExpiry,
  makeExcerpt,
  stripHtml,
} = require('../utils/validate');
const { hashPassword } = require('../utils/password');
const { nowISO } = require('../config/database');
const QRCode = require('qrcode');

router.use(authenticate);

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${req.headers.host || 'localhost'}`;
}

function sharePath(token) {
  return `/s/${token}`;
}

function clipId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Clip not found' });
    return null;
  }
  return id;
}

// List / search clips
router.get('/', async (req, res) => {
  const { q: qParam, search, tag, favorite, pinned, type, sort, limit, offset } = req.query;
  const q = qParam || search;
  const items = await Clip.list(Number(req.user.id), {
    q,
    tag,
    favorite,
    pinned,
    type,
    sort,
    limit,
    offset,
  });
  res.json({
    items: items.map((row) => sanitizeClipOutput(row)),
    total: items.length,
  });
});

// Tag list + stats for sidebar
router.get('/tags', async (req, res) => {
  res.json({ tags: await Clip.tagsWithCounts(Number(req.user.id)) });
});

router.get('/stats', async (req, res) => {
  res.json(await Clip.stats(Number(req.user.id)));
});

// Export all (JSON download)
router.get('/export', async (req, res) => {
  const items = await Clip.exportAll(Number(req.user.id));
  const payload = {
    app: 'online-clipboard',
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="clipboard-export-${Date.now()}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

// Import (JSON)
router.post('/import', writeLimiter, async (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body) ? body : body.items;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Body must contain an items array' });
  }
  if (items.length > 500) {
    return res.status(400).json({ error: 'Import is limited to 500 items at a time' });
  }
  let imported = 0;
  const errors = [];
  const now = nowISO();
  for (const [index, raw] of items.entries()) {
    if (!raw || typeof raw !== 'object') {
      errors.push({ index, error: 'Not an object' });
      continue;
    }
    const contentType = ['text', 'richtext', 'code'].includes(raw.contentType || raw.content_type)
      ? raw.contentType || raw.content_type
      : 'text';
    const content = typeof raw.content === 'string' ? raw.content.slice(0, 900000) : '';
    if (!content.trim()) {
      errors.push({ index, error: 'Missing content' });
      continue;
    }
    const tags = normalizeTags(raw.tags) || [];
    let language = null;
    if (typeof raw.language === 'string' && raw.language.length <= 32) language = raw.language;
    let expiresAt = null;
    const parsedExpiry = parseExpiry(raw.expiresAt || raw.expires_at);
    if (parsedExpiry) expiresAt = parsedExpiry;

    const finalContent = contentType === 'richtext' ? sanitizeRichText(content) : content;
    await Clip.create(
      Number(req.user.id),
      {
        title: typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) || null : null,
        content: finalContent,
        content_type: contentType,
        language,
        tags,
        is_pinned: raw.isPinned ? 1 : 0,
        is_favorite: raw.isFavorite ? 1 : 0,
        expires_at: expiresAt,
      },
      { createdAt: now, updatedAt: now }
    );
    imported++;
  }
  await Clip.log(Number(req.user.id), 'import', `${imported} items`, req.ip);
  res.status(201).json({ imported, errors });
});

// Create clip
router.post('/', writeLimiter, async (req, res) => {
  const { errors, data } = validateClipPayload(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const share = !!req.body.share;
  const passwordHash = req.body.sharePassword
    ? hashPassword(String(req.body.sharePassword))
    : null;
  const id = await Clip.create(Number(req.user.id), data, {
    passwordHash,
    share,
  });
  const row = await Clip.findByIdForUser(id, Number(req.user.id));
  await Clip.log(Number(req.user.id), 'create', `clip ${id}`, req.ip);
  const out = sanitizeClipOutput(row);
  if (out.shareEnabled) out.shareUrl = sharePath(row.share_token);
  res.status(201).json(out);
});

// Read single clip
router.get('/:id', async (req, res) => {
  const id = clipId(req, res);
  if (!id) return;
  const row = await Clip.findByIdForUser(id, Number(req.user.id));
  if (!row) return res.status(404).json({ error: 'Clip not found' });
  const out = sanitizeClipOutput(row);
  if (out.shareEnabled) out.shareUrl = sharePath(row.share_token);
  res.json(out);
});

// Update clip
router.patch('/:id', writeLimiter, async (req, res) => {
  const id = clipId(req, res);
  if (!id) return;
  const existing = await Clip.findByIdForUser(id, Number(req.user.id));
  if (!existing) return res.status(404).json({ error: 'Clip not found' });

  const { errors, data } = validateClipPayload(req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields to update' });

  await Clip.update(id, Number(req.user.id), data);
  const row = await Clip.findByIdForUser(id, Number(req.user.id));
  const out = sanitizeClipOutput(row);
  if (out.shareEnabled) out.shareUrl = sharePath(row.share_token);
  res.json(out);
});

// Record a copy event (history stats)
router.patch('/:id/copy', async (req, res) => {
  const id = clipId(req, res);
  if (!id) return;
  const changes = await Clip.markCopied(id, Number(req.user.id));
  if (!changes) return res.status(404).json({ error: 'Clip not found' });
  res.json({ ok: true });
});

// Favorite / pin quick toggles
router.patch('/:id/flags', async (req, res) => {
  const body = req.body || {};
  const data = {};
  if (typeof body.isFavorite === 'boolean') data.is_favorite = body.isFavorite ? 1 : 0;
  if (typeof body.isPinned === 'boolean') data.is_pinned = body.isPinned ? 1 : 0;
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No flags provided' });
  const id = clipId(req, res);
  if (!id) return;
  const changes = await Clip.update(id, Number(req.user.id), data);
  if (!changes) return res.status(404).json({ error: 'Clip not found' });
  const row = await Clip.findByIdForUser(id, Number(req.user.id));
  res.json(sanitizeClipOutput(row));
});

// Delete clip
router.delete('/:id', async (req, res) => {
  const id = clipId(req, res);
  if (!id) return;
  const changes = await Clip.remove(id, Number(req.user.id));
  if (!changes) return res.status(404).json({ error: 'Clip not found' });
  await Clip.log(Number(req.user.id), 'delete', `clip ${id}`, req.ip);
  res.json({ ok: true });
});

// Share settings
router.post('/:id/share', writeLimiter, async (req, res) => {
  const id = clipId(req, res);
  if (!id) return;
  const userId = Number(req.user.id);
  const body = req.body || {};

  if (body.enabled === false) {
    const changes = await Clip.disableShare(id, userId);
    if (!changes) return res.status(404).json({ error: 'Clip not found' });
    return res.json({ shareEnabled: false });
  }

  const opts = {
    isOneTime: !!body.oneTime,
    regenerate: !!body.regenerate || !!body.rotate || body.revoke === true,
  };
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length > 128) {
      return res.status(400).json({ error: 'Share password must be 4-128 characters' });
    }
    opts.passwordHash = hashPassword(body.password);
  } else if (body.clearPassword === true) {
    opts.passwordHash = null;
  } else {
    // keep existing password when not specified
    const existing = await Clip.findByIdForUser(id, userId);
    if (!existing) return res.status(404).json({ error: 'Clip not found' });
    opts.passwordHash = existing.password_hash;
  }

  const token = await Clip.enableShare(id, userId, opts);
  if (!token) return res.status(404).json({ error: 'Clip not found' });
  const row = await Clip.findByIdForUser(id, userId);
  await Clip.log(userId, 'share', `clip ${id}`, req.ip);
  const out = sanitizeClipOutput(row);
  out.shareUrl = sharePath(token);
  res.json(out);
});

// QR code (PNG) for the share link
router.get('/:id/qr', async (req, res) => {
  const id = clipId(req, res);
  if (!id) return;
  const row = await Clip.findByIdForUser(id, Number(req.user.id));
  if (!row) return res.status(404).json({ error: 'Clip not found' });
  if (!row.share_enabled || !row.share_token) {
    return res.status(400).json({ error: 'Sharing is not enabled for this clip' });
  }
  try {
    const url = baseUrl(req) + sharePath(row.share_token);
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(png);
  } catch (err) {
    console.error('QR generation failed:', err.message);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Single clip export as txt/html/md
router.get('/:id/export', async (req, res) => {
  const id = clipId(req, res);
  if (!id) return;
  const row = await Clip.findByIdForUser(id, Number(req.user.id));
  if (!row) return res.status(404).json({ error: 'Clip not found' });
  const safeName = (row.title || 'clip').replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 50) || 'clip';
  const format = (req.query.format || 'txt').toLowerCase();

  if (format === 'html') {
    const body = row.content_type === 'richtext' ? row.content : `<pre>${escapeHtml(row.content)}</pre>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(row.title || 'Clip')}</title></head><body>${body}</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.html"`);
    return res.send(html);
  }
  if (format === 'md') {
    const fenced = '```' + (row.language || '') + '\n' + row.content + '\n```';
    const md = row.content_type === 'code' ? fenced : row.content;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.md"`);
    return res.send(md);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.txt"`);
  res.send(row.content_type === 'richtext' ? stripHtml(row.content) + '\n' : row.content);
});

function escapeHtml(s) {
  return String(s)
    .replaceAll('\x26', '\x26amp;')
    .replaceAll('\x3C', '\x26lt;')
    .replaceAll('\x3E', '\x26gt;')
    .replaceAll('"', '\x26quot;')
    .replaceAll("'", '\x26#39;');
}

module.exports = router;
