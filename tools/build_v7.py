"""build_v7.py — 加一段 6 秒全景巡视（横向缓慢平移），推到 ~39 秒。"""
import glob
import os
import subprocess

from PIL import Image

FOOT = r"D:\项目\ai思考可视化\dsh-workflow-monitor\footage"
TMP = os.environ.get("TEMP", r"C:\Windows\Temp")
FF = r"C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
W, H = 1920, 1080
DUR = 6.0
FPS = 30
FRAMES = int(DUR * FPS)


def run(a, quiet=True):
    r = subprocess.run(a, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if r.returncode != 0 and not quiet:
        print("FAIL", (r.stderr or "")[-200:])
    return r.returncode == 0


def make_pan():
    src = sorted(glob.glob(os.path.join(FOOT, "cap-run", "*.png")))
    base = Image.open(src[len(src) // 2]).convert("RGB")
    bw, bh = base.size
    # 视口从画面左侧缓慢推到右侧，同时轻微放大
    dst = os.path.join(TMP, "j-pan")
    os.makedirs(dst, exist_ok=True)
    win_w = int(bw * 0.78)
    for i in range(FRAMES):
        t = i / (FRAMES - 1)
        left = int((bw - win_w) * (0.15 + 0.7 * t))
        crop = base.crop((left, 0, left + win_w, bh)).resize((W, H), Image.LANCZOS)
        crop.save(os.path.join(dst, "f%04d.jpg" % i), quality=94)
    return dst


def main():
    d = make_pan()
    print("全景帧:", len(glob.glob(os.path.join(d, "*.jpg"))))
    ok = run([FF, "-y", "-framerate", "30", "-i", os.path.join(d, "f%04d.jpg"),
              "-vf", "scale=1920:1080", "-r", "30", "-t", str(DUR),
              "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p",
              os.path.join(TMP, "pan.mp4")], quiet=False)
    order = ["a1", "a2", "a3", "a4", "a5b", "a6", "pan", "a7", "a8", "a9", "a11b", "a12", "a10"]
    lst = os.path.join(TMP, "cc7.txt")
    with open(lst, "w", encoding="ascii") as fh:
        for x in order:
            fh.write("file '%s'\n" % os.path.join(TMP, x + ".mp4").replace("\\", "/"))
    joined = os.path.join(TMP, "joined7.mp4")
    okj = run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined], quiet=False)
    print("pan:", ok, "concat:", okj)

    subs = [
        (0.3, 1.4, "这是一块给 AI 智能体做的仪器墙"),
        (1.6, 4.4, "它此刻正在读你的会话"),
        (4.6, 5.9, "每一次工具调用，都会亮一下"),
        (6.1, 8.9, "上面这排是实时读数"),
        (9.1, 11.9, "下面这块是 42 小时的活动，越久越淡"),
        (12.1, 14.9, "空闲时它慢下来，但不装忙"),
        (15.2, 20.8, "整屏八块面板，各管一件事"),
        (21.2, 23.5, "它分两半：浏览器里的客户端"),
        (23.7, 26.1, "和读日志的宿主半边"),
        (26.3, 28.7, "日志是拼接的 zstd 帧，要按魔数切帧"),
        (28.9, 31.3, "会话行可以点，弹出详情"),
        (31.5, 33.9, "安装只要一句话：把地址发给你的 AI"),
        (34.2, 38.6, "全部开源，非商业免费"),
    ]
    parts = ["drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='%s':fontcolor=0xE8EBF2:"
             "fontsize=42:x=(w-text_w)/2:y=h-150:enable='between(t,%.1f,%.1f)'" % (t, a, b)
             for a, b, t in subs]
    out = os.path.join(FOOT, "promo-v5.mp4")
    okf = run([FF, "-y", "-i", joined, "-vf", ",".join(parts), "-c:v", "libx264", "-crf", "18",
               "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], quiet=False)
    print("final:", okf, os.path.getsize(out) // 1024 if os.path.exists(out) else 0, "KB")


if __name__ == "__main__":
    main()
