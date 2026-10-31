// src/utils/validate.js
const sanitizeHtml = require('sanitize-html');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LANG_RE = /^[a-zA-Z0-9+#._-]{1,32}$/;
const CONTENT_TYPES = new Set(['text', 'richtext', 'code']);
const MAX_CONTENT = 900000; // chars (~ under 2MB body limit even with base64 images)
const MAX_TAGS = 10;
const MAX_TAG_LEN = 32;
const MAX_TITLE = 200;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateRegistration({ username, email, password } = {}) {
  const errors = [];
  if (!isNonEmptyString(username) || !USERNAME_RE.test(username.trim())) {
    errors.push('Username must be 3-32 characters (letters, numbers, underscore)');
  }
  if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim()) || email.trim().length > 254) {
    errors.push('A valid email address is required');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    errors.push('Password must be between 8 and 128 characters');
  } else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one letter and one number');
  }
  return errors;
}

function normalizeTags(tags) {
  if (tags == null) return [];
  if (!Array.isArray(tags)) return null;
  const out = [];
  for (const t of tags) {
    if (typeof t !== 'string') return null;
    const clean = t.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function parseExpiry(expiresAt) {
  if (expiresAt == null || expiresAt === '' || expiresAt === 'never') return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return undefined; // invalid
  return d.toISOString();
}

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeExcerpt(content, contentType) {
  let text = content;
  if (contentType === 'richtext') text = stripHtml(content);
  text = String(text);
  if (text.length <= 300) return text;
  return text.slice(0, 300) + '…';
}

const RICH_OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
    'ol', 'ul', 'li', 'a', 'img', 'span', 'div', 'hr', 'sub', 'sup',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
  },
  disallowedTagsMode: 'discard',
};

function sanitizeRichText(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, RICH_OPTIONS);
}

function validateClipPayload(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (body.title !== undefined) {
    if (body.title == null) data.title = null;
    else if (typeof body.title !== 'string') errors.push('Title must be a string');
    else {
      const t = body.title.trim();
      if (t.length > MAX_TITLE) errors.push(`Title must be at most ${MAX_TITLE} characters`);
      else data.title = t || null;
    }
  } else if (!partial) data.title = null;

  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      errors.push('Content is required');
    } else if (body.content.length > MAX_CONTENT) {
      errors.push(`Content is too large (max ${MAX_CONTENT} characters)`);
    } else {
      data.content = body.content;
    }
  } else if (!partial) errors.push('Content is required');

  if (body.contentType !== undefined) {
    if (!CONTENT_TYPES.has(body.contentType)) errors.push('contentType must be text, richtext, or code');
    else data.content_type = body.contentType;
  } else if (!partial) data.content_type = 'text';

  if (body.language !== undefined) {
    if (body.language == null || body.language === '') data.language = null;
    else if (typeof body.language !== 'string' || !LANG_RE.test(body.language)) {
      errors.push('Invalid language identifier');
    } else data.language = body.language;
  } else if (!partial) data.language = null;

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== 'string')) {
      errors.push('Tags must be an array of strings');
    } else if (body.tags.length > MAX_TAGS) {
      errors.push(`Maximum ${MAX_TAGS} tags allowed`);
    } else {
      data.tags = normalizeTags(body.tags);
    }
  } else if (!partial) data.tags = [];

  for (const key of ['isPinned', 'isFavorite']) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') errors.push(`${key} must be a boolean`);
      else data[key === 'isPinned' ? 'is_pinned' : 'is_favorite'] = body[key] ? 1 : 0;
    } else if (!partial) data[key === 'isPinned' ? 'is_pinned' : 'is_favorite'] = 0;
  }

  if (body.expiresAt !== undefined) {
    const parsed = parseExpiry(body.expiresAt);
    if (parsed === undefined) errors.push('Invalid expiration date');
    else data.expires_at = parsed;
  }

  return { errors, data };
}

function sanitizeClipOutput(row, { includeContent = true } = {}) {
  if (!row) return null;
  const out = {
    id: Number(row.id),
    title: row.title,
    contentType: row.content_type,
    language: row.language || null,
    tags: JSON.parse(row.tags || '[]'),
    isPinned: !!row.is_pinned,
    isFavorite: !!row.is_favorite,
    copyCount: Number(row.copy_count || 0),
    viewCount: Number(row.view_count || 0),
    shareEnabled: !!row.share_enabled,
    hasShare: !!row.share_token,
    shareToken: row.share_token || null,
    hasPassword: !!row.password_hash,
    isOneTime: !!row.is_one_time,
    readCount: Number(row.read_count || 0),
    expiresAt: row.expires_at || null,
    expired: row.expires_at ? new Date(row.expires_at) < new Date() : false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeContent) {
    out.content = row.content;
    out.excerpt = makeExcerpt(row.content, row.content_type);
  } else {
    out.excerpt = row.excerpt || null;
  }
  return out;
}

module.exports = {
  validateRegistration,
  validateClipPayload,
  sanitizeRichText,
  sanitizeClipOutput,
  normalizeTags,
  makeExcerpt,
  parseExpiry,
  stripHtml,
  MAX_CONTENT,
  MAX_TITLE,
  MAX_TAGS,
};
