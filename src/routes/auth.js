// src/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Clip = require('../models/Clip');
const { run, nowISO } = require('../config/database');
const { authenticate, signToken } = require('../middleware/auth');
const { authLimiter, writeLimiter } = require('../middleware/rateLimit');
const { validateRegistration } = require('../utils/validate');

function publicUser(user) {
  return { id: Number(user.id), username: user.username, email: user.email, createdAt: user.created_at };
}

router.use(authLimiter);

router.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  const errors = validateRegistration({ username, email, password });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  if (User.findByUsername(username)) {
    return res.status(409).json({ error: 'Username is already taken' });
  }
  if (User.findByEmail(email)) {
    return res.status(409).json({ error: 'Email is already registered' });
  }

  const id = User.create({ username, email, passwordHash: User.hashPassword(password) });
  const user = User.findById(id);
  Clip.log(id, 'register', username, req.ip);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { identifier, username, password } = req.body || {};
  const who = identifier || username;
  if (typeof who !== 'string' || typeof password !== 'string' || !who || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = User.findCredentialsByNameOrEmail(who);
  const ok = user && User.verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  Clip.log(Number(user.id), 'login', user.username, req.ip);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', authenticate, (req, res) => {
  // Invalidate all tokens issued so far by bumping the token version.
  run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', Number(req.user.id));
  Clip.log(Number(req.user.id), 'logout', req.user.username, req.ip);
  res.json({ message: 'Logged out successfully' });
});

router.put('/password', writeLimiter, authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  const creds = User.findCredentialsByNameOrEmail(req.user.username);
  if (!User.verifyPassword(currentPassword, creds.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'New password must be 8-128 characters' });
  }
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must contain a letter and a number' });
  }
  run(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?',
    User.hashPassword(newPassword), nowISO(), req.user.id
  );
  Clip.log(Number(req.user.id), 'password_change', req.user.username, req.ip);
  const updated = User.findById(req.user.id);
  res.json({ token: signToken(updated), message: 'Password updated. Other sessions were signed out.' });
});

module.exports = router;
