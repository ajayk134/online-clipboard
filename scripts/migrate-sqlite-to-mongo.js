// scripts/migrate-sqlite-to-mongo.js
// Idempotently copies users, clips, and audit history from the legacy SQLite
// database into MongoDB. Existing MongoDB documents with the same numeric id
// are updated in place; counters are advanced to the highest migrated id.
//
// Usage: MONGODB_URI=... [MONGODB_DB=online_clipboard] node scripts/migrate-sqlite-to-mongo.js
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { connect, close, getDb } = require('../src/config/database');
const { makeExcerpt } = require('../src/utils/validate');

const root = path.join(__dirname, '..');
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'clipboard.db');

function parseTags(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function tableExists(sqlite, name) {
  return !!sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function sequenceValue(sqlite, table) {
  if (!tableExists(sqlite, 'sqlite_sequence')) return 0;
  const row = sqlite
    .prepare('SELECT seq FROM sqlite_sequence WHERE name = ?')
    .get(table);
  return row ? Number(row.seq || 0) : 0;
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.log(`[migrate] no SQLite database at ${dbPath}; nothing to migrate`);
    return;
  }

  const sqlite = new DatabaseSync(dbPath, { readOnly: true });
  const db = await connect();
  console.log(`[migrate] source: ${dbPath}`);
  console.log(`[migrate] target: MongoDB database "${db.databaseName}"`);

  const stats = { users: 0, clips: 0, audit: 0 };
  let maxUserId = 0;
  let maxClipId = 0;

  if (tableExists(sqlite, 'users')) {
    const users = sqlite.prepare('SELECT * FROM users ORDER BY id ASC').all();
    for (const row of users) {
      const id = Number(row.id);
      maxUserId = Math.max(maxUserId, id);
      await db.collection('users').updateOne(
        { id },
        {
          $set: {
            id,
            username: row.username,
            email: row.email,
            username_lower: String(row.username || '').toLowerCase(),
            email_lower: String(row.email || '').toLowerCase(),
            password_hash: row.password_hash,
            token_version: Number(row.token_version || 0),
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
          },
        },
        { upsert: true }
      );
      stats.users++;
    }
  }

  if (tableExists(sqlite, 'clipboard_items')) {
    const clips = sqlite.prepare('SELECT * FROM clipboard_items ORDER BY id ASC').all();
    for (const row of clips) {
      const id = Number(row.id);
      maxClipId = Math.max(maxClipId, id);
      const contentType = ['text', 'richtext', 'code'].includes(row.content_type)
        ? row.content_type
        : 'text';
      const legacyToken = row.share_token ?? row.shareable_link ?? null;
      const shareEnabled =
        row.share_enabled != null ? !!row.share_enabled : !!legacyToken;
      await db.collection('clips').updateOne(
        { id },
        {
          $set: {
            id,
            user_id: Number(row.user_id),
            title: row.title ?? null,
            title_lower: row.title ? String(row.title).toLowerCase() : null,
            content: row.content,
            excerpt: row.excerpt || makeExcerpt(row.content || '', contentType),
            content_type: contentType,
            language: row.language ?? null,
            tags: parseTags(row.tags),
            is_pinned: !!row.is_pinned,
            is_favorite: !!row.is_favorite,
            copy_count: Number(row.copy_count || 0),
            view_count: Number(row.view_count || 0),
            share_token: legacyToken,
            share_enabled: shareEnabled,
            expires_at: row.expires_at ?? null,
            is_one_time: !!row.is_one_time,
            read_count: Number(row.read_count || 0),
            password_hash: row.password_hash ?? null,
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
          },
        },
        { upsert: true }
      );
      stats.clips++;
    }
  }

  if (tableExists(sqlite, 'audit_log')) {
    const logs = sqlite.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
    for (const row of logs) {
      await db.collection('audit_log').updateOne(
        { legacy_id: Number(row.id) },
        {
          $set: {
            legacy_id: Number(row.id),
            user_id: row.user_id == null ? null : Number(row.user_id),
            action: row.action,
            detail: row.detail ?? null,
            ip: row.ip ?? null,
            created_at: row.created_at,
          },
        },
        { upsert: true }
      );
      stats.audit++;
    }
  }

  // Preserve SQLite's AUTOINCREMENT high-water marks (which may exceed the
  // highest surviving id when rows were deleted) so ids are never reused.
  maxUserId = Math.max(maxUserId, sequenceValue(sqlite, 'users'));
  maxClipId = Math.max(maxClipId, sequenceValue(sqlite, 'clipboard_items'));

  const counters = db.collection('counters');
  await counters.updateOne({ _id: 'users' }, { $max: { seq: maxUserId } }, { upsert: true });
  await counters.updateOne({ _id: 'clips' }, { $max: { seq: maxClipId } }, { upsert: true });

  const targetCounts = {
    users: await db.collection('users').countDocuments(),
    clips: await db.collection('clips').countDocuments(),
    audit: await db.collection('audit_log').countDocuments(),
  };

  console.log(
    `[migrate] copied users=${stats.users} clips=${stats.clips} audit=${stats.audit}`
  );
  console.log(
    `[migrate] target totals users=${targetCounts.users} clips=${targetCounts.clips} audit=${targetCounts.audit}`
  );

  sqlite.close();
}

main()
  .catch((err) => {
    console.error(
      `[migrate] failed: ${String(err.message).replace(
        /mongodb(\+srv)?:\/\/[^@\s]*@/g,
        'mongodb$1://***@'
      )}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await close().catch(() => {});
  });
