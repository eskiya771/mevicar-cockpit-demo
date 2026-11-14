#!/usr/bin/env python3
"""Create the complete, versioned, integrity-checked Android offline Web bundle.

Run AFTER the regular Pages dist/ generation. The ZIP is intentionally served
by GitHub Pages only as a user-requested update, never read on APK launch.
"""
import hashlib
import json
import pathlib
import sys
import zipfile

dist = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist").resolve()
info = json.loads((dist / "build-info.json").read_text(encoding="utf-8"))
build = info.get("build")
assert type(build) is int and 1 <= build < 2_100_000_000, "invalid Web build"
assert (dist / "index.html").is_file(), "missing HTML entrypoint"

archive = dist / "offline-bundle.zip"
manifest = dist / "offline-bundle.json"
files = sorted(
    p for p in dist.rglob("*")
    if p.is_file() and p.resolve() not in (archive, manifest)
    and not p.is_symlink()
)
assert files and len(files) <= 500, "unexpected offline asset count"
total = sum(p.stat().st_size for p in files)
assert total < 150_000_000, "offline distribution too large"

with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
    for file in files:
        name = file.relative_to(dist).as_posix()
        assert not name.startswith("/") and ".." not in pathlib.PurePosixPath(name).parts
        output.write(file, name)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
record = {
    "schema": 1,
    "version": info["version"],
    "build": build,
    "commit": info.get("commit", ""),
    "size": archive.stat().st_size,
    "sha256": digest,
    "files": len(files),
}
manifest.write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
with zipfile.ZipFile(archive) as verified:
    assert "index.html" in verified.namelist()
    assert "build-info.json" in verified.namelist()
    assert "native-updates.js" in verified.namelist()
    assert len(verified.namelist()) == len(files)
print(f"Offline Web bundle: build {build} / {len(files)} assets / {total} unpacked / {record['size']} zipped")
