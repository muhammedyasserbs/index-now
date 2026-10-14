#!/usr/bin/env python3
"""Static checks for the GitHub Pages site in docs/.

Checks: canonical URLs, Open Graph / Twitter image, local asset references,
JSON-LD parsing, sitemap coverage, robots.txt, and no third-party font hosts.
Run from anywhere: python3 scripts/check_site.py
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
BASE = "https://muhammedyasserbs.github.io/index-now/"
FORBIDDEN_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com")

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonical = None
        self.meta: dict[str, str] = {}
        self.links: list[str] = []
        self.scripts_ld: list[str] = []
        self._in_ld = False
        self._ld_buf: list[str] = []
        self.html_lang = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.html_lang = a.get("lang")
        if tag == "link":
            if a.get("rel") == "canonical":
                self.canonical = a.get("href")
            if a.get("href"):
                self.links.append(a["href"])
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key and a.get("content") is not None:
                self.meta[key] = a["content"]
        if tag == "script":
            if a.get("type") == "application/ld+json":
                self._in_ld = True
                self._ld_buf = []
            if a.get("src"):
                self.links.append(a["src"])
        if tag in ("img", "source") and a.get("src"):
            self.links.append(a["src"])
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])

    def handle_endtag(self, tag):
        if tag == "script" and self._in_ld:
            self.scripts_ld.append("".join(self._ld_buf))
            self._in_ld = False

    def handle_data(self, data):
        if self._in_ld:
            self._ld_buf.append(data)


def page_path(html_file: Path) -> str:
    rel = html_file.relative_to(DOCS).as_posix()
    if rel == "index.html":
        return BASE
    return BASE + rel[: -len("index.html")]


def check_page(html_file: Path) -> None:
    rel = html_file.relative_to(DOCS).as_posix()
    text = html_file.read_text(encoding="utf-8")
    p = PageParser()
    p.feed(text)
    expected = page_path(html_file)

    if not p.html_lang:
        err(f"{rel}: <html> is missing lang")
    if p.canonical != expected:
        err(f"{rel}: canonical is {p.canonical!r}, expected {expected!r}")
    if p.meta.get("og:url") != expected:
        err(f"{rel}: og:url is {p.meta.get('og:url')!r}, expected {expected!r}")
    if p.meta.get("twitter:card") != "summary_large_image":
        err(f"{rel}: twitter:card should be summary_large_image")

    og_image = p.meta.get("og:image", "")
    if not og_image.startswith(BASE):
        err(f"{rel}: og:image must be an absolute URL under {BASE}")
    else:
        local = DOCS / og_image[len(BASE):]
        if not local.is_file():
            err(f"{rel}: og:image file missing: {local.relative_to(ROOT)}")
        else:
            w, h = read_png_size(local)
            if (w, h) != (1200, 630):
                err(f"{rel}: og:image must be 1200x630, got {w}x{h}")

    for ref in p.links:
        parsed = urlparse(ref)
        if parsed.scheme or ref.startswith(("#", "mailto:", "tel:", "data:")):
            if parsed.netloc and any(h in parsed.netloc for h in FORBIDDEN_HOSTS):
                err(f"{rel}: forbidden third-party font host: {ref}")
            continue
        if ref.startswith("/"):
            err(f"{rel}: root-relative reference breaks on project pages: {ref}")
            continue
        target = (html_file.parent / parsed.path).resolve()
        if parsed.path.endswith("/") or parsed.path == "":
            target = target / "index.html"
        if not target.exists():
            err(f"{rel}: broken local reference: {ref}")

    for raw in p.scripts_ld:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            err(f"{rel}: JSON-LD does not parse: {e}")
            continue
    if rel in ("index.html", "en/index.html"):
        blocks = []
        for raw in p.scripts_ld:
            try:
                blocks.append(json.loads(raw))
            except json.JSONDecodeError:
                pass
        kinds = {b.get("@type") for b in blocks}
        for needed in ("SoftwareApplication", "FAQPage"):
            if needed not in kinds:
                err(f"{rel}: missing JSON-LD {needed}")

    if re.search(r"screenshot-\d\.png", text):
        err(f"{rel}: still references a deleted screenshot PNG")
    for host in FORBIDDEN_HOSTS:
        if host in text:
            err(f"{rel}: references {host}")


def read_png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def check_sitemap(pages: set[str]) -> None:
    sm = DOCS / "sitemap.xml"
    if not sm.is_file():
        err("docs/sitemap.xml is missing")
        return
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9",
          "x": "http://www.w3.org/1999/xhtml"}
    root = ET.parse(sm).getroot()
    locs = {u.findtext("s:loc", namespaces=ns) for u in root.findall("s:url", ns)}
    for missing in sorted(pages - locs):
        err(f"sitemap.xml: missing URL {missing}")
    for extra in sorted(locs - pages):
        err(f"sitemap.xml: URL with no page {extra}")
    for u in root.findall("s:url", ns):
        alts = {a.get("hreflang") for a in u.findall("x:link", ns)}
        if alts != {"ar", "en"}:
            err(f"sitemap.xml: {u.findtext('s:loc', namespaces=ns)} needs ar and en alternates")
        if not u.findtext("s:lastmod", namespaces=ns):
            err(f"sitemap.xml: {u.findtext('s:loc', namespaces=ns)} has no lastmod")


def check_robots() -> None:
    rb = DOCS / "robots.txt"
    if not rb.is_file():
        err("docs/robots.txt is missing")
        return
    if f"Sitemap: {BASE}sitemap.xml" not in rb.read_text(encoding="utf-8"):
        err("robots.txt does not point to the sitemap")


def main() -> int:
    pages = sorted(DOCS.rglob("*.html"))
    if not pages:
        err("no HTML pages found in docs/")
    urls = {page_path(p) for p in pages}
    for page in pages:
        check_page(page)
    check_sitemap(urls)
    check_robots()
    if errors:
        print("Site checks FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"Site checks passed: {len(pages)} pages, sitemap and robots OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
