#!/usr/bin/env python3
"""Assemble the published Web/PWA and the Android offline ZIP from one staged source snapshot."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WEB_BUILD = 1248
SOURCE_SHA = "ddd11767db047e3c23314ac1166caf533ed87969"
EXPECTED_VERSION = "0.6.6"
ALLOWED_SUFFIXES = {".js", ".css", ".html", ".json", ".mjs", ".webmanifest", ".png", ".svg", ".wasm", ".txt", ".map"}
SKIP = {"index.html", "source-index.html", "build-info.json", "proxy-release.json", "offline-bundle.json", "offline-bundle.zip"}
NEW_NAV_ASSETS = {"navigation-shared-core.js", "navigation-google.js", "nav-web-parity.js", "nav-dashboard.js", "nav-route-details.js", "nav-trip.js", "nav-trip.html", "nav-trip.css"}

with tempfile.TemporaryDirectory(prefix="mevicar-web-1248-") as temp:
    work = Path(temp)
    (work / "dist").mkdir()
    (work / "scripts").mkdir()
    (work / "bridge").mkdir()
    for entry in ROOT.iterdir():
        if entry.is_file() and entry.name not in SKIP and entry.suffix in ALLOWED_SUFFIXES:
            shutil.copy2(entry, work / entry.name)
            shutil.copy2(entry, work / "dist" / entry.name)
        elif entry.is_dir() and entry.name in {"weather", "vendor"}:
            shutil.copytree(entry, work / entry.name)
            shutil.copytree(entry, work / "dist" / entry.name)
    shutil.copy2(ROOT / "source-index.html", work / "index.html")
    shutil.copy2(ROOT / "release-src" / "build-versioned-site.py", work / "scripts" / "build-versioned-site.py")
    shutil.copy2(ROOT / "release-src" / "make-offline-bundle.py", work / "scripts" / "make-offline-bundle.py")
    (work / "VERSION").write_text(EXPECTED_VERSION + "\n", encoding="utf-8")
    old_proxy = json.loads((ROOT / "proxy-release.json").read_text(encoding="utf-8"))
    (work / "bridge" / "release.json").write_text(
        json.dumps({"version": old_proxy["version"], "build": old_proxy["build"]}), encoding="utf-8"
    )
    sw = (work / "dist" / "sw.js")
    original_sw = sw.read_text(encoding="utf-8")
    new_sw = re.sub(r"mevicar-next-shell-(?:v|build-)\d+", f"mevicar-next-shell-build-{WEB_BUILD}", original_sw)
    assert new_sw != original_sw, "Service worker build cache must rotate"
    sw.write_text(new_sw, encoding="utf-8")
    (work / "sw.js").write_text(new_sw, encoding="utf-8")
    env = {**os.environ, "BUILD_NUMBER": str(WEB_BUILD), "BUILD_SHA": SOURCE_SHA}
    subprocess.run(["python3", "scripts/build-versioned-site.py"], cwd=work, env=env, check=True)
    subprocess.run(["python3", "scripts/make-offline-bundle.py", "dist"], cwd=work, env=env, check=True)
    dist = work / "dist"
    info = json.loads((dist / "build-info.json").read_text(encoding="utf-8"))
    manifest = json.loads((dist / "offline-bundle.json").read_text(encoding="utf-8"))
    assert info == {"version": EXPECTED_VERSION, "build": WEB_BUILD, "commit": SOURCE_SHA}
    assert manifest["build"] == WEB_BUILD and manifest["commit"] == SOURCE_SHA
    assert manifest["version"] == EXPECTED_VERSION
    with zipfile.ZipFile(dist / "offline-bundle.zip") as archive:
        files = set(archive.namelist())
        assert NEW_NAV_ASSETS <= files, f"Missing shared navigation files: {NEW_NAV_ASSETS - files}"
        assert "index.html" in files and "build-info.json" in files
        assert json.loads(archive.read("build-info.json")) == info
    html = (dist / "index.html").read_text(encoding="utf-8")
    for token in ["mevicar-route-detail-script", "mevicar-shared-navigation-script", "mevicar-navigation-script",
                  "mevicar-navigation-parity-script", "mevicar-trip-script", '"build": 1248']:
        assert token in html, f"Missing compiled HTML module: {token}"
    for path in ["index.html", "build-info.json", "proxy-release.json",
                 "offline-bundle.zip", "offline-bundle.json", "sw.js"]:
        shutil.copy2(dist / path, ROOT / path)
    print("Prepared full Web/PWA + matching offline bundle B1248")
    print("HTML bytes:", (ROOT / "index.html").stat().st_size)
    print("Archive SHA-256:", hashlib.sha256((ROOT / "offline-bundle.zip").read_bytes()).hexdigest())
