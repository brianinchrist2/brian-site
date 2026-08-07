import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { setupTestDB } from '../helpers/setup-db.js';

// 重建类迁移（DROP TABLE / RENAME）必须按 docs/migrations.md 在文件内关闭并恢复
// 外键检查，避免重建过程中被 FK 检查拒绝或产生中间态。
const REBUILD_FILES = [
  '011-assessment-retakes.sql',
  '012-cascade-fixes.sql',
  '013-submission-versions.sql',
];

function readMigration(file) {
  return readFileSync(join(process.cwd(), 'migrations', file), 'utf-8');
}

describe('rebuild migrations must toggle PRAGMA foreign_keys', () => {
  it('011/012/013 open with PRAGMA foreign_keys = OFF before the first CREATE and close with ON after the last rebuild', () => {
    for (const file of REBUILD_FILES) {
      const sql = readMigration(file);
      const offIdx = sql.indexOf('PRAGMA foreign_keys = OFF;');
      const createIdx = sql.indexOf('CREATE TABLE');
      expect(offIdx, `${file}: PRAGMA foreign_keys = OFF present`).toBeGreaterThanOrEqual(0);
      expect(offIdx, `${file}: PRAGMA OFF precedes first CREATE TABLE`).toBeLessThan(createIdx);
      const onIdx = sql.lastIndexOf('PRAGMA foreign_keys = ON;');
      const renameIdx = sql.lastIndexOf('ALTER TABLE');
      expect(onIdx, `${file}: PRAGMA foreign_keys = ON present`).toBeGreaterThanOrEqual(0);
      expect(onIdx, `${file}: PRAGMA ON comes after the last rebuild`).toBeGreaterThan(renameIdx);
    }
  });

  it('011 applies and re-applies cleanly on a fresh DB', async () => {
    const db = await setupTestDB(['001_init.sql', '009-assessments.sql', '011-assessment-retakes.sql']);
    const sql = readMigration('011-assessment-retakes.sql');
    await expect(db.exec(sql)).resolves.toBeUndefined();
    await expect(db.exec(sql)).resolves.toBeUndefined();
  });

  it('012 applies and re-applies cleanly on a fresh DB', async () => {
    const db = await setupTestDB(['001_init.sql', '003-interactions.sql', '008-videos.sql', '012-cascade-fixes.sql']);
    const sql = readMigration('012-cascade-fixes.sql');
    await expect(db.exec(sql)).resolves.toBeUndefined();
    await expect(db.exec(sql)).resolves.toBeUndefined();
  });

  it('013 applies and re-applies cleanly on a fresh DB', async () => {
    const db = await setupTestDB(['001_init.sql', '007-assignments.sql', '013-submission-versions.sql']);
    const sql = readMigration('013-submission-versions.sql');
    await expect(db.exec(sql)).resolves.toBeUndefined();
    await expect(db.exec(sql)).resolves.toBeUndefined();
  });
});
