#!/usr/bin/env bash
# متجرك 🇸🇩 — بناء APK بأدوات Android SDK مباشرة (بدون Gradle)
# Usage: JAVA_HOME=... ANDROID_HOME=... ./android/build-apk.sh [output.apk]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/android"
OUT_APK="${1:-$ROOT/dist/matjarak.apk}"
BT="$ANDROID_HOME/build-tools/34.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-34/android.jar"
BUILD="$APP/build"
KEYSTORE="$APP/matjarak-release.keystore"

rm -rf "$BUILD" && mkdir -p "$BUILD/compiled" "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$(dirname "$OUT_APK")"

echo "▶ 1/6 aapt2 compile resources"
"$BT/aapt2" compile --dir "$APP/res" -o "$BUILD/compiled/res.zip"

echo "▶ 2/6 aapt2 link (manifest + R.java)"
"$BT/aapt2" link \
  -I "$PLATFORM" \
  --manifest "$APP/AndroidManifest.xml" \
  --java "$BUILD/gen" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0.0 \
  -o "$BUILD/base.apk" \
  "$BUILD/compiled/res.zip"

echo "▶ 3/6 javac"
find "$APP/src" "$BUILD/gen" -name "*.java" > "$BUILD/sources.txt"
"$JAVA_HOME/bin/javac" --release 11 -encoding UTF-8 -Xlint:-options \
  -classpath "$PLATFORM" \
  -d "$BUILD/classes" @"$BUILD/sources.txt"

echo "▶ 4/6 d8 (dex)"
find "$BUILD/classes" -name "*.class" > "$BUILD/classes.txt"
"$BT/d8" --release --min-api 24 --lib "$PLATFORM" --output "$BUILD/dex" @"$BUILD/classes.txt"

echo "▶ 5/6 package + zipalign"
cp "$BUILD/base.apk" "$BUILD/unsigned.apk"
( cd "$BUILD/dex" && zip -q "$BUILD/unsigned.apk" classes.dex )
"$BT/zipalign" -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"

echo "▶ 6/6 sign (apksigner)"
if [ ! -f "$KEYSTORE" ]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -v -keystore "$KEYSTORE" -storetype PKCS12 \
    -alias matjarak -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass matjarak2026 -keypass matjarak2026 \
    -dname "CN=Matjarak, OU=Mobile, O=Matjarak SD, L=Khartoum, C=SD" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:matjarak2026 --key-pass pass:matjarak2026 \
  --ks-key-alias matjarak --out "$OUT_APK" "$BUILD/aligned.apk"
"$BT/apksigner" verify --verbose "$OUT_APK" | head -n 4

echo "✅ APK: $OUT_APK ($(du -h "$OUT_APK" | cut -f1))"
