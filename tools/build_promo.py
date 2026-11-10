"""build_promo.py — 生成字卡、特写帧、编码分段、拼接、烧字幕，一次跑完。"""
import glob
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\项目\ai思考可视化\dsh-workflow-monitor"
FOOT = os.path.join(ROOT, "footage")
WORK = os.path.join(FOOT, "_work")
TMP = os.environ.get("TEMP", r"C:\Windows\Temp")
FF = r"C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
W, H = 1920, 1080
BG = (8, 9, 11)
FG = (232, 235, 242)
DIM = (122, 127, 136)
PINK = (240, 166, 198)
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONT_B = r"C:\Windows\Fonts\msyhbd.ttc"


def f(sz, bold=False):
    for p in ([FONT_B, FONT] if bold else [FONT]):
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def run(args):
    r = subprocess.run([FF] + args, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if r.returncode != 0:
        print("FFMPEG FAIL:", " ".join(args)[:120])
        print((r.stderr or "")[-400:])
    return r.returncode == 0


def backdrop(src, dim=0.28, blur=0):
    im = Image.open(src).convert("RGB")
    im = im.resize((W, H), Image.LANCZOS)
    im = im.point(lambda v: int(v * dim))
    return im


def card(back, lines, out):
    im = back.copy()
    d = ImageDraw.Draw(im)
    y = 360
    for text, sz, col, bold, gap in lines:
        fo = f(sz, bold)
        w = d.textlength(text, font=fo)
        d.text(((W - w) / 2, y), text, font=fo, fill=col)
        y += sz + gap
    im.save(out)


def closeup_frames(src_dir, box, frames, zoom_from, zoom_to, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    fs = sorted(glob.glob(os.path.join(src_dir, "*.png")))
    base = Image.open(fs[len(fs) // 2]).convert("RGB")
    x0, y0, x1, y1 = box
    for i in range(frames):
        t = i / max(1, frames - 1)
        z = zoom_from + (zoom_to - zoom_from) * t
        cw, ch = int((x1 - x0) / z), int((y1 - y0) / z)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        l = max(0, min(base.width - cw, cx - cw // 2))
        tp = max(0, min(base.height - ch, cy - ch // 2))
        crop = base.crop((l, tp, l + cw, tp + ch)).resize((W, H), Image.LANCZOS)
        crop.save(os.path.join(out_dir, "f%04d.jpg" % i), quality=94)


def seg(name, src, extra=None, d="3"):
    target = os.path.join(TMP, name + ".mp4")
    args = ["-y"]
    if "%04d" in src:
        args += ["-framerate", "30", "-i", src]
    else:
        args += ["-loop", "1", "-t", d, "-i", src]
    vf = "scale=1920:1080:flags=lanczos"
    if extra:
        vf = extra + "," + vf
    args += ["-vf", vf, "-r", "30", "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", target]
    return run(args)


def main():
    os.makedirs(WORK, exist_ok=True)
    cap_run = os.path.join(FOOT, "cap-run")

    print("1/5 生成字卡")
    back = backdrop(os.path.join(cap_run, "f0040.png"), 0.22)
    card(back, [("AGENT TELEMETRY", 92, FG, True, 26),
                ("智能体实时运行态势", 52, DIM, False, 34),
                ("DeepSeek Harness 插件", 32, (72, 76, 84), False, 0)],
         os.path.join(WORK, "title.png"))
    card(back, [("dsh-workflow-monitor", 74, FG, True, 30),
                ("github.com/chienchen-png/dsh-workflow-monitor", 34, PINK, False, 44),
                ("非商业许可 · 欢迎修改与试用", 28, DIM, False, 0)],
         os.path.join(WORK, "end.png"))

    print("2/5 生成特写帧")
    closeup_frames(cap_run, (0, 0, 1920, 140), 90, 1.0, 1.35, os.path.join(WORK, "j-top"))
    closeup_frames(cap_run, (1180, 760, 1920, 1080), 90, 1.0, 1.4, os.path.join(WORK, "j-matrix"))

    print("3/5 编码分段")
    ok = []
    ok.append(seg("w1", os.path.join(WORK, "title.png"), "fade=in:st=0:d=1.2", "4"))
    ok.append(seg("w2", os.path.join(TMP, "j-run", "f%04d.jpg")))
    ok.append(seg("w3", os.path.join(TMP, "j-tool", "f%04d.jpg")))
    ok.append(seg("w4", os.path.join(WORK, "j-top", "f%04d.jpg")))
    ok.append(seg("w5", os.path.join(WORK, "j-matrix", "f%04d.jpg")))
    ok.append(seg("w6", os.path.join(TMP, "j-idle", "f%04d.jpg")))
    ok.append(seg("w7", os.path.join(WORK, "end.png"), "fade=in:st=0.4:d=1.0", "5"))
    print("   分段:", ok)

    print("4/5 拼接")
    names = ["w1", "w2", "w3", "w4", "w5", "w6", "w7"]
    lst = os.path.join(TMP, "cc2.txt")
    with open(lst, "w", encoding="ascii") as fh:
        for n in names:
            fh.write("file '%s'\n" % os.path.join(TMP, n + ".mp4").replace("\\", "/"))
    joined = os.path.join(TMP, "joined2.mp4")
    run(["-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])

    print("5/5 烧字幕")
    subs = [
        (4.6, 7.2, "这是一块给 AI 智能体做的仪器墙"),
        (7.3, 9.3, "它此刻正在读你的会话"),
        (9.4, 11.8, "每一次工具调用，都会亮一下"),
        (11.9, 14.6, "上面这排是实时读数"),
        (14.7, 17.4, "下面这块是 42 小时的活动，越久越淡"),
        (17.5, 20.8, "空闲时它慢下来，但不装忙"),
        (20.9, 23.4, "全部开源，非商业免费"),
    ]
    parts = []
    for a, b, t in subs:
        parts.append(
            "drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='%s':fontcolor=0xE8EBF2:"
            "fontsize=44:x=(w-text_w)/2:y=h-150:enable='between(t,%.1f,%.1f)'" % (t, a, b))
    out = os.path.join(FOOT, "promo-26s.mp4")
    ok5 = run(["-y", "-i", joined, "-vf", ",".join(parts), "-c:v", "libx264",
               "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", out])
    size = os.path.getsize(out) // 1024 if os.path.exists(out) else 0
    print("完成:", ok5, size, "KB")


if __name__ == "__main__":
    sys.exit(main())
