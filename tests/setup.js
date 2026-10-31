// tests/setup.js — shared test environment: isolated DB, sane env, api helper
process.env.NODE_ENV = 'test';
process.env.DB_PATH = process.env.DB_PATH || '/tmp/opencode/test-clipboard.db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-do-not-use-in-prod';
process.env.RATE_LIMIT_DISABLED = '1';

const fs = require('fs');
if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);

const request = require('supertest');
const { db } = require('../src/config/database');
const { createApp } = require('../src/app');

const app = createApp();

function uniqueUser(prefix = 'user') {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let req = request(app)[method.toLowerCase()](path).set(headers);
  if (body !== undefined) req = req.send(body);
  const res = await req;
  let data = null;
  if (res.text) { try { data = JSON.parse(res.text); } catch { data = { raw: res.text }; } }
  return { status: res.status, body: data, headers: res.headers };
}

async function registerAndLogin(overrides = {}) {
  const username = uniqueUser();
  const payload = {
    username,
    email: `${username}@test.io`,
    password: 'S3cure-pass!',
    ...overrides,
  };
  const res = await api('/api/auth/register', { method: 'POST', body: payload });
  return { user: res.body.user, token: res.body.token, payload };
}

function resetTables() {
  db.exec('DELETE FROM audit_log; DELETE FROM clipboard_items; DELETE FROM users;');
}

module.exports = { app, api, registerAndLogin, uniqueUser, resetTables, db };
