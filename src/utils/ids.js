// src/utils/ids.js
const crypto = require('crypto');

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function shareToken() {
  return randomToken(24); // ~192 bits of entropy
}

module.exports = { randomToken, shareToken };
