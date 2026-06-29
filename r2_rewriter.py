import os
import re
import urllib.parse

POSTS_DIR = r"D:\projects\brian-site\brianinchrist\organicchurch\posts"

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

def rewrite_to_r2(r2_domain):
    r2_domain = r2_domain.rstrip('/')
    if not r2_domain.startswith('http'):
        r2_domain = 'https://' + r2_domain
        
    print(f"Starting to rewrite remote media links to Cloudflare R2: {r2_domain}")
    
    # 匹配所有包含 jiadongli 的链接
    url_pattern = re.compile(r'(?:https?:)?//[a-zA-Z0-9.-]*jiadongli[a-zA-Z0-9.-]*[^\s"\'>\)]+', re.IGNORECASE)
    media_extensions = ('.mp3', '.mp4', '.m4a', '.wav', '.mov', '.ogg')
    
    html_count = 0
    replacement_count = 0
    
    for filename in os.listdir(POSTS_DIR):
        if not filename.endswith('.html'):
            continue
        post_id = filename.split('.')[0]
        file_path = os.path.join(POSTS_DIR, filename)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            urls = url_pattern.findall(content)
            modified = False
            
            # 去重匹配到的 URL，避免重复替换
            urls = list(set(urls))
            
            for url in urls:
                parsed_url = urllib.parse.urlparse(url)
                path_lower = parsed_url.path.lower()
                
                # 如果是多媒体大文件资产
                if path_lower.endswith(media_extensions) or 'wp-content/uploads' in path_lower:
                    if path_lower.endswith(media_extensions):
                        # 生成统一命名的文件名
                        sanitized_name = sanitize_filename(url)
                        local_filename = f"{post_id}_{sanitized_name}"
                        
                        # 替换正文中的远程链接为 R2 桶中的链接
                        r2_url = f"{r2_domain}/{local_filename}"
                        content = content.replace(url, r2_url)
                        modified = True
                        replacement_count += 1
                        
            if modified:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                html_count += 1
                
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            
    print(f"\nCompleted! Modified {html_count} HTML files, successfully redirected {replacement_count} assets to R2 storage.")
    print("Next step: Please run 'npx wrangler pages deploy brianinchrist' to upload the updated posts to Pages.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python r2_rewriter.py <R2_CUSTOM_DOMAIN>")
        print("Example: python r2_rewriter.py assets.organicchurch.dpdns.org")
        sys.exit(1)
        
    rewrite_to_r2(sys.argv[1])
