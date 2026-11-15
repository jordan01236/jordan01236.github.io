"""
Recolours a black-and-white artwork into the room's palette for the canvas on the wall.

    python3 make_painting.py <source image>   ->  tex/painting.png

Dark ink becomes deep navy; the light ground becomes a teal-to-violet gradient,
with a little canvas weave so it reads as a painting rather than a print.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tex", "painting.png")
src = Image.open(sys.argv[1]).convert("L")
# square crop around the centre, 1024 px
w, h = src.size
s = min(w, h)
src = src.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).resize((1024, 1024), Image.LANCZOS)
L = np.asarray(src, dtype=np.float32) / 255.0
lo, hi = np.percentile(L, 2), np.percentile(L, 98)
t = np.clip((L - lo) / max(hi - lo, 1e-3), 0, 1)
t = t * t * (3 - 2 * t)                                   # crisp edges, keep anti-aliasing

H = W = 1024
yy, xx = np.mgrid[0:H, 0:W] / (H - 1)
teal = np.array([45, 212, 191]) / 255.0
violet = np.array([124, 140, 248]) / 255.0
pink = np.array([255, 92, 168]) / 255.0
g = np.clip(yy * 0.85 + xx * 0.25, 0, 1)[..., None]
ground = teal * (1 - g) + violet * g
glow = np.exp(-(((xx - 0.5) ** 2) / 0.05 + ((yy - 0.92) ** 2) / 0.01))[..., None]   # warm city glow
ground = ground * (1 - 0.35 * glow) + pink * 0.35 * glow
ground *= 0.82
ink = np.array([11, 18, 32]) / 255.0
img = ink * (1 - t[..., None]) + ground * t[..., None]

rng = np.random.default_rng(7)
weave = (np.sin(xx * W * 1.4) * np.sin(yy * H * 1.4)) * 0.012 + rng.normal(0, 0.012, (H, W))
img = np.clip(img + weave[..., None], 0, 1)
out = Image.fromarray((img * 255 + 0.5).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4))
out.save(OUT)
print("wrote", OUT)
