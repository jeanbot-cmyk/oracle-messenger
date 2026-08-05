#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/frontend/android"
SDK_DIR="${ANDROID_HOME:-$ROOT_DIR/.android-sdk}"
SECRET_DIR="$ROOT_DIR/.secrets/android/gh-secret-files"

export ANDROID_HOME="$SDK_DIR"
export ORACLE_MESSENGER_KEYSTORE_FILE="$ROOT_DIR/.secrets/android/oracle-messenger-upload.jks"
export ORACLE_MESSENGER_KEYSTORE_PASSWORD="$(tr -d '\r\n' < "$SECRET_DIR/ORACLE_MESSENGER_KEYSTORE_PASSWORD")"
export ORACLE_MESSENGER_KEY_ALIAS="$(tr -d '\r\n' < "$SECRET_DIR/ORACLE_MESSENGER_KEY_ALIAS")"
export ORACLE_MESSENGER_KEY_PASSWORD="$(tr -d '\r\n' < "$SECRET_DIR/ORACLE_MESSENGER_KEY_PASSWORD")"
BUILD_DATE="$(date -u +%Y%m%d)"
export ORACLE_MESSENGER_VERSION_CODE="${ORACLE_MESSENGER_VERSION_CODE:-${BUILD_DATE}01}"
export ORACLE_MESSENGER_VERSION_NAME="${ORACLE_MESSENGER_VERSION_NAME:-1.0.$BUILD_DATE.1}"

if [[ ! -f "$ANDROID_DIR/app/google-services.json" ]]; then
  printf "WARNING: app/google-services.json is missing. AAB can build, but native FCM push will not work.\n" >&2
fi

printf "Building Oracle Messenger Android release versionCode=%s versionName=%s\n" \
  "$ORACLE_MESSENGER_VERSION_CODE" \
  "$ORACLE_MESSENGER_VERSION_NAME"

cd "$ROOT_DIR/frontend"
npx cap sync android

cd "$ANDROID_DIR"
./gradlew :app:bundleRelease --no-daemon

printf "\nAAB generated at:\n%s\n" "$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
