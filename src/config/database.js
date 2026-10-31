// src/config/database.js
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_DIR = path.join(__dirname, '..', '..', 'data');
const dbPath = process.env.DB_PATH || path.join(DEFAULT_DB_DIR, 'clipboard.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

function ensureColumns(database, table, defs) {
  const existing = new Set(
    database.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name)
  );
  for (const def of defs) {
    if (!existing.has(def.name)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${def.ddl}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Migrations. Each runs once, tracked via PRAGMA user_version. All are
// idempotent and backward compatible with legacy schemas (e.g. the original
// scaffold that used `shareable_link` and had no excerpt/meta columns).
// ---------------------------------------------------------------------------
const MIGRATIONS = [
  {
    version: 1,
    name: 'base-schema',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          token_version INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS clipboard_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT,
          content TEXT NOT NULL,
          excerpt TEXT,
          content_type TEXT NOT NULL DEFAULT 'text'
            CHECK (content_type IN ('text', 'richtext', 'code')),
          language TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          is_pinned INTEGER NOT NULL DEFAULT 0,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          copy_count INTEGER NOT NULL DEFAULT 0,
          view_count INTEGER NOT NULL DEFAULT 0,
          share_token TEXT UNIQUE,
          share_enabled INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT,
          is_one_time INTEGER NOT NULL DEFAULT 0,
          read_count INTEGER NOT NULL DEFAULT 0,
          password_hash TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          action TEXT NOT NULL,
          detail TEXT,
          ip TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `);
    },
  },
  {
    version: 2,
    name: 'compat-columns-and-backfill',
    up(database) {
      // Add any columns missing from legacy databases (scaffold or v1 install).
      ensureColumns(database, 'users', [
        { name: 'token_version', ddl: 'token_version INTEGER NOT NULL DEFAULT 0' },
      ]);
      ensureColumns(database, 'clipboard_items', [
        { name: 'title', ddl: 'title TEXT' },
        { name: 'excerpt', ddl: 'excerpt TEXT' },
        { name: 'language', ddl: 'language TEXT' },
        { name: 'tags', ddl: `tags TEXT NOT NULL DEFAULT '[]'` },
        { name: 'is_pinned', ddl: 'is_pinned INTEGER NOT NULL DEFAULT 0' },
        { name: 'is_favorite', ddl: 'is_favorite INTEGER NOT NULL DEFAULT 0' },
        { name: 'copy_count', ddl: 'copy_count INTEGER NOT NULL DEFAULT 0' },
        { name: 'view_count', ddl: 'view_count INTEGER NOT NULL DEFAULT 0' },
        { name: 'share_token', ddl: 'share_token TEXT' },
        { name: 'share_enabled', ddl: 'share_enabled INTEGER NOT NULL DEFAULT 0' },
        { name: 'expires_at', ddl: 'expires_at TEXT' },
        { name: 'is_one_time', ddl: 'is_one_time INTEGER NOT NULL DEFAULT 0' },
        { name: 'read_count', ddl: 'read_count INTEGER NOT NULL DEFAULT 0' },
        { name: 'password_hash', ddl: 'password_hash TEXT' },
      ]);

      // Legacy scaffold stored share links in `shareable_link`.
      const legacyCols = new Set(
        database.prepare('PRAGMA table_info(clipboard_items)').all().map((r) => r.name)
      );
      if (legacyCols.has('shareable_link')) {
        database.exec(
          `UPDATE clipboard_items
             SET share_token = shareable_link, share_enabled = 1
           WHERE share_token IS NULL AND shareable_link IS NOT NULL`
        );
      }

      // Backfill excerpts that are missing (never overwrite real data).
      database.exec(
        `UPDATE clipboard_items
           SET excerpt = substr(content, 1, 300)
         WHERE excerpt IS NULL OR excerpt = ''`
      );

      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_items_user_created ON clipboard_items (user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_items_user_pinned ON clipboard_items (user_id, is_pinned DESC, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_items_share_token ON clipboard_items (share_token);
        CREATE INDEX IF NOT EXISTS idx_items_expires ON clipboard_items (expires_at);
      `);

      // Sanity: JSON1 must be available (used for tag queries).
      database.prepare("SELECT json_valid('[]')").get();
    },
  },
];

function getCurrentVersion() {
  return Number(db.prepare('PRAGMA user_version').get().user_version || 0);
}

function migrate() {
  let from = getCurrentVersion();
  if (from > MIGRATIONS[MIGRATIONS.length - 1].version) {
    throw new Error(`Database version ${from} is newer than supported schema`);
  }
  for (const migration of MIGRATIONS) {
    if (getCurrentVersion() >= migration.version) continue;
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      console.log(`[db] applied migration ${migration.version} (${migration.name})`);
      from = migration.version;
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${err.message}`);
    }
  }
  return getCurrentVersion();
}

const appliedVersion = migrate();

const stmtCache = new Map();
function prepare(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

function get(sql, ...params) {
  const row = prepare(sql).get(...params);
  return row === undefined ? null : row;
}

function all(sql, ...params) {
  return prepare(sql).all(...params);
}

function run(sql, ...params) {
  const result = prepare(sql).run(...params);
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { db, get, all, run, nowISO, dbPath, schemaVersion: appliedVersion };
