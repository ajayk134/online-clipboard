// tests/auth.test.js — registration, login, session, password change
const { api, registerAndLogin, resetTables, uniqueUser } = require('./setup');

beforeEach(() => resetTables());

describe('POST /api/auth/register', () => {
  it('registers a user and returns a valid session', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'alice_test', email: 'alice@test.io', password: 'S3cure-pass!' },
    });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('alice_test');
    expect(res.body.user.email).toBe('alice@test.io');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token).not.toContain('password');
  });

  it('rejects weak passwords', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'weakpw', email: 'weak@test.io', password: 'short' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it('rejects invalid usernames and emails', async () => {
    const bad1 = await api('/api/auth/register', {
      method: 'POST', body: { username: 'a b!', email: 'x@test.io', password: 'S3cure-pass!' },
    });
    const bad2 = await api('/api/auth/register', {
      method: 'POST', body: { username: 'goodone', email: 'not-an-email', password: 'S3cure-pass!' },
    });
    expect(bad1.status).toBe(400);
    expect(bad2.status).toBe(400);
  });

  it('rejects duplicate username and email case-insensitively', async () => {
    await registerAndLogin({ username: 'dupuser', email: 'dup@test.io' });
    const dupName = await api('/api/auth/register', {
      method: 'POST', body: { username: 'DUPUSER', email: 'other@test.io', password: 'S3cure-pass!' },
    });
    const dupEmail = await api('/api/auth/register', {
      method: 'POST', body: { username: 'otherone', email: 'DUP@test.io', password: 'S3cure-pass!' },
    });
    expect(dupName.status).toBe(409);
    expect(dupEmail.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with username', async () => {
    const { payload } = await registerAndLogin({ username: 'bobtest' });
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'bobtest', password: payload.password },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('bobtest');
    expect(typeof res.body.token).toBe('string');
  });

  it('logs in with email', async () => {
    const { payload } = await registerAndLogin();
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: payload.email, password: payload.password },
    });
    expect(res.status).toBe(200);
  });

  it('rejects wrong password with 401', async () => {
    const { payload } = await registerAndLogin();
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: payload.username, password: 'WrongPassword1!' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

describe('session management', () => {
  it('GET /api/auth/me returns the current user with a valid token', async () => {
    const { token, user } = await registerAndLogin();
    const res = await api('/api/auth/me', { token });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(user.username);
  });

  it('rejects requests without a token', async () => {
    const res = await api('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('invalidates tokens after logout', async () => {
    const { token } = await registerAndLogin();
    const logout = await api('/api/auth/logout', { method: 'POST', token });
    expect(logout.status).toBe(200);
    const me = await api('/api/auth/me', { token });
    expect(me.status).toBe(401);
  });

  it('changes password and invalidates old tokens', async () => {
    const { token, payload } = await registerAndLogin();
    const res = await api('/api/auth/password', {
      method: 'PUT',
      token,
      body: { currentPassword: payload.password, newPassword: 'N3w-password!' },
    });
    expect(res.status).toBe(200);
    const oldToken = await api('/api/auth/me', { token });
    expect(oldToken.status).toBe(401);
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: payload.username, password: 'N3w-password!' },
    });
    expect(login.status).toBe(200);
  });
});
