import os
import sys
import re
import ssl
import json
import urllib.request
import urllib.parse
from datetime import datetime

# 设置标准输出编码为 UTF-8，防止 Windows 下 print 包含特殊字符的标题时抛出 UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# 绕过 SSL 验证
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_DIR = r"D:\projects\brian-site\brianinchrist\organicchurch"
POSTS_DIR = os.path.join(BASE_DIR, "posts")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

# 创建目录
os.makedirs(POSTS_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

def download_file(url, save_path):
    """下载文件并保存到本地（拦截大于 24MB 的文件以符合 Cloudflare Pages 限制）"""
    # 24MB 阈值，预留 1MB 缓冲
    MAX_SIZE = 24 * 1024 * 1024
    
    if os.path.exists(save_path):
        # 检查本地已存在的缓存文件，如果超出限制，则彻底删除并返回 False
        if os.path.getsize(save_path) > MAX_SIZE:
            print(f"Local file {os.path.basename(save_path)} exceeds 24MB, deleting...")
            try:
                os.remove(save_path)
            except:
                pass
            return False
        return True
        
    try:
        # 解码并重新编码 URL，防止中文字符导致请求失败
        parsed_url = urllib.parse.urlparse(url)
        path = urllib.parse.quote(parsed_url.path)
        encoded_url = urllib.parse.urlunparse((
            parsed_url.scheme,
            parsed_url.netloc,
            path,
            parsed_url.params,
            parsed_url.query,
            parsed_url.fragment
        ))
        
        req = urllib.request.Request(encoded_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
            # 优先从 Header 检查文件大小
            content_length = response.getheader('Content-Length')
            if content_length:
                size = int(content_length)
                if size > MAX_SIZE:
                    print(f"Skipping {url} (File size {size/(1024*1024):.2f}MB exceeds Cloudflare Pages 25MB limit)")
                    return False
            
            # 流式写入，并在过程中进行防爆大小检查
            temp_path = save_path + ".tmp"
            written = 0
            with open(temp_path, 'wb') as f:
                while True:
                    chunk = response.read(1024 * 64)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > MAX_SIZE:
                        print(f"Skipping {url} (Stream size exceeded 24MB limit)")
                        f.close()
                        try:
                            os.remove(temp_path)
                        except:
                            pass
                        return False
                    f.write(chunk)
            
            # 写入完成，覆盖重命名
            if os.path.exists(save_path):
                os.remove(save_path)
            os.rename(temp_path, save_path)
            
        print(f"Downloaded: {url} -> {save_path} ({written/(1024*1024):.2f}MB)")
        return True
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        if os.path.exists(save_path + ".tmp"):
            try:
                os.remove(save_path + ".tmp")
            except:
                pass
        return False

def sanitize_filename(url):
    """从 URL 生成干净的文件名"""
    parsed = urllib.parse.urlparse(url)
    filename = os.path.basename(parsed.path)
    if not filename:
        # 如果 URL 没文件名，用哈希或随机名
        import hashlib
        filename = hashlib.md5(url.encode()).hexdigest() + ".jpg"
    # 去除特殊字符，只保留字母数字点和下划线横杠
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    # 限制长度
    if len(filename) > 100:
        name, ext = os.path.splitext(filename)
        filename = name[:90] + ext
    return filename

def process_content_resources(content, post_id):
    """解析正文中的 jiadongli 资源（图片、音频、视频、PDF等）并进行本地化下载和替换"""
    # 匹配所有包含 jiadongli 的远程链接（包括 online, xyz 等域名后缀）
    urls = re.findall(r'(?:https?:)?//[a-zA-Z0-9.-]*jiadongli[a-zA-Z0-9.-]*[^\s"\'>\)]+', content)
    
    # 去重
    urls = list(set(urls))
    local_resources = []
    
    # 常见需要本地化下载的文件后缀
    file_extensions = ('.mp3', '.mp4', '.m4a', '.wav', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.zip', '.mov', '.ogg')
    
    for url in urls:
        parsed_url = urllib.parse.urlparse(url)
        path_lower = parsed_url.path.lower()
        
        is_media = False
        # 1. 检查是否在 wp-content/uploads 文件夹下
        if 'wp-content/uploads' in path_lower:
            is_media = True
        # 2. 或者是以特定的多媒体或文件格式结尾
        elif path_lower.endswith(file_extensions):
            is_media = True
            
        if is_media:
            # 排除音频和视频资源，改由 Cloudflare R2 托管以解决 Pages 部署包大小与超时问题
            if path_lower.endswith(('.mp3', '.mp4', '.m4a', '.wav', '.mov', '.ogg')):
                continue
                
            filename = sanitize_filename(url)
            local_filename = f"{post_id}_{filename}"
            local_path = os.path.join(UPLOADS_DIR, local_filename)
            
            # 处理可能的相对协议 //
            download_url = url
            if url.startswith('//'):
                download_url = 'https:' + url
                
            # 下载该媒体资源并替换链接
            if download_file(download_url, local_path):
                content = content.replace(url, f"../uploads/{local_filename}")
                local_resources.append(local_filename)
                
    return content, local_resources

def fetch_all_posts():
    """抓取所有 WordPress 文章"""
    posts = []
    page = 1
    print("Starting to fetch posts from WordPress API...")
    while True:
        url = f"https://jiadongli.online/blog1/organicchurch/wp-json/wp/v2/posts?_embed=1&per_page=100&page={page}"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx) as response:
                data = json.loads(response.read().decode())
                if not data:
                    break
                posts.extend(data)
                print(f"Fetched page {page} with {len(data)} posts.")
                page += 1
        except Exception as e:
            print(f"Stopped fetching at page {page}: {e}")
            break
            
    print(f"Total posts fetched: {len(posts)}")
    return posts

def generate_post_html(post, content, local_featured_media):
    """生成单篇文章的 HTML 页面"""
    post_id = post['id']
    title = post['title']['rendered']
    
    # 格式化日期
    date_str = post['date'] # 格式如 2026-06-01T12:57:09
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S")
        formatted_date = dt.strftime("%Y-%m-%d")
        display_date = dt.strftime("%B %d, %Y")
    except:
        formatted_date = date_str[:10]
        display_date = date_str[:10]
        
    # 解析分类
    categories = []
    if '_embedded' in post and 'wp:term' in post['_embedded']:
        for term_list in post['_embedded']['wp:term']:
            for term in term_list:
                if term.get('taxonomy') == 'category':
                    categories.append(term.get('name'))
                    
    # 作者名
    author_name = "Brian"
    if '_embedded' in post and 'author' in post['_embedded']:
        authors = post['_embedded']['author']
        if authors:
            author_name = authors[0].get('name', 'Brian')
            
    categories_html = "".join([f'<span class="category-tag">{cat}</span>' for cat in categories])
    
    featured_media_html = ""
    if local_featured_media:
        featured_media_html = f'<div class="featured-image-container"><img class="featured-image" src="../uploads/{local_featured_media}" alt="{title}"></div>'

    html_template = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - 有机教会</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600&family=Noto+Serif+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {{
      --primary: #5645d4;
      --primary-pressed: #4534b3;
      --on-primary: #ffffff;
      --brand-navy: #0a1530;
      --canvas: #ffffff;
      --surface: #f6f5f4;
      --surface-soft: #fafaf9;
      --hairline: #e5e3df;
      --hairline-strong: #c8c4be;
      --ink-deep: #000000;
      --ink: #1a1a1a;
      --charcoal: #37352f;
      --slate: #5d5b54;
      --steel: #787671;
      --stone: #a4a097;
      --on-dark: #ffffff;
      --font-sans: 'Inter', -apple-system, system-ui, sans-serif;
      --font-serif: 'Noto Serif SC', Georgia, serif;
      --rounded-md: 8px;
      --rounded-lg: 12px;
      --shadow-card: rgba(15, 15, 15, 0.08) 0px 4px 12px 0px;
    }}

    *, *::before, *::after {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    html {{
      scroll-behavior: smooth;
    }}

    body {{
      font-family: var(--font-sans);
      background-color: var(--canvas);
      color: var(--charcoal);
      line-height: 1.6;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }}

    a {{ text-decoration: none; color: inherit; }}

    /* Top Nav */
    .top-nav {{
      position: sticky;
      top: 0;
      background-color: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--hairline);
      z-index: 100;
      height: 64px;
      display: flex;
      align-items: center;
    }}

    .container {{
      max-width: 800px;
      margin: 0 auto;
      padding: 0 24px;
      width: 100%;
    }}

    .nav-inner {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 24px;
    }}

    .logo {{
      font-size: 16px;
      font-weight: 600;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .logo-mark {{
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: var(--ink);
      color: var(--on-dark);
      border-radius: 6px;
    }}

    .nav-links {{
      display: flex;
      gap: 24px;
      align-items: center;
    }}

    .nav-link {{
      font-size: 14px;
      font-weight: 500;
      color: var(--steel);
      transition: color 0.2s;
    }}

    .nav-link:hover {{ color: var(--ink); }}

    .lang-toggle {{
      display: flex;
      background: var(--surface);
      border: 1px solid var(--hairline);
      border-radius: var(--rounded-md);
      padding: 2px;
    }}
    
    .lang-toggle button {{
      background: transparent;
      border: none;
      padding: 4px 10px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      color: var(--steel);
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s ease;
    }}

    .lang-toggle button.active {{
      background: var(--canvas);
      color: var(--ink);
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }}

    /* Article Layout */
    .article-container {{
      padding: 56px 0 96px;
    }}

    .article-header {{
      margin-bottom: 40px;
    }}

    .post-title {{
      font-family: var(--font-sans);
      font-size: 38px;
      font-weight: 700;
      color: var(--ink-deep);
      line-height: 1.25;
      margin-bottom: 20px;
      letter-spacing: -0.5px;
    }}

    .post-meta {{
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      font-size: 14px;
      color: var(--steel);
      margin-bottom: 24px;
    }}

    .author-info {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .author-avatar {{
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--charcoal);
    }}

    .category-tags {{
      display: flex;
      gap: 8px;
    }}

    .category-tag {{
      background-color: var(--surface);
      color: var(--charcoal);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }}

    .featured-image-container {{
      width: 100%;
      margin-bottom: 40px;
      border-radius: var(--rounded-lg);
      overflow: hidden;
      box-shadow: var(--shadow-card);
    }}

    .featured-image {{
      width: 100%;
      height: auto;
      max-height: 450px;
      object-fit: cover;
      display: block;
    }}

    /* Article Content - Notion Style */
    .article-content {{
      font-family: var(--font-serif);
      font-size: 17px;
      color: var(--charcoal);
      line-height: 1.8;
      letter-spacing: 0.01em;
    }}

    .article-content p {{
      margin-bottom: 24px;
    }}

    .article-content h2 {{
      font-family: var(--font-sans);
      font-size: 24px;
      font-weight: 600;
      color: var(--ink-deep);
      margin: 48px 0 16px;
      border-bottom: 1px solid var(--hairline);
      padding-bottom: 8px;
    }}

    .article-content h3 {{
      font-family: var(--font-sans);
      font-size: 20px;
      font-weight: 600;
      color: var(--ink-deep);
      margin: 32px 0 12px;
    }}

    .article-content blockquote {{
      margin: 32px 0;
      padding: 16px 24px;
      background: var(--surface-soft);
      border-left: 4px solid var(--primary);
      border-radius: 0 var(--rounded-md) var(--rounded-md) 0;
      font-style: normal;
    }}

    .article-content blockquote p {{
      margin-bottom: 0;
    }}

    .article-content ul, .article-content ol {{
      margin-bottom: 24px;
      padding-left: 24px;
    }}

    .article-content li {{
      margin-bottom: 8px;
    }}

    .article-content img {{
      max-width: 100%;
      height: auto;
      display: block;
      margin: 32px auto;
      border-radius: var(--rounded-md);
      box-shadow: var(--shadow-card);
    }}

    /* Navigation / Back */
    .back-to-blog {{
      margin-top: 64px;
      padding-top: 32px;
      border-top: 1px solid var(--hairline);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}

    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 500;
      padding: 10px 18px;
      border-radius: var(--rounded-md);
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }}

    .btn-secondary {{
      background-color: transparent;
      color: var(--ink);
      border: 1px solid var(--hairline-strong);
    }}
    .btn-secondary:hover {{ background-color: var(--surface); }}

    .btn-primary {{
      background-color: var(--primary);
      color: var(--on-primary);
    }}
    .btn-primary:hover {{ background-color: var(--primary-pressed); }}

    /* Footer */
    .footer {{
      border-top: 1px solid var(--hairline);
      padding: 48px 0;
      background: var(--surface-soft);
      text-align: center;
      color: var(--stone);
      font-size: 13px;
    }}

    .progress-bar {{
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      background: var(--primary);
      width: 0%;
      z-index: 1000;
      transition: width 0.1s ease-out;
    }}

    /* Responsive Media */
    .article-content img,
    .article-content video,
    .article-content audio,
    .article-content iframe {{
      max-width: 100% !important;
      height: auto !important;
      display: block;
      margin: 24px auto;
    }}

    .article-content audio {{
      width: 100%;
    }}

    /* WP Block elements mobile override */
    .wp-block-media-text {{
      display: grid;
      gap: 20px;
      margin: 32px 0;
    }}

    /* Mobile Menu Button */
    .mobile-menu-btn {{
      display: none;
      background: transparent;
      border: none;
      color: var(--ink);
      cursor: pointer;
      padding: 6px;
      border-radius: var(--rounded-md);
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
    }}
    .mobile-menu-btn:hover {{
      background: var(--surface-soft);
    }}

    @media (max-width: 768px) {{
      .mobile-menu-btn {{
        display: flex;
      }}
      .nav-links {{
        display: none;
      }}
    }}

    /* Mobile Menu Overlay */
    .mobile-menu-overlay {{
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(15, 15, 15, 0.4);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }}
    .mobile-menu-overlay.show {{
      opacity: 1;
      pointer-events: auto;
    }}
    .mobile-menu-card {{
      background: var(--canvas);
      width: 280px;
      height: 100%;
      box-shadow: var(--shadow-card);
      padding: var(--spacing-xxl) var(--spacing-xl);
      display: flex;
      flex-direction: column;
      position: relative;
      transform: translateX(100%);
      transition: transform 0.2s ease;
    }}
    .mobile-menu-overlay.show .mobile-menu-card {{
      transform: translateX(0);
    }}
    .mobile-menu-close {{
      position: absolute;
      top: 16px;
      right: 16px;
      background: transparent;
      border: none;
      font-size: 24px;
      color: var(--stone);
      cursor: pointer;
    }}
    .mobile-menu-close:hover {{
      color: var(--ink);
    }}
    .mobile-menu-links {{
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 32px;
    }}
    .mobile-menu-links a {{
      font-size: 18px;
      font-weight: 500;
      color: var(--ink);
      text-decoration: none;
      padding: 8px 12px;
      border-radius: var(--rounded-md);
      transition: background 0.15s ease;
    }}
    .mobile-menu-links a:hover {{
      background: var(--surface-soft);
    }}

    /* Mobile adjustments */
    @media (max-width: 768px) {{
      .post-title {{ font-size: 28px; }}
      .article-container {{ padding: 32px 0 64px; }}
      
      /* Force media-text stacks vertically on mobile */
      .wp-block-media-text {{
        display: flex !important;
        flex-direction: column !important;
      }}
      .wp-block-media-text__media, 
      .wp-block-media-text__content {{
        width: 100% !important;
      }}
      
      /* Navigation optimizations on smaller screens */
      .nav-links {{
        gap: 12px;
      }}
      .nav-link {{
        font-size: 13px;
      }}
      .logo {{
        font-size: 14px;
      }}
    }}
  </style>
</head>
<body>
  <div class="progress-bar" id="progressBar"></div>

  <nav class="top-nav" aria-label="Main Navigation">
    <div class="nav-inner">
      <a href="../../index.html" class="logo">
        <span class="logo-mark">✝</span>
        有机教会
      </a>
      
      <div style="display:flex; gap:16px; align-items:center;">
        <div class="nav-links">
          <a href="../../index.html#about" class="nav-link"><span class="lang-en">About</span><span class="lang-zh">关于</span></a>
          <a href="../../index.html#beliefs" class="nav-link"><span class="lang-en">Beliefs</span><span class="lang-zh">信仰</span></a>
          <a href="../index.html" class="nav-link"><span class="lang-en">Journal</span><span class="lang-zh">文章</span></a>
          <a href="../../oikos_church/" class="nav-link"><span class="lang-en">Book</span><span class="lang-zh">著作</span></a>
        </div>
        
        <div class="lang-toggle" aria-label="Language Toggle">
          <button id="lang-en-btn" class="active" onclick="switchLang('en')">EN</button>
          <button id="lang-zh-btn" onclick="switchLang('zh')">中文</button>
        </div>

        <button id="mobile-menu-btn" class="mobile-menu-btn" onclick="toggleMobileMenu(true)" aria-label="Toggle Navigation Menu">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  </nav>

  <main class="container">
    <article class="article-container">
      <header class="article-header">
        <h1 class="post-title">{title}</h1>
        <div class="post-meta">
          <div class="author-info">
            <span class="author-avatar">{author_name[0].upper()}</span>
            <span>{author_name}</span>
          </div>
          <div>•</div>
          <time datetime="{formatted_date}">{display_date}</time>
          <div>•</div>
          <div class="category-tags">
            {categories_html}
          </div>
        </div>
      </header>

      {featured_media_html}

      <div class="article-content">
        {content}
      </div>

      <div class="back-to-blog">
        <a href="../index.html" class="btn btn-secondary">
          ← <span class="lang-en">Back to Journal</span><span class="lang-zh">返回文章首页</span>
        </a>
      </div>
    </article>
  </main>

  <footer class="footer">
    <div class="container">
      <p>&copy; 2026 有机教会. Soli Deo Gloria.</p>
    </div>
  </footer>

  <script>
    function switchLang(lang) {{
      const body = document.body;
      const enBtn = document.getElementById('lang-en-btn');
      const zhBtn = document.getElementById('lang-zh-btn');
      
      if (lang === 'zh') {{
        body.classList.add('show-zh');
        enBtn.classList.remove('active');
        zhBtn.classList.add('active');
        document.documentElement.lang = 'zh';
        localStorage.setItem('lang', 'zh');
      }} else {{
        body.classList.remove('show-zh');
        enBtn.classList.add('active');
        zhBtn.classList.remove('active');
        document.documentElement.lang = 'en';
        localStorage.setItem('lang', 'en');
      }}
    }}
    
    // Auto-detect language
    const savedLang = localStorage.getItem('lang');
    if (savedLang) {{
      switchLang(savedLang);
    }} else {{
      const userLang = navigator.language || navigator.userLanguage;
      if (userLang && (userLang.startsWith('zh') || userLang.startsWith('cmn'))) {{
        switchLang('zh');
      }}
    }}

    // Reading Progress Bar
    window.addEventListener('scroll', () => {{
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      document.getElementById('progressBar').style.width = scrolled + '%';
    }});

    function toggleMobileMenu(show) {{
      const overlay = document.getElementById('mobile-menu-overlay');
      if (!overlay) return;
      if (show) {{
        overlay.classList.add('show');
      }} else {{
        overlay.classList.remove('show');
      }}
    }}
  </script>

  <!-- Mobile Menu Overlay -->
  <div id="mobile-menu-overlay" class="mobile-menu-overlay" onclick="toggleMobileMenu(false)">
    <div class="mobile-menu-card" onclick="event.stopPropagation()">
      <button class="mobile-menu-close" onclick="toggleMobileMenu(false)">&times;</button>
      <div class="mobile-menu-links">
        <a href="../../index.html#about" onclick="toggleMobileMenu(false)"><span class="lang-en">About</span><span class="lang-zh">关于</span></a>
        <a href="../../index.html#beliefs" onclick="toggleMobileMenu(false)"><span class="lang-en">Beliefs</span><span class="lang-zh">信仰</span></a>
        <a href="../index.html" onclick="toggleMobileMenu(false)"><span class="lang-en">Journal</span><span class="lang-zh">文章</span></a>
        <a href="../../oikos_church/" onclick="toggleMobileMenu(false)"><span class="lang-en">Book</span><span class="lang-zh">著作</span></a>
      </div>
    </div>
  </div>
</body>
</html>
"""
    file_path = os.path.join(POSTS_DIR, f"{post_id}.html")
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(html_template)

def clean_html_body(html):
    """如果 WP 内容里包含了 <html><body> 之类的包装，把它提取出核心 body"""
    if not html:
        return ""
    # 移除可能存在的 <html>, <head>, <body> 包装
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if body_match:
        html = body_match.group(1)
    
    # 移除 <title> 等重复的头部
    html = re.sub(r'<title[^>]*>.*?</title>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<meta[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    
    # 移除空的包裹
    html = html.strip()
    return html

def main():
    posts = fetch_all_posts()
    
    posts_metadata = []
    
    for i, post in enumerate(posts):
        post_id = post['id']
        title = post['title']['rendered']
        print(f"[{i+1}/{len(posts)}] Processing post: {title} (ID: {post_id})")
        
        # 提取特色图片
        featured_media_url = ""
        local_featured_media = ""
        if '_embedded' in post and 'wp:featuredmedia' in post['_embedded']:
            media_list = post['_embedded']['wp:featuredmedia']
            if media_list and len(media_list) > 0:
                featured_media_url = media_list[0].get('source_url', '')
                
        if featured_media_url:
            # 排除特色媒体中的音视频
            if urllib.parse.urlparse(featured_media_url).path.lower().endswith(('.mp3', '.mp4', '.m4a', '.wav', '.mov', '.ogg')):
                featured_media_url = ""
                
        if featured_media_url:
            media_filename = sanitize_filename(featured_media_url)
            local_media_filename = f"featured_{post_id}_{media_filename}"
            media_save_path = os.path.join(UPLOADS_DIR, local_media_filename)
            if download_file(featured_media_url, media_save_path):
                local_featured_media = local_media_filename
        
        # 处理正文和正文中的资源
        raw_content = post['content']['rendered']
        cleaned_content = clean_html_body(raw_content)
        processed_content, local_resources = process_content_resources(cleaned_content, post_id)
        
        # 解析分类
        categories = []
        if '_embedded' in post and 'wp:term' in post['_embedded']:
            for term_list in post['_embedded']['wp:term']:
                for term in term_list:
                    if term.get('taxonomy') == 'category':
                        categories.append(term.get('name'))
                        
        # 格式化日期
        date_str = post['date']
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S")
            formatted_date = dt.strftime("%Y-%m-%d")
        except:
            formatted_date = date_str[:10]
            
        # 提取摘要
        excerpt_raw = post.get('excerpt', {}).get('rendered', '')
        # 清理 html 标签
        excerpt_clean = re.sub(r'<[^>]+>', '', excerpt_raw).strip()
        # 截取长度
        if len(excerpt_clean) > 150:
            excerpt_clean = excerpt_clean[:147] + "..."
            
        # 记录元数据
        posts_metadata.append({
            "id": post_id,
            "title": title,
            "date": formatted_date,
            "excerpt": excerpt_clean,
            "categories": categories,
            "featured_image": f"uploads/{local_featured_media}" if local_featured_media else ""
        })
        
        # 生成静态文章页面
        generate_post_html(post, processed_content, local_featured_media)
        
    # 保存 posts.json
    metadata_path = os.path.join(BASE_DIR, "posts.json")
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(posts_metadata, f, ensure_ascii=False, indent=2)
        
    print(f"Migration completed successfully. {len(posts)} posts processed.")

if __name__ == "__main__":
    main()
