import json, sys, os, collections
p = "/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/lectures/_build/run.jsonl"
tools = []
n = 0
usage_ids = {}
for ln in open(p, encoding="utf-8", errors="replace"):
    ln = ln.strip()
    if not ln:
        continue
    n += 1
    try:
        ev = json.loads(ln)
    except Exception:
        continue
    if ev.get("type") == "assistant":
        msg = ev.get("message", {})
        mid = msg.get("id")
        if mid and msg.get("usage"):
            usage_ids[mid] = msg["usage"]
        for c in (msg.get("content") or []):
            if c.get("type") == "tool_use":
                inp = c.get("input", {}) or {}
                what = inp.get("file_path") or inp.get("pattern") or inp.get("command") or ""
                tools.append("%s: %s" % (c.get("name"), str(what)[:80]))
            elif c.get("type") == "text" and (c.get("text") or "").strip():
                tools.append("[text] " + c["text"].strip()[:120])
    elif ev.get("type") == "result":
        tools.append("[RESULT] subtype=%s turns=%s dur=%.0fs" % (ev.get("subtype"), ev.get("num_turns"), (ev.get("duration_ms") or 0) / 1000))

ti = sum(1 for t in tools if not t.startswith("[text]") and not t.startswith("[RESULT]"))
print("事件行数:", n, "| 工具调用:", ti, "| 文本块:", sum(1 for t in tools if t.startswith("[text]")))
sz = os.path.getsize(p)
print("jsonl 大小: %.0f KB" % (sz / 1024))
ti_tok = sum(u.get("input_tokens", 0) for u in usage_ids.values())
cr = sum(u.get("cache_read_input_tokens", 0) for u in usage_ids.values())
cc = sum(u.get("cache_creation_input_tokens", 0) for u in usage_ids.values())
ot = sum(u.get("output_tokens", 0) for u in usage_ids.values())
print("用量(去重): input=%s cache_read=%s cache_create=%s output=%s" % (ti_tok, cr, cc, ot))
print("--- 最近 22 条 ---")
for t in tools[-22:]:
    print(" -", t)
