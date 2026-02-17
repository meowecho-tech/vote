#!/usr/bin/env bash
set -euo pipefail

PORT="${FRONTEND_PORT:-3001}"
HOST="${FRONTEND_HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}"

(
  cd apps/frontend
  bun run dev -- -p "$PORT" -H "$HOST" > /tmp/vote-web.log 2>&1
) &
WEB_PID=$!
trap 'kill ${WEB_PID} >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  if curl -sS "${BASE_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

curl -sS "${BASE_URL}" | rg -q "Vote Platform"
curl -sS "${BASE_URL}/login" | rg -q "Sign in"
curl -sS "${BASE_URL}/verify-otp" | rg -q "Verify OTP"

echo "Frontend smoke tests passed"
