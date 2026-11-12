#!/usr/bin/env python3
"""Prepare a repeatable Android debug build; never edits the PWA or its source files."""
from pathlib import Path
import os
import re

root=Path("android/app")
gradle=root/"build.gradle"
manifest=root/"src/main/AndroidManifest.xml"
if not gradle.is_file() or not manifest.is_file():
    raise SystemExit("Missing generated Capacitor Android application")

version=Path("VERSION").read_text().strip()
if not re.fullmatch(r"\d+\.\d+\.\d+",version):
    raise SystemExit("Invalid product version")
build_number=int(os.environ.get("GITHUB_RUN_NUMBER","1"))
if not 1<=build_number<2_100_000_000:
    raise SystemExit("Invalid Android versionCode")

source=gradle.read_text()
source,count=re.subn(r'(\bversionName\s+)"[^"]+"',lambda m:m.group(1)+'"'+version+'"',source,count=1)
if count!=1:
    raise SystemExit("Unable to set Android versionName")
source,count=re.subn(r'(\bversionCode\s+)\d+',lambda m:m.group(1)+str(build_number),source,count=1)
if count!=1:
    raise SystemExit("Unable to set Android versionCode")
gradle.write_text(source)

source=manifest.read_text()
activity=re.search(r'<activity\b[^>]*android:name="\.MainActivity"[^>]*>',source,re.S)
if not activity:
    raise SystemExit("Unable to find Android main activity")
tag=activity.group()
if "android:screenOrientation=" not in tag:
    tag=tag.replace('android:name=".MainActivity"',
                    'android:name=".MainActivity" android:screenOrientation="sensorLandscape"')
    source=source[:activity.start()]+tag+source[activity.end():]
manifest.write_text(source)

# Replace the template's Capacitor launcher icon with our existing MeviCar PWA icon.
from PIL import Image
icon=Image.open("dist/icon-512.png").convert("RGBA")
res=root/"src/main/res"
for density,size in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    folder=res/("mipmap-"+density)
    folder.mkdir(parents=True,exist_ok=True)
    output=icon.resize((size,size),Image.Resampling.LANCZOS)
    output.save(folder/"ic_launcher.png")
    output.save(folder/"ic_launcher_round.png")
# Remove adaptive launcher icon resources derived from the Capacitor template.
# The bitmap icons above will be selected for all density configurations.
for name in ["ic_launcher.xml","ic_launcher_round.xml"]:
    file=res/"mipmap-anydpi-v26"/name
    if file.exists():
        file.unlink()
print(f"Prepared MeviCar Next Android {version} (build {build_number}): landscape and launcher icons")
