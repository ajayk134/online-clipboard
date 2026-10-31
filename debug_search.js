process.env.NODE_ENV = 'test';
process.env.DB_PATH = '/tmp/opencode/test-clipboard-debug.db';
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_DISABLED = '1';

const fs = require('fs');
if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);

const { db, run } = require('./src/config/database');
const { createApp } = require('./src/app');
const request = require('supertest');

const app = createApp();

const uniqueUser = () => 'user_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let req = request(app)[method.toLowerCase()](path).set(headers);
  if (body !== undefined) req = req.send(body);
  const res = await req;
  let data = null;
  if (res.text) { try { data = JSON.parse(res.text); } catch { data = { raw: res.text }; } }
  return { status: res.status, body: data };
}

async function reg() {
  const u = uniqueUser();
  const r = await api('/api/auth/register', { method: 'POST', body: { username: u, email: u + '@test.io', password: 'S3cure-pass!' } });
  return { user: r.body.user, token: r.body.token };
}

async function main() {
  const { token } = await reg();
  await api('/api/clips', { method: 'POST', token, body: { content: 'kubernetes cluster config', contentType: 'text' } });
  await api('/api/clips', { method: 'POST', token, body: { content: 'grocery list apples', contentType: 'text' } });

  const rows = db.prepare('SELECT id, content, excerpt, tags FROM clipboard_items').all();
  console.log('DB rows:', JSON.stringify(rows));

  const like = '%kubernetes%';
  const searchRows = db.prepare("SELECT id, content, excerpt FROM clipboard_items WHERE content LIKE ? ESCAPE '\\'").all(like);
  console.log('Search by content only:', JSON.stringify(searchRows));

  const res = await api('/api/clips?search=kubernetes', { token });
  console.log('API search results count:', res.body.items.length);
  console.log('API search results:', JSON.stringify(res.body.items.map(i => ({ id: i.id, content: i.content, excerpt: i.excerpt }))));
}

main().catch(e => console.error(e));
