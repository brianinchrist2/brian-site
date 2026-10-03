#!/usr/bin/env python3
"""把已清理日志的那几次运行（①–⑦）补回 usage_summary.json，避免丢账。

用法：python3 restore_usage_history.py    # 幂等，按 label 合并
数值来源：各次运行当轮实测（stream-json 的 result.modelUsage，与 transcript 按 message.id 去重交叉核对）。
"""
import json, pathlib

P = pathlib.Path(__file__).with_name('usage_summary.json')
HIST = [
    dict(label='① 大纲修订（通读全书 → v2 大纲 + 修订说明）', log='run.jsonl', model='claude-opus-5-5',
         duration_min=34.13, turns=50, subagents=0, billed_input_equivalent=1928077, output=234958, thinking=141734,
         cost_usd_list=11.72),
    dict(label='② 幻灯片（v2 大纲 → 4 讲 HTML deck）', log='run_slides.jsonl', model='claude-opus-5-5',
         duration_min=59.78, turns=129, subagents=0, billed_input_equivalent=4627754, output=330789, thinking=111073,
         cost_usd_list=19.07),
    dict(label='③ 配图设计 1（爱宴空位）', log='run_image_design.jsonl', model='claude-opus-5-5',
         duration_min=2.9, turns=12, subagents=0, billed_input_equivalent=91636, output=14833, thinking=10561,
         cost_usd_list=0.70),
    dict(label='④ 模型探针（验证 opus-5-5 / 1M 窗口）', log='（探针）', model='claude-opus-5-5',
         duration_min=0.14, turns=1, subagents=0, billed_input_equivalent=17089, output=32, thinking=28,
         cost_usd_list=0.1055),
    dict(label='⑤ 配图设计 2（石屋脚手架）', log='run_image_design2.jsonl', model='claude-opus-5-5',
         duration_min=2.47, turns=10, subagents=0, billed_input_equivalent=99510, output=13871, thinking=9264,
         cost_usd_list=0.73),
    dict(label='⑥ 全四讲配图方案（15 张）', log='run_image_plan.jsonl', model='claude-opus-5-5',
         duration_min=12.3, turns=26, subagents=0, billed_input_equivalent=441808, output=70860, thinking=54804,
         cost_usd_list=3.2042),
    dict(label='⑦ l1-07 提示词修复（读图诊断）', log='run_fix_l107.jsonl', model='claude-opus-5-5',
         duration_min=0.63, turns=1, subagents=0, billed_input_equivalent=38201, output=3057, thinking=1988,
         cost_usd_list=0.2571),
    dict(label='⑧ 全书思维导图数据（通读全书 → mindmap_data.json）', log='run_mindmap.jsonl', model='claude-opus-5-5',
         duration_min=8.36, turns=33, subagents=0, input_tokens=62, cache_create=363812, cache_read=5404568,
         billed_input_equivalent=995284, output=56606, thinking=39969, cost_usd_list=5.1238),
]


def billed_input(r):
    """计费输入等效；老条目没有该字段时按口径现算。"""
    v = r.get('billed_input_equivalent')
    if v:
        return v
    return r.get('input_tokens', 0) + round(r.get('cache_create', 0) * 1.25) + round(r.get('cache_read', 0) * 0.1)


def norm(r):
    r = dict(r)
    r['billed_input_equivalent'] = billed_input(r)
    for k in ('turns', 'output', 'thinking', 'cost_usd_list', 'duration_min'):
        r[k] = r.get(k, 0)
    return r


def main():
    d = json.loads(P.read_text(encoding='utf-8'))
    runs = {r['label']: norm(r) for r in d.get('runs', [])}
    for h in HIST:
        runs.setdefault(h['label'], norm(h))
    order = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']
    out = sorted(runs.values(), key=lambda r: order.index(r['label'][0]) if r['label'][0] in order else 99)
    tot = dict(turns=sum(r['turns'] for r in out), duration_min=round(sum(r['duration_min'] for r in out), 1),
               billed_input_equivalent=sum(r['billed_input_equivalent'] for r in out),
               output=sum(r['output'] for r in out), thinking=sum(r.get('thinking', 0) for r in out),
               cost_usd_list=round(sum(r['cost_usd_list'] for r in out), 4))
    tot['billed_total'] = tot['billed_input_equivalent'] + tot['output']
    d['runs'] = out
    d['total'] = tot
    d['note'] = ('claude CLI (opus-5-5) 各次运行用量，逐次实测（stream-json 的 result.modelUsage，'
                 '与 transcript 按 message.id 去重交叉核对）。口径：计费输入等效 = 全新 input×1 + 缓存写入×1.25 + 缓存读取×0.1；'
                 'costUSD 为 list 价折算，Max 订阅非实际扣费。①–⑦ 的原始 log 已清理，数值为清理前固化。')
    P.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for r in out:
        print(f"{r['label'][:26]:28s} {r['duration_min']:6.2f}min {r['turns']:4d}turns  计费输入 {r['billed_input_equivalent']:>9,}  输出 {r['output']:>7,}  ${r['cost_usd_list']:.4f}")
    print('-' * 108)
    print(f"累计 {len(out)} 次 / {tot['turns']} turns / {tot['duration_min']} 分钟：计费 token {tot['billed_total']:,}  costUSD(list) ${tot['cost_usd_list']:.2f}")


if __name__ == '__main__':
    main()
