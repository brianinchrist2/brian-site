// Simple in-memory D1 mock for unit testing
function createMockD1() {
  const tables = {};
  return {
    prepare(sql) {
      const stmt = {
        sql,
        _bindings: [],
        bind(...args) {
          this._bindings = args;
          return this;
        },
        first() {
          // Default: return null. Override in tests.
          return Promise.resolve(null);
        },
        all() {
          return Promise.resolve({ results: [], meta: {} });
        },
        run() {
          return Promise.resolve({ meta: {} });
        },
        raw() {
          return Promise.resolve([]);
        },
      };
      return stmt;
    },
    batch(statements) {
      return Promise.all(statements.map((s) => s.run()));
    },
    exec(sql) {
      return Promise.resolve();
    },
    _tables: tables,
  };
}

function createMockKV() {
  const store = new Map();
  return {
    get(key) {
      return Promise.resolve(store.get(key) ?? null);
    },
    getWithMetadata(key) {
      const value = store.get(key);
      return Promise.resolve(value ? { value, metadata: null } : null);
    },
    put(key, value, options) {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
    list(options) {
      const keys = [...store.keys()].map((name) => ({ name }));
      return Promise.resolve({ keys, list_complete: true, cacheStatus: null });
    },
    _store: store,
  };
}

export function createMockEnv(overrides = {}) {
  return {
    DB: createMockD1(),
    USERS_KV: createMockKV(),
    JWT_SECRET: 'test-jwt-secret',
    ...overrides,
  };
}
