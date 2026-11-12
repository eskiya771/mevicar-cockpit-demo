#!/usr/bin/env python3
"""Make the exact Pages dist safe for the embedded Capacitor WebView."""
from pathlib import Path

index = Path("dist/index.html")
html = index.read_text()
registration = "if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('PWA service worker:',err)))}"
if registration not in html:
    raise SystemExit("PWA service-worker registration changed; review Android packaging")
html = html.replace(registration, "")
# The platform abstraction is loaded only in the Android wrapper.
html = html.replace('</head>', '<script src="./meviplatform.js"></script></head>')
# This is a native bundle, not a browser-installable PWA.
html = html.replace('<link rel="manifest" href="./manifest.webmanifest">', '')
index.write_text(html)
platform = Path('meviplatform.js')
if not platform.is_file():
    raise SystemExit('Platform adapter missing')
Path('dist/meviplatform.js').write_text(platform.read_text())
sw = Path("dist/sw.js")
if sw.exists():
    sw.unlink()
print("Android assets prepared: local web bundle, no PWA service worker")
