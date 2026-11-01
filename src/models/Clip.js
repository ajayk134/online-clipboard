// src/models/Clip.js
const { getDb, nextId, nowISO, unwrapFindOneAndUpdate } = require('../config/database');
const { shareToken } = require('../utils/ids');
const { makeExcerpt, sanitizeRichText } = require('../utils/validate');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class Clip {
  static async create(
    userId,
    data,
    {
      passwordHash = null,
      share = false,
      createdAt = null,
      updatedAt = null,
      isPinned = null,
      isFavorite = null,
      isOneTime = false,
      shareToken: tokenOverride = null,
      shareEnabled = null,
      copyCount = 0,
      viewCount = 0,
      readCount = 0,
    } = {}
  ) {
    const contentType = data.content_type || 'text';
    const content =
      contentType === 'richtext' ? sanitizeRichText(data.content) : data.content;
    const now = nowISO();
    const created = createdAt || now;
    const token = tokenOverride || (share ? shareToken() : null);
    const title = data.title ?? null;
    const id = await nextId('clips');

    await getDb().collection('clips').insertOne({
      id,
      user_id: Number(userId),
      title,
      title_lower: title ? String(title).toLowerCase() : null,
      content,
      excerpt: makeExcerpt(content, contentType),
      content_type: contentType,
      language: data.language ?? null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      is_pinned: isPinned !== null ? !!isPinned : !!data.is_pinned,
      is_favorite: isFavorite !== null ? !!isFavorite : !!data.is_favorite,
      copy_count: Number(copyCount) || 0,
      view_count: Number(viewCount) || 0,
      share_token: token,
      share_enabled: shareEnabled !== null ? !!shareEnabled : !!(share && token),
      expires_at: data.expires_at ?? null,
      is_one_time: !!isOneTime,
      read_count: Number(readCount) || 0,
      password_hash: passwordHash,
      created_at: created,
      updated_at: updatedAt || created,
    });

    return id;
  }

  static async findByIdForUser(id, userId) {
    return getDb().collection('clips').findOne({ id: Number(id), user_id: Number(userId) });
  }

  static async list(
    userId,
    { q, tag, favorite, pinned, type, sort = 'created', limit = 100, offset = 0 } = {}
  ) {
    const filter = { user_id: Number(userId) };

    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { title: regex },
        { excerpt: regex },
        { content: regex },
        { tags: regex },
      ];
    }
    if (tag) filter.tags = String(tag).toLowerCase();
    if (favorite === '1' || favorite === 1 || favorite === true) filter.is_favorite = true;
    if (pinned === '1' || pinned === 1 || pinned === true) filter.is_pinned = true;
    if (type && ['text', 'richtext', 'code'].includes(type)) {
      filter.content_type = type;
    }

    const orderMap = {
      created: { is_pinned: -1, created_at: -1 },
      updated: { is_pinned: -1, updated_at: -1 },
      title: { is_pinned: -1, title: 1 },
      copies: { is_pinned: -1, copy_count: -1, created_at: -1 },
    };
    const order = orderMap[sort] || orderMap.created;
    const lim = Math.max(1, Math.min(200, Number(limit) || 100));
    const off = Math.max(0, Number(offset) || 0);

    let cursor = getDb().collection('clips').find(filter).sort(order).skip(off).limit(lim);
    if (sort === 'title') cursor = cursor.collation({ locale: 'en', strength: 2 });
    return cursor.toArray();
  }

  static async update(id, userId, data) {
    const clipId = Number(id);
    const uid = Number(userId);
    const set = {};

    if (data.content !== undefined || data.content_type !== undefined) {
      const existing = await this.findByIdForUser(clipId, uid);
      if (!existing) return 0;
      const newContent = data.content !== undefined ? data.content : existing.content;
      const newType =
        data.content_type !== undefined ? data.content_type : existing.content_type;
      const content = newType === 'richtext' ? sanitizeRichText(newContent) : newContent;
      set.content = content;
      set.excerpt = makeExcerpt(content, newType);
      set.content_type = newType;
      if (data.language === undefined && existing.language && newType !== 'code') {
        set.language = null;
      }
    }
    if (data.title !== undefined) {
      set.title = data.title;
      set.title_lower = data.title ? String(data.title).toLowerCase() : null;
    }
    if (data.language !== undefined) set.language = data.language;
    if (data.tags !== undefined) set.tags = Array.isArray(data.tags) ? data.tags : [];
    if (data.is_pinned !== undefined) set.is_pinned = !!data.is_pinned;
    if (data.is_favorite !== undefined) set.is_favorite = !!data.is_favorite;
    if (data.expires_at !== undefined) set.expires_at = data.expires_at;

    if (Object.keys(set).length === 0) return 0;

    set.updated_at = nowISO();
    const result = await getDb()
      .collection('clips')
      .updateOne({ id: clipId, user_id: uid }, { $set: set });
    return result.matchedCount;
  }

  static async remove(id, userId) {
    const result = await getDb()
      .collection('clips')
      .deleteOne({ id: Number(id), user_id: Number(userId) });
    return result.deletedCount;
  }

  static async markCopied(id, userId) {
    const result = await getDb()
      .collection('clips')
      .updateOne(
        { id: Number(id), user_id: Number(userId) },
        { $inc: { copy_count: 1 } }
      );
    return result.matchedCount;
  }

  // ---- sharing ----

  static async enableShare(
    id,
    userId,
    { passwordHash = null, isOneTime = false, regenerate = false } = {}
  ) {
    const item = await this.findByIdForUser(id, userId);
    if (!item) return null;
    const token = regenerate || !item.share_token ? shareToken() : item.share_token;
    await getDb()
      .collection('clips')
      .updateOne(
        { id: Number(id), user_id: Number(userId) },
        {
          $set: {
            share_token: token,
            share_enabled: true,
            is_one_time: !!isOneTime,
            password_hash: passwordHash,
            updated_at: nowISO(),
          },
        }
      );
    return token;
  }

  static async disableShare(id, userId) {
    const result = await getDb()
      .collection('clips')
      .updateOne(
        { id: Number(id), user_id: Number(userId) },
        {
          $set: {
            share_enabled: false,
            password_hash: null,
            updated_at: nowISO(),
          },
        }
      );
    return result.matchedCount;
  }

  static async findByShareToken(token) {
    return getDb().collection('clips').findOne({ share_token: token });
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
  static async consumeOneTime(id) {
    const result = await getDb()
      .collection('clips')
      .findOneAndUpdate(
        { id: Number(id), is_one_time: true, read_count: 0 },
        { $inc: { read_count: 1 } },
        { returnDocument: 'after' }
      );
    return !!unwrapFindOneAndUpdate(result);
  }

  static async registerView(id) {
    await getDb()
      .collection('clips')
      .updateOne({ id: Number(id) }, { $inc: { view_count: 1 } });
  }

  // ---- tags/stats/import/export/purge ----

  static async tagsWithCounts(userId) {
    return getDb()
      .collection('clips')
      .aggregate([
        { $match: { user_id: Number(userId) } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $project: { _id: 0, tag: '$_id', count: 1 } },
      ])
      .toArray();
  }

  static async stats(userId) {
    const rows = await getDb()
      .collection('clips')
      .aggregate([
        { $match: { user_id: Number(userId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            favorites: { $sum: { $cond: ['$is_favorite', 1, 0] } },
            pinned: { $sum: { $cond: ['$is_pinned', 1, 0] } },
            copies: { $sum: '$copy_count' },
            views: { $sum: '$view_count' },
            shared: { $sum: { $cond: ['$share_enabled', 1, 0] } },
          },
        },
      ])
      .toArray();
    const row = rows[0] || {};
    return {
      total: Number(row.total || 0),
      favorites: Number(row.favorites || 0),
      pinned: Number(row.pinned || 0),
      copies: Number(row.copies || 0),
      views: Number(row.views || 0),
      shared: Number(row.shared || 0),
    };
  }

  static async exportAll(userId) {
    const rows = await getDb()
      .collection('clips')
      .find({ user_id: Number(userId) })
      .sort({ created_at: 1 })
      .project({
        _id: 0,
        title: 1,
        content: 1,
        content_type: 1,
        language: 1,
        tags: 1,
        is_pinned: 1,
        is_favorite: 1,
        created_at: 1,
      })
      .toArray();
    return rows.map((row) => ({
      title: row.title,
      content: row.content,
      contentType: row.content_type,
      language: row.language,
      tags: Array.isArray(row.tags) ? row.tags : [],
      isPinned: !!row.is_pinned,
      isFavorite: !!row.is_favorite,
      createdAt: row.created_at,
    }));
  }

  static async purgeExpiredOlderThan(days = 7) {
    const cutoff = new Date(Date.now() - Number(days) * 864e5).toISOString();
    const result = await getDb()
      .collection('clips')
      .deleteMany({ expires_at: { $ne: null, $lt: cutoff } });
    return result.deletedCount;
  }

  static async purgeExpired() {
    const result = await getDb()
      .collection('clips')
      .deleteMany({ expires_at: { $ne: null, $lt: nowISO() } });
    return result.deletedCount;
  }

  static async log(userId, action, detail, ip) {
    try {
      await getDb().collection('audit_log').insertOne({
        user_id: userId == null ? null : Number(userId),
        action,
        detail: detail || null,
        ip: ip || null,
        created_at: nowISO(),
      });
    } catch {
      /* audit failures must never break requests */
    }
  }
}

module.exports = Clip;
