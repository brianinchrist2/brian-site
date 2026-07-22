import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

// Wrap node:sqlite DatabaseSync in a D1-compatible async interface
function createD1FromSQLite(db) {
  function prepare(sql) {
    const stmt = {
      _stmt: db.prepare(sql),
      _bindings: [],
      bind(...args) {
        this._bindings = args;
        return this;
      },
      first() {
        try {
          const row = this._stmt.get(...this._bindings);
          return Promise.resolve(row ?? null);
        } catch (e) {
          return Promise.reject(e);
        }
      },
      all() {
        try {
          const results = this._stmt.all(...this._bindings);
          return Promise.resolve({ results, meta: {} });
        } catch (e) {
          return Promise.reject(e);
        }
      },
      run() {
        try {
          this._stmt.run(...this._bindings);
          return Promise.resolve({ meta: {} });
        } catch (e) {
          return Promise.reject(e);
        }
      },
      raw() {
        try {
          const rows = this._stmt.all(...this._bindings);
          return Promise.resolve(rows.map((r) => Object.values(r)));
        } catch (e) {
          return Promise.reject(e);
        }
      },
    };
    return stmt;
  }

  return {
    prepare,
    batch(statements) {
      return Promise.all(statements.map((s) => s.run()));
    },
    exec(sql) {
      try {
        db.exec(sql);
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    },
    _db: db,
  };
}

export async function setupTestDB(migrationFiles = []) {
  const db = new DatabaseSync(':memory:');

  for (const file of migrationFiles) {
    const filePath = join(process.cwd(), 'migrations', file);
    const sql = readFileSync(filePath, 'utf-8');
    db.exec(sql);
  }

  return createD1FromSQLite(db);
}
