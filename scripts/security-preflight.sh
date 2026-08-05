#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Oracle Messenger security preflight"

fail=0

check_ignored() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    echo "INFO missing optional secret file: $path"
    return
  fi
  if git check-ignore -q "$path"; then
    echo "OK   ignored by Git: $path"
  else
    echo "FAIL not ignored by Git: $path"
    fail=1
  fi
}

check_not_tracked() {
  local path="$1"
  if git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    echo "FAIL tracked secret file: $path"
    fail=1
  else
    echo "OK   not tracked: $path"
  fi
}

check_ignored ".secrets/firebase-admin.json"
check_ignored ".secrets/android/oracle-messenger-upload.jks"
check_ignored ".secrets/android/android-upload-key.txt"
check_ignored "frontend/android/app/google-services.json"

check_not_tracked ".secrets/firebase-admin.json"
check_not_tracked ".secrets/android/oracle-messenger-upload.jks"
check_not_tracked ".secrets/android/android-upload-key.txt"
check_not_tracked "frontend/android/app/google-services.json"

tracked_hits="$(
  git grep -n -I -E -e '-----BEGIN PRIVATE KEY-----|firebase-adminsdk|LIVEKIT_API_SECRET=.+|JWT_SECRET=.{20,}|GOOGLE_CLIENT_SECRET=.{10,}' -- \
    ':!docs' ':!scripts/security-preflight.sh' ':!.env.example' || true
)"

if [[ -n "$tracked_hits" ]]; then
  echo "FAIL sensitive pattern found in tracked files:"
  echo "$tracked_hits"
  fail=1
else
  echo "OK   no private-key/admin-secret pattern in tracked source files"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "Security preflight FAILED"
  exit 1
fi

echo "Security preflight OK."
