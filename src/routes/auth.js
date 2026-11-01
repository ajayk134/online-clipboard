// src/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Clip = require('../models/Clip');
const { authenticate, signToken } = require('../middleware/auth');
const { authLimiter, writeLimiter } = require('../middleware/rateLimit');
const { validateRegistration } = require('../utils/validate');

function publicUser(user) {
  return {
    id: Number(user.id),
    username: user.username,
    email: user.email,
    createdAt: user.created_at,
  };
}

router.use(authLimiter);

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  const errors = validateRegistration({ username, email, password });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  if (await User.findByUsername(username)) {
    return res.status(409).json({ error: 'Username is already taken' });
  }
  if (await User.findByEmail(email)) {
    return res.status(409).json({ error: 'Email is already registered' });
  }

  const id = await User.create({ username, email, passwordHash: User.hashPassword(password) });
  const user = await User.findById(id);
  await Clip.log(id, 'register', username, req.ip);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { identifier, username, password } = req.body || {};
  const who = identifier || username;
  if (typeof who !== 'string' || typeof password !== 'string' || !who || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = await User.findCredentialsByNameOrEmail(who);
  const ok = user && User.verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  await Clip.log(Number(user.id), 'login', user.username, req.ip);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', authenticate, async (req, res) => {
  // Invalidate all tokens issued so far by bumping the token version.
  await User.bumpTokenVersion(Number(req.user.id));
  await Clip.log(Number(req.user.id), 'logout', req.user.username, req.ip);
  res.json({ message: 'Logged out successfully' });
});

router.put('/password', writeLimiter, authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  const creds = await User.findCredentialsByNameOrEmail(req.user.username);
  if (!creds || !User.verifyPassword(currentPassword, creds.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'New password must be 8-128 characters' });
  }
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must contain a letter and a number' });
  }
  const updated = await User.updatePassword(req.user.id, User.hashPassword(newPassword));
  await Clip.log(Number(req.user.id), 'password_change', req.user.username, req.ip);
  res.json({ token: signToken(updated), message: 'Password updated. Other sessions were signed out.' });
});

module.exports = router;
