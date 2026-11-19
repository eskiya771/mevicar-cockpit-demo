#!/usr/bin/env python3
"""Rebuild the Android OfflineWebStore package from the published Web source.

The public site and Android offline update must use the same Web build. Do
not advance offline-bundle.json without creating the matching, hashed ZIP.
"""
from pathlib import Path, PurePosixPath
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
info = json.loads((root / "build-info.json").read_text(encoding="utf-8"))
assert isinstance(info.get("build"), int) and info["build"] > 0
assert (root / "index.html").is_file() and (root / "native-updates.js").is_file()
zip_path = root / "offline-bundle.zip"
manifest_path = root / "offline-bundle.json"

excluded_roots = {".git", ".github", "scripts"}
excluded_files = {"offline-bundle.zip", "offline-bundle.json"}
files = sorted(
    (p for p in root.rglob("*")
     if p.is_file() and not p.is_symlink()
     and p.relative_to(root).parts[0] not in excluded_roots
     and p.relative_to(root).as_posix() not in excluded_files),
    key=lambda p: p.relative_to(root).as_posix(),
)
assert 50 <= len(files) <= 500, f"Unexpected file count: {len(files)}"
assert sum(p.stat().st_size for p in files) < 150_000_000

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for p in files:
        name = p.relative_to(root).as_posix()
        assert not name.startswith("/") and ".." not in PurePosixPath(name).parts
        archive.write(p, name)
with zipfile.ZipFile(zip_path) as archive:
    names = archive.namelist()
    assert len(names) == len(files)
    for required in ("index.html", "build-info.json", "native-updates.js", "nav-web-parity.js"):
        assert required in names
    bundled_info = json.loads(archive.read("build-info.json"))
    assert bundled_info == info
    assert b"Keine weiteren Ziele im Verlauf." in archive.read("nav-web-parity.js")

record = {
    "schema": 1,
    "version": info["version"],
    "build": info["build"],
    "commit": info.get("commit", ""),
    "size": zip_path.stat().st_size,
    "sha256": hashlib.sha256(zip_path.read_bytes()).hexdigest(),
    "files": len(files),
}
manifest_path.write_text(json.dumps(record, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(f"Android offline package build {record['build']}: {record['files']} files, {record['size']} bytes")
