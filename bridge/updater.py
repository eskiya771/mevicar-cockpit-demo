#!/usr/bin/env python3
"""MeviTV Synology host updater. Run every minute as a trusted DSM scheduled task.
Never expose this script as an HTTP service and never mount docker.sock into MeviTV.
Install Python 3 on the NAS and set MEVITV_BRIDGE_DIR if needed.
"""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

BASE = Path(os.environ.get("MEVITV_BRIDGE_DIR", "/volume1/docker/mevitv-bridge")).resolve()
MAIL = BASE / "update-control"
STATE = MAIL / "status.json"
REQUEST = MAIL / "request.json"
LOCK = BASE / ".updater.lock"
REPO = "eskiya771/mevicar-cockpit-demo"
FILES = ("server.cjs", "hls.cjs", "remux.cjs", "Dockerfile", "compose.yaml")
SHA = re.compile(r"^[a-f0-9]{40}$")
PERIOD = 30 * 60

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}

def save_status(data):
    MAIL.mkdir(mode=0o770, parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".status-", dir=str(MAIL))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, separators=(",", ":"))
        os.chmod(name, 0o644)
        os.replace(name, STATE)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def download(url, cap=1_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": "MeviTV-Synology-Updater/1", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=25) as response:
        data = response.read(cap + 1)
    if len(data) > cap:
        raise RuntimeError("Downloaded GitHub file exceeds limit")
    return data

def remote_version():
    url = "https://api.github.com/repos/" + REPO + "/commits?sha=main&path=bridge&per_page=1"
    commits = json.loads(download(url, 200_000))
    if not isinstance(commits, list) or not commits:
        raise RuntimeError("GitHub did not return bridge commits")
    commit = commits[0]["sha"]
    if not SHA.fullmatch(commit):
        raise RuntimeError("Invalid GitHub commit SHA")
    return commit

def docker(*args):
    return subprocess.run(["docker", "compose", *args], cwd=BASE, check=True,
                          timeout=240, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def healthy():
    for _ in range(20):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8787/health", timeout=3) as response:
                if json.load(response).get("status") == "ready":
                    return True
        except (OSError, ValueError):
            pass
        time.sleep(2)
    return False

def install(target):
    if not SHA.fullmatch(target):
        raise RuntimeError("Invalid pinned update SHA")
    staging = Path(tempfile.mkdtemp(prefix=".update-", dir=BASE))
    originals = {}
    try:
        # Immutable GitHub commit URLs, fixed file allowlist; never touch .env.
        for name in FILES:
            data = download("https://raw.githubusercontent.com/" + REPO + "/" + target + "/bridge/" + name)
            if not data:
                raise RuntimeError("Missing " + name)
            (staging / name).write_bytes(data)
        for name in FILES:
            path = BASE / name
            originals[name] = path.read_bytes() if path.exists() else None
        try:
            for name in FILES:
                os.replace(staging / name, BASE / name)
            docker("up", "-d", "--build")
            if not healthy():
                raise RuntimeError("Health check failed after deployment")
        except Exception as exc:
            for name, data in originals.items():
                if data is None:
                    (BASE / name).unlink(missing_ok=True)
                else:
                    (BASE / name).write_bytes(data)
            try:
                docker("up", "-d", "--build")
            except Exception as rollback_error:
                raise RuntimeError("Update failed; rollback also failed: " + str(rollback_error)[:120]) from exc
            raise RuntimeError("Update failed; previous files restored: " + str(exc)[:140]) from exc
    finally:
        shutil.rmtree(staging, ignore_errors=True)

def main():
    if not BASE.is_dir() or not (BASE / "compose.yaml").is_file():
        raise RuntimeError("Incorrect Synology bridge directory")
    MAIL.mkdir(mode=0o770, parents=True, exist_ok=True)
    with LOCK.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        state = read_json(STATE)
        installed = state.get("installed") if SHA.fullmatch(str(state.get("installed", ""))) else None
        latest = state.get("latest") if SHA.fullmatch(str(state.get("latest", ""))) else None
        checked = state.get("checked_epoch", 0)
        if not isinstance(checked, (int, float)):
            checked = 0
        if time.time() - checked >= PERIOD or not latest:
            try:
                latest = remote_version()
                state.update(latest=latest, checked_at=now(), checked_epoch=time.time(),
                             message="", state="ready")
            except Exception as exc:
                state.update(state="check_failed", message="GitHub check failed: " + str(exc)[:140])
        state["installed"] = installed
        state["available"] = bool(latest and latest != installed)
        # Existing update command must be consumed once, never automatically created.
        if REQUEST.is_file():
            pending = MAIL / ".request-processing.json"
            try:
                os.replace(REQUEST, pending)
                req = read_json(pending)
                target = req.get("target")
                if target != latest or not SHA.fullmatch(str(target)):
                    raise RuntimeError("Requested version does not match last checked GitHub version")
                # Check GitHub again before applying to avoid a stale or substituted target.
                if remote_version() != target:
                    raise RuntimeError("GitHub version has changed; refresh before updating")
                state.update(state="installing", message="Installing requested update")
                save_status(state)
                install(target)
                installed = target
                state.update(installed=installed, state="ready", message="Update installed successfully")
            except Exception as exc:
                state.update(state="update_failed", message=str(exc)[:180])
            finally:
                pending.unlink(missing_ok=True)
        state["available"] = bool(latest and installed != latest)
        save_status(state)

if __name__ == "__main__":
    main()
