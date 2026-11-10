"""build_v5.py — 修 mock 矩阵数据（越久越淡可见）→ 重捕矩阵段 → 替换分段 → 重烧字幕。"""
import glob
import os
import re
import subprocess

from PIL import Image

ROOT = r"D:\项目\ai思考可视化\dsh-workflow-monitor"
FOOT = os.path.join(ROOT, "footage")
TMP = os.environ.get("TEMP", r"C:\Windows\Temp")
FF = r"C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
PY = r"C:\Users\HW\.dsh\dsh-runtimes\dsh-next-primary-runtime\dependencies\python\python.exe"
W, H = 1920, 1080


def run(args, quiet=True):
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if r.returncode != 0 and not quiet:
        print("FAIL", " ".join(args)[:90], (r.stderr or "")[-200:])
    return r.returncode == 0


def patch_mock():
    p = os.path.join(ROOT, "lab", "host.html")
    s = open(p, encoding="utf-8").read()
    old = ("  var buckets = function(seed){ var a=[]; for(var i=0;i<28;i++){ "
           "a.push(((i*seed)%7===0)?12:((i*seed)%3===0?3:0)); } return a; };")
    new = ("  var buckets = function(seed){ var a=[]; for(var i=0;i<28;i++){ "
           "var age=(27-i)/27; var dens=age*age; var v=0; "
           "if(((i*seed)%5)!==0) v=Math.round(2+dens*22); if(age<0.35&&((i+seed)%3)!==0) v=0; "
           "a.push(v); } return a; };")
    if old in s:
        open(p, "w", encoding="utf-8").write(s.replace(old, new))
        print("mock 已改为时间衰减分布")
    else:
        print("mock 未匹配（可能已改过）")


def capture(frames=30):
    out = os.path.join(FOOT, "cap-mx")
    if os.path.exists(out):
        for f in glob.glob(os.path.join(out, "*.png")):
            os.remove(f)
    url = "http://127.0.0.1:8791/lab/host.html?mode=run&mock=history&clean=1"
    ok = run(["node", os.path.join(ROOT, "tools", "capture.mjs"), url, out, str(frames), "16.7", "1920", "1080"])
    n = len(glob.glob(os.path.join(out, "*.png")))
    print("捕获帧:", n, ok)
    return out


def closeup(src_dir, box, frames, out_dir, z0=1.0, z1=1.4):
    os.makedirs(out_dir, exist_ok=True)
    fs = sorted(glob.glob(os.path.join(src_dir, "*.png")))
    base = Image.open(fs[len(fs) // 2]).convert("RGB").resize((W, H), Image.LANCZOS)
    x0, y0, x1, y1 = box
    for i in range(frames):
        t = i / max(1, frames - 1)
        z = z0 + (z1 - z0) * t
        cw, ch = int((x1 - x0) / z), int((y1 - y0) / z)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        l = max(0, min(base.width - cw, cx - cw // 2))
        tp = max(0, min(base.height - ch, cy - ch // 2))
        base.crop((l, tp, l + cw, tp + ch)).resize((W, H), Image.LANCZOS).save(
            os.path.join(out_dir, "f%04d.jpg" % i), quality=94)


def seg(name, src, d="3"):
    return run([FF, "-y", "-framerate", "30", "-i", src, "-vf",
                "scale=1920:1080:flags=lanczos", "-r", "30", "-c:v", "libx264",
                "-crf", "17", "-pix_fmt", "yuv420p", os.path.join(TMP, name + ".mp4")])


def main():
    patch_mock()
    src = capture(30)
    print("生成矩阵特写帧")
    closeup(src, (1180, 760, 1920, 1080), 90, os.path.join(TMP, "j-mx2"))
    print("编码分段 a5b")
    ok = seg("a5b", os.path.join(TMP, "j-mx2", "f%04d.jpg"))
    order = ["a1", "a2", "a3", "a4", "a5b", "a6", "a7", "a8", "a9", "a11", "a12", "a10"]
    lst = os.path.join(TMP, "cc5.txt")
    with open(lst, "w", encoding="ascii") as fh:
        for n in order:
            fh.write("file '%s'\n" % os.path.join(TMP, n + ".mp4").replace("\\", "/"))
    joined = os.path.join(TMP, "joined5.mp4")
    okj = run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])
    print("拼接:", ok, okj)
    return joined


if __name__ == "__main__":
    main()
