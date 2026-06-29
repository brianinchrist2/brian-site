import os
import re

POSTS_DIR = r"D:\projects\brian-site\brianinchrist\organicchurch\posts"

def check_posts():
    if not os.path.exists(POSTS_DIR):
        print(f"Directory {POSTS_DIR} does not exist.")
        return

    domain_pattern = re.compile(r'jiadongli\.online[^\s"\'>]*', re.IGNORECASE)
    results = {}

    for filename in os.listdir(POSTS_DIR):
        if not filename.endswith('.html'):
            continue
        file_path = os.path.join(POSTS_DIR, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                matches = domain_pattern.findall(content)
                if matches:
                    results[filename] = list(set(matches))
        except Exception as e:
            print(f"Error reading {filename}: {e}")

    print(f"Found {len(results)} files containing 'jiadongli.online' links.")
    # 打印前 20 个发现，以及它们包含的链接
    count = 0
    for filename, links in results.items():
        count += 1
        if count > 30:
            print("... and more files.")
            break
        print(f"\n[{filename}] contains:")
        for link in links[:5]:
            print(f"  - {link}")
        if len(links) > 5:
            print(f"  - (and {len(links)-5} more links)")

if __name__ == "__main__":
    check_posts()
