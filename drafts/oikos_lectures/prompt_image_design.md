# 任务：为讲座幻灯片设计"一张"配图（出 Flux 4B 生图提示词）

## 背景
- 书：《家教会的本体论革命》（18 章，主题：教会不是建筑/机构，而是"家"——Oikos / Koinonia / Oikonomia）
- 用途：**第 4 讲「祭坛的转移：从聚会形态到国度生态」**里「神圣爱宴」那一段的配图，放进 HTML 幻灯片的一页图解位。
- 幻灯片成品（务必先读，理解版式与配色）：`lectures/slides/lecture-4.html`，样式在 `lectures/slides/assets/deck.css`
- 讲义的风格令牌（严禁自创配色）：`../../assets/css/vars.css`（羊皮纸 `#FAF6EC`、墨红 `#8A3517`、橄榄绿 `#4A6741`、墨 `#241B11`）
- 内容依据（可读相关小节）：`manuscript/15_第十五章_神圣爱宴.md`

## 出图引擎（硬约束，必须按它写参数）
本机 `FLUX.2-klein 4B` GGUF + 无审查文本编码器，**小尺寸、快**：
- 调用脚本：`~/ai/models/flux/gui_app/run_flux2_lora.py`
- 权重：`--unet flux-2-klein-4b-Q4_K_M.gguf --te flux2-klein-4b-uncensored-q4_k_m.gguf`
- 可用 LoRA（4B 专用）：`flux2-klein-4b-lora-old-gods.safetensors`（可选用，也可不用）
- 尺寸：**总像素 ≤ 0.5MP**，长边 ≤ 896，比例 16:9 或 3:2（图会在幻灯片里以约 1100×540 显示）
- 步数 4–8，guidance 3.5 左右
（这是 4B 蒸馏模型：细节能力有限，**靠构图和光影出效果，不靠复杂细节**。）

## 已知的 4B 弱点（设计时必须规避，否则一定返工）
1. **近景人脸会糊、会歪**——不要让画面主体是正脸特写。
2. **手部**：多指/畸变高发。不要设计"手在画面前景"的构图。
3. 画面里**不要出现任何文字**（中英文都别要，模型会写成乱码）。
4. 不需要现代元素、logo、水印。

## 交付内容（一次给全，别写长篇分析）
请输出以下字段，用紧凑的 Markdown 段落，总长控制在 400 字以内（不含 prompt 本身）：

1. **画面构想**（中文 2–3 句）：这张图拍什么、镜头怎么放、为什么它能承载"神圣爱宴"的神学意思。
2. **PROMPT**（英文，单段逗号分隔，Flux 风格：主体 → 场景 → 光线 → 镜头/材质 → 风格锚定词）。要求：
   - 光影是重点（暖烛光 / 侧光 / 伦勃朗式明暗），适合被压成"羊皮纸单色调"后仍然有层次；
   - 用摄影语言锚定质感（例如 `documentary photography`, `natural window light`, `shallow depth of field`）；
   - 明确写 `no visible text`。
3. **NEGATIVE**（英文）。
4. **参数**：width × height、steps、guidance、建议 seed（给 2 个）。
5. **幻灯片说明文字**（中文 ≤ 20 字，作为图注 caption）。
6. **来源标注**（中文 ≤ 16 字，用于页脚"图片来源"，这是 AI 生成图）。
7. **插入位置**：在 `lecture-4.html` 里指出应插在哪一页（用该页的 `data-title` 指认），并给出可直接粘贴的 HTML 片段——沿用该文件已有的 class 词汇（`.fig`、`.g-fig`、`.stack`、`.r` 等），图片用 `<img src="assets/img/xxx.jpg" alt="…">`，图注用 `.cap`。

## 约束
- 只做**设计**，不要调用生图脚本、不要改任何文件、不要委派子代理。
- 不确定的地方直接说不确定，别编。
