import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// reader-auth.js 是经典 IIFE，挂载到 window.ReaderAuth；在 happy-dom 环境中 eval 其源码以加载
const SRC = readFileSync(
  join(process.cwd(), 'brianinchrist/organicchurch/library/assets/js/reader-auth.js'),
  'utf-8'
);

beforeAll(() => {
  // 每次只在首个 beforeAll 加载一次；window.ReaderAuth 在 happy-dom 全局上
  (0, eval)(SRC);
});

beforeEach(() => {
  localStorage.clear();
});

function okJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ReaderAuth token helpers', () => {
  it('isLoggedIn is false without a token', () => {
    expect(window.ReaderAuth.isLoggedIn()).toBe(false);
    expect(window.ReaderAuth.getToken()).toBeNull();
  });

  it('setToken/getToken round-trips and flips isLoggedIn', () => {
    window.ReaderAuth.setToken('abc');
    expect(window.ReaderAuth.getToken()).toBe('abc');
    expect(window.ReaderAuth.isLoggedIn()).toBe(true);
  });

  it('clearToken removes the token and isLoggedIn goes false', () => {
    window.ReaderAuth.setToken('abc');
    window.ReaderAuth.clearToken();
    expect(window.ReaderAuth.getToken()).toBeNull();
    expect(window.ReaderAuth.isLoggedIn()).toBe(false);
  });

  it('getToken is null when localStorage is unavailable', () => {
    const orig = window.localStorage.getItem;
    window.localStorage.getItem = () => { throw new Error('denied'); };
    expect(window.ReaderAuth.getToken()).toBeNull();
    window.localStorage.getItem = orig;
  });
});

describe('ReaderAuth signIn / signUp', () => {
  it('signIn POSTs to /api/auth/signin and stores the token', async () => {
    const fetchMock = vi.fn(async () => okJson({ success: true, token: 'jwt-123', user: { id: 'u1', nickname: 'N' } }));
    globalThis.fetch = fetchMock;

    const data = await window.ReaderAuth.signIn('a@b.c', 'p');
    expect(data.token).toBe('jwt-123');
    expect(window.ReaderAuth.getToken()).toBe('jwt-123');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signin', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ email: 'a@b.c', password: 'p' });
  });

  it('signIn lowercases+trims email before sending', async () => {
    const fetchMock = vi.fn(async () => okJson({ success: true, token: 'jwt-1', user: { id: 'u1' } }));
    globalThis.fetch = fetchMock;
    await window.ReaderAuth.signIn('  A@B.C ', 'p');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.email).toBe('a@b.c');
  });

  it('signUp POSTs to /api/auth/signup and stores the token', async () => {
    const fetchMock = vi.fn(async () => okJson({ success: true, token: 'jwt-2', user: { id: 'u2' } }, 201));
    globalThis.fetch = fetchMock;

    const data = await window.ReaderAuth.signUp('Nick', 'n@b.c', 'pw');
    expect(data.token).toBe('jwt-2');
    expect(window.ReaderAuth.getToken()).toBe('jwt-2');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({ method: 'POST' }));
  });

  it('signIn throws with server error message on failure', async () => {
    globalThis.fetch = vi.fn(async () => okJson({ error: 'Invalid email or password.' }, 401));
    await expect(window.ReaderAuth.signIn('a@b.c', 'bad')).rejects.toThrow('Invalid email or password.');
  });

  it('signIn throws a generic message when server returns non-JSON', async () => {
    globalThis.fetch = vi.fn(async () => new Response('oops', { status: 500 }));
    await expect(window.ReaderAuth.signIn('a@b.c', 'p')).rejects.toThrow('登录失败');
  });
});

describe('ReaderAuth getProfile / logout', () => {
  it('getProfile returns null when not logged in', async () => {
    expect(await window.ReaderAuth.getProfile()).toBeNull();
  });

  it('getProfile fetches /api/user/profile with Bearer token', async () => {
    const fetchMock = vi.fn(async () => okJson({ user: { id: 'u1', nickname: 'N', roles: ['student'] } }));
    globalThis.fetch = fetchMock;
    window.ReaderAuth.setToken('t-ok');

    const profile = await window.ReaderAuth.getProfile();
    expect(profile.user.nickname).toBe('N');
    expect(fetchMock).toHaveBeenCalledWith('/api/user/profile', {
      headers: { Authorization: 'Bearer t-ok' },
    });
  });

  it('getProfile clears the token when the profile request is unauthorized', async () => {
    globalThis.fetch = vi.fn(async () => okJson({ error: 'Unauthorized' }, 401));
    window.ReaderAuth.setToken('t-expired');
    expect(await window.ReaderAuth.getProfile()).toBeNull();
    expect(window.ReaderAuth.getToken()).toBeNull();
  });

  it('logout clears the token and fires logout callbacks', () => {
    const cb = vi.fn();
    window.ReaderAuth.onLogout(cb);
    window.ReaderAuth.setToken('abc');
    window.ReaderAuth.logout();
    expect(window.ReaderAuth.getToken()).toBeNull();
    expect(cb).toHaveBeenCalled();
  });
});
