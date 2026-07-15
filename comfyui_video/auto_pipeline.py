#!/usr/bin/env python3
"""
AutoDL.Art + ComfyUI 全自动视频管线
====================================
流程:
  1. 通过浏览器CDP点击「开机」
  2. 等待实例启动，获取WebUI-6006代理地址
  3. 等待ComfyUI就绪
  4. 依次生成两个分镜视频（射门 + 扑球）
  5. 下载到本地
  6. 通过浏览器CDP点击「关机」

用法:
  python auto_pipeline.py
"""

import asyncio
import json
import sys
import time
from pathlib import Path

import websockets

# ─── 配置 ───────────────────────────────────────────────────
# AutoDL.Art 实例页面标签页的 WebSocket URL (CDP)
INSTANCE_PAGE_WS = "ws://127.0.0.1:9222/devtools/page/195CCFA9C9E1B8E7DE8B140666E647F2"

# 工作流文件
WORKFLOW_SCENE1 = Path(__file__).parent / "scene1_shoot.json"
WORKFLOW_SCENE2 = Path(__file__).parent / "scene2_save.json"

# 输出目录
OUTPUT_DIR = Path(__file__).parent / "outputs"

# 生成参数
BATCH_SIZE = 40   # 40帧
FPS = 8           # 8fps → 5秒
WIDTH = 512
HEIGHT = 512

# ComfyUI 客户端
sys.path.insert(0, str(Path(__file__).parent))
from comfyui_client import ComfyUIClient


class AutoDLOrchestrator:
    """AutoDL 实例生命周期管理（通过浏览器CDP）"""

    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.comfyui_url = None

    async def _eval(self, ws, js: str) -> str:
        """在浏览器中执行 JavaScript，返回结果"""
        await ws.send(json.dumps({
            "id": int(time.time() * 1000) % 100000,
            "method": "Runtime.evaluate",
            "params": {"expression": js, "returnByValue": True}
        }))
        r = json.loads(await ws.recv())
        return r.get("result", {}).get("result", {}).get("value", "")

    async def power_on(self) -> bool:
        """点击「开机」按钮"""
        print("\n🔌 正在开机...")
        async with websockets.connect(self.ws_url, max_size=5*2**20) as ws:
            # 点击开机
            js = """
            (function() {
                var btn = [...document.querySelectorAll('button,span')].find(function(el) {
                    return el.textContent.trim() === '开机' && el.offsetParent !== null;
                });
                if (btn) { btn.click(); return 'clicked'; }
                return 'not_found';
            })()
            """
            r = await self._eval(ws, js)
            print(f"  开机按钮: {r}")
            await asyncio.sleep(2)
            
            # 确认对话框
            js2 = """
            (function() {
                var btn = [...document.querySelectorAll('button')].find(function(el) {
                    return (el.textContent.includes('确定') || el.textContent.includes('确认')) 
                           && el.offsetParent !== null;
                });
                if (btn) { btn.click(); return 'confirmed'; }
                return 'no_confirm';
            })()
            """
            r2 = await self._eval(ws, js2)
            print(f"  确认: {r2}")
            return r == 'clicked'

    async def wait_for_comfyui_url(self, timeout_minutes: int = 15) -> str:
        """等待实例启动并获取 ComfyUI URL"""
        print(f"\n⏳ 等待实例启动 (最长 {timeout_minutes} 分钟)...")
        start = time.time()
        timeout = timeout_minutes * 60
        last_status = ""
        
        async with websockets.connect(self.ws_url, max_size=5*2**20) as ws:
            while time.time() - start < timeout:
                # 刷新页面获取最新状态
                await self._eval(ws, "window.location.reload()")
                await asyncio.sleep(5)
                
                # 获取页面文本
                text = await self._eval(ws, "document.body.innerText")
                
                # 检测实例状态
                if "运行中" in text or "running" in text.lower():
                    status = "🟢 运行中"
                elif "关机" in text or "stopped" in text.lower():
                    status = "🔴 已关机"
                elif "启动中" in text or "starting" in text.lower():
                    status = "🟡 启动中"
                else:
                    status = "⏳ 未知"
                
                if status != last_status:
                    print(f"  {status} ({(time.time()-start)/60:.1f}分)")
                    last_status = status
                
                # 查找 WebUI-6006 链接 (实例运行后会出现)
                # 格式: https://xxx.autodl.art:8443 或 https://xxx.xxx.com:8443
                import re
                urls = re.findall(r'https?://[a-zA-Z0-9.-]+(?:8443|6006)[^\s\"\'<>]*', text)
                for url in urls:
                    if '6006' in url or ('autodl' in url and '8443' in url):
                        self.comfyui_url = url.rstrip('/')
                        print(f"\n  ✅ 获取到 ComfyUI URL: {self.comfyui_url}")
                        return self.comfyui_url
                
                # 有时URL格式不同，尝试查找 "WebUI-6006" 附近的文本
                if "6006" in text or "WebUI" in text:
                    lines = text.split('\n')
                    for i, line in enumerate(lines):
                        if '6006' in line and ('http' in line or '://' in line or 'com' in line):
                            # 提取URL
                            url_match = re.search(r'https?://[^\s]+', line)
                            if url_match:
                                self.comfyui_url = url_match.group().rstrip('/')
                                print(f"\n  ✅ 获取到 ComfyUI URL: {self.comfyui_url}")
                                return self.comfyui_url
                
                remaining = int((timeout - (time.time() - start)) / 60)
                print(f"  ⏳ 等待中... 预计还剩 {remaining} 分钟")
                await asyncio.sleep(30)
        
        raise TimeoutError(f"实例启动超时 ({timeout_minutes}分钟)")

    async def power_off(self) -> bool:
        """点击「关机」"""
        print("\n🔌 正在关机...")
        async with websockets.connect(self.ws_url, max_size=5*2**20) as ws:
            # 展开"更多"菜单
            await self._eval(ws, """
            (function() {
                var btn = [...document.querySelectorAll('button,span')].find(function(el) {
                    return el.textContent.trim() === '更多' && el.offsetParent !== null;
                });
                if (btn) { btn.click(); return 'more_clicked'; }
                return 'no_more';
            })()
            """)
            await asyncio.sleep(1)
            
            # 点击关机
            js = """
            (function() {
                var btns = [...document.querySelectorAll('button,li,span,a,div')];
                var powerBtn = btns.find(function(el) {
                    return (el.textContent.includes('关机') || el.textContent.includes('停止'))
                           && el.offsetParent !== null
                           && el.textContent.trim() !== '开机';
                });
                if (powerBtn) { powerBtn.click(); return 'clicked'; }
                return 'not_found';
            })()
            """
            r = await self._eval(ws, js)
            print(f"  关机按钮: {r}")
            await asyncio.sleep(2)
            
            # 确认对话框
            js2 = """
            (function() {
                var btn = [...document.querySelectorAll('button')].find(function(el) {
                    return (el.textContent.includes('确定') || el.textContent.includes('确认'))
                           && el.offsetParent !== null;
                });
                if (btn) { btn.click(); return 'confirmed'; }
                return 'no_confirm';
            })()
            """
            r2 = await self._eval(ws, js2)
            print(f"  确认: {r2}")
            return r == 'clicked'


