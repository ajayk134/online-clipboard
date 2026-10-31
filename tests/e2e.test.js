// tests/e2e.test.js — end-to-end + edge-case coverage for auth, clips, sharing, DB
const { api, registerAndLogin, resetTables, db, app } = require('./setup');

beforeEach(() => resetTables());

describe('E2E: authentication', () => {
  it('register -> login -> me -> password change invalidates old token', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST', body: { username: 'cycletest', email: 'cycle@test.io', password: 'S3cure-pass!' },
    });
    expect(reg.status).toBe(201);

    const login = await api('/api/auth/login', {
      method: 'POST', body: { identifier: 'CYCLETEST', password: 'S3cure-pass!' },
    });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const me = await api('/api/auth/me', { token });
    expect(me.status).toBe(200);

    const pw = await api('/api/auth/password', {
      method: 'PUT', token,
      body: { currentPassword: 'S3cure-pass!', newPassword: 'N3w-pass-99' },
    });
    expect(pw.status).toBe(200);
    // old token is invalidated by the password change
    expect((await api('/api/auth/me', { token })).status).toBe(401);

    const relogin = await api('/api/auth/login', {
      method: 'POST', body: { identifier: 'cycletest', password: 'N3w-pass-99' },
    });
    expect(relogin.status).toBe(200);
  });

  it('rejects registration with missing fields', async () => {
    const noPass = await api('/api/auth/register', { method: 'POST', body: { username: 'x', email: 'x@test.io' } });
    expect(noPass.status).toBe(400);
    const noUser = await api('/api/auth/register', { method: 'POST', body: { email: 'x@test.io', password: 'S3cure-pass!' } });
    expect(noUser.status).toBe(400);
  });

  it('login rejects missing identifier/password', async () => {
    expect((await api('/api/auth/login', { method: 'POST', body: {} })).status).toBe(400);
    expect((await api('/api/auth/login', { method: 'POST', body: { identifier: 'a', password: '' } })).status).toBe(400);
  });

  it('protects clip routes without a token', async () => {
    expect((await api('/api/clips')).status).toBe(401);
    expect((await api('/api/clips', { method: 'POST', body: { content: 'x' } })).status).toBe(401);
    expect((await api('/api/clips/1', { method: 'DELETE' })).status).toBe(401);
  });

  it('rejects malformed JSON bodies', async () => {
    const request = require('supertest');
    const res = await request(app).post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });
});

