"""build_v4.py — 在已有分段基础上补两张卡（交互 / 安装），重新拼接并烧新字幕。"""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\项目\ai思考可视化\dsh-workflow-monitor"
FOOT = os.path.join(ROOT, "footage")
WORK = os.path.join(FOOT, "_work2")
TMP = os.environ.get("TEMP", r"C:\Windows\Temp")
FF = r"C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
W, H = 1920, 1080
FG = (232, 235, 242)
DIM = (122, 127, 136)
PINK = (240, 166, 198)
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONT_B = r"C:\Windows\Fonts\msyhbd.ttc"


def fn(sz, bold=False):
    try:
        return ImageFont.truetype(FONT_B if bold else FONT, sz)
    except Exception:
        return ImageFont.load_default()


def run(args):
    r = subprocess.run([FF] + args, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if r.returncode != 0:
        print("FAIL:", " ".join(args)[:90], (r.stderr or "")[-200:])
    return r.returncode == 0


def backdrop(src, dim=0.16):
    im = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    return im.point(lambda v: int(v * dim))


def card(title, lines, out_path):
    im = backdrop(os.path.join(FOOT, "cap-run", "f0040.png"))
    d = ImageDraw.Draw(im)
    fo = fn(64, True)
    w = d.textlength(title, font=fo)
    d.text(((W - w) / 2, 300), title, font=fo, fill=FG)
    y = 300 + 64 + 56
    d.line([(W / 2 - 220, y), (W / 2 + 220, y)], fill=(70, 74, 82), width=2)
    y += 48
    for text, sz, col, bold, gap in lines:
        f2 = fn(sz, bold)
        w2 = d.textlength(text, font=f2)
        d.text(((W - w2) / 2, y), text, font=f2, fill=col)
        y += sz + gap
    im.save(out_path)


def seg(name, src, d="2.6"):
    target = os.path.join(TMP, name + ".mp4")
    return run(["-y", "-loop", "1", "-t", d, "-i", src, "-vf",
                "scale=1920:1080:flags=lanczos,fade=in:st=0:d=0.5", "-r", "30",
                "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", target])


def main():
    print("1/3 生成两张卡")
    card("点一下就看得更细", [
        ("会话行可点击，弹出该会话的详情", 34, DIM, False, 24),
        ("工作区 · 运行状态 · 会话 ID", 30, (150, 155, 165), False, 24),
        ("Esc 或 ✕ 关闭", 28, (110, 115, 124), False, 0),
    ], os.path.join(WORK, "arch4.png"))
    card("安装只要一句话", [
        ("把仓库地址发给你的 AI，让它帮你装", 34, DIM, False, 26),
        ("github.com/chienchen-png/dsh-workflow-monitor", 32, PINK, False, 26),
        ("装完刷新页面，左侧导航出现「监控大屏」", 28, (150, 155, 165), False, 0),
    ], os.path.join(WORK, "arch5.png"))

    print("2/3 编码 + 拼接")
    ok4 = seg("a11", os.path.join(WORK, "arch4.png"))
    ok5 = seg("a12", os.path.join(WORK, "arch5.png"))
    order = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a11", "a12", "a10"]
    lst = os.path.join(TMP, "cc4.txt")
    with open(lst, "w", encoding="ascii") as fh:
        for n in order:
            fh.write("file '%s'\n" % os.path.join(TMP, n + ".mp4").replace("\\", "/"))
    joined = os.path.join(TMP, "joined4.mp4")
    okc = run(["-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])
    print("   cards:", ok4, ok5, "concat:", okc)

    print("3/3 烧字幕")
    subs = [
        (2.0, 4.2, "这是一块给 AI 智能体做的仪器墙"),
        (4.6, 7.2, "它此刻正在读你的会话"),
        (7.4, 9.4, "每一次工具调用，都会亮一下"),
        (9.6, 12.4, "上面这排是实时读数"),
        (12.5, 15.3, "这一块是 42 小时的活动，越久越淡"),
        (15.4, 18.2, "空闲时它慢下来，但不装忙"),
        (18.6, 21.0, "它分两半：浏览器里的客户端"),
        (21.1, 23.5, "和读日志的宿主半边"),
        (23.6, 26.2, "日志是拼接的 zstd 帧，要按魔数切帧"),
        (26.6, 29.0, "会话行可以点，弹出详情"),
        (29.2, 32.0, "安装只要一句话：把地址发给你的 AI"),
        (32.4, 35.4, "全部开源，非商业免费"),
    ]
    parts = []
    for a, b, t in subs:
        parts.append("drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='%s':fontcolor=0xE8EBF2:"
                     "fontsize=42:x=(w-text_w)/2:y=h-150:enable='between(t,%.1f,%.1f)'" % (t, a, b))
    out = os.path.join(FOOT, "promo-36s.mp4")
    ok = run(["-y", "-i", joined, "-vf", ",".join(parts), "-c:v", "libx264", "-crf", "18",
              "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out])
    print("完成:", ok, (os.path.getsize(out) // 1024 if os.path.exists(out) else 0), "KB")


if __name__ == "__main__":
    main()
