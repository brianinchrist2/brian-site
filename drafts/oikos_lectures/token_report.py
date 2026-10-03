#!/usr/bin/env python3
"""汇总 claude CLI(opus) 各次运行的 token 消耗。

数据源：每次运行 --output-format stream-json 日志里的 result 事件（权威值）。
用法：
  python3 token_report.py                 # 自动扫 drafts/oikos_lectures 下的 run*.jsonl
  python3 token_report.py a.jsonl b.jsonl # 指定日志
"""
import glob
import json
import os
import sys

BASE = "/Users/brianw/projects/brian-site/drafts/oikos_lectures"
LABELS = {
    "run.jsonl": "① 大纲修订（通读全书 → v2 大纲 + 修订说明）",
    "run_slides.jsonl": "② 幻灯片（v2 大纲 → 4 讲 HTML deck）",
    "run_image_design.jsonl": "③ 配图设计 1（爱宴空位）",
    "run_image_design2.jsonl": "⑤ 配图设计 2（石屋脚手架）",
    "run_image_plan.jsonl": "⑥ 全四讲配图方案（15 张）",
    "run_fix_l107.jsonl": "⑦ l1-07 提示词修复（本轮）",
}
# 前台跑的探针（无 stream-json 日志，数值取自当时终端输出）
PROBE = {
    "label": "④ 模型探针（验证 opus-5-5 / 1M 窗口）",
    "duration_min": 0.143,
    "input": 2, "cc": 12851, "cr": 10229, "out": 32, "think": 28, "cost": 0.1055018,
}


def parse_result(path):
    res = None
    for ln in open(path, encoding="utf-8", errors="replace"):
        ln = ln.strip()
        if not ln:
            continue
        try:
            ev = json.loads(ln)
        except Exception:
            continue
        if ev.get("type") == "result":
            res = ev
    if not res:
        return None
    mu = res.get("modelUsage") or {}
    model = list(mu)[0] if mu else "?"
    u = mu.get(model, {})
    return {
        "model": model,
        "min": (res.get("duration_ms") or 0) / 60000,
        "turns": res.get("num_turns"),
        "sub": (res.get("subagent_stats") or {}).get("spawned"),
        "sid": res.get("session_id"),
        "input": u.get("inputTokens") or 0,
        "cc": u.get("cacheCreationInputTokens") or 0,
        "cr": u.get("cacheReadInputTokens") or 0,
        "out": u.get("outputTokens") or 0,
        "think": u.get("thinkingTokens") or 0,
        "cost": u.get("costUSD") or 0.0,
        "ctx": u.get("contextWindow"),
    }


def billed_input(d):
    """按 Anthropic 缓存倍率折算的输入等效（写 1.25× / 读 0.1×）。"""
    return d["input"] + d["cc"] * 1.25 + d["cr"] * 0.1


def main():
    args = sys.argv[1:]
    files = args if args else sorted(
        set(glob.glob(f"{BASE}/run*.jsonl") + glob.glob(f"{BASE}/_build/run*.jsonl")),
        key=os.path.getmtime,
    )
    rows = []
    for f in files:
        d = parse_result(f)
        if d:
            d["label"] = LABELS.get(os.path.basename(f), os.path.basename(f))
            rows.append(d)

    T = dict(input=0, cc=0, cr=0, out=0, think=0, cost=0.0, min=0.0, turns=0, sub=0)
    for d in rows:
        for k in T:
            T[k] += d.get(k) or 0

    T["input"] += PROBE["input"]; T["cc"] += PROBE["cc"]; T["cr"] += PROBE["cr"]
    T["out"] += PROBE["out"]; T["think"] += PROBE["think"]; T["cost"] += PROBE["cost"]
    T["min"] += PROBE["duration_min"]; T["turns"] += 1

    print("=" * 116)
    for d in rows:
        print(f"{d['label']}")
        print(f"    {d['model']} | {d['min']:.1f} min | turns {d['turns']} | 子代理 {d['sub']} | session {str(d['sid'])[:8]}…")
        print(f"    input={d['input']:,}  cache_create={d['cc']:,}  cache_read={d['cr']:,}  "
              f"output={d['out']:,}(思维 {d['think']:,})  计费输入等效={billed_input(d):,.0f}  costUSD(list)=${d['cost']:.4f}")
        print("-" * 116)

    print(f"{PROBE['label']}")
    print(f"    input={PROBE['input']:,}  cache_create={PROBE['cc']:,}  cache_read={PROBE['cr']:,}  "
          f"output={PROBE['out']:,}(思维 {PROBE['think']:,})  计费输入等效={billed_input(PROBE):,.0f}  costUSD(list)=${PROBE['cost']:.4f}")
    print("=" * 116)

    raw_in = T["input"] + T["cc"] + T["cr"]
    print(f"合计（{len(rows) + 1} 次运行）  时长 {T['min']:.1f} 分钟 | 总 turns {T['turns']}")
    print(f"  输入侧原始计数 input+cache_create+cache_read = {raw_in:>13,}")
    print(f"  其中 全新 input / 缓存写入 / 缓存读取        = {T['input']:,} / {T['cc']:,} / {T['cr']:,}")
    print(f"  ★ 计费输入等效（写 1.25× 读 0.1×）           = {T['input'] + T['cc']*1.25 + T['cr']*0.1:>13,.0f}")
    print(f"  输出 output（其中思维 thinking）              = {T['out']:,}（{T['think']:,}，占 {T['think']/max(T['out'],1)*100:.0f}%）")
    print(f"  ★ token 总计（计费输入等效 + 输出）           = {T['input'] + T['cc']*1.25 + T['cr']*0.1 + T['out']:>13,.0f}")
    print(f"  原始计数总计（含缓存重复读取）                = {raw_in + T['out']:>13,}")
    print(f"  costUSD（list 价折算，非实扣）                = ${T['cost']:.4f}")
    print("=" * 116)


if __name__ == "__main__":
    main()
