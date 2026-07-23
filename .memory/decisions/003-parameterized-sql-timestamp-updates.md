# ADR-003: 强制规范 SQL 时间戳 UPDATE 的参数化绑定

## Status: Accepted (2026-07-23)

## Context
- 部分 API 文件中使用了未参数化的内联字符串插值，如 `updated_at = ${now()}`。
- 由于 `now()` 返回 ISO 时间格式字符串（如 `"2026-07-23T11:16:50.000Z"`），直接插值到 SQL 中无单引号包裹，会导致 SQLite 产生 `unrecognized token: "23T03"` 报错。

## Decision
规范所有 SQL `UPDATE` 语句中的时间戳绑定，一律使用 `updated_at = ?` 占位符并在 `params` 数组中传递 `now()`。

## Consequences
- ✅ 彻底消除隐藏的 SQL 语法错误。
- ✅ 提升 SQL 注入安全性与 Prepared Statement 执行性能。

## Related
- Session: 2026-07-23_003
- Files: `functions/api/modules/books/[id].js`, `functions/api/modules/videos/[id]/log.js`
