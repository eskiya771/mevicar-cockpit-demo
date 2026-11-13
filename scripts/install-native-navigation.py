#!/usr/bin/env python3
"""Install the native Google Navigation SDK bridge in generated Capacitor Android project."""
from pathlib import Path
import re
root=Path("android/app")
source=Path("native-navigation")
dest=root/"src/main/java/de/mevicar/next"
dest.mkdir(parents=True,exist_ok=True)
for name in ("MeviNavigationActivity.java","MeviNativeNavigationPlugin.java"):
    (dest/name).write_text((source/name).read_text())
main=root/"src/main/java/de/mevicar/next/MainActivity.java"
if not main.exists():
    raise SystemExit("Capacitor generated MainActivity not found")
text=main.read_text()
if "registerPlugin(MeviNativeNavigationPlugin.class)" not in text:
    # Capacitor registers manually supplied custom native plugin before BridgeActivity.onCreate.
    text=text.replace("super.onCreate(savedInstanceState);",
       "registerPlugin(MeviNativeNavigationPlugin.class);\n        super.onCreate(savedInstanceState);")
    if "registerPlugin(MeviNativeNavigationPlugin.class)" not in text:
        raise SystemExit("Cannot register native navigation plugin")
    main.write_text(text)
gradle=root/"build.gradle"
text=gradle.read_text()
marker="implementation 'com.google.android.libraries.navigation:navigation:7.9.0'"
if marker not in text:
    m=re.search(r"dependencies\s*\{",text)
    if not m: raise SystemExit("Gradle dependencies block missing")
    text=text[:m.end()]+"\n    "+marker+text[m.end():]
    gradle.write_text(text)
manifest=root/"src/main/AndroidManifest.xml"
text=manifest.read_text()
if 'android.permission.ACCESS_FINE_LOCATION' not in text:
    text=text.replace("<application",'<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>\n    <application',1)
if 'MeviNavigationActivity' not in text:
    text=text.replace("</application>",'<activity android:name="de.mevicar.next.MeviNavigationActivity" android:exported="false" android:screenOrientation="sensorLandscape"/>\n    </application>',1)
manifest.write_text(text)
print("Registered Google Navigation SDK 7.9.0, Activity and Capacitor plugin")
