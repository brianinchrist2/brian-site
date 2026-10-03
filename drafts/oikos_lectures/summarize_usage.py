#!/usr/bin/env python3
"""把各次 claude CLI 运行的 token 用量抽成一个 small JSON，然后就可以删掉几十 MB 的 stream-json 日志。"""
import glob
import json
import os
import pathlib

D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
LABELS = {
    "run.jsonl": "① 大纲修订（通读全书 → v2 大纲 + 修订说明）",
    "run_slides.jsonl": "② 幻灯片（v2 大纲 → 4 讲 HTML deck）",
    "run_image_design.jsonl": "③ 配图设计 1（爱宴空位）",
    "run_image_design2.jsonl": "⑤ 配图设计 2（石屋脚手架）",
    "run_image_plan.jsonl": "⑥ 全四讲配图方案（15 张）",
    "run_fix_l107.jsonl": "⑦ l1-07 提示词修复（读图诊断）",
    "run_mindmap.jsonl": "⑧ 全书思维导图数据（通读全书 → mindmap_data.json）",
    "run_anchor_map.jsonl": "⑨ 要点→正文小节 锚点映射（110 条）",
}
PROBE = {"label": "④ 模型探针（验证 opus-5-5 / 1M 窗口）", "duration_min": 0.143,
         "input": 2, "cache_create": 12851, "cache_read": 10229, "output": 32,
         "thinking": 28, "cost_usd_list": 0.1055018}

runs = []
for f in sorted(glob.glob(str(D / 'run*.jsonl')) + glob.glob(str(D / '_build/run*.jsonl')), key=os.path.getmtime):
    res = None
    for ln in open(f, encoding='utf-8', errors='replace'):
        ln = ln.strip()
        if not ln:
            continue
        try:
            ev = json.loads(ln)
        except Exception:
            continue
        if ev.get('type') == 'result':
            res = ev
    base = os.path.basename(f)
    if not res:
        runs.append({"label": LABELS.get(base, base), "note": "无 result 事件（日志不完整）", "log": base})
        continue
    m = list((res.get('modelUsage') or {}).values())[0]
    runs.append({
        "label": LABELS.get(base, base), "log": base,
        "model": "claude-opus-5-5",
        "duration_min": round((res.get('duration_ms') or 0) / 60000, 2),
        "turns": res.get('num_turns'),
        "subagents": (res.get('subagent_stats') or {}).get('spawned'),
        "input_tokens": m.get('inputTokens'), "cache_create": m.get('cacheCreationInputTokens'),
        "cache_read": m.get('cacheReadInputTokens'), "output": m.get('outputTokens'),
        "thinking": m.get('thinkingTokens'), "cost_usd_list": round(m.get('costUSD') or 0, 4),
    })

tot = {"cache_create": 0, "cache_read": 0, "input_tokens": 0, "output": 0, "thinking": 0,
       "cost_usd_list": 0.0, "duration_min": 0.0, "turns": 0}
for r in runs:
    if 'input_tokens' not in r:
        continue
    for k in tot:
        tot[k] += r.get(k) or 0
for k, v in (("input_tokens", PROBE['input']), ("cache_create", PROBE['cache_create']),
             ("cache_read", PROBE['cache_read']), ("output", PROBE['output']),
             ("thinking", PROBE['thinking'])):
    tot[k] += v
tot["cost_usd_list"] += PROBE['cost_usd_list']
tot["duration_min"] += PROBE['duration_min']
tot["turns"] += 1

summary = {
    "note": ("claude CLI (opus-5-5) 各次运行用量。口径：input=全新输入，cache_create=缓存写入，"
             "cache_read=缓存读取。计费输入等效 = input*1 + cache_create*1.25 + cache_read*0.1；"
             "costUSD 是 list 价折算，Max 订阅非实际扣费。"),
    "runs": runs + [PROBE],
    "total": {**{k: round(v, 4) if isinstance(v, float) else v for k, v in tot.items()},
              "billed_input_equivalent": round(tot["input_tokens"] + tot["cache_create"] * 1.25 + tot["cache_read"] * 0.1),
              "raw_count_all_tokens": tot["input_tokens"] + tot["cache_create"] + tot["cache_read"] + tot["output"]},
}
summary["total"]["billed_total"] = summary["total"]["billed_input_equivalent"] + tot["output"]

(D / 'usage_summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print("写入 usage_summary.json")
print(json.dumps(summary["total"], ensure_ascii=False, indent=2))
