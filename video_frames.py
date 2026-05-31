import os
import asyncio
import aiohttp
import subprocess
from fastapi import FastAPI, HTTPException

# 修正：asynco -> asyncio
app = FastAPI()

# 设置保存图片的文件夹
FRAME_DIR = "/tmp/frames"
os.makedirs(FRAME_DIR, exist_ok=True)

# 核心功能：下载视频
async def download_video(url: str, save_path: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=30) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="下载视频失败")
            with open(save_path, "wb") as f:
                f.write(await resp.read())

# 核心功能：抽帧（使用 imageio-ffmpeg，不需要系统环境变量）
def extract_frames(video_path: str, output_dir: str):
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    # 使用 imageio-ffmpeg 的 ffmpeg 命令
    # -i 输入视频
    # -vf fps=1/5 每5秒抽1帧（如果想每1秒抽1帧，改成 fps=1）
    # %04d.jpg 输出为 0001.jpg, 0002.jpg 这样
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vf", "fps=1/5",
        "-q:v", "2",
        f"{output_dir}/frame_%04d.jpg"
    ]
    
    try:
        # 运行命令，捕获输出
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print("FFmpeg 输出:", result.stdout)
    except subprocess.CalledProcessError as e:
        print("FFmpeg 错误:", e.stderr)
        raise HTTPException(status_code=500, detail=f"抽帧失败: {e.stderr}")

# 你的主接口
@app.post("/extract-frames/")
async def extract_frames_api(video_url: str):
    # 生成唯一的文件名（避免冲突）
    video_filename = "temp_video.mp4"
    video_path = os.path.join(FRAME_DIR, video_filename)
    
    try:
        # 1. 下载
        await download_video(video_url, video_path)
        
        # 2. 抽帧
        extract_frames(video_path, FRAME_DIR)
        
        # 3. 返回结果（这里简单返回文件名，你可以改成返回URL）
        return {
            "message": "抽帧成功",
            "frames": [f"{FRAME_DIR}/frame_{i:04d}.jpg" for i in range(1, 4)]  # 示例返回3帧
        }
        
    finally:
        # 清理临时视频文件（可选）
        if os.path.exists(video_path):
            os.remove(video_path)

# 启动命令：uvicorn video_frames:app --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)