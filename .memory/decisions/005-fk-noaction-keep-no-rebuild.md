# ADR-005: courses.created_by / classes.advisor_id 保留 NO ACTION，不在 014 重建

## Status: Accepted (2026-08-03)

## Context
- 本地核对 `migrations/001_init.sql`（生产 PRAGMA 核对需 wrangler 认证，属后续生产步骤）：
  - `courses.created_by TEXT NOT NULL REFERENCES users(id)`（001:22）
  - `classes.advisor_id TEXT NOT NULL REFERENCES users(id)`（001:51）
  - 两者均**无 ON DELETE 子句** → SQLite 默认 NO ACTION，删除被引用用户会被拒绝。
- 014 是数据迁移（时间戳统一）；生产应用时混入破坏性重建会显著提高失败风险。

## Decision
- **不在 014 追加 classes/courses 重建迁移**。
- 维持现状：删除有课程/班级的用户时由 FK NO ACTION 拒绝（现无用户删除流程，风险低）。
- 如未来上线用户删除功能，再单独开一个迁移重建 classes/courses（`_new` + 搬迁 + DROP + RENAME 模式，见 011-013），并将列改为可空 + `ON DELETE SET NULL`；执行时按 `docs/migrations.md` 先 `PRAGMA foreign_keys=OFF`。

## Consequences
- ✅ 014 保持纯数据迁移，风险最小。
- ⚠️ 删除用户需先处理其创建的课程/班级（当前无此流程）。
- 后续若需要 `SET NULL`：`created_by`/`advisor_id` 必须从 NOT NULL 改为可空——这是额外 schema 变更，需评估应用层"无创建者"语义。

## Related
- Task 9（P2 迁移修复）报告：`.superpowers/sdd/task-9-report.md`
- Files: `migrations/001_init.sql`, `migrations/014_timestamp_unify.sql`, `docs/migrations.md`
