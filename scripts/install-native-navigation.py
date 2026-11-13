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
    # Capacitor's generated MainActivity normally has no onCreate override.
    invocation="registerPlugin(MeviNativeNavigationPlugin.class);"
    if "super.onCreate(savedInstanceState);" in text:
        text=text.replace("super.onCreate(savedInstanceState);",invocation+"\n        super.onCreate(savedInstanceState);")
    else:
        opening="public class MainActivity extends BridgeActivity {"
        if opening not in text: raise SystemExit("Unexpected MainActivity")
        insert=opening+"\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        "+invocation+"\n        super.onCreate(savedInstanceState);\n    }"
        text=text.replace(opening,insert)
    if invocation not in text: raise SystemExit("Cannot register native navigation plugin")
    main.write_text(text)
gradle=root/"build.gradle"
text=gradle.read_text()
marker="implementation 'com.google.android.libraries.navigation:navigation:7.9.0'"
if marker not in text:
    m=re.search(r"dependencies\s*\{",text)
    if not m: raise SystemExit("Gradle dependencies block missing")
    text=text[:m.end()]+"\n    "+marker+text[m.end():]
    gradle.write_text(text)
# Navigation SDK 7.9.0 requires Gradle 8.13, Android Gradle plugin 8.13.2,
# and core library desugaring (Google Navigation SDK Android setup requirements).
root_gradle=Path("android/build.gradle")
root_source=root_gradle.read_text()
root_source,count=re.subn(r"com\\.android\\.tools\\.build:gradle:\\d+\\.\\d+\\.\\d+",
                         "com.android.tools.build:gradle:8.13.2",root_source)
if count<1: raise SystemExit("Unable to locate Android Gradle plugin version")
root_gradle.write_text(root_source)
text=gradle.read_text()
if "coreLibraryDesugaringEnabled true" not in text:
    if "android {" not in text: raise SystemExit("Android gradle config missing")
    text=text.replace("android {","android {\\n    compileOptions {\\n        coreLibraryDesugaringEnabled true\\n    }",1)
desugar="coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.1.5'"
if desugar not in text:
    m=re.search(r"dependencies\\s*\\{",text)
    if not m: raise SystemExit("Gradle dependencies block missing for desugaring")
    text=text[:m.end()]+"\\n    "+desugar+text[m.end():]
gradle.write_text(text)
manifest=root/"src/main/AndroidManifest.xml"
text=manifest.read_text()
if 'android.permission.ACCESS_FINE_LOCATION' not in text:
    text=text.replace("<application",'<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>\n    <application',1)
if 'MeviNavigationActivity' not in text:
    text=text.replace("</application>",'<activity android:name="de.mevicar.next.MeviNavigationActivity" android:exported="false" android:screenOrientation="sensorLandscape"/>\n    </application>',1)
manifest.write_text(text)
print("Registered Google Navigation SDK 7.9.0, Activity and Capacitor plugin")
