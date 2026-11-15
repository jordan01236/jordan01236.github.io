"""Generates the small image textures used in the scene (posters, side monitor)."""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tex")
os.makedirs(OUT, exist_ok=True)
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
random.seed(3)


def font(size, bold=False):
    return ImageFont.truetype(MONO_B if bold else MONO, size)


# ---- side monitor: a tall, monochrome "system monitor" (white on black, tinted in the browser)
W, H = 720, 1200
im = Image.new("RGB", (W, H), (5, 5, 5))
d = ImageDraw.Draw(im)
f = font(19)
y = 22
d.text((22, y), "jordan@kali: ~/htb   [recon]", font=font(19, True), fill=(235, 235, 235)); y += 40
for i in range(8):
    used = random.uniform(0.08, 0.95)
    d.text((22, y), f"{i:>2}", font=f, fill=(150, 150, 150))
    d.rectangle((64, y + 4, 64 + 520, y + 18), outline=(60, 60, 60))
    d.rectangle((64, y + 4, 64 + int(520 * used), y + 18), fill=(210, 210, 210))
    d.text((604, y), f"{used * 100:4.0f}%", font=f, fill=(180, 180, 180)); y += 27
y += 16
pts = []
gy = y + 150
for x in range(0, 677, 6):
    v = 60 + 55 * math.sin(x / 47) + 28 * math.sin(x / 13 + 1) + random.uniform(-9, 9)
    pts.append((22 + x, gy - v))
d.rectangle((22, y, 698, gy + 10), outline=(55, 55, 55))
d.line(pts, fill=(240, 240, 240), width=3)
for gx in range(22, 698, 68):
    d.line((gx, y, gx, gy + 10), fill=(26, 26, 26))
y = gy + 34
lines = [
    "$ nmap -sC -sV -p- 10.10.11.42",
    "PORT     STATE SERVICE  VERSION",
    "22/tcp   open  ssh      OpenSSH 9.6",
    "80/tcp   open  http     nginx 1.24",
    "445/tcp  open  smb      Samba 4.19",
    "3389/tcp open  rdp",
    "5985/tcp open  winrm",
    "",
    "$ ffuf -u http://target/FUZZ -w raft.txt",
    "admin        [Status: 301, Size: 178]",
    "api          [Status: 200, Size: 42]",
    "backup       [Status: 403, Size: 153]",
    ".git         [Status: 301, Size: 178]",
    "",
    "$ tail -f loot/notes.md",
    "- creds reused on smb -> check winrm",
    "- .git exposed, dump + grep secrets",
    "- user flag: done",
    "- root: kernel? sudo -l? cron?",
    "",
    "$ _",
]
for ln in lines:
    bright = ln.startswith("$")
    d.text((22, y), ln, font=font(19, bright), fill=(245, 245, 245) if bright else (165, 165, 165))
    y += 28
im.save(os.path.join(OUT, "side_screen.png"))


# ---- poster A: big prompt glyph
W, H = 840, 1188
im = Image.new("RGB", (W, H), (9, 12, 18))
d = ImageDraw.Draw(im)
for i in range(0, H, 6):
    d.line((0, i, W, i), fill=(11, 15, 22))
d.text((90, 330), "~$", font=font(430, True), fill=(94, 234, 212))
d.rectangle((90, 860, 330, 880), fill=(94, 234, 212))
d.text((90, 930), "enumerate.", font=font(54), fill=(232, 237, 242))
d.text((90, 1000), "exploit.", font=font(54), fill=(232, 237, 242))
d.text((90, 1070), "escalate.", font=font(54), fill=(124, 140, 248))
im.save(os.path.join(OUT, "poster_a.png"))

# ---- poster B: constellation / network graph
S = 600
im = Image.new("RGB", (S, S), (232, 228, 218))
d = ImageDraw.Draw(im)
nodes = [(random.uniform(60, S - 60), random.uniform(60, S - 60)) for _ in range(26)]
for i, a in enumerate(nodes):
    for b in nodes[i + 1:]:
        if math.dist(a, b) < 150:
            d.line((*a, *b), fill=(40, 46, 60), width=3)
for i, (x, y) in enumerate(nodes):
    r = 13 if i % 7 == 0 else 8
    d.ellipse((x - r, y - r, x + r, y + r), fill=(20, 150, 135) if i % 7 == 0 else (30, 34, 44))
im.save(os.path.join(OUT, "poster_b.png"))

# ---- poster C: hex dump
W, H = 600, 420
im = Image.new("RGB", (W, H), (14, 17, 26))
d = ImageDraw.Draw(im)
y = 30
for r in range(11):
    row = " ".join(f"{random.randrange(256):02x}" for _ in range(12))
    if r == 5:
        row = "68 61 63 6b 20 74 68 65 20 62 6f 78"
    d.text((34, y), f"{r * 12:04x}  {row}", font=font(24, r == 5), fill=(94, 234, 212) if r == 5 else (110, 122, 140))
    y += 33
im.save(os.path.join(OUT, "poster_c.png"))
print("textures written to", OUT)


# ---- handheld multitool screen: black pixel UI on an orange LCD (generic, no logos)
W, H = 256, 128
im = Image.new("RGB", (W, H), (255, 138, 20))
d = ImageDraw.Draw(im)
f = font(15, True)
d.rectangle((0, 0, W, 18), fill=(20, 10, 0))
d.text((6, 1), "12:00", font=font(13, True), fill=(255, 138, 20))
for i in range(4):
    d.rectangle((W - 50 + i * 10, 14 - i * 3, W - 44 + i * 10, 15), fill=(255, 138, 20))
items = ["Sub-GHz", "125 kHz RFID", "NFC", "Infrared"]
for i, t in enumerate(items):
    y = 26 + i * 25
    if i == 0:
        d.rectangle((2, y - 2, W - 3, y + 20), fill=(20, 10, 0))
        d.text((10, y), "> " + t, font=f, fill=(255, 138, 20))
    else:
        d.text((10, y), "  " + t, font=f, fill=(20, 10, 0))
im.save(os.path.join(OUT, "multitool_screen.png"))
print("multitool screen written")
