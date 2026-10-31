// tests/clips.test.js — clip CRUD, excerpt generation, tags, flags, stats
const { api, registerAndLogin, resetTables } = require('./setup');

beforeEach(() => resetTables());

let token;
beforeEach(async () => {
  ({ token } = await registerAndLogin());
});

describe('POST /api/clips', () => {
  it('creates a text clip and generates an excerpt', async () => {
    const res = await api('/api/clips', {
      method: 'POST',
      token,
      body: {
        title: 'Note',
        content: 'First line of the note\nSecond line with more detail',
        contentType: 'text',
        tags: ['work', 'idea'],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.content).toContain('First line');
    expect(typeof res.body.excerpt).toBe('string');
    expect(res.body.excerpt.length).toBeGreaterThan(0);
    expect(res.body.tags).toEqual(['work', 'idea']);
    expect(res.body.contentType).toBe('text');
  });

  it('creates a richtext clip with sanitized content and plain-text excerpt', async () => {
    const res = await api('/api/clips', {
      method: 'POST',
      token,
      body: {
        title: 'Rich',
        content: '<h1>Heading</h1><p>Hello <b>world</b><script>alert(1)</script></p>',
        contentType: 'richtext',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.content).not.toMatch(/<script/i);
    expect(res.body.excerpt).not.toMatch(/<|>/); // plain text
    expect(res.body.excerpt).toContain('Hello');
  });

  it('creates a code clip with language', async () => {
    const res = await api('/api/clips', {
      method: 'POST',
      token,
      body: { content: 'console.log(1)', contentType: 'code', language: 'javascript' },
    });
    expect(res.status).toBe(201);
    expect(res.body.language).toBe('javascript');
    expect(res.body.contentType).toBe('code');
  });

  it('rejects empty content', async () => {
    const res = await api('/api/clips', {
      method: 'POST', token, body: { content: '', contentType: 'text' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid content type', async () => {
    const res = await api('/api/clips', {
      method: 'POST', token, body: { content: 'x', contentType: 'binary' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid expiry value', async () => {
    const res = await api('/api/clips', {
      method: 'POST', token, body: { content: 'x', contentType: 'text', expiresAt: 'tomorrow' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects more than the max tags', async () => {
    const res = await api('/api/clips', {
      method: 'POST', token, body: {
        content: 'x', contentType: 'text',
        tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11'],
      },
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated creation', async () => {
    const res = await api('/api/clips', {
      method: 'POST', body: { content: 'x', contentType: 'text' },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/clips', () => {
  it('lists clips newest first', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'older one', contentType: 'text' } });
    await new Promise((r) => setTimeout(r, 20));
    await api('/api/clips', { method: 'POST', token, body: { content: 'newer one', contentType: 'text' } });
    const res = await api('/api/clips', { token });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].excerpt).toContain('newer one');
  });

  it('searches by query', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'kubernetes cluster config', contentType: 'text' } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'grocery list apples', contentType: 'text' } });
    const res = await api('/api/clips?search=kubernetes', { token });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].content).toContain('kubernetes');
  });

  it('filters by tag', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'a', contentType: 'text', tags: ['urgent'] } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'b', contentType: 'text', tags: ['later'] } });
    const res = await api('/api/clips?tag=urgent', { token });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].tags).toContain('urgent');
  });

  it('filters favorites only', async () => {
    const c1 = await api('/api/clips', { method: 'POST', token, body: { content: 'fav clip', contentType: 'text' } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'plain clip', contentType: 'text' } });
    await api(`/api/clips/${c1.body.id}/flags`, { method: 'PATCH', token, body: { isFavorite: true } });
    const res = await api('/api/clips?favorite=1', { token });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].isFavorite).toBe(true);
  });

  it('supports type filter', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'plain', contentType: 'text' } });
    await api('/api/clips', { method: 'POST', token, body: { content: 'print(1)', contentType: 'code', language: 'python' } });
    const res = await api('/api/clips?type=code', { token });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].contentType).toBe('code');
  });
});

