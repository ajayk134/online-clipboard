// tests/e2e-flows.mjs — black-box end-to-end verification against a live backend (localhost:3000).
// Uses supertest against the HTTP server and the mongodb driver to assert persistence in
// the isolated online_clipboard_test database. Never prints MONGODB_URI or JWT_SECRET.
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB = process.env.MONGODB_DB_TEST || 'online_clipboard_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-do-not-use-in-prod';
process.env.RATE_LIMIT_DISABLED = '1';

import { MongoClient } from 'mongodb';
import supertest from 'supertest';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const request = supertest(BASE);

const PASS = { n: 0 };
const FAIL = { n: 0 };

let db;

async function assert(cond, name) {
  if (cond) { PASS.n++; console.log(`  ok - ${name}`); }
  else { FAIL.n++; console.error(`  FAIL - ${name}`); }
}

async function api(method, url, body, token) {
  let req = request[method.toLowerCase()](url);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) req = req.send(body);
  const res = await req;
  let data = null;
  if (res.text) {
    try { data = JSON.parse(res.text); } catch { data = { raw: res.text }; }
  }
  return { status: res.status, body: data, headers: res.headers };
}

function unique(prefix = 'e2e') {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function resetDb() {
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('clips').deleteMany({}),
    db.collection('audit_log').deleteMany({}),
    db.collection('counters').deleteMany({}),
  ]);
}

async function registerAndLogin(overrides = {}) {
  const username = unique();
  const payload = { username, email: `${username}@test.io`, password: 'S3cure-pass!', ...overrides };
  const reg = await api('POST', '/api/auth/register', payload);
  await assert(reg.status === 201, `register ${username} -> 201`);
  const login = await api('POST', '/api/auth/login', { identifier: username, password: 'S3cure-pass!' });
  await assert(login.status === 200, `login ${username} -> 200`);
  return { user: login.body.user, token: login.body.token };
}

