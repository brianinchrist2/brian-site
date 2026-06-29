import os
import subprocess
import sys

TEMP_R2_DIR = r"D:\projects\brian-site\temp_r2"
BUCKET_NAME = "organic-church"

def upload_assets():
    if not os.path.exists(TEMP_R2_DIR):
        print(f"Directory {TEMP_R2_DIR} does not exist.")
        return

    files = [f for f in os.listdir(TEMP_R2_DIR) if os.path.isfile(os.path.join(TEMP_R2_DIR, f))]
    print(f"Found {len(files)} files in {TEMP_R2_DIR} to upload to R2 bucket '{BUCKET_NAME}'...")

    success_count = 0
    for i, filename in enumerate(files):
        file_path = os.path.join(TEMP_R2_DIR, filename)
        print(f"[{i+1}/{len(files)}] Uploading {filename}...")
        
        # 运行 wrangler r2 object put 命令
        cmd = [
            "npx", "wrangler", "r2", "object", "put",
            f"{BUCKET_NAME}/{filename}",
            "--file", file_path,
            "--remote"
        ]
        
        try:
            # shell=True 在 Windows 下比较稳妥，因为 npx 是一个 cmd/ps1 脚本
            result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="ignore")
            if result.returncode == 0:
                print(f"  Success: {filename}")
                success_count += 1
            else:
                print(f"  Failed: {filename}")
                print(f"  Error: {result.stderr.strip()}")
        except Exception as e:
            print(f"  Exception occurred: {e}")

    print(f"\nUpload completed. {success_count}/{len(files)} files uploaded successfully.")

if __name__ == "__main__":
    upload_assets()
