// src/models/User.js
const bcrypt = require('bcryptjs');
const { get, run, nowISO } = require('../config/database');

const ROUNDS = Math.max(4, Math.min(15, Number(process.env.BCRYPT_ROUNDS) || 12));

const SAFE_FIELDS = 'id, username, email, token_version, created_at, updated_at';

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

  static create({ username, email, passwordHash }) {
    const result = run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      username.trim(), email.trim().toLowerCase(), passwordHash
    );
    return Number(result.lastInsertRowid);
  }

  static findById(id) {
    return get(`SELECT ${SAFE_FIELDS} FROM users WHERE id = ?`, id);
  }

  static findByUsername(username) {
    return get(`SELECT ${SAFE_FIELDS}, password_hash FROM users WHERE username = ?`, String(username).trim());
  }

  static findByEmail(email) {
    return get(`SELECT ${SAFE_FIELDS}, password_hash FROM users WHERE email = ?`, String(email).trim().toLowerCase());
  }

  static findCredentialsByNameOrEmail(identifier) {
    return get(
      `SELECT ${SAFE_FIELDS}, password_hash FROM users WHERE username = ? OR email = ?`,
      String(identifier).trim(), String(identifier).trim().toLowerCase()
    );
  }

  static bumpTokenVersion(id) {
    run('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?', nowISO(), id);
    return get(`SELECT ${SAFE_FIELDS} FROM users WHERE id = ?`, id);
  }

  static touch(id) {
    run('UPDATE users SET updated_at = ? WHERE id = ?', nowISO(), id);
  }
}

module.exports = User;