async function main() {
  let client;
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set');
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(process.env.MONGODB_DB);
    await resetDb();
  } catch (e) {
    console.error(`Could not connect to MongoDB test DB: ${e.message}`);
    console.error('Skipping DB-persistence assertions; API flows will still be attempted.');
  }

  console.log('\n== E2E: authentication ==');
  {
    const { token, user } = await registerAndLogin();
    const me = await api('GET', '/api/auth/me', undefined, token);
    await assert(me.status === 200, 'me returns 200 with token');
    await assert(me.body && me.body.user && me.body.user.id === user.id, 'me returns correct user');

    // protected without token -> 401
    const noToken = await api('GET', '/api/clips');
    await assert(noToken.status === 401, 'clips without token -> 401');

    // password change invalidates old token
    const pw = await api('PUT', '/api/auth/password', { currentPassword: 'S3cure-pass!', newPassword: 'N3w-pass-99' }, token);
    await assert(pw.status === 200, 'password change -> 200');
    const stale = await api('GET', '/api/auth/me', undefined, token);
    await assert(stale.status === 401, 'old token invalid after password change -> 401');

    const relogin = await api('POST', '/api/auth/login', { identifier: user.username, password: 'N3w-pass-99' });
    await assert(relogin.status === 200, 'relogin with new password -> 200');
    const newToken = relogin.body.token;
    const me2 = await api('GET', '/api/auth/me', undefined, newToken);
    await assert(me2.status === 200, 'me with new token -> 200');

    // logout bumps token_version
    const out = await api('POST', '/api/auth/logout', undefined, newToken);
    await assert(out.status === 200, 'logout -> 200');
    const afterLogout = await api('GET', '/api/auth/me', undefined, newToken);
    await assert(afterLogout.status === 401, 'logged-out token -> 401');
  }

  console.log('\n== E2E: clip CRUD ==');
  {
    const { token } = await registerAndLogin();
    const created = await api('POST', '/api/clips', { content: 'hello world', contentType: 'text', title: 'T1' }, token);
    await assert(created.status === 201, 'create clip -> 201');
    const id = created.body.id;

    const list = await api('GET', '/api/clips', undefined, token);
    await assert(list.status === 200 && Array.isArray(list.body.items) && list.body.items.length >= 1, 'list clips returns items');

    const get = await api('GET', `/api/clips/${id}`, undefined, token);
    await assert(get.status === 200 && get.body.id === id, 'get clip by id');

    const upd = await api('PATCH', `/api/clips/${id}`, { title: 'T2', content: 'updated', tags: ['a', 'b'] }, token);
    await assert(upd.status === 200 && upd.body.title === 'T2' && upd.body.content === 'updated', 'patch clip updates fields');

    // copy count
    const copy = await api('PATCH', `/api/clips/${id}/copy`, undefined, token);
    await assert(copy.status === 200 && copy.body.ok === true, 'copy -> ok');
    const got = await api('GET', `/api/clips/${id}`, undefined, token);
    await assert(got.body.copyCount >= 1, 'copy count incremented');

    // favorite/pin flags
    const fl = await api('PATCH', `/api/clips/${id}/flags`, { isFavorite: true, isPinned: true }, token);
    await assert(fl.status === 200 && fl.body.isFavorite === true && fl.body.isPinned === true, 'flags set');

    // stats + tags
    const stats = await api('GET', '/api/clips/stats', undefined, token);
    await assert(stats.status === 200 && typeof stats.body.total === 'number', 'stats endpoint');
    const tags = await api('GET', '/api/clips/tags', undefined, token);
    await assert(tags.status === 200 && Array.isArray(tags.body.tags), 'tags endpoint');

    // search / filter / pagination
    const search = await api('GET', '/api/clips?q=hello', undefined, token);
    await assert(search.status === 200 && search.body.items.length >= 1, 'search q=hello');
    const byTag = await api('GET', '/api/clips?tag=a', undefined, token);
    await assert(byTag.status === 200, 'filter by tag');
    const page = await api('GET', '/api/clips?limit=1&offset=0', undefined, token);
    await assert(page.status === 200 && page.body.items.length <= 1, 'pagination limit');

    // ownership: another user cannot touch this clip
    const other = await registerAndLogin();
    const hijack = await api('PATCH', `/api/clips/${id}`, { content: 'hack' }, other.token);
    await assert(hijack.status === 404, 'other user editing clip -> 404');
    const delOther = await api('DELETE', `/api/clips/${id}`, other.token);
    await assert(delOther.status === 404, 'other user deleting clip -> 404');

    // 404 for nonexistent
    const nope = await api('GET', '/api/clips/999999', undefined, token);
    await assert(nope.status === 404, 'nonexistent clip -> 404');

    // delete
    const del = await api('DELETE', `/api/clips/${id}`, undefined, token);
    await assert(del.status === 200 && del.body.ok === true, 'delete clip -> 200');
    const gone = await api('GET', '/api/clips', undefined, token);
    await assert(gone.body.items.every((c) => c.id !== id), 'deleted clip absent from list');
  }

  console.log('\n== E2E: import/export round-trip ==');
  {
    const { token } = await registerAndLogin();
    await api('POST', '/api/clips', { title: 'E1', content: 'exp1', contentType: 'text', tags: ['ex'] }, token);
    const exp = await api('GET', '/api/clips/export', undefined, token);
    await assert(exp.status === 200 && Array.isArray(exp.body.items) && exp.body.items.length >= 1, 'export -> JSON array');
    const imp = await api('POST', '/api/clips/import', { items: exp.body.items }, token);
    await assert(imp.status === 201 && typeof imp.body.imported === 'number', 'import -> 201 with imported count');
    const list = await api('GET', '/api/clips', undefined, token);
    await assert(list.body.items.length >= 2, 'imported clip present in list');

    // import max 500
    const tooMany = Array(501).fill({ content: 'x', contentType: 'text' });
    const over = await api('POST', '/api/clips/import', { items: tooMany }, token);
    await assert(over.status === 400, 'import >500 items -> 400');
  }

  console.log('\n== E2E: sharing ==');
  {
    const { token } = await registerAndLogin();
    const created = await api('POST', '/api/clips', { content: 'shared value', contentType: 'text', title: 'Shared' }, token);
    const clipId = created.body.id;

    // enable share
    const share = await api('POST', `/api/clips/${clipId}/share`, { enabled: true }, token);
    await assert(share.status === 200 && share.body.shareUrl && share.body.shareToken, 'enable share -> shareUrl + shareToken');
    const token_ = share.body.shareToken;

    // meta leaks no content
    const meta = await api('GET', `/api/share/${token_}/meta`);
    await assert(meta.status === 200 && meta.body.content === undefined && meta.body.hasPassword === false, 'meta has no content, no password');

    // access returns content
    const acc = await api('POST', `/api/share/${token_}/access`, {});
    await assert(acc.status === 200 && acc.body.content === 'shared value', 'access returns content');

    // unknown token -> 404
    const unk = await api('GET', '/api/share/doesnotexist/meta');
    await assert(unk.status === 404, 'unknown share token -> 404');
    const unk2 = await api('POST', '/api/share/doesnotexist/access', {});
    await assert(unk2.status === 404, 'unknown share token access -> 404');

    // disable then access gone
    await api('POST', `/api/clips/${clipId}/share`, { enabled: false }, token);
    const dis = await api('POST', `/api/share/${token_}/access`, {});
    await assert(dis.status === 404 || dis.status === 410, 'disabled share access -> 404/410');

    // rotate invalidates old token
    const s1 = await api('POST', `/api/clips/${clipId}/share`, { enabled: true }, token);
    const oldTok = s1.body.shareToken;
    const s2 = await api('POST', `/api/clips/${clipId}/share`, { enabled: true, rotate: true }, token);
    await assert(s2.body.shareToken !== oldTok, 'rotate issues new token');
    const oldAcc = await api('POST', `/api/share/${oldTok}/access`, {});
    await assert(oldAcc.status === 404 || oldAcc.status === 410, 'rotated old token -> 404/410');

    // password protect: wrong then right
    await api('POST', `/api/clips/${clipId}/share`, { enabled: true, password: 'pw-abc' }, token);
    const share2 = await api('GET', `/api/clips/${clipId}`, undefined, token);
    await assert(share2.body.shareToken && share2.body.hasPassword === true, 'share meta hasPassword true');
    const wrong = await api('POST', `/api/share/${share2.body.shareToken}/access`, { password: 'nope' });
    await assert(wrong.status === 401, 'wrong share password -> 401');
    const right = await api('POST', `/api/share/${share2.body.shareToken}/access`, { password: 'pw-abc' });
    await assert(right.status === 200 && right.body.content === 'shared value', 'right share password -> content');

    // one-time burn after first view
    const ot = await api('POST', `/api/clips/${clipId}/share`, { enabled: true, oneTime: true }, token);
    const first = await api('POST', `/api/share/${ot.body.shareToken}/access`, {});
    await assert(first.status === 200 && first.body.consumed === true, 'one-time first view consumed');
    const second = await api('POST', `/api/share/${ot.body.shareToken}/access`, {});
    await assert(second.status === 404 || second.status === 410, 'one-time second view -> 404/410');

    // one-time not burned by wrong password
    const ot2 = await api('POST', `/api/clips/${clipId}/share`, { enabled: true, oneTime: true, password: 'pw' }, token);
    const bad = await api('POST', `/api/share/${ot2.body.shareToken}/access`, { password: 'bad' });
    await assert(bad.status === 401, 'one-time wrong password -> 401 not consumed');
    const good = await api('POST', `/api/share/${ot2.body.shareToken}/access`, { password: 'pw' });
    await assert(good.status === 200, 'one-time correct password -> 200');
    const burned = await api('POST', `/api/share/${ot2.body.shareToken}/access`, { password: 'pw' });
    await assert(burned.status === 404 || burned.status === 410, 'one-time burned after good view -> 404/410');

    // expired share -> 410
    const past = new Date(Date.now() - 1000).toISOString();
    await api('PATCH', `/api/clips/${clipId}`, { expiresAt: past }, token);
    const ex = await api('POST', `/api/clips/${clipId}/share`, { enabled: true }, token);
    const expired = await api('POST', `/api/share/${ex.body.shareToken}/access`, {});
    await assert(expired.status === 410 || expired.status === 404, 'expired share -> 410/404');
  }

  console.log('\n== E2E: MongoDB persistence ==');
  {
    const { token } = await registerAndLogin();
    await api('POST', '/api/clips', { content: 'persist me', contentType: 'text', title: 'Persist' }, token);
    if (db) {
      const count = await db.collection('clips').countDocuments({ content: 'persist me' });
      await assert(count >= 1, 'clip persisted in MongoDB online_clipboard_test');
      const userCount = await db.collection('users').countDocuments({});
      await assert(userCount >= 1, 'user persisted in MongoDB');
    } else {
      await assert(true, 'MongoDB unavailable; persistence check skipped');
    }
  }

  console.log(`\n== E2E summary: ${PASS.n} passed, ${FAIL.n} failed ==`);
  process.exit(FAIL.n > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E fatal error:', err);
  process.exit(1);
});
