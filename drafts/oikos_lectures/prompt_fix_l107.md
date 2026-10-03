# 任务：重写 l1-07 的提示词（风格跑偏，需单色麻胶版画）

## 问题
第 1 讲「主权使用 ≠ 设计认可」的页角小图，要的是**单色麻胶版画（monochrome linocut）**，
实际出成了**彩色平涂的儿童插画**（大量绿树、黄橙色火焰感），与这套讲义其他 14 张的克制调性不一致。

**请先看这张失败的实际输出**：`/Users/brianw/ai/models/flux/outputs/l1-07-lvzi.png`
（你可以用 Read 读图片；也可以裁切放大看细节，输出目录可写临时文件到 /tmp）

## 原始设计（供参考，不必照抄）
- 页：第 1 讲第 7 页，经文页（民 22:28"主权使用 ≠ 设计认可"），slot=**spot**，512×512，方形
- 图注："驴开了口，却不因此成了先知"
- 原 prompt 的风格段（问题所在）：
  `carved relief print texture with visible gouge marks, thick black lines and solid shapes on warm cream paper, high contrast, generous negative space, monochrome linocut, folk Bible print, gently humorous`
- 原 negative 里已有 `colour`，但**没拦住**。

## 本机引擎
FLUX.2-klein **4B**（蒸馏、512×512、6 步、guidance 3.5）。它对**风格词很弱**，对**画面内容词很强**：
- 风格锚定词放在句尾基本失效 → **要把风格放句首、并写成具体的印刷工艺描述**；
- negative 对"颜色"这类全局属性作用有限 → **正向里要显式否认其他颜色**；
- 元素一多，颜色就跟着多 → **简化场景**。

## 你要交付的（紧凑，≤250 字，不含 prompt）
1. **诊断**：一句话说清它为什么会出成彩色平涂（指到 prompt 里具体的词）。
2. **新 PROMPT**（英文单段，逗号分隔）：**风格锚定词放最前**；显式写"只用黑墨与纸色、两种色调"；把场景**减到最少元素**（宁可只有驴、缰绳/鞍、地上的杖、一道光）；
   写清楚是**刻痕质感**而不是绘画（例如 gouge-cut, carved relief, chisel marks, cross-hatched shadows）。
3. **新 NEGATIVE**（英文）：把颜色、平涂矢量、儿童插画、数字绘画这几类**具体点名**。
4. **3 个 seed**（整数，各不相同）。
5. **保守版备选**：若上面这版仍可能跑偏，再给一句"苟住风格"的最小改动建议（例如只保留驴与光的剪影）。

## 约束
- 只做设计：**不要**跑生图脚本、不要改任何文件、不要调子代理、不要后台任务。
- 尺寸固定 512×512、steps 6、guidance 3.5（别改）。
