// src/models/User.js
const bcrypt = require('bcryptjs');
const { getDb, nextId, nowISO, unwrapFindOneAndUpdate } = require('../config/database');

const ROUNDS = Math.max(4, Math.min(15, Number(process.env.BCRYPT_ROUNDS) || 12));

const SAFE_PROJECTION = { _id: 0, password_hash: 0 };

class User {
  static hashPassword(password) {
    return bcrypt.hashSync(password, ROUNDS);
  }

  static verifyPassword(password, hash) {
    try {
      return bcrypt.compareSync(password, hash);
    } catch {
      return false;
    }
  }

  static async create({ username, email, passwordHash }) {
    const id = await nextId('users');
    const now = nowISO();
    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    await getDb().collection('users').insertOne({
      id,
      username: cleanUsername,
      email: cleanEmail,
      username_lower: cleanUsername.toLowerCase(),
      email_lower: cleanEmail,
      password_hash: passwordHash,
      token_version: 0,
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  static async findById(id) {
    return getDb().collection('users').findOne({ id: Number(id) }, { projection: SAFE_PROJECTION });
  }

  static async findByUsername(username) {
    const key = String(username).trim().toLowerCase();
    return getDb().collection('users').findOne({ username_lower: key });
  }

  static async findByEmail(email) {
    const key = String(email).trim().toLowerCase();
    return getDb().collection('users').findOne({ email_lower: key });
  }

  static async findCredentialsByNameOrEmail(identifier) {
    const key = String(identifier).trim().toLowerCase();
    return getDb().collection('users').findOne({
      $or: [{ username_lower: key }, { email_lower: key }],
    });
  }

  static async bumpTokenVersion(id) {
    const result = await getDb().collection('users').findOneAndUpdate(
      { id: Number(id) },
      { $inc: { token_version: 1 }, $set: { updated_at: nowISO() } },
      { returnDocument: 'after', projection: SAFE_PROJECTION }
    );
    return unwrapFindOneAndUpdate(result);
  }

  static async updatePassword(id, passwordHash) {
    const result = await getDb().collection('users').findOneAndUpdate(
      { id: Number(id) },
      {
        $set: { password_hash: passwordHash, updated_at: nowISO() },
        $inc: { token_version: 1 },
      },
      { returnDocument: 'after', projection: SAFE_PROJECTION }
    );
    return unwrapFindOneAndUpdate(result);
  }

  // Application-level cascade (MongoDB has no foreign keys).
  static async remove(id) {
    const userId = Number(id);
    const db = getDb();
    const clips = await db.collection('clips').deleteMany({ user_id: userId });
    const audit = await db.collection('audit_log').deleteMany({ user_id: userId });
    const users = await db.collection('users').deleteOne({ id: userId });
    return { deleted: users.deletedCount, clips: clips.deletedCount, audit: audit.deletedCount };
  }
}

module.exports = User;
