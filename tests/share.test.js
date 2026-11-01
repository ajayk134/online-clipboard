// tests/share.test.js — share links, passwords, one-time burn, expiry, public meta
const { api, registerAndLogin, resetTables } = require('./setup');

beforeEach(async () => { await resetTables(); });

let token;
beforeEach(async () => {
  ({ token } = await registerAndLogin());
});

async function createClip(content = 'shared secret content') {
  const res = await api('/api/clips', {
    method: 'POST', token, body: { content, contentType: 'text', title: 'Shared clip' },
  });
  return res.body;
}

async function enableShare(clipId, body = { enabled: true }) {
  return api(`/api/clips/${clipId}/share`, { method: 'POST', token, body });
}

describe('share link lifecycle', () => {
  it('enables sharing and returns a share URL', async () => {
    const clip = await createClip();
    const res = await enableShare(clip.id);
    expect(res.status).toBe(200);
    expect(res.body.shareEnabled).toBe(true);
    expect(res.body.shareUrl).toMatch(/^\/s\//);
    expect(typeof res.body.shareToken).toBe('string');
  });

  it('exposes public meta without authentication', async () => {
    const clip = await createClip();
    const share = await enableShare(clip.id);
    const res = await api(`/api/share/${share.body.shareToken}/meta`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Shared clip');
    expect(res.body.hasPassword).toBe(false);
    expect(res.body.content).toBeUndefined(); // no content leak in meta
  });

  it('accesses a shared clip by token', async () => {
    const clip = await createClip();
    const share = await enableShare(clip.id);
    const res = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('shared secret content');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('returns 404 for unknown share token', async () => {
    const res = await api('/api/share/no-such-token/meta');
    expect(res.status).toBe(404);
  });

  it('disables sharing', async () => {
    const clip = await createClip();
    const share = await enableShare(clip.id);
    const off = await enableShare(clip.id, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.shareEnabled).toBe(false);
    const access = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([404, 410]).toContain(access.status);
  });

  it('rotates the token when share link is regenerated', async () => {
    const clip = await createClip();
    const s1 = await enableShare(clip.id);
    const s2 = await enableShare(clip.id, { enabled: true, rotate: true });
    expect(s2.body.shareToken).not.toBe(s1.body.shareToken);
    const old = await api(`/api/share/${s1.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([404, 410]).toContain(old.status);
  });
});

describe('password protected shares', () => {
  it('requires a password to access', async () => {
    const clip = await createClip();
    await enableShare(clip.id, { enabled: true, password: 'share-pw-123' });
    const share = await api(`/api/clips/${clip.id}`, { token });
    const meta = await api(`/api/share/${share.body.shareToken}/meta`);
    expect(meta.body.hasPassword).toBe(true);
    const wrong = await api(`/api/share/${share.body.shareToken}/access`, {
      method: 'POST', body: { password: 'wrong' },
    });
    expect(wrong.status).toBe(401);
    const right = await api(`/api/share/${share.body.shareToken}/access`, {
      method: 'POST', body: { password: 'share-pw-123' },
    });
    expect(right.status).toBe(200);
    expect(right.body.content).toBe('shared secret content');
  });
});

describe('one-time links', () => {
  it('burns after first successful view', async () => {
    const clip = await createClip('one time only');
    const share = await enableShare(clip.id, { enabled: true, oneTime: true });
    const first = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect(first.status).toBe(200);
    expect(first.body.consumed).toBe(true);
    const second = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([404, 410]).toContain(second.status);
  });

  it('does not burn when the wrong password is used', async () => {
    const clip = await createClip();
    const share = await enableShare(clip.id, { enabled: true, oneTime: true, password: 'pw' });
    const bad = await api(`/api/share/${share.body.shareToken}/access`, {
      method: 'POST', body: { password: 'nope' },
    });
    expect(bad.status).toBe(401);
    const good = await api(`/api/share/${share.body.shareToken}/access`, {
      method: 'POST', body: { password: 'pw' },
    });
    expect(good.status).toBe(200);
  });
});

describe('expired shares', () => {
  it('refuses access after expiry', async () => {
    const clip = await createClip();
    const past = new Date(Date.now() - 60_000).toISOString();
    await enableShare(clip.id);
    await api(`/api/clips/${clip.id}`, { method: 'PATCH', token, body: { expiresAt: past } });
    const share = await api(`/api/clips/${clip.id}`, { token });
    const access = await api(`/api/share/${share.body.shareToken}/access`, { method: 'POST', body: {} });
    expect([410, 404]).toContain(access.status);
  });
});

describe('QR code endpoint', () => {
  it('serves a PNG QR for a shared clip', async () => {
    const clip = await createClip();
    await enableShare(clip.id);
    const res = await api(`/api/clips/${clip.id}/qr`, { token });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('rejects QR for an unshared clip', async () => {
    const clip = await createClip();
    const res = await api(`/api/clips/${clip.id}/qr`, { token });
    expect([404, 400]).toContain(res.status);
  });
});
