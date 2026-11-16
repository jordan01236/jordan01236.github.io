#!/usr/bin/env python3
"""Adds search and link-preview tags to every page, lazy-loads post images, and writes sitemap.xml.

Run it from the repo root after adding a post to posts.json:

    python3 tools/site/meta.py

It only rewrites the block between the "site-meta" comments, so it is safe to run again.
"""
import html
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://hackwithjordan.com"
IMAGE = f"{SITE}/assets/room/poster.jpg"
START, END = "<!-- site-meta -->", "<!-- /site-meta -->"

PAGES = {
    "index.html": ("HackWithJordan — Security Writeups", None, "/"),
    "blog.html": ("Writeups — HackWithJordan", None, "/blog.html"),
    "about.html": ("About — HackWithJordan", None, "/about.html"),
}


def block(title, desc, url, kind, date=None, with_description=True):
    t, d = html.escape(title, quote=True), html.escape(desc, quote=True)
    lines = [START]
    if with_description:
        lines.append(f'<meta name="description" content="{d}">')
    lines += [
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:type" content="{kind}">',
        '<meta property="og:site_name" content="HackWithJordan">',
        f'<meta property="og:title" content="{t}">',
        f'<meta property="og:description" content="{d}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{IMAGE}">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    if date:
        lines.append(f'<meta property="article:published_time" content="{date}">')
    lines.append(END)
    return "\n    ".join(lines)


PLATFORMS = {"htb": "Hack The Box", "vulnlab": "VulnLab", "pg": "Proving Grounds"}


def describe(post):
    """The post's excerpt. Without one: a plain line naming the machine and where it is from."""
    if post.get("excerpt", "").strip():
        return post["excerpt"].strip()
    prefix, _, name = post["title"].partition(":")
    platform = PLATFORMS.get(prefix.strip().lower())
    if platform and name.strip():
        return f"Walkthrough of the {platform} machine {name.strip()}, from first foothold to full compromise."
    return f"{post['title']}: a penetration testing walkthrough, from first foothold to full compromise."


def put(text, new_block):
    """Replace the existing block, or add one right after </title>."""
    if START in text:
        return re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: new_block, text, count=1, flags=re.S)
    return text.replace("</title>", "</title>\n    " + new_block, 1)


def lazy_images(text):
    """Every image after the first loads only when it is about to scroll into view."""
    seen = 0

    def one(m):
        nonlocal seen
        seen += 1
        tag = m.group(0)
        if seen == 1 or "loading=" in tag:
            return tag
        return tag[:4] + ' loading="lazy" decoding="async"' + tag[4:]

    return re.sub(r"<img\b[^>]*>", one, text)


def main():
    posts = json.loads((ROOT / "posts.json").read_text(encoding="utf-8"))["posts"]
    urls = [(SITE + "/", None), (SITE + "/blog.html", None), (SITE + "/about.html", None)]

    for name, (title, _, path) in PAGES.items():
        f = ROOT / name
        text = f.read_text(encoding="utf-8")
        desc = re.search(r'<meta name="description" content="([^"]*)"', text)
        # These pages already have a hand-written description; reuse it for the preview.
        new = put(text, block(title, html.unescape(desc.group(1)) if desc else title, SITE + path, "website", with_description=False))
        if new != text:
            f.write_text(new, encoding="utf-8")

    changed = 0
    for post in posts:
        f = ROOT / post["filename"]
        if not f.exists():
            print("missing:", post["filename"])
            continue
        url = f"{SITE}/{quote(post['filename'], safe='/()')}"
        urls.append((url, post["date"]))
        text = f.read_text(encoding="utf-8")
        new = lazy_images(put(text, block(post["title"], describe(post), url, "article", post["date"])))
        if new != text:
            f.write_text(new, encoding="utf-8")
            changed += 1

    rows = "".join(
        f"  <url><loc>{html.escape(u)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>\n" for u, d in urls
    )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + rows + "</urlset>\n",
        encoding="utf-8",
    )
    print(f"{changed} posts updated, {len(urls)} URLs in sitemap.xml")


if __name__ == "__main__":
    main()
