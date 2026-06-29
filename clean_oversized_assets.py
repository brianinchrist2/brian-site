import os

UPLOADS_DIR = r"D:\projects\brian-site\brianinchrist\organicchurch\uploads"
MAX_SIZE = 24 * 1024 * 1024 # 24MB

def clean_large_files():
    if not os.path.exists(UPLOADS_DIR):
        print(f"Directory {UPLOADS_DIR} does not exist.")
        return
        
    cleaned = []
    total_files = 0
    
    # 强制清理所有的 mp3/mp4，改由 R2 托管
    media_extensions = ('.mp3', '.mp4')
    
    for filename in os.listdir(UPLOADS_DIR):
        file_path = os.path.join(UPLOADS_DIR, filename)
        if os.path.isdir(file_path):
            continue
        total_files += 1
        name_lower = filename.lower()
        size = os.path.getsize(file_path)
        
        # 只要是 mp3 或 mp4 就一律清除，或者大于 MAX_SIZE 的文件
        if name_lower.endswith(media_extensions) or size > MAX_SIZE:
            print(f"Deleting media/large file: {filename} ({size/(1024*1024):.2f}MB)")
            try:
                os.remove(file_path)
                cleaned.append((filename, size))
            except Exception as e:
                print(f"Failed to delete {filename}: {e}")
                
    print(f"Scan complete. Total files checked: {total_files}. Deleted {len(cleaned)} oversized files.")
    if cleaned:
        print("\nOversized files list for R2 migration:")
        for name, sz in cleaned:
            print(f"  - {name} ({sz/(1024*1024):.2f}MB)")

if __name__ == "__main__":
    clean_large_files()
