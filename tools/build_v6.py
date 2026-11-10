"""build_v6.py — 用真实抽屉画面替换交互卡，重拼并重烧字幕。"""
import glob
import os
import subprocess

from PIL import Image

FOOT = r"D:\项目\ai思考可视化\dsh-workflow-monitor\footage"
TMP = os.environ.get("TEMP", r"C:\Windows\Temp")
FF = r"C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
W, H = 1920, 1080


def run(a, quiet=True):
    r = subprocess.run(a, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if r.returncode != 0 and not quiet:
        print("FAIL", (r.stderr or "")[-200:])
    return r.returncode == 0


def prep_drawer():
    src = os.path.join(FOOT, "cap-drawer")
    dst = os.path.join(TMP, "j-drawer")
    os.makedirs(dst, exist_ok=True)
    fs = sorted(glob.glob(os.path.join(src, "*.png")))
    # 裁掉底部黑边（页面高度小于 1080），拉伸填满
    for i, f in enumerate(fs):
        im = Image.open(f).convert("RGB")
        w2, h2 = im.size
        crop = im.crop((0, 0, w2, int(h2 * 0.72)))
        crop.resize((W, H), Image.LANCZOS).save(os.path.join(dst, "f%04d.jpg" % i), quality=94)
    return len(fs), dst


def main():
    n, d = prep_drawer()
    print("抽屉帧:", n)
    # 45 帧铺满 2.6s → 17.3fps，保持时间轴不变
    ok = run([FF, "-y", "-framerate", "17.3", "-i", os.path.join(d, "f%04d.jpg"),
              "-vf", "scale=1920:1080:flags=lanczos", "-r", "30", "-t", "2.6",
              "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p",
              os.path.join(TMP, "a11b.mp4")], quiet=False)
    order = ["a1", "a2", "a3", "a4", "a5b", "a6", "a7", "a8", "a9", "a11b", "a12", "a10"]
    lst = os.path.join(TMP, "cc6.txt")
    with open(lst, "w", encoding="ascii") as fh:
        for x in order:
            fh.write("file '%s'\n" % os.path.join(TMP, x + ".mp4").replace("\\", "/"))
    joined = os.path.join(TMP, "joined6.mp4")
    okj = run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined], quiet=False)
    print("segment:", ok, "concat:", okj)
    return joined


if __name__ == "__main__":
    main()
