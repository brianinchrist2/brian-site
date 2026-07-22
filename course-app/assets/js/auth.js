const CourseAuth = {
  getToken() {
    return localStorage.getItem('auth_token');
  },

  setToken(token) {
    localStorage.setItem('auth_token', token);
  },

  clearToken() {
    localStorage.removeItem('auth_token');
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  async signIn(email, password) {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign in failed');
    this.setToken(data.token);
    return data;
  },

  async signUp(nickname, email, password) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign up failed');
    if (data.token) this.setToken(data.token);
    return data;
  },

  async getProfile() {
    const token = this.getToken();
    if (!token) return null;
    const res = await fetch('/api/user/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      this.clearToken();
      return null;
    }
    return await res.json();
  },

  logout() {
    this.clearToken();
    window.location.href = '/login.html';
  },
};

export default CourseAuth;
