# ADR-004: 前端 DOM 状态切换优先使用稳定节点与 textContent

## Status: Accepted (2026-07-23)

## Context
- 在 `course-app/login.html` 中，登录与注册状态的切换原先通过重写包含事件元素的 `toggleText.innerHTML` 来实现。
- 重写 `innerHTML` 会销毁之前的 DOM 节点并产生新节点，原先绑定的事件监听器随之丢失，重新绑定 `.click` 原生方法引发了循环重复绑定隐患。

## Decision
前端状态切换统一重构为固定 DOM 结构，仅针对文本 `textContent` 进行动态更新，保留常驻的事件监听器节点。

## Consequences
- ✅ 消除了 DOM 节点重写与事件监听器重复绑定的隐患。
- ✅ 提升了前端交互的鲁棒性与性能。
- ✅ 避免滥用 `innerHTML` 降低 XSS 注入风险。

## Related
- Test: `tests/e2e/login-toggle.spec.js`
- File: `course-app/login.html`
