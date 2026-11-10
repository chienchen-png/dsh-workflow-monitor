"""resub.py — 只重烧字幕（不重编码分段），字幕窗口严格对齐分段边界。"""
import os
import subprocess

TMP = os.environ.get("TEMP", r"C:\Windows\Temp")
FOOT = r"D:\项目\ai思考可视化\dsh-workflow-monitor\footage"
FF = r"C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"

# 分段时长（秒）：a1 1.5 / a2 3 / a3 1.5 / a4 3 / a5 3 / a6 3 / a7 2.6 / a8 2.6 / a9 2.6 / a11 2.6 / a12 2.6 / a10 5
SUBS = [
    (0.3, 1.4, "这是一块给 AI 智能体做的仪器墙"),
    (1.6, 4.4, "它此刻正在读你的会话"),
    (4.6, 5.9, "每一次工具调用，都会亮一下"),
    (6.1, 8.9, "上面这排是实时读数"),
    (9.1, 11.9, "下面这块是 42 小时的活动，越久越淡"),
    (12.1, 14.9, "空闲时它慢下来，但不装忙"),
    (15.1, 17.5, "它分两半：浏览器里的客户端"),
    (17.7, 20.1, "和读日志的宿主半边"),
    (20.3, 22.7, "日志是拼接的 zstd 帧，要按魔数切帧"),
    (22.9, 25.3, "会话行可以点，弹出详情"),
    (25.5, 27.9, "安装只要一句话：把地址发给你的 AI"),
    (28.1, 32.8, "全部开源，非商业免费"),
]

src = os.path.join(TMP, "joined4.mp4")
out = os.path.join(FOOT, "promo-36s-v2.mp4")

parts = []
for a, b, t in SUBS:
    parts.append(
        "drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='%s':fontcolor=0xE8EBF2:"
        "fontsize=42:x=(w-text_w)/2:y=h-150:enable='between(t,%.1f,%.1f)'" % (t, a, b))

cmd = [FF, "-y", "-i", src, "-vf", ",".join(parts), "-c:v", "libx264", "-crf", "18",
       "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
print("ok" if r.returncode == 0 else "FAIL")
print((r.stderr or "")[-200:])
if os.path.exists(out):
    print("size", os.path.getsize(out) // 1024, "KB")
