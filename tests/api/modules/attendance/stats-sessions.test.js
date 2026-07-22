import { describe, it, expect } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestGet } from '../../../../functions/api/modules/attendance/stats.js';

// Create a mock D1 that returns test data based on SQL content
function createStatsMockD1() {
  function prepare(sql) {
    const stmt = {
      _sql: sql,
      _bindings: [],
      bind(...args) { this._bindings = args; return this; },
      first() {
        if (sql.includes('COUNT(*) as count')) {
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve(null);
      },
      all() {
        if (sql.includes('class_members') || sql.includes('class_sessions')) {
          if (sql.includes('u.id as student_id')) {
            return Promise.resolve({
              results: [{
                student_id: 's1',
                nickname: 'Test Student',
                email: 'test@test.com',
                present: 1, absent: 0, late: 0, excused: 0,
                total_recorded: 1
              }],
              meta: {}
            });
          }
          if (sql.includes('attendance_records ar') && sql.includes('JOIN class_sessions')) {
            return Promise.resolve({
              results: [{
                status: 'present',
                notes: null,
                session_date: '2026-01-01',
                title: 'Test Session'
              }],
              meta: {}
            });
          }
        }
        return Promise.resolve({ results: [], meta: {} });
      },
      run() { return Promise.resolve({ meta: {} }); },
      raw() { return Promise.resolve([]); },
    };
    return stmt;
  }
  return {
    prepare,
    batch(stmts) { return Promise.all(stmts.map(s => s.run())); },
    exec() { return Promise.resolve(); },
  };
}

describe('GET /api/modules/attendance/stats - sessions detail', () => {
  it('returns students with sessions array', async () => {
    const token = await signJWT(
      { sub: 'test-user', exp: Date.now() + 3600000 },
      'test-jwt-secret'
    );

    const ctx = createMockContext({
      method: 'GET',
      url: 'http://localhost/api/modules/attendance/stats?class_id=test-class',
      headers: { Authorization: `Bearer ${token}` },
      env: {
        DB: createStatsMockD1(),
        JWT_SECRET: 'test-jwt-secret',
      },
    });

    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.stats.students).toBeDefined();
    expect(data.stats.students.length).toBeGreaterThan(0);
    expect(data.stats.students[0].sessions).toBeDefined();
    expect(Array.isArray(data.stats.students[0].sessions)).toBe(true);
  });
});
