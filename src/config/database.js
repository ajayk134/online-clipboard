// src/config/database.js
const { MongoClient } = require('mongodb');

const DEFAULT_DB = 'online_clipboard';

let client = null;
let db = null;
let connecting = null;

function dbName() {
  return process.env.MONGODB_DB || DEFAULT_DB;
}

function getDb() {
  if (!db) throw new Error('MongoDB is not connected');
  return db;
}

async function ensureIndexes(database) {
  await database.collection('users').createIndexes([
    { key: { id: 1 }, name: 'id_1', unique: true },
    { key: { username_lower: 1 }, name: 'username_lower_1', unique: true },
    { key: { email_lower: 1 }, name: 'email_lower_1', unique: true },
  ]);

  await database.collection('clips').createIndexes([
    { key: { id: 1 }, name: 'id_1', unique: true },
    { key: { user_id: 1, created_at: -1 }, name: 'user_created' },
    { key: { user_id: 1, is_pinned: -1, updated_at: -1 }, name: 'user_pinned' },
    {
      key: { share_token: 1 },
      name: 'share_token_1',
      unique: true,
      partialFilterExpression: { share_token: { $type: 'string' } },
    },
    { key: { expires_at: 1 }, name: 'expires_at_1' },
    { key: { user_id: 1, tags: 1 }, name: 'user_tags' },
  ]);

  await database.collection('audit_log').createIndexes([
    {
      key: { legacy_id: 1 },
      name: 'legacy_id_1',
      unique: true,
      partialFilterExpression: { legacy_id: { $exists: true } },
    },
    { key: { user_id: 1, created_at: -1 }, name: 'user_created' },
  ]);
}

async function connect() {
  if (db) return db;
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI must be set (see .env.example)');
  }

  connecting = (async () => {
    const c = new MongoClient(uri, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS || 15000),
      maxPoolSize: Number(process.env.MONGODB_POOL_SIZE || 10),
    });
    await c.connect();
    const d = c.db(dbName());
    await d.command({ ping: 1 });
    await ensureIndexes(d);
    client = c;
    db = d;
    console.log(`[db] connected to MongoDB database "${d.databaseName}"`);
    return d;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function ping() {
  await getDb().command({ ping: 1 });
  return true;
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

function unwrapFindOneAndUpdate(result) {
  if (!result) return null;
  if (result.seq !== undefined || result.id !== undefined) return result;
  return result.value ?? null;
}

async function nextId(name) {
  const counters = getDb().collection('counters');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await counters.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      const doc = unwrapFindOneAndUpdate(result);
      if (doc && doc.seq !== undefined) return Number(doc.seq);
    } catch (err) {
      // Concurrent upserts can race on first use; retry the allocation.
      if (err && err.code === 11000) continue;
      throw err;
    }
  }
  throw new Error(`Failed to allocate an id for "${name}"`);
}

function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = {
  connect,
  close,
  getDb,
  ping,
  nextId,
  ensureIndexes,
  nowISO,
  dbName,
  unwrapFindOneAndUpdate,
};
