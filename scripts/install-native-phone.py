#!/usr/bin/env python3
"""Include Classic iPhone ANCS BLE transport in the Android-only Capacitor APK.

The original Kotlin transport and protocol are copied without weakening their
permission, pairing or encrypted-GATT handling. Nothing touches GitHub Pages.
"""
from pathlib import Path
import re

android=Path("android")
app=android/"app"
dest=app/"src/main/java/de/mevicar/next"
dest.mkdir(parents=True,exist_ok=True)
source=Path("native-phone")
for filename in ("AncsProtocol.kt","AncsLink.kt","MeviPhonePlugin.java"):
    target=dest/filename
    target.write_text((source/filename).read_text())

root_gradle=android/"build.gradle"
root=root_gradle.read_text()
kotlin="classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0'"
if kotlin not in root:
    # Capacitor's Android Groovy root buildscript classpath already contains AGP.
    match=re.search(r"dependencies\s*\{",root)
    if not match:
        raise SystemExit("No Gradle buildscript dependencies available for Kotlin")
    root=root[:match.end()]+"\n        "+kotlin+root[match.end():]
    root_gradle.write_text(root)

app_gradle=app/"build.gradle"
code=app_gradle.read_text()
plugin="apply plugin: 'org.jetbrains.kotlin.android'"
if plugin not in code:
    opening="apply plugin: 'com.android.application'"
    if opening not in code: raise SystemExit("Unexpected Capacitor Android application Gradle plugin")
    code=code.replace(opening,opening+"\n"+plugin,1)
if "kotlin { compilerOptions {" not in code:
    code+="\n// ANCS Classic Kotlin modules compile to the same Java 21 bytecode as Capacitor.\n"
    code+="kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21) } }\n"
app_gradle.write_text(code)

main=dest/"MainActivity.java"
main_code=main.read_text()
line="registerPlugin(MeviPhonePlugin.class);"
if line not in main_code:
    existing="registerPlugin(MeviNativeNavigationPlugin.class);"
    if existing not in main_code:
        raise SystemExit("Register Navigation SDK before installing ANCS phone bridge")
    main_code=main_code.replace(existing,existing+"\n        "+line,1)
    main.write_text(main_code)

manifest=app/"src/main/AndroidManifest.xml"
xml=manifest.read_text()
permissions=[
    '<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />',
    '<uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />',
]
add="\n    ".join(x for x in permissions if x not in xml)
if add:
    xml=xml.replace("<application",add+"\n    <application",1)
    manifest.write_text(xml)

print("Installed original Classic ANCS Bluetooth LE client/peripheral, Capacitor phone plugin and Android BLE permissions")
