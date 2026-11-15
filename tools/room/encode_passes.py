"""
Turns the linear EXR light-group passes into the 8-bit WebP textures the page
loads, plus a tone-mapped preview that mirrors the shader in assets/js/room.js.

    python3 encode_passes.py <render dir> <output dir> [--quality 88]

Encoding per pass:  stored = clamp(linear / RANGE) ** (1 / 2.2)
"""
import argparse
import glob
import json
import os

import bpy
import numpy as np
from PIL import Image

RANGE = {"base": 2.0, "lamp": 6.0, "accent": 6.0, "screen": 3.0}
ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--quality", type=int, default=94)
args = ap.parse_args()
os.makedirs(args.dst, exist_ok=True)


def load(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1, :, :3]


def aces(x):
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


TEAL = np.array([0.369, 0.918, 0.831]) ** 2.2
sizes = {}
for tag in ("wide", "close"):
    lin = {}
    for g, rng in RANGE.items():
        hits = sorted(glob.glob(os.path.join(args.src, tag, f"*{g}*.exr")))
        if not hits:
            continue
        lin[g] = np.maximum(load(hits[-1]), 0)
        sizes[tag] = [lin[g].shape[1], lin[g].shape[0]]
        enc = np.clip(lin[g] / rng, 0, 1) ** (1 / 2.2)
        Image.fromarray((enc * 255 + 0.5).astype(np.uint8)).save(
            os.path.join(args.dst, f"{tag}_{g}.webp"), quality=args.quality, method=6)
    if len(lin) < 4:
        print("skip", tag, list(lin))
        continue
    for name, lamp, tint in (("on", 1.0, TEAL), ("off", 0.0, TEAL), ("root", 1.0, np.array([1.0, 0.07, 0.07]))):
        c = lin["base"] + lamp * lin["lamp"] + (lin["accent"] * 1.0 + lin["screen"] * 0.9) * tint
        out = aces(c * 1.0) ** (1 / 2.2)
        Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(os.path.join(args.src, f"preview_{tag}_{name}.jpg"), quality=90)
    print(tag, {g: (float(v.mean()), float(np.percentile(v, 99.5))) for g, v in lin.items()})

src_meta = os.path.join(args.src, "room.json")
if os.path.exists(src_meta):
    meta = json.load(open(src_meta))
    meta["range"] = RANGE
    if "wide" in sizes:
        meta["size"] = sizes["wide"]
    json.dump(meta, open(os.path.join(args.dst, "room.json"), "w"), indent=1)
