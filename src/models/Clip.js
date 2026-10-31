// src/models/Clip.js
const { get, all, run, nowISO } = require('../config/database');
const { shareToken } = require('../utils/ids');
const { makeExcerpt, sanitizeRichText } = require('../utils/validate');

class Clip {
  static create(userId, data, { passwordHash = null, share = false } = {}) {
    const content =
      data.content_type === 'richtext' ? sanitizeRichText(data.content) : data.content;
    const excerpt = makeExcerpt(content, data.content_type);
    const token = share ? shareToken() : null;

    const result = run(
      `INSERT INTO clipboard_items
        (user_id, title, content, excerpt, content_type, language, tags,
         is_pinned, is_favorite, expires_at, share_token, share_enabled, is_one_time, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      data.title ?? null,
      content,
      excerpt,
      data.content_type || 'text',
      data.language ?? null,
      JSON.stringify(data.tags || []),
      data.is_pinned ? 1 : 0,
      data.is_favorite ? 1 : 0,
      data.expires_at ?? null,
      token,
      share && token ? 1 : 0,
      0,
      passwordHash
    );
    return Number(result.lastInsertRowid);
  }

  static findById(id) {
    return get('SELECT * FROM clipboard_items WHERE id = ?', id);
  }

  static findByIdForUser(id, userId) {
    return get('SELECT * FROM clipboard_items WHERE id = ? AND user_id = ?', id, userId);
  }

  static list(userId, { q, tag, favorite, pinned, type, sort = 'created', limit = 100, offset = 0 } = {}) {
    const where = ['user_id = ?'];
    const params = [userId];

    if (q) {
      where.push(`(title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`);
      const like = `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      params.push(like, like, like, like);
    }
    if (tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(clipboard_items.tags) jt WHERE jt.value = ?)");
      params.push(String(tag).toLowerCase());
    }
    if (favorite === '1' || favorite === 1 || favorite === true) where.push('is_favorite = 1');
    if (pinned === '1' || pinned === 1 || pinned === true) where.push('is_pinned = 1');
    if (type && ['text', 'richtext', 'code'].includes(type)) {
      where.push('content_type = ?');
      params.push(type);
    }

    const orderMap = {
      created: 'is_pinned DESC, created_at DESC',
      updated: 'is_pinned DESC, updated_at DESC',
      title: 'is_pinned DESC, title COLLATE NOCASE ASC',
      copies: 'is_pinned DESC, copy_count DESC, created_at DESC',
    };
    const order = orderMap[sort] || orderMap.created;
    const lim = Math.max(1, Math.min(200, Number(limit) || 100));
    const off = Math.max(0, Number(offset) || 0);

    const sql = `SELECT * FROM clipboard_items WHERE ${where.join(' AND ')}
      ORDER BY ${order} LIMIT ${lim} OFFSET ${off}`;
    return all(sql, ...params);
  }

  static count(userId) {
    return Number(get('SELECT COUNT(*) AS c FROM clipboard_items WHERE user_id = ?', userId).c);
  }

  static update(id, userId, data) {
    const fields = [];
    const params = [];

    if (data.content !== undefined || data.content_type !== undefined) {
      const existing = this.findById(id);
      const newContent =
        data.content !== undefined ? data.content : existing.content;
      const newType = data.content_type !== undefined ? data.content_type : existing.content_type;
      const content = newType === 'richtext' ? sanitizeRichText(newContent) : newContent;
      fields.push('content = ?', 'excerpt = ?', 'content_type = ?');
      params.push(content, makeExcerpt(content, newType), newType);
      if (data.language === undefined && existing.language && newType !== 'code') {
        fields.push('language = ?');
        params.push(null);
      }
    }
    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
    if (data.language !== undefined) { fields.push('language = ?'); params.push(data.language); }
    if (data.tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(data.tags)); }
    if (data.is_pinned !== undefined) { fields.push('is_pinned = ?'); params.push(data.is_pinned); }
    if (data.is_favorite !== undefined) { fields.push('is_favorite = ?'); params.push(data.is_favorite); }
    if (data.expires_at !== undefined) { fields.push('expires_at = ?'); params.push(data.expires_at); }

    if (fields.length === 0) return 0;

    fields.push('updated_at = ?');
    params.push(nowISO());
    params.push(id, userId);

