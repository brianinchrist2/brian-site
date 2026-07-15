#!/usr/bin/env python3
"""
快速执行管线 — 跳过开机（实例已在运行）
"""
import asyncio, json, sys, time, re
from pathlib import Path
import websockets

WS_URL = "ws://127.0.0.1:9222/devtools/page/195CCFA9C9E1B8E7DE8B140666E647F2"
sys.path.insert(0, str(Path(__file__).parent))
from comfyui_client import ComfyUIClient

OUTPUT_DIR = Path(__file__).parent / "outputs"

async def eval_js(ws, js):
    await ws.send(json.dumps({"id": int(time.time()*1000)%100000, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
    r = json.loads(await ws.recv())
    return r.get("result",{}).get("result",{}).get("value","")

async def find_comfyui_url():
    """从页面提取 ComfyUI 6006 代理地址"""
    async with websockets.connect(WS_URL, max_size=5*2**20) as ws:
        # 刷新页面确保最新状态
        await eval_js(ws, "window.location.reload()")
        await asyncio.sleep(5)
        
        text = await eval_js(ws, "document.body.innerText")
        
        # 查找 URL 模式
        urls = re.findall(r'https?://[a-zA-Z0-9.-]+(?:8443)[^\s\"\'<>]*', text)
        for url in urls:
            if 'autodl' in url:
                return url.rstrip('/')
        
        # 查找 6006 相关行
        for line in text.split('\n'):
            if '6006' in line and ('http' in line or 'com' in line or 'cn' in line):
                m = re.search(r'https?://[^\s]+', line)
                if m:
                    return m.group().rstrip('/')
        
        # 查找 WebUI 行
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if 'WebUI' in line and i+1 < len(lines):
                m = re.search(r'https?://[^\s]+', lines[i+1])
                if m:
                    return m.group().rstrip('/')
        
        return None

async def power_off():
    async with websockets.connect(WS_URL, max_size=5*2**20) as ws:
        await eval_js(ws, """
        (function(){
            var more = [...document.querySelectorAll('button,span')].find(function(e){
                return e.textContent.trim()==='更多' && e.offsetParent!==null;
            });
            if(more){more.click();return 'more';}
            return 'no_more';
        })()
        """)
        await asyncio.sleep(1)
        
        r = await eval_js(ws, """
        (function(){
            var btn = [...document.querySelectorAll('button,li,span')].find(function(e){
                return (e.textContent.includes('关机')&&e.textContent.trim()!=='开机') && e.offsetParent!==null;
            });
            if(btn){btn.click();return 'clicked';}
            return 'not_found';
        })()
        """)
        print(f"  关机: {r}")
        await asyncio.sleep(2)
        
        r2 = await eval_js(ws, """
        (function(){
            var btn = [...document.querySelectorAll('button')].find(function(e){
                return (e.textContent.includes('确定')||e.textContent.includes('确认')) && e.offsetParent!==null;
            });
            if(btn){btn.click();return 'confirmed';}
            return 'no_confirm';
        })()
        """)
        print(f"  确认: {r2}")

async def main():
    print("="*60)
    print("  🎬 AutoDL + ComfyUI 快速管线")
    print("  📽️  分镜1: 射门  |  分镜2: 扑球")
    print("="*60)
    
    # 第1步：找 ComfyUI 地址
    print("\n📌 查找 ComfyUI 地址...")
    url = None
    for attempt in range(30):
        url = await find_comfyui_url()
        if url:
            print(f"  ✅ ComfyUI URL: {url}")
            break
        print(f"  ⏳ 等待中... ({attempt+1}/30)")
        await asyncio.sleep(10)
    
    if not url:
        print("❌ 无法获取 ComfyUI URL")
        sys.exit(1)
    
    # 第2步：连接 ComfyUI
    print("\n📌 连接 ComfyUI...")
    client = ComfyUIClient(url, str(OUTPUT_DIR))
    if not client.wait_ready(max_retries=30, interval=10):
        print("❌ ComfyUI 未就绪")
        sys.exit(1)
    
    # 第3步：生成视频
    scenes = [
        ("scene1_shoot.json", "⚽ 射门", 42,
         "a soccer player powerfully kicking a ball towards the goal, dynamic action, stadium, cinematic lighting, epic sports photography, detailed, 8k"),
        ("scene2_save.json", "🧤 扑球", 123,
         "a goalkeeper diving to catch a soccer ball, intense action, stadium full of fans, dramatic lighting, sports photography, dynamic pose, detailed"),
    ]
    neg = "blurry, low quality, distorted, ugly, deformed, bad anatomy, watermark, still image, no motion"
    
    for wf_file, name, seed, prompt in scenes:
        print(f"\n📌 [{name}]")
        wf = client.load_workflow(str(Path(__file__).parent/wf_file))
        wf = client.apply_params(wf, prompt=prompt, negative=neg, seed=seed,
                                 batch_size=40, fps=8, width=512, height=512)
        
        pid = client.queue_prompt(wf)
        result = client.wait_for_completion(pid)
        files = client.download_outputs(result)
        for f in files:
            print(f"  📁 {f}")
    
    # 第4步：关机
    print("\n📌 关机...")
    await power_off()
    
    print("\n"+"="*60)
    print("  ✅ 全部完成！视频保存在:", OUTPUT_DIR)
    print("="*60)

asyncio.run(main())
