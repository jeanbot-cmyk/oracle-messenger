#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="${ANDROID_HOME:-$ROOT_DIR/.android-sdk}"
ADB="${ANDROID_ADB:-}"
if [[ -z "$ADB" && -x "$SDK_DIR/platform-tools/adb" ]]; then
  ADB="$SDK_DIR/platform-tools/adb"
fi
if [[ -z "$ADB" ]]; then
  ADB="$(command -v adb || true)"
fi
LOG_DIR="$ROOT_DIR/test-artifacts/android-calls/$(date +%Y%m%d-%H%M%S)"

if [[ ! -x "$ADB" ]]; then
  echo "adb not found. Install android-tools-adb or set ANDROID_ADB=/path/to/adb."
  exit 1
fi

mkdir -p "$LOG_DIR"

"$ADB" start-server >/dev/null 2>&1 || true

if [[ -n "${ANDROID_ADB_CONNECT_HOSTS:-}" ]]; then
  IFS=', ' read -r -a ADB_HOSTS <<< "$ANDROID_ADB_CONNECT_HOSTS"
  for host in "${ADB_HOSTS[@]}"; do
    [[ -z "$host" ]] && continue
    "$ADB" connect "$host" || true
  done
fi

mapfile -t DEVICES < <("$ADB" devices | awk 'NR>1 && $2=="device"{print $1}')
if [[ "${#DEVICES[@]}" -lt 2 ]]; then
  echo "Connect at least 2 Android phones with USB debugging enabled."
  echo "For Wi-Fi ADB, set ANDROID_ADB_CONNECT_HOSTS=\"PHONE_A_IP:5555,PHONE_B_IP:5555\"."
  "$ADB" devices
  exit 1
fi

echo "Using devices:"
printf ' - %s\n' "${DEVICES[@]:0:2}"
echo
echo "Logs will be saved in: $LOG_DIR"
echo "Open Oracle Messenger on both phones, connect with two different accounts, then run the call matrix from docs/android-real-device-call-test.md."
echo "Press Ctrl+C when tests are finished."

cleanup() {
  echo
  echo "Stopping log capture..."
  jobs -p | xargs -r kill 2>/dev/null || true
  echo "Saved logs:"
  find "$LOG_DIR" -type f -maxdepth 1 -print
}
trap cleanup EXIT

for device in "${DEVICES[@]:0:2}"; do
  "$ADB" -s "$device" logcat -c || true
  "$ADB" -s "$device" logcat -v time > "$LOG_DIR/$device.log" &
done

wait