describe('GET /api/clips/:id', () => {
  it('returns a full clip', async () => {
    const created = await api('/api/clips', {
      method: 'POST', token,
      body: { title: 'T', content: 'full content body', contentType: 'text' },
    });
    const res = await api(`/api/clips/${created.body.id}`, { token });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('full content body');
  });

  it('cannot access another users clip', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { content: 'secret', contentType: 'text' } });
    const other = await registerAndLogin();
    const res = await api(`/api/clips/${created.body.id}`, { token: other.token });
    expect([403, 404]).toContain(res.status);
  });
});

describe('PATCH /api/clips/:id', () => {
  it('updates content and regenerates the excerpt', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { content: 'original text', contentType: 'text' } });
    const res = await api(`/api/clips/${created.body.id}`, {
      method: 'PATCH', token, body: { content: 'updated text with new words', title: 'Updated' },
    });
    expect(res.status).toBe(200);
    expect(res.body.content).toContain('updated text');
    expect(res.body.excerpt).toContain('updated text');
    expect(res.body.title).toBe('Updated');
  });

  it('updates tags', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { content: 'x', contentType: 'text', tags: ['a'] } });
    const res = await api(`/api/clips/${created.body.id}`, { method: 'PATCH', token, body: { tags: ['b', 'c'] } });
    expect(res.body.tags).toEqual(['b', 'c']);
  });

  it('rejects empty update', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { content: 'x', contentType: 'text' } });
    const res = await api(`/api/clips/${created.body.id}`, { method: 'PATCH', token, body: {} });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/clips/:id/flags', () => {
  it('toggles favorite and pin', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { content: 'x', contentType: 'text' } });
    const r1 = await api(`/api/clips/${created.body.id}/flags`, { method: 'PATCH', token, body: { isFavorite: true, isPinned: true } });
    expect(r1.body.isFavorite).toBe(true);
    expect(r1.body.isPinned).toBe(true);
    const r2 = await api(`/api/clips/${created.body.id}/flags`, { method: 'PATCH', token, body: { isFavorite: false } });
    expect(r2.body.isFavorite).toBe(false);
    expect(r2.body.isPinned).toBe(true);
  });
});

describe('DELETE /api/clips/:id', () => {
  it('deletes a clip', async () => {
    const created = await api('/api/clips', { method: 'POST', token, body: { content: 'bye', contentType: 'text' } });
    const res = await api(`/api/clips/${created.body.id}`, { method: 'DELETE', token });
    expect(res.status).toBe(200);
    const after = await api(`/api/clips/${created.body.id}`, { token });
    expect([404, 410]).toContain(after.status);
  });
});

describe('GET /api/clips/stats and /tags', () => {
  it('returns stats and tag counts', async () => {
    await api('/api/clips', { method: 'POST', token, body: { content: 'x', contentType: 'text', tags: ['alpha'] } });
    const stats = await api('/api/clips/stats', { token });
    expect(stats.body.total).toBe(1);
    const tags = await api('/api/clips/tags', { token });
    expect(tags.body.tags[0].tag).toBe('alpha');
  });
});

describe('import/export', () => {
  it('exports and re-imports clips', async () => {
    await api('/api/clips', { method: 'POST', token, body: { title: 'E1', content: 'export me', contentType: 'text', tags: ['ex'] } });
    const exp = await api('/api/clips/export', { token });
    expect(exp.status).toBe(200);
    expect(exp.body.items).toHaveLength(1);
    const imp = await api('/api/clips/import', {
      method: 'POST', token, body: { items: exp.body.items },
    });
    expect(imp.status).toBe(201);
    expect(imp.body.imported).toBe(1);
    const list = await api('/api/clips', { token });
    expect(list.body.items).toHaveLength(2);
  });
});
