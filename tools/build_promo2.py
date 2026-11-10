"""build_promo2.py — 在 v1 基础上加入架构三卡与扫描线开场。"""
import glob
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\项目\ai思考可视化\dsh-workflow-monitor"
FOOT = os.path.join(ROOT, "footage")
WORK = os.path.join(FOOT, "_work2")
TMP = os.environ.get("TEMP", r"C:\Windows\Temp")
FF = r"C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
W, H = 1920, 1080
BG = (8, 9, 11)
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
        print("FF FAIL:", " ".join(args)[:100])
        print((r.stderr or "")[-300:])
    return r.returncode == 0


def backdrop(src, dim=0.22):
    im = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    return im.point(lambda v: int(v * dim))


def text_block(d, lines, start_y):
    y = start_y
    for text, sz, col, bold, gap in lines:
        fo = fn(sz, bold)
        w = d.textlength(text, font=fo)
        d.text(((W - w) / 2, y), text, font=fo, fill=col)
        y += sz + gap
    return y


def arch_card(title, lines, out_path, back):
    im = back.copy()
    d = ImageDraw.Draw(im)
    y = 300
    fo = fn(64, True)
    w = d.textlength(title, font=fo)
    d.text(((W - w) / 2, y), title, font=fo, fill=FG)
    y += 64 + 60
    d.line([(W / 2 - 220, y), (W / 2 + 220, y)], fill=(70, 74, 82), width=2)
    y += 50
    text_block(d, lines, y)
    im.save(out_path)


def scanline_title(src, out_dir, frames=45):
    """扫描线自下而上扫过，文字随之显现。"""
    os.makedirs(out_dir, exist_ok=True)
    base = backdrop(src, 0.18)
    layer = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(layer)
    text_block(d, [("AGENT TELEMETRY", 92, FG, True, 26),
                   ("智能体实时运行态势", 52, DIM, False, 34),
                   ("DeepSeek Harness 插件", 32, (72, 76, 84), False, 0)], 360)
    for i in range(frames):
        t = i / (frames - 1)
        im = base.copy()
        cut = int(H * (0.15 + 0.85 * t))
        im.paste(layer.crop((0, 0, W, cut)), (0, 0))
        d2 = ImageDraw.Draw(im)
        if cut < H - 2:
            d2.line([(0, cut), (W, cut)], fill=(240, 166, 198), width=3)
        im.save(os.path.join(out_dir, "f%04d.jpg" % i), quality=94)


def seg(name, src, extra=None, d="3"):
    target = os.path.join(TMP, name + ".mp4")
    args = ["-y"]
    args += (["-framerate", "30", "-i", src] if "%04d" in src else ["-loop", "1", "-t", d, "-i", src])
    vf = "scale=1920:1080:flags=lanczos"
    if extra:
        vf = extra + "," + vf
    args += ["-vf", vf, "-r", "30", "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", target]
    return run(args)


def main():
    os.makedirs(WORK, exist_ok=True)
    cap = os.path.join(FOOT, "cap-run")
    still = os.path.join(cap, "f0040.png")

    print("1/4 扫描线开场 + 架构三卡")
    scanline_title(still, os.path.join(WORK, "j-title"))
    back = backdrop(still, 0.16)
    arch_card("客户端半边", [
        ("浏览器里的插件，只读会话状态", 36, DIM, False, 26),
        ("useSessions · useSessionStatus · useWorkspaces", 30, (150, 155, 165), False, 26),
        ("Canvas 只画氛围，能读的字全是 DOM", 30, (150, 155, 165), False, 0),
    ], os.path.join(WORK, "arch1.png"), back)
    arch_card("宿主半边", [
        ("读浏览器拿不到的东西", 36, DIM, False, 26),
        ("内存占用 · 42 小时活动桶 · 用量聚合", 30, (150, 155, 165), False, 26),
        ("一条命名路由 /workflow-monitor/usage-v2", 30, (150, 155, 165), False, 0),
    ], os.path.join(WORK, "arch2.png"), back)
    arch_card("读日志的难点", [
        ("会话日志是拼接的 zstd 帧", 36, DIM, False, 26),
        ("Node 一次性解压只返回第一帧", 30, (150, 155, 165), False, 26),
        ("按魔数 28 B5 2F FD 切帧，逐帧解压", 30, PINK, False, 0),
    ], os.path.join(WORK, "arch3.png"), back)

    print("2/4 编码分段")
    segs = [
        ("a1", os.path.join(WORK, "j-title", "f%04d.jpg"), None, "1.5"),
        ("a2", os.path.join(TMP, "j-run", "f%04d.jpg"), None, "3"),
        ("a3", os.path.join(TMP, "j-tool", "f%04d.jpg"), None, "1.5"),
        ("a4", os.path.join(WORK, "j-top", "f%04d.jpg"), None, "3"),
        ("a5", os.path.join(WORK, "j-matrix", "f%04d.jpg"), None, "3"),
        ("a6", os.path.join(TMP, "j-idle", "f%04d.jpg"), None, "3"),
        ("a7", os.path.join(WORK, "arch1.png"), "fade=in:st=0:d=0.5", "2.6"),
        ("a8", os.path.join(WORK, "arch2.png"), "fade=in:st=0:d=0.5", "2.6"),
        ("a9", os.path.join(WORK, "arch3.png"), "fade=in:st=0:d=0.5", "2.6"),
        ("a10", os.path.join(WORK, "end.png"), "fade=in:st=0.4:d=1.0", "5"),
    ]
    oks = [seg(n, s, e, d) for n, s, e, d in segs]
    print("   分段:", oks)

    print("3/4 拼接")
    lst = os.path.join(TMP, "cc3.txt")
    with open(lst, "w", encoding="ascii") as fh:
        for n, _, _, _ in segs:
            fh.write("file '%s'\n" % os.path.join(TMP, n + ".mp4").replace("\\", "/"))
    joined = os.path.join(TMP, "joined3.mp4")
    run(["-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])

    print("4/4 烧字幕")
    subs = [
        (2.0, 4.2, "这是一块给 AI 智能体做的仪器墙"),
        (4.6, 7.2, "它此刻正在读你的会话"),
        (7.4, 9.4, "每一次工具调用，都会亮一下"),
        (9.6, 12.4, "上面这排是实时读数"),
        (12.5, 15.3, "下面这块是 42 小时的活动，越久越淡"),
        (15.4, 18.2, "空闲时它慢下来，但不装忙"),
        (18.6, 21.0, "它分两半：浏览器里的客户端"),
        (21.1, 23.5, "和读日志的宿主半边"),
        (23.6, 26.2, "日志是拼接的 zstd 帧，要按魔数切帧"),
        (26.6, 29.0, "全部开源，非商业免费"),
    ]
    parts = []
    for a, b, t in subs:
        parts.append("drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='%s':fontcolor=0xE8EBF2:"
                     "fontsize=42:x=(w-text_w)/2:y=h-150:enable='between(t,%.1f,%.1f)'" % (t, a, b))
    out = os.path.join(FOOT, "promo-31s.mp4")
    ok = run(["-y", "-i", joined, "-vf", ",".join(parts), "-c:v", "libx264", "-crf", "18",
              "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out])
    print("完成:", ok, (os.path.getsize(out) // 1024 if os.path.exists(out) else 0), "KB")


if __name__ == "__main__":
    main()
