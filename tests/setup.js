// tests/setup.js — shared test environment: isolated MongoDB database, sane env, api helper
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

process.env.NODE_ENV = 'test';
// Never let tests touch the production database, even if .env sets MONGODB_DB.
process.env.MONGODB_DB = process.env.MONGODB_DB_TEST || 'online_clipboard_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-do-not-use-in-prod';
process.env.RATE_LIMIT_DISABLED = '1';

const request = require('supertest');
const { connect, close, getDb } = require('../src/config/database');
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
  if (res.text) {
    try {
      data = JSON.parse(res.text);
    } catch {
      data = { raw: res.text };
    }
  }
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

async function resetTables() {
  const db = getDb();
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('clips').deleteMany({}),
    db.collection('audit_log').deleteMany({}),
    db.collection('counters').deleteMany({}),
  ]);
}

beforeAll(async () => {
  await connect();
  await resetTables();
});

afterAll(async () => {
  try {
    await getDb().dropDatabase();
  } catch {
    /* ignore cleanup failures */
  }
  await close();
});

module.exports = { app, api, registerAndLogin, uniqueUser, resetTables, getDb };
