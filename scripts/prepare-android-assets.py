#!/usr/bin/env python3
"""Make the exact Pages dist safe for the embedded Capacitor WebView."""
from pathlib import Path

index = Path("dist/index.html")
html = index.read_text()
registration = "if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('PWA service worker:',err)))}"
if registration not in html:
    raise SystemExit("PWA service-worker registration changed; review Android packaging")
html = html.replace(registration, "")
# This is a native bundle, not a browser-installable PWA.
html = html.replace('<link rel="manifest" href="./manifest.webmanifest">', '')
index.write_text(html)
sw = Path("dist/sw.js")
if sw.exists():
    sw.unlink()
print("Android assets prepared: local web bundle, no PWA service worker")