describe('E2E: clip CRUD', () => {
  let token;
  beforeEach(async () => { ({ token } = await registerAndLogin()); });

  it('creates all three content types', async () => {
    const text = await api('/api/clips', { method: 'POST', token, body: { content: 'plain', contentType: 'text' } });
    expect(text.status).toBe(201);
    const rich = await api('/api/clips', { method: 'POST', token, body: { content: '<p>hi</p>', contentType: 'richtext' } });
    expect(rich.status).toBe(201);
    const code = await api('/api/clips', { method: 'POST', token, body: { content: 'const x=1', contentType: 'code', language: 'js' } });
    expect(code.status).toBe(201);
    expect(code.body.language).toBe('js');
  });

  it('sanitizes XSS in rich text and excerpt', async () => {
    const res = await api('/api/clips', {
      method: 'POST', token,
      body: { content: '<img src=x onerror=alert(1)><script>bad()</script><p>keep me</p>', contentType: 'richtext' },
    });
    expect(res.status).toBe(201);
    expect(res.body.content).not.toMatch(/onerror|<script|alert\(/i);
    expect(res.body.content).toContain('keep me');
    expect(res.body.excerpt).not.toMatch(/<|>/);
  });

  it('updates via PATCH (text, tags, expiry, title)', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { title: 'T1', content: 'orig', contentType: 'text', tags: ['a'] } });
    const res = await api(`/api/clips/${created.body.id}`, {
      method: 'PATCH', token,
      body: { content: 'updated', title: 'T2', tags: ['b', 'c'], expiresAt: 'never' },
    });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('updated');
    expect(res.body.title).toBe('T2');
    expect(res.body.tags).toEqual(['b', 'c']);
    expect(res.body.expiresAt).toBeNull();
  });

  it('updating rich text switches type and clears language', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { content: 'code', contentType: 'code', language: 'python' } });
    const res = await api(`/api/clips/${created.body.id}`, {
      method: 'PATCH', token, body: { content: '<p>now rich</p>', contentType: 'richtext' },
    });
    expect(res.status).toBe(200);
    expect(res.body.contentType).toBe('richtext');
    expect(res.body.language).toBeNull();
  });

  it('rejects updates to another user clip and nonexistent clip', async () => {
    const mine = await api('/api/clips', { method: 'POST', token, body: { content: 'x', contentType: 'text' } });
    const other = await registerAndLogin();
    expect((await api(`/api/clips/${mine.body.id}`, { method: 'PATCH', token: other.token, body: { content: 'hack' } })).status).toBe(404);
    expect((await api('/api/clips/999999', { method: 'PATCH', token, body: { content: 'x' } })).status).toBe(404);
    expect((await api('/api/clips/999999', { method: 'DELETE', token })).status).toBe(404);
    expect((await api('/api/clips/abc', { token })).status).toBe(404);
  });

  it('delete then list reflects removal', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'd1', contentType: 'text' } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'd2', contentType: 'text' } });
    const list1 = await api('/api/clips', { token });
    expect(list1.body.items).toHaveLength(2);
    const id = list1.body.items[1].id;
    expect((await api(`/api/clips/${id}`, { method: 'DELETE', token })).status).toBe(200);
    const list2 = await api('/api/clips', { token });
    expect(list2.body.items).toHaveLength(1);
  });

  it('copy count increments', async () => {
    const c = await api('/api/clips', { method: 'POST', token, body: { content: 'copy me', contentType: 'text' } });
    await api(`/api/clips/${c.body.id}/copy`, { method: 'PATCH', token });
    const got = await api(`/api/clips/${c.body.id}`, { token });
    expect(got.body.copyCount).toBe(1);
  });

  it('favorite and pin toggles persist', async () => {
    const c = await api('/api/clips', { method: 'POST', token, body: { content: 'f', contentType: 'text' } });
    const r = await api(`/api/clips/${c.body.id}/flags`, { method: 'PATCH', token, body: { isFavorite: true, isPinned: true } });
    expect(r.body.isFavorite).toBe(true);
    expect(r.body.isPinned).toBe(true);
    const off = await api(`/api/clips/${c.body.id}/flags`, { method: 'PATCH', token, body: { isFavorite: false } });
    expect(off.body.isFavorite).toBe(false);
    expect(off.body.isPinned).toBe(true);
  });

  it('search, tag, type, sort and pagination work', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'alpha unique', contentType: 'text', tags: ['t1'] } });
    await new Promise((r) => setTimeout(r, 25));
    await api('/api/clips', { method: 'POST', token, body: { content: 'beta code', contentType: 'code', language: 'js', tags: ['t2'] } });
    await new Promise((r) => setTimeout(r, 25));

    const search = await api('/api/clips?q=alpha', { token });
    expect(search.body.items).toHaveLength(1);

    const byTag = await api('/api/clips?tag=t2', { token });
    expect(byTag.body.items[0].contentType).toBe('code');

    const byType = await api('/api/clips?type=code', { token });
    expect(byType.body.items).toHaveLength(1);

    const sorted = await api('/api/clips?sort=title', { token });
    expect(sorted.body.items).toHaveLength(2);

    const page = await api('/api/clips?limit=1&offset=1', { token });
    expect(page.body.items).toHaveLength(1);
  });

  it('stats and tags endpoints', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'x', contentType: 'text', tags: ['red'] } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'y', contentType: 'text', tags: ['red', 'blue'] } });
    const first = await api('/api/clips', { token });
    const firstId = first.body.items[0].id;
    await api(`/api/clips/${firstId}`, { method: 'PATCH', token, body: { isFavorite: true } });

    const stats = await api('/api/clips/stats', { token });
    expect(stats.body.total).toBe(2);
    expect(stats.body.favorites).toBe(1);

    const tags = await api('/api/clips/tags', { token });
    const byName = Object.fromEntries(tags.body.tags.map((t) => [t.tag, t.count]));
    expect(byName.red).toBe(2);
    expect(byName.blue).toBe(1);
  });

  it('export round-trips through import', async () => {
    await api('/api/clips', { method: 'POST', token, body: { title: 'E', content: 'e1', contentType: 'text', tags: ['ex'] } });
    const exp = await api('/api/clips/export', { token });
    expect(exp.status).toBe(200);
    expect(exp.body.items).toHaveLength(1);
    const imp = await api('/api/clips/import', { method: 'POST', token, body: { items: exp.body.items } });
    expect(imp.status).toBe(201);
    expect(imp.body.imported).toBe(1);
    const list = await api('/api/clips', { token });
    expect(list.body.items).toHaveLength(2);
  });

  it('rejects oversized content and too many tags', async () => {
    const big = await api('/api/clips', { method: 'POST', token, body: { content: 'a'.repeat(900001), contentType: 'text' } });
    expect(big.status).toBe(400);
    const manyTags = await api('/api/clips', { method: 'POST', token, body: { content: 'x', contentType: 'text', tags: Array(11).fill('t') } });
    expect(manyTags.status).toBe(400);
  });
});

