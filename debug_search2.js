process.env.NODE_ENV = 'test';
process.env.DB_PATH = '/tmp/opencode/test-clipboard-debug2.db';
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

  // Get user id from DB
  const users = db.prepare('SELECT id FROM users').all();
  console.log('Users:', JSON.stringify(users));
  const userId = users[0].id;

  // Test exact SQL from Clip.list
  const q = 'kubernetes';
  const like = `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  console.log('Like pattern:', JSON.stringify(like));

  const sql = `SELECT * FROM clipboard_items WHERE user_id = ? AND (title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\') ORDER BY is_pinned DESC, created_at DESC LIMIT 100 OFFSET 0`;
  console.log('SQL:', sql);
  console.log('Params:', [userId, like, like, like, like]);

  const rows = db.prepare(sql).all(userId, like, like, like, like);
  console.log('Direct SQL results:', JSON.stringify(rows.map(r => ({ id: r.id, content: r.content }))));

  // Now test without ESCAPE
  const sql2 = `SELECT * FROM clipboard_items WHERE user_id = ? AND (title LIKE ? OR excerpt LIKE ? OR content LIKE ? OR tags LIKE ?) ORDER BY is_pinned DESC, created_at DESC LIMIT 100 OFFSET 0`;
  const rows2 = db.prepare(sql2).all(userId, like, like, like, like);
  console.log('Without ESCAPE results:', JSON.stringify(rows2.map(r => ({ id: r.id, content: r.content }))));

  const res = await api('/api/clips?search=kubernetes', { token });
  console.log('API search results count:', res.body.items.length);
}

main().catch(e => console.error(e));
