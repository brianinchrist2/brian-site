#!/usr/bin/env python3
"""
ComfyUI API 客户端 — 发送工作流、轮询进度、下载结果
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


class ComfyUIClient:
    def __init__(self, base_url: str, output_dir: str = "./outputs"):
        self.base_url = base_url.rstrip("/")
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _api_post(self, endpoint: str, data: dict, timeout: int = 300) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _api_get(self, endpoint: str, timeout: int = 30) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def wait_ready(self, max_retries: int = 60, interval: int = 10) -> bool:
        """等待 ComfyUI 就绪"""
        print("  ⏳ 等待 ComfyUI 就绪...")
        for i in range(max_retries):
            try:
                resp = self._api_get("/", timeout=5)
                if resp.get("status") == "ok" or True:
                    print(f"  ✅ ComfyUI 已就绪 (尝试 {i+1})")
                    return True
            except Exception:
                pass
            print(f"  ⏳ 等待中... ({i+1}/{max_retries})")
            time.sleep(interval)
        return False

    def load_workflow(self, filepath: str) -> dict:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def apply_params(self, workflow: dict, prompt: str = None,
                     negative: str = None, seed: int = None,
                     batch_size: int = None, fps: int = None,
                     width: int = None, height: int = None) -> dict:
        """修改工作流参数"""
        wf = json.loads(json.dumps(workflow))
        prompt_applied = False
        neg_applied = False
        for node_id, node in wf.items():
            ct = node.get("class_type", "")
            inputs = node.get("inputs", {})
            if ct == "CLIPTextEncode" and prompt and not prompt_applied:
                inputs["text"] = prompt
                prompt_applied = True
            elif ct == "CLIPTextEncode" and negative and not neg_applied and prompt_applied:
                inputs["text"] = negative
                neg_applied = True
            if ct == "EmptyLatentImage":
                if width: inputs["width"] = width
                if height: inputs["height"] = height
                if batch_size: inputs["batch_size"] = batch_size
            if ct in ("KSampler", "ksampler") and seed is not None:
                inputs["seed"] = seed
            if ct == "SaveAnimatedWEBP" and fps:
                inputs["fps"] = fps
        return wf

    def queue_prompt(self, workflow: dict) -> str:
        result = self._api_post("/prompt", {"prompt": workflow})
        prompt_id = result.get("prompt_id", "")
        if not prompt_id:
            raise RuntimeError(f"提交失败: {json.dumps(result, indent=2)}")
        print(f"  ✅ 已提交, ID: {prompt_id[:16]}...")
        return prompt_id

    def wait_for_completion(self, prompt_id: str, timeout: int = 600) -> dict:
        start = time.time()
        last_pct = -1
        while time.time() - start < timeout:
            try:
                resp = self._api_get(f"/history/{prompt_id}", timeout=10)
                if resp and prompt_id in resp:
                    elapsed = time.time() - start
                    print(f"\n  ✅ 生成完成！耗时 {elapsed:.0f} 秒")
                    return resp[prompt_id]
            except urllib.error.HTTPError:
                pass
            try:
                queue = self._api_get("/queue", timeout=5)
                running = queue.get("queue_running", [])
                if running:
                    prog = running[0]
                    step = prog.get("progress_step", 0)
                    total = prog.get("max_step", 1)
                    pct = int(step / max(total, 1) * 100)
                    if pct != last_pct:
                        bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
                        print(f"\r  ⏳ 生成中: [{bar}] {pct}%", end="", flush=True)
                        last_pct = pct
            except Exception:
                pass
            time.sleep(3)
        raise TimeoutError(f"生成超时 ({timeout}秒)")

    def download_outputs(self, result: dict) -> list:
        downloaded = []
        outputs = result.get("outputs", {})
        for node_id, node_output in outputs.items():
            for img in node_output.get("images", []):
                params = urllib.parse.urlencode({
                    "filename": img["filename"],
                    "subfolder": img.get("subfolder", ""),
                    "type": img.get("type", "output"),
                })
                url = f"{self.base_url}/view?{params}"
                local = self.output_dir / img["filename"]
                urllib.request.urlretrieve(url, local)
                size = os.path.getsize(local) / 1024
                print(f"  ✅ 下载: {local.name} ({size:.0f} KB)")
                downloaded.append(local)
            for gif in node_output.get("gifs", []):
                params = urllib.parse.urlencode({
                    "filename": gif["filename"],
                    "subfolder": gif.get("subfolder", ""),
                    "type": gif.get("type", "output"),
                })
                url = f"{self.base_url}/view?{params}"
                local = self.output_dir / gif["filename"]
                urllib.request.urlretrieve(url, local)
                size = os.path.getsize(local) / 1024
                print(f"  ✅ 下载: {local.name} ({size:.0f} KB)")
                downloaded.append(local)
        return downloaded

    def get_queue_status(self) -> dict:
        try:
            return self._api_get("/queue", timeout=5)
        except Exception:
            return {}
