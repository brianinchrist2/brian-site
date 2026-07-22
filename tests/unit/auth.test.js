import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CourseAuth module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('CourseAuth object exists with expected methods', async () => {
    const auth = await import('../../course-app/assets/js/auth.js');
    expect(auth.default || auth.CourseAuth).toBeDefined();
    const CourseAuth = auth.default || auth.CourseAuth;
    expect(typeof CourseAuth.getToken).toBe('function');
    expect(typeof CourseAuth.setToken).toBe('function');
    expect(typeof CourseAuth.clearToken).toBe('function');
    expect(typeof CourseAuth.isLoggedIn).toBe('function');
    expect(typeof CourseAuth.signIn).toBe('function');
    expect(typeof CourseAuth.signUp).toBe('function');
    expect(typeof CourseAuth.getProfile).toBe('function');
    expect(typeof CourseAuth.logout).toBe('function');
  });

  it('setToken stores token in localStorage', async () => {
    const auth = await import('../../course-app/assets/js/auth.js');
    const CourseAuth = auth.default || auth.CourseAuth;
    CourseAuth.setToken('test-token-123');
    expect(localStorage.getItem('auth_token')).toBe('test-token-123');
  });

  it('getToken retrieves token from localStorage', async () => {
    const auth = await import('../../course-app/assets/js/auth.js');
    const CourseAuth = auth.default || auth.CourseAuth;
    localStorage.setItem('auth_token', 'my-token');
    expect(CourseAuth.getToken()).toBe('my-token');
  });

  it('clearToken removes token from localStorage', async () => {
    const auth = await import('../../course-app/assets/js/auth.js');
    const CourseAuth = auth.default || auth.CourseAuth;
    localStorage.setItem('auth_token', 'temp');
    CourseAuth.clearToken();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('isLoggedIn returns true when token exists', async () => {
    const auth = await import('../../course-app/assets/js/auth.js');
    const CourseAuth = auth.default || auth.CourseAuth;
    expect(CourseAuth.isLoggedIn()).toBe(false);
    CourseAuth.setToken('some-token');
    expect(CourseAuth.isLoggedIn()).toBe(true);
  });
});
