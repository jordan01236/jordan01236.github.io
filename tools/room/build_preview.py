"""
Bundles the home page (index.html) and everything it loads into one self-contained HTML file
that can be opened straight from disk (double-click), with no web server.

    python3 tools/room/build_preview.py <output.html>
"""
import base64
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SITE = "https://" + open(os.path.join(ROOT, "CNAME")).read().strip() + "/"


def read(p, mode="r"):
    with open(os.path.join(ROOT, p), mode) as f:
        return f.read()


html = read("index.html")
images = {}
for tag in ("wide", "close"):
    for g in ("base", "lamp", "accent", "screen"):
        name = f"{tag}_{g}"
        images[name] = "data:image/webp;base64," + base64.b64encode(read(f"assets/room/{name}.webp", "rb")).decode()
inline = (
    "<script>window.__POSTS__ = " + read("posts.json") + ";\n"
    "window.__ROOM__ = " + json.dumps({"meta": json.loads(read("assets/room/room.json")), "images": images}) + ";</script>\n"
)
for src in ("assets/js/terminal.js", "assets/js/desktop.js", "assets/js/kali-tools.js", "assets/js/room.js"):
    js = read(src)
    if src.endswith("terminal.js"):
        # page links should go to the live site when the file is opened from disk
        js = js.replace('go("blog.html"', f'go("{SITE}blog.html"').replace('go("about.html"', f'go("{SITE}about.html"')
        js = js.replace('go(p.filename.split("/").map(encodeURIComponent).join("/")', f'go("{SITE}" + p.filename.split("/").map(encodeURIComponent).join("/")')
    m = re.search(r'<script src="' + re.escape(src) + r'(\?v=\w+)?"></script>', html)
    assert m, src
    html = html.replace(m.group(0), (inline if src.endswith("terminal.js") else "") + "<script>\n" + js.replace("</script>", "<\\/script>") + "\n</script>")
html = re.sub(r'\s*<link rel="preload"[^>]*>', "", html)
css = read("assets/css/desktop.css")
html = re.sub(r'<link rel="stylesheet" href="assets/css/desktop\.css(\?v=\w+)?">', lambda m: "<style>\n" + css + "\n</style>", html)
html = re.sub(r'href="(index|blog|about)\.html"', lambda m: f'href="{SITE}{m.group(1)}.html"', html)
# no analytics from a local preview
html = re.sub(r"\s*<script async src=\"https://www\.googletagmanager[^<]*</script>\s*<script>.*?</script>", "", html, count=1, flags=re.S)
out = sys.argv[1]
with open(out, "w") as f:
    f.write(html)
print(out, f"{os.path.getsize(out) / 1e6:.1f} MB")