    const result = run(
      `UPDATE clipboard_items SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      ...params
    );
    return Number(result.changes);
  }

  static remove(id, userId) {
    return Number(run('DELETE FROM clipboard_items WHERE id = ? AND user_id = ?', id, userId).changes);
  }

  static markCopied(id, userId) {
    const result = run(
      'UPDATE clipboard_items SET copy_count = copy_count + 1 WHERE id = ? AND user_id = ?',
      id, userId
    );
    return Number(result.changes);
  }

  // ---- sharing ----

  static enableShare(id, userId, { passwordHash = null, isOneTime = false, regenerate = false } = {}) {
    const item = this.findByIdForUser(id, userId);
    if (!item) return null;
    const token = regenerate || !item.share_token ? shareToken() : item.share_token;
    run(
      `UPDATE clipboard_items
       SET share_token = ?, share_enabled = 1, is_one_time = ?, password_hash = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      token, isOneTime ? 1 : 0, passwordHash, nowISO(), id, userId
    );
    return token;
  }

  static disableShare(id, userId) {
    return Number(run(
      'UPDATE clipboard_items SET share_enabled = 0, password_hash = NULL, updated_at = ? WHERE id = ? AND user_id = ?',
      nowISO(), id, userId
    ).changes);
  }

  static findByShareToken(token) {
    return get('SELECT * FROM clipboard_items WHERE share_token = ?', token);
  }

  static shareMeta(row) {
    return {
      title: row.title,
      contentType: row.content_type,
      language: row.language || null,
      hasPassword: !!row.password_hash,
      isOneTime: !!row.is_one_time,
      available: !(row.is_one_time && row.read_count > 0),
      expiresAt: row.expires_at || null,
      expired: row.expires_at ? new Date(row.expires_at) < new Date() : false,
      createdAt: row.created_at,
      excerpt: makeExcerpt(row.content, row.content_type).slice(0, 120),
    };
  }

  // Atomically burn a one-time link; returns true if this call consumed it.
  static consumeOneTime(id) {
    return Number(run(
      'UPDATE clipboard_items SET read_count = read_count + 1 WHERE id = ? AND is_one_time = 1 AND read_count = 0',
      id
    ).changes) === 1;
  }

  static registerView(id) {
    run('UPDATE clipboard_items SET view_count = view_count + 1 WHERE id = ?', id);
  }

  // ---- tags/stats/import/export/purge ----

  static tagsWithCounts(userId) {
    return all(
      `SELECT jt.value AS tag, COUNT(*) AS count
       FROM clipboard_items, json_each(clipboard_items.tags) jt
       WHERE clipboard_items.user_id = ?
       GROUP BY jt.value ORDER BY count DESC, tag ASC`,
      userId
    );
  }

  static stats(userId) {
    const row = get(
      `SELECT
        COUNT(*) AS total,
        SUM(is_favorite) AS favorites,
        SUM(is_pinned) AS pinned,
        SUM(copy_count) AS copies,
        SUM(view_count) AS views,
        SUM(share_enabled) AS shared
       FROM clipboard_items WHERE user_id = ?`,
      userId
    );
    return {
      total: Number(row.total || 0),
      favorites: Number(row.favorites || 0),
      pinned: Number(row.pinned || 0),
      copies: Number(row.copies || 0),
      views: Number(row.views || 0),
      shared: Number(row.shared || 0),
    };
  }

  static exportAll(userId) {
    return all(
      `SELECT title, content, content_type AS contentType, language, tags,
              is_pinned AS isPinned, is_favorite AS isFavorite, created_at AS createdAt
       FROM clipboard_items WHERE user_id = ? ORDER BY created_at ASC`,
      userId
    ).map((row) => ({ ...row, tags: JSON.parse(row.tags || '[]'), isPinned: !!row.isPinned, isFavorite: !!row.isFavorite }));
  }

  static purgeExpiredOlderThan(days = 7) {
    return Number(run(
      `DELETE FROM clipboard_items
       WHERE expires_at IS NOT NULL AND expires_at < datetime('now', ?)`,
      `-${Number(days)} days`
    ).changes);
  }

  static purgeExpired() {
    return Number(run(
      "DELETE FROM clipboard_items WHERE expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')"
    ).changes);
  }

  static log(userId, action, detail, ip) {
    try {
      run('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?, ?, ?, ?)',
        userId, action, detail || null, ip || null);
    } catch {
      /* audit failures must never break requests */
    }
  }
}

module.exports = Clip;
