import os
import re
import urllib.request
import urllib.parse
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

POSTS_DIR = r"D:\projects\brian-site\brianinchrist\organicchurch\posts"
TEMP_R2_DIR = r"D:\projects\brian-site\temp_r2"
os.makedirs(TEMP_R2_DIR, exist_ok=True)

def sanitize_filename(url):
    """从 URL 生成干净的文件名，与 migrate_blog.py 规则保持一致"""
    parsed = urllib.parse.urlparse(url)
    filename = os.path.basename(parsed.path)
    if not filename:
        import hashlib
        filename = hashlib.md5(url.encode()).hexdigest() + ".jpg"
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    if len(filename) > 100:
        name, ext = os.path.splitext(filename)
        filename = name[:90] + ext
    return filename

def extract_remote_assets():
    """扫描所有静态文章，提取出依然指向远程的 mp3/mp4 文件"""
    print("Scanning posts directory for remaining remote media assets...")
    
    # 提取所有 jiadongli 音频/视频链接的正则
    url_pattern = re.compile(r'(?:https?:)?//[a-zA-Z0-9.-]*jiadongli[a-zA-Z0-9.-]*[^\s"\'>\)]+', re.IGNORECASE)
    media_extensions = ('.mp3', '.mp4', '.m4a', '.wav', '.mov', '.ogg')
    
    # 用字典保存远程 URL 到本地化文件名的映射
    assets_to_download = {}
    
    for filename in os.listdir(POSTS_DIR):
        if not filename.endswith('.html'):
            continue
        post_id = filename.split('.')[0]
        file_path = os.path.join(POSTS_DIR, filename)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            urls = url_pattern.findall(content)
            for url in urls:
                parsed_url = urllib.parse.urlparse(url)
                path_lower = parsed_url.path.lower()
                
                # 如果是多媒体文件且包含 jiadongli
                if path_lower.endswith(media_extensions) or 'wp-content/uploads' in path_lower:
                    if path_lower.endswith(media_extensions):
                        # 处理协议头
                        download_url = url
                        if url.startswith('//'):
                            download_url = 'https:' + url
                            
                        # 生成统一的 sanitized 文件名
                        sanitized_name = sanitize_filename(url)
                        local_filename = f"{post_id}_{sanitized_name}"
                        assets_to_download[download_url] = local_filename
        except Exception as e:
            print(f"Error scanning {filename}: {e}")
            
    return assets_to_download

def download_assets():
    assets = extract_remote_assets()
    print(f"\nFound {len(assets)} media assets to download for Cloudflare R2.")
    print(f"Assets will be saved to: {TEMP_R2_DIR}\n")
    
    success_count = 0
    for i, (url, filename) in enumerate(assets.items()):
        save_path = os.path.join(TEMP_R2_DIR, filename)
        
        if os.path.exists(save_path) and os.path.getsize(save_path) > 0:
            print(f"[{i+1}/{len(assets)}] Already downloaded: {filename}")
            success_count += 1
            continue
            
        print(f"[{i+1}/{len(assets)}] Downloading: {url} -> {filename}")
        try:
            parsed = urllib.parse.urlparse(url)
            path = urllib.parse.quote(parsed.path)
            encoded_url = urllib.parse.urlunparse((
                parsed.scheme, parsed.netloc, path, parsed.params, parsed.query, parsed.fragment
            ))
            
            req = urllib.request.Request(encoded_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
                with open(save_path, 'wb') as f:
                    f.write(response.read())
            size = os.path.getsize(save_path)
            print(f"Success: {filename} ({size/(1024*1024):.2f}MB)")
            success_count += 1
        except Exception as e:
            print(f"Failed to download {filename}: {e}")
            
    print(f"\nDownload finished. {success_count}/{len(assets)} files ready in temp_r2.")
    print("ACTION REQUIRED: Please drag and upload all files inside temp_r2 folder directly to your Cloudflare R2 bucket root.")

if __name__ == "__main__":
    download_assets()
