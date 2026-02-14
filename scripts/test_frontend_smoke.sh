#!/usr/bin/env bash
set -euo pipefail

PORT="${FRONTEND_PORT:-3001}"
BASE_URL="http://localhost:${PORT}"

(
  cd apps/frontend
  bun run dev -- -p "$PORT" > /tmp/vote-web.log 2>&1
) &
WEB_PID=$!
trap 'kill ${WEB_PID} >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  if curl -sS "${BASE_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

curl -sS "${BASE_URL}" | rg -q "Election Console"
curl -sS "${BASE_URL}/login" | rg -q "Sign in"
curl -sS "${BASE_URL}/verify-otp" | rg -q "Verify OTP"

echo "Frontend smoke tests passed"
