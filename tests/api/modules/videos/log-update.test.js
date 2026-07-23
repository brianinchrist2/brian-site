import { describe, it, expect, beforeAll } from 'vitest';
import { createMockContext } from '../../../helpers/mock-context.js';
import { setupTestDB } from '../../../helpers/setup-db.js';
import { createMockEnv } from '../../../helpers/mock-env.js';
import { signJWT } from '../../../../functions/_utils/jwt.js';
import { onRequestPost } from '../../../../functions/api/modules/videos/[id]/log.js';

describe('POST /api/modules/videos/[id]/log update existing', () => {
  let db, studentToken, mockEnv;

  beforeAll(async () => {
    db = await setupTestDB(['001_init.sql', '002-attendance.sql', '003-interactions.sql', '004-books.sql', '005-course-extend.sql', '007-assignments.sql', '008-videos.sql']);
    mockEnv = createMockEnv({ DB: db });
    await db.prepare("INSERT INTO users (id, email, nickname, password_hash, salt, roles) VALUES ('student1', 'student@test.com', 'Student', 'hash', 'salt', '[\"student\"]')").run();
    await db.prepare("INSERT INTO courses (id, title, created_by) VALUES ('c1', 'Test Course', 'student1')").run();
    await db.prepare("INSERT INTO video_lessons (id, course_id, title, video_url, created_by) VALUES ('v1', 'c1', 'Lesson 1', 'http://example.com', 'student1')").run();
    await db.prepare("INSERT INTO video_watch_logs (id, video_lesson_id, student_id, watch_duration_seconds, last_position_seconds, completed) VALUES ('log1', 'v1', 'student1', 10, 10, 0)").run();
    studentToken = await signJWT({ sub: 'student1', roles: ['student'] }, mockEnv.JWT_SECRET);
  });

  it('updates existing watch log without SQL syntax error', async () => {
    const ctx = createMockContext({
      method: 'POST',
      url: 'http://localhost/api/modules/videos/v1/log',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { watch_duration_seconds: 60, last_position_seconds: 60, completed: true },
      env: mockEnv,
      params: { id: 'v1' }
    });
    const res = await onRequestPost(ctx);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const updated = await db.prepare("SELECT * FROM video_watch_logs WHERE id = 'log1'").first();
    expect(updated.watch_duration_seconds).toBe(60);
    expect(updated.completed).toBe(1);
  });
});
