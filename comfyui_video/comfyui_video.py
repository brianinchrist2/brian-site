#!/usr/bin/env python3
"""
ComfyUI 视频生成脚本 — 魔幻鼠标 5秒动画
=========================================
用法:
  1. 先修改下方的 COMFYUI_URL 为你的 ComfyUI 访问地址
  2. 运行: python comfyui_video.py

流程:
  1. 加载工作流 → 2. 修改提示词 → 3. 发送到 ComfyUI API
  → 4. 轮询进度 → 5. 下载视频到本地
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# ═══════════════════════════════════════════════════════════════
# 配置区 — 启动实例后修改这里的 URL
# ═══════════════════════════════════════════════════════════════

# ComfyUI 地址 (从 AutoDL 实例详情页获取)
# 格式1: http://连接IP:6006
# 格式2: https://u1-xxxxx.autodl.com:8443  (AutoDL 代理地址)
COMFYUI_URL = "http://localhost:6006"

# 输出目录
OUTPUT_DIR = Path("./outputs")

# 工作流文件 (支持 .json API 格式)
WORKFLOW_FILE = Path(__file__).parent / "workflow_animate.json"

# 视频生成参数
PROMPT = "A magical glowing computer mouse floating in dark space, surrounded by sparkling blue and purple magic particles swirling around it, fantasy style, epic lighting, cinematic quality, smooth motion, intricate details"
NEGATIVE_PROMPT = "blurry, low quality, distorted, ugly, deformed, bad anatomy, watermark, text, logo, still image, static"
WIDTH = 512
HEIGHT = 512
BATCH_SIZE = 40       # 40帧 @ 8fps = 5秒
FPS = 8
SEED = 42

# ═══════════════════════════════════════════════════════════════


class ComfyUIClient:
    """ComfyUI API 客户端"""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.output_dir = OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _api_post(self, endpoint: str, data: dict) -> dict:
        """发送 POST 请求到 ComfyUI API"""
        url = f"{self.base_url}{endpoint}"
        req_data = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _api_get(self, endpoint: str) -> dict:
        """发送 GET 请求到 ComfyUI API"""
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def check_health(self) -> bool:
        """检查 ComfyUI 是否在线"""
        try:
            resp = self._api_get("/")
            return True
        except Exception as e:
            print(f"  ❌ ComfyUI 未连接: {e}")
            return False

    def load_workflow(self, filepath: str) -> dict:
        """从 JSON 文件加载工作流"""
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def apply_prompt(self, workflow: dict, prompt: str, negative: str,
                     width: int, height: int, batch_size: int, fps: int,
                     seed: int) -> dict:
        """修改工作流中的提示词和参数"""
        wf = json.loads(json.dumps(workflow))  # 深拷贝

        for node_id, node in wf.items():
            ct = node.get("class_type", "")
            inputs = node.get("inputs", {})

            if ct == "CLIPTextEncode" and "positive" not in str(node_id):
                # 找到正向提示词节点 (通常第一个 CLIPTextEncode)
                if "text" in inputs:
                    inputs["text"] = prompt

            if ct == "CLIPTextEncode" and "negative" not in str(node_id):
                # 找到负向提示词节点
                if "text" in inputs and "blurry" in str(inputs.get("text", "")):
                    inputs["text"] = negative

            if ct == "EmptyLatentImage":
                inputs["width"] = width
                inputs["height"] = height
                inputs["batch_size"] = batch_size

            if ct in ("KSampler", "ksampler"):
                inputs["seed"] = seed

            if ct == "SaveAnimatedWEBP":
                inputs["fps"] = fps

        return wf

    def queue_prompt(self, workflow: dict) -> str:
        """发送工作流到 ComfyUI，返回 prompt_id"""
        data = {"prompt": workflow}
        result = self._api_post("/prompt", data)
        prompt_id = result.get("prompt_id", "")
        if not prompt_id:
            raise RuntimeError(f"提交失败: {json.dumps(result, indent=2)}")
        print(f"  ✅ 任务已提交: {prompt_id[:20]}...")
        return prompt_id

    def wait_for_completion(self, prompt_id: str, timeout: int = 600,
                            check_interval: int = 5) -> dict:
        """轮询等待任务完成"""
        start = time.time()
        last_progress = ""
        while time.time() - start < timeout:
            try:
                resp = self._api_get(f"/history/{prompt_id}")
                if resp and prompt_id in resp:
                    print(f"\n  ✅ 生成完成！耗时 {time.time()-start:.0f} 秒")
                    return resp[prompt_id]
            except urllib.error.HTTPError as e:
                if e.code != 400:  # 400 = 还在队列中
                    pass

            # 显示进度
            try:
                queue = self._api_get("/queue")
                if queue.get("queue_running"):
                    prog = queue["queue_running"][0]
                    step = prog.get("progress_step", 0)
                    total = prog.get("max_step", 1)
                    pct = int(step / total * 100) if total > 0 else 0
                    bar = "#" * (pct // 5) + "-" * (20 - pct // 5)
                    msg = f"\r  ⏳ 生成中: [{bar}] {pct}% ({step}/{total})"
                    if msg != last_progress:
                        print(msg, end="", flush=True)
                        last_progress = msg
            except Exception:
                pass

            remaining = int(time.time() - start)
            sys.stdout.flush()
            time.sleep(check_interval)

        raise TimeoutError(f"生成超时 ({timeout}秒)")

    def download_outputs(self, result: dict) -> list[Path]:
        """下载生成的文件到本地"""
        downloaded = []
        outputs = result.get("outputs", {})
        for node_id, node_output in outputs.items():
            for file_data in node_output.get("images", []):
                filename = file_data["filename"]
                subfolder = file_data.get("subfolder", "")
                file_type = file_data.get("type", "output")

                params = urllib.parse.urlencode({
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": file_type,
                })
                url = f"{self.base_url}/view?{params}"
                local_path = self.output_dir / filename

                print(f"  ⬇️ 下载: {url[:80]}...")
                urllib.request.urlretrieve(url, local_path)
                print(f"  ✅ 已保存: {local_path}")
                downloaded.append(local_path)

        # 也处理 GIF/视频文件
        for node_id, node_output in outputs.items():
            for file_data in node_output.get("gifs", []):
                filename = file_data["filename"]
                params = urllib.parse.urlencode({
                    "filename": filename,
                    "subfolder": file_data.get("subfolder", ""),
                    "type": file_data.get("type", "output"),
                })
                url = f"{self.base_url}/view?{params}"
                local_path = self.output_dir / filename
                print(f"  ⬇️ 下载视频: {url[:80]}...")
                urllib.request.urlretrieve(url, local_path)
                print(f"  ✅ 已保存: {local_path}")
                downloaded.append(local_path)

        return downloaded


def main():
    print("=" * 60)
    print("  🎬 ComfyUI 视频生成器 — 魔幻鼠标")
    print("=" * 60)

    # 1. 检查 ComfyUI
    client = ComfyUIClient(COMFYUI_URL)
    print(f"\n🔗 连接 ComfyUI: {COMFYUI_URL}")
    if not client.check_health():
        print("\n⚠️  请先启动实例并修改 COMFYUI_URL 配置")
        print(f"   当前配置: {COMFYUI_URL}")
        sys.exit(1)

    # 2. 检查工作流文件
    wf_path = WORKFLOW_FILE
    if not wf_path.exists():
        # 尝试用默认的 workflow_api.json
        wf_path = Path(__file__).parent / "workflow_api.json"
    if not wf_path.exists():
        print(f"❌ 找不到工作流文件: {WORKFLOW_FILE}")
        sys.exit(1)
    print(f"📄 加载工作流: {wf_path}")

    # 3. 加载并应用参数
    workflow = client.load_workflow(str(wf_path))
    workflow = client.apply_prompt(
        workflow,
        prompt=PROMPT,
        negative=NEGATIVE_PROMPT,
        width=WIDTH,
        height=HEIGHT,
        batch_size=BATCH_SIZE,
        fps=FPS,
        seed=SEED,
    )
    print(f"🎯 提示词: {PROMPT[:60]}...")
    print(f"📐 分辨率: {WIDTH}x{HEIGHT}, {BATCH_SIZE}帧 @ {FPS}fps = {BATCH_SIZE//FPS}秒")

    # 4. 提交任务
    print("\n🚀 提交生成任务...")
    prompt_id = client.queue_prompt(workflow)

    # 5. 等待完成
    print(f"⏳ 等待生成完成...")
    result = client.wait_for_completion(prompt_id)

    # 6. 下载结果
    print("\n📥 下载结果...")
    files = client.download_outputs(result)

    print("\n" + "=" * 60)
    print(f"  ✅ 完成！生成了 {len(files)} 个文件:")
    for f in files:
        size = os.path.getsize(f) / 1024
        print(f"     📁 {f.name} ({size:.0f} KB)")
    print("=" * 60)


if __name__ == "__main__":
    main()