async def main():
    print("=" * 60)
    print("  🎬 AutoDL + ComfyUI 全自动视频管线")
    print("  📽️  分镜1: 射门  |  分镜2: 扑球")
    print("=" * 60)

    orchestrator = AutoDLOrchestrator(INSTANCE_PAGE_WS)

    # ═══ 第1步：开机 ═══
    print("\n" + "─" * 40)
    print("📌 第1步: 开机")
    print("─" * 40)
    ok = await orchestrator.power_on()
    if not ok:
        print("⚠️  开机按钮未找到，可能已经开机？继续等待...")

    # ═══ 第2步：等待实例启动 + 获取ComfyUI URL ═══
    print("\n" + "─" * 40)
    print("📌 第2步: 等待实例启动")
    print("─" * 40)
    try:
        comfyui_url = await orchestrator.wait_for_comfyui_url(timeout_minutes=15)
    except TimeoutError as e:
        print(f"❌ {e}")
        sys.exit(1)

    # ═══ 第3步：连接 ComfyUI ═══
    print("\n" + "─" * 40)
    print("📌 第3步: 连接 ComfyUI API")
    print("─" * 40)
    client = ComfyUIClient(comfyui_url, str(OUTPUT_DIR))
    if not client.wait_ready(max_retries=30, interval=10):
        print("❌ ComfyUI 未能在预期时间内就绪")
        sys.exit(1)

    # ═══ 第4步：生成两个分镜视频 ═══
    scenes = [
        ("scene1_shoot.json", "⚽ 射门", 42, "a soccer player powerfully kicking a ball towards the goal, dynamic action shot, stadium atmosphere, cinematic lighting, motion blur, epic sports photography, detailed, 8k"),
        ("scene2_save.json", "🧤 扑球", 123, "a goalkeeper diving to catch a soccer ball, intense action moment, stadium full of fans, dramatic lighting, sports photography, dynamic pose, detailed, cinematic"),
    ]
    negative = "blurry, low quality, distorted, ugly, deformed, bad anatomy, watermark, text, logo, still image, static, no motion"

    for wf_file, scene_name, seed, prompt in scenes:
        print(f"\n" + "─" * 40)
        print(f"📌 第4步: 生成 [{scene_name}]")
        print("─" * 40)
        print(f"  🎯 提示词: {prompt[:60]}...")
        print(f"  📐 {WIDTH}x{HEIGHT} | {BATCH_SIZE}帧 @ {FPS}fps = {BATCH_SIZE//FPS}秒")

        wf_path = Path(__file__).parent / wf_file
        workflow = client.load_workflow(str(wf_path))
        workflow = client.apply_params(
            workflow,
            prompt=prompt,
            negative=negative,
            seed=seed,
            batch_size=BATCH_SIZE,
            fps=FPS,
            width=WIDTH,
            height=HEIGHT,
        )

        prompt_id = client.queue_prompt(workflow)
        
        # 等待队列清空（上一个任务完成）
        while True:
            status = client.get_queue_status()
            queue_running = status.get("queue_running", [])
            queue_pending = status.get("queue_pending", [])
            if not queue_running and not queue_pending:
                break
            time.sleep(2)

        result = client.wait_for_completion(prompt_id)
        files = client.download_outputs(result)
        for f in files:
            print(f"    📁 {f}")

    # ═══ 第5步：关机 ═══
    print("\n" + "─" * 40)
    print("📌 第5步: 关机")
    print("─" * 40)
    await orchestrator.power_off()

    # ═══ 完成 ═══
    print("\n" + "=" * 60)
    print("  ✅ 全部完成！")
    print(f"  📂 视频保存在: {OUTPUT_DIR}")
    print("  💡 记得去 AutoDL.Art 确认实例已关机")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
