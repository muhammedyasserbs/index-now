#!/usr/bin/env python3
"""Static checks for the Chrome extension in index-flow/.

Checks: manifest fields and file references, icon sizes, i18n JSON and
data-i18n keys, JavaScript syntax (node --check), self-hosted font files,
and no third-party font hosts. Run: python3 scripts/check_extension.py
"""
import json
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "index-flow"
FORBIDDEN = ("fonts.googleapis.com", "fonts.gstatic.com")
MAX_DESCRIPTION = 132

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    return struct.unpack(">II", head[16:24])


def check_manifest() -> dict:
    mf = EXT / "manifest.json"
    manifest = json.loads(mf.read_text(encoding="utf-8"))
    if manifest.get("manifest_version") != 3:
        err("manifest_version must be 3")
    for key in ("name", "version", "description", "icons"):
        if not manifest.get(key):
            err(f"manifest.json missing {key}")
    if not re.fullmatch(r"\d+(\.\d+){0,3}", manifest.get("version", "")):
        err(f"invalid version: {manifest.get('version')!r}")
    if len(manifest.get("description", "")) > MAX_DESCRIPTION:
        err(f"description is longer than {MAX_DESCRIPTION} characters")

    refs: list[str] = []
    refs += list(manifest.get("icons", {}).values())
    refs += list(manifest.get("action", {}).get("default_icon", {}).values())
    bg = manifest.get("background", {}).get("service_worker")
    if bg:
        refs.append(bg)
    sp = manifest.get("side_panel", {}).get("default_path")
    if sp:
        refs.append(sp)
    for cs in manifest.get("content_scripts", []):
        refs += cs.get("js", [])
    for ref in refs:
        if not (EXT / ref).is_file():
            err(f"manifest references missing file: {ref}")

    for size, rel in manifest.get("icons", {}).items():
        path = EXT / rel
        if path.is_file():
            w, h = png_size(path)
            if (w, h) != (int(size), int(size)):
                err(f"icon {rel} is {w}x{h}, declared as {size}")
    return manifest


def check_i18n() -> set[str]:
    keys: set[str] = set()
    for path in sorted((EXT / "i18n").glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{path.name} is not valid JSON: {e}")
            continue
        if not isinstance(data, dict):
            err(f"{path.name}: top level must be a JSON object")
            continue
        for key, value in data.items():
            if not isinstance(value, str) or not value.strip():
                err(f"{path.name}: key {key!r} must map to a non-empty string")
        keys |= set(data)
    return keys


def check_html_i18n(keys: set[str]) -> None:
    for html in sorted(EXT.glob("*.html")):
        text = html.read_text(encoding="utf-8")
        for key in re.findall(r'data-i18n(?:-[a-z]+)?="([^"]+)"', text):
            if key not in keys:
                err(f"{html.name}: data-i18n key {key!r} not in i18n/*.json")


def check_js() -> None:
    node = shutil.which("node")
    if not node:
        err("node is required for JavaScript syntax checks")
        return
    for js in sorted(EXT.glob("*.js")):
        result = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
        if result.returncode != 0:
            err(f"syntax error in {js.name}: {result.stderr.strip().splitlines()[-1]}")


def check_fonts() -> None:
    css = (EXT / "side-panel.css").read_text(encoding="utf-8")
    faces = re.findall(r"@font-face\s*\{[^}]*\}", css)
    if not faces:
        err("side-panel.css has no @font-face rules")
    for face in faces:
        for rel in re.findall(r"url\(['\"]?([^'\")]+)['\"]?\)", face):
            if rel.startswith("http"):
                err(f"font loaded from remote URL: {rel}")
            elif not (EXT / rel).is_file():
                err(f"font file missing: index-flow/{rel}")
    for path in EXT.rglob("*"):
        if path.is_file() and path.suffix in (".html", ".css", ".js", ".json"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            for host in FORBIDDEN:
                if host in text:
                    err(f"{path.relative_to(ROOT)} references {host}")


def main() -> int:
    check_manifest()
    keys = check_i18n()
    check_html_i18n(keys)
    check_js()
    check_fonts()
    if errors:
        print("Extension checks FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("Extension checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
