# ADR-006: 状态色 token 加深至 WCAG AA 达标

- **Status**: Accepted
- **Date**: 2026-08-03
- **Context**: P4 验收（Task 18）对比度抽查发现共享 `--status-*` token 在徽章场景不满足设计规范门禁"徽章对比度 ≥4.5:1"（spec P4 4.3）：
  - `--status-late #B8860B`：tint 徽章 2.74:1、正文 3.02:1（✗；Task 17 的 `--late-ink #A66A00` 4.16:1 亦不达标）
  - `--status-excused #4A7A9B`：tint 徽章 3.81:1、正文 4.28:1（✗）
  - `--status-present #4A6741`（5.14–5.88）与 `--status-absent #8A3517`（6.39–7.48）已达标，不动
- **Decision**:
  - `--status-late: #B8860B → #8A4F00`（tint 5.26:1 / 正文 6.08:1 / 白底 active 按钮 6.56:1）
  - `--status-excused: #4A7A9B → #39637A`（tint 5.22:1 / 正文 6.01:1）
  - 对应 `--status-*-bg` tint rgba 随新 hex 同步（rgba(138,79,0,0.10) / rgba(57,99,122,0.10)）
  - 同步范围：`course-app/assets/css/vars.css` + `brianinchrist/organicchurch/assets/css/vars.css`（Task 17 "×2 同步"惯例）+ 基准页 `student/attendance.html` 本地 token 副本；`admin/attendance.html --late-ink` 改为 `var(--status-late)` 消除重复值
  - `attendance.js STATUS_COLORS` 硬编码 hex → `var(--status-*)` 字符串（inline style 级联解析，浏览器实测正常）
- **Consequences**:
  - 徽章/统计/状态按钮全部 ≥4.5:1；late/excused 色相微暗（深金/深蓝灰），与羊皮纸调性一致
  - `--late-ink` 特例退化为主 token 别名，C1 修复保留但值统一
  - 未处理：`--faint #7A6C55` 在 `--surface` 上 4.42:1（margin 未达标，M9 已定值且非徽章场景，记录不修）
