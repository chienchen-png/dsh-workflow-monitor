"""Image fingerprint for headless screenshots.

Prints a coarse ASCII luminance map plus radial and hue profiles so composition
and palette can be judged without an image-capable model.
"""
import sys
import numpy as np
from PIL import Image

RAMP = " .:-=+*#%@"


def load(path):
    im = Image.open(path).convert("RGB")
    return im, np.asarray(im, dtype=np.float32) / 255.0


def lum(rgb):
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def ascii_map(l, cols=76, rows=30):
    h, w = l.shape
    ys = np.linspace(0, h, rows + 1).astype(int)
    xs = np.linspace(0, w, cols + 1).astype(int)
    out = []
    peak = float(l.max())
    norm = np.clip(l / (peak if peak > 1e-6 else 1.0), 0, 1)
    for r in range(rows):
        line = []
        for c in range(cols):
            block = norm[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
            v = float(block.mean()) if block.size else 0.0
            idx = min(len(RAMP) - 1, int(v ** 0.62 * (len(RAMP) - 1) + 0.5))
            line.append(RAMP[idx])
        out.append("".join(line))
    return "\n".join(out)


def radial_profile(l, bands=18):
    h, w = l.shape
    cy, cx = h / 2.0, w / 2.0
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
    rmax = min(h, w) / 2.0
    prof = []
    for i in range(bands):
        lo, hi = rmax * i / bands, rmax * (i + 1) / bands
        m = (r >= lo) & (r < hi)
        prof.append(float(l[m].mean()) if m.any() else 0.0)
    return prof


def hue_profile(rgb, bins=12):
    im = Image.fromarray((rgb * 255).astype(np.uint8)).convert("HSV")
    a = np.asarray(im, dtype=np.float32)
    h_, s_, v_ = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = (s_ > 0.18) & (v_ > 0.10)
    if not m.any():
        return [], 0.0
    hist, _ = np.histogram(h_[m], bins=bins, range=(0, 255))
    total = max(1, int(m.sum()))
    return [(int(round(b * 360 / bins)), round(float(c) / total, 3)) for b, c in enumerate(hist)], float(m.mean())


def main(path, cols=76, rows=30):
    im, rgb = load(path)
    l = lum(rgb)
    print(f"file       : {path}")
    print(f"size       : {im.size[0]}x{im.size[1]}")
    print(f"luminance  : mean={l.mean():.4f} max={l.max():.4f} p95={np.percentile(l, 95):.4f}")
    lit = float((l > 0.10).mean())
    print(f"lit pixels : {lit * 100:.1f}%   (>0.10)")
    hues, satfrac = hue_profile(rgb)
    print(f"saturated  : {satfrac * 100:.1f}%   hue bins (deg:share): " + ", ".join(f"{h}:{s}" for h, s in hues if s > 0.02))
    print("radial     : " + " ".join(f"{v:.2f}" for v in radial_profile(l)))
    print()
    print(ascii_map(l, cols, rows))


if __name__ == "__main__":
    p = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 76
    rows = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    main(p, cols, rows)