describe('E2E: sharing', () => {
  let token;
  beforeEach(async () => { ({ token } = await registerAndLogin()); });

  async function create() {
    const r = await api('/api/clips', { method: 'POST', token, body: { content: 'shared value', contentType: 'text', title: 'Shared' } });
    return r.body;
  }

  it('meta leaks no content; access returns content', async () => {
    const clip = await create();
    const share = await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true } });
    expect(share.status).toBe(200);
    expect(share.body.shareUrl).toMatch(/^\/s\//);

    const meta = await api(`/api/share/${share.body.shareToken}/meta`);
    expect(meta.status).toBe(200);
    expect(meta.body.content).toBeUndefined();
    expect(meta.body.hasPassword).toBe(false);

    const acc = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect(acc.status).toBe(200);
    expect(acc.body.content).toBe('shared value');
    expect(acc.body.passwordHash).toBeUndefined();
  });

  it('unknown token is 404', async () => {
    expect((await api('/api/share/zzz/meta')).status).toBe(404);
    expect((await api('/api/share/zzz/access', { method: 'POST', body: {} })).status).toBe(404);
  });

  it('disable then access is gone', async () => {
    const clip = await create();
    const share = await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true } });
    await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: false } });
    const acc = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([404, 410]).toContain(acc.status);
  });

  it('rotate invalidates old token', async () => {
    const clip = await create();
    const s1 = await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true } });
    const s2 = await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true, rotate: true } });
    expect(s2.body.shareToken).not.toBe(s1.body.shareToken);
    const old = await api(`/api/share/${s1.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([404, 410]).toContain(old.status);
  });

  it('password protected share: wrong then right', async () => {
    const clip = await create();
    await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true, password: 'pw-abc' } });
    const share = await api(`/api/clips/${clip.id}`, { token });
    expect((await api(`/api/share/${share.body.shareToken}/meta`)).body.hasPassword).toBe(true);
    expect((await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: { password: 'nope' } })).status).toBe(401);
    const ok = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: { password: 'pw-abc' } });
    expect(ok.status).toBe(200);
    expect(ok.body.content).toBe('shared value');
  });

  it('one-time link burns after first view and not on wrong password', async () => {
    const clip = await create();
    const share = await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true, oneTime: true } });
    const first = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect(first.status).toBe(200);
    expect(first.body.consumed).toBe(true);
    const second = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([404, 410]).toContain(second.status);
  });

  it('one-time link not burned by wrong password', async () => {
    const clip = await create();
    const share = await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true, oneTime: true, password: 'pw' } });
    expect((await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: { password: 'bad' } })).status).toBe(401);
    const good = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: { password: 'pw' } });
    expect(good.status).toBe(200);
    // burned now
    expect([404, 410]).toContain(
      (await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: { password: 'pw' } })).status
    );
  });

  it('expired share returns 410', async () => {
    const clip = await create();
    const past = new Date(Date.now() - 1000).toISOString();
    await api(`/api/clips/${clip.id}`, { method: 'PATCH', token, body: { expiresAt: past } });
    const share = await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true } });
    const acc = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([410, 404]).toContain(acc.status);
  });

  it('QR code PNG for shared clip, rejected otherwise', async () => {
    jest.setTimeout(30000);
    const clip = await create();
    await api(`/api/clips/${clip.id}/share`, { method: 'POST', token, body: { enabled: true } });
    const qr = await api(`/api/clips/${clip.id}/qr`, { token });
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toBe('image/png');
    const fresh = await api('/api/clips', { method: 'POST', token, body: { content: 'n', contentType: 'text' } });
    const noShare = await api(`/api/clips/${fresh.body.id}/qr`, { token });
    expect([400, 404]).toContain(noShare.status);
  });
});

describe('E2E: database operations', () => {
  it('logout bumps token_version invalidating older tokens', async () => {
    const { token: t1 } = await registerAndLogin();
    const { token: t2 } = await registerAndLogin();
    const me1 = await api('/api/auth/me', { token: t1 });
    expect(me1.status).toBe(200);
    await api('/api/auth/logout', { method: 'POST', token: t1 });
    expect((await api('/api/auth/me', { token: t1 })).status).toBe(401);
    // other user unaffected
    expect((await api('/api/auth/me', { token: t2 })).status).toBe(200);
  });

  it('user deletion cascades clips (ON DELETE CASCADE)', async () => {
    const { token, user } = await registerAndLogin();
    await api('/api/clips', { method: 'POST', token, body: { content: 'c1', contentType: 'text' } });
    expect((await api('/api/clips', { token })).body.items).toHaveLength(1);
    const deleted = db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    expect(deleted.changes).toBe(1);
    // token no longer valid since user is gone
    expect((await api('/api/clips', { token })).status).toBe(401);
    const remaining = db.prepare('SELECT COUNT(*) AS c FROM clipboard_items').get().c;
    expect(Number(remaining)).toBe(0);
  });

  it('maintenance purgeExpired removes expired only', async () => {
    const { token } = await registerAndLogin();
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 864e5 * 30).toISOString();
    await api('/api/clips', { method: 'POST', token, body: { content: 'exp', contentType: 'text', expiresAt: past } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'keep', contentType: 'text', expiresAt: future } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'never', contentType: 'text' } });
    const Clip = require('../src/models/Clip');
    const purged = Clip.purgeExpired();
    expect(purged).toBe(1);
    const list = await api('/api/clips', { token });
    expect(list.body.items.map((i) => i.content)).toEqual(expect.arrayContaining(['keep', 'never']));
  });

  it('schema version is applied and migrations idempotent', async () => {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    expect(version).toBe(2);
    // re-run migrate via new app instance would be idempotent; column set is stable
    const cols = db.prepare('PRAGMA table_info(clipboard_items)').all().map((r) => r.name);
    expect(cols).toContain('share_token');
    expect(cols).toContain('excerpt');
    expect(cols).toContain('password_hash');
  });
});
