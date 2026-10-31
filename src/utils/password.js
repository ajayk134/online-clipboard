// src/utils/password.js
const bcrypt = require('bcryptjs');

// Lower cost for short-lived share passwords; user passwords use User model rounds.
const SHARE_ROUNDS = Math.max(4, Math.min(15, Number(process.env.BCRYPT_ROUNDS_SHARE) || 10));

function hashPassword(password) {
  return bcrypt.hashSync(String(password), SHARE_ROUNDS);
}

function verifyPassword(password, hash) {
  try {
    return bcrypt.compareSync(String(password), hash);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
