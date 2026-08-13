#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/frontend/android"
SDK_DIR="${ANDROID_HOME:-$ROOT_DIR/.android-sdk}"

failures=0

check_file() {
  local label="$1"
  local path="$2"
  if [[ -f "$path" ]]; then
    printf "OK   %s\n" "$label"
  else
    printf "MISS %s: %s\n" "$label" "$path"
    failures=$((failures + 1))
  fi
}

check_dir() {
  local label="$1"
  local path="$2"
  if [[ -d "$path" ]]; then
    printf "OK   %s\n" "$label"
  else
    printf "MISS %s: %s\n" "$label" "$path"
    failures=$((failures + 1))
  fi
}

printf "Oracle Messenger Android preflight\n"
printf "Root: %s\n" "$ROOT_DIR"
printf "SDK:  %s\n\n" "$SDK_DIR"

node "$ROOT_DIR/scripts/sync-android-google-services.js"

check_dir "Android SDK" "$SDK_DIR"
check_file "Android local.properties" "$ANDROID_DIR/local.properties"
check_file "Firebase google-services.json" "$ANDROID_DIR/app/google-services.json"
check_file "Upload keystore" "$ROOT_DIR/.secrets/android/oracle-messenger-upload.jks"
check_file "Keystore password" "$ROOT_DIR/.secrets/android/gh-secret-files/ORACLE_MESSENGER_KEYSTORE_PASSWORD"
check_file "Key alias" "$ROOT_DIR/.secrets/android/gh-secret-files/ORACLE_MESSENGER_KEY_ALIAS"
check_file "Key password" "$ROOT_DIR/.secrets/android/gh-secret-files/ORACLE_MESSENGER_KEY_PASSWORD"

if [[ -x "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]]; then
  printf "\nInstalled SDK packages:\n"
  "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK_DIR" --list_installed || true
fi

if [[ "$failures" -gt 0 ]]; then
  printf "\nPreflight failed with %s missing item(s).\n" "$failures"
  exit 1
fi

printf "\nPreflight OK.\n"
