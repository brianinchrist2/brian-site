# 🎬 AutoDL + ComfyUI 全自动视频管线

## 分镜

| 场景 | 内容 | 时长 |
|------|------|------|
| 🎬 场景1 | ⚽ 射门 — 球员大力射门 | 5秒 (40帧@8fps) |
| 🎬 场景2 | 🧤 扑球 — 守门员飞身扑救 | 5秒 (40帧@8fps) |

## 文件结构

```
comfyui_video/
├── auto_pipeline.py       # 🚀 主程序 — 全自动执行
├── comfyui_client.py      # 🔧 ComfyUI API 客户端
├── scene1_shoot.json      # ⚽ 场景1 工作流 (AnimateDiff)
├── scene2_save.json       # 🧤 场景2 工作流 (AnimateDiff)
├── workflow_api.json      # 🖼️ 备用工作流 (静态WEBP)
├── workflow_animate.json  # 🎬 备用工作流 (通用动画)
├── comfyui_video.py       # 🐍 手动版脚本
└── outputs/               # 📂 输出目录
```

## 使用方式

### 方式 A: 全自动（推荐）🚀

```bash
cd D:\projects\brian-site\comfyui_video
python auto_pipeline.py
```

自动完成：**开机 → 等实例就绪 → 获取ComfyUI地址 → 生成射门视频 → 生成扑球视频 → 下载 → 关机**

### 方式 B: 半手动（先开机）

1. 在 AutoDL.Art 控制台手动开机
2. 获取 ComfyUI 地址（WebUI-6006）
3. 修改 `comfyui_video.py` 中的 `COMFYUI_URL`
4. 运行：`python comfyui_video.py`

## 准备工作

### 确保 ComfyUI 镜像已安装

通过 ComfyUI Manager 安装：
- **AnimateDiff-Evolved** — 视频生成核心
- **Video Helper Suite** — 视频编码

### 模型文件

工作流需要以下模型（放在 `ComfyUI/models/` 下）：
- `models/checkpoints/v1-5-pruned-emaonly.safetensors` (或任何 SD1.5 模型)
- `models/motion_modules/mm_sd_v15_v2.ckpt` (AnimateDiff 运动模块)

如果镜像里没有，可以在 ComfyUI Manager 中自动下载。

## 自定义

编辑 `auto_pipeline.py` 中的参数：

```python
BATCH_SIZE = 40   # 帧数 (40帧 @ 8fps = 5秒)
FPS = 8           # 帧率
WIDTH = 512       # 分辨率
HEIGHT = 512
```

提示词在 `scene1_shoot.json` 和 `scene2_save.json` 的 `CLIPTextEncode` 节点中。
