#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

API_BASE="${API_BASE:-http://localhost:8080/api/v1}"
PG_CONTAINER="${PG_CONTAINER:-vote-postgres}"
PG_USER="${PG_USER:-vote}"
PG_DB="${PG_DB:-vote}"

cp -n infra/.env.example infra/.env >/dev/null 2>&1 || true
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d >/dev/null

# Bash 3.2 (default on macOS) does not support `mapfile`/`readarray`.
while IFS= read -r file; do
  [ -n "$file" ] || continue
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" < "$file" >/dev/null
done < <(find apps/backend/migrations -maxdepth 1 -type f -name '*.sql' | sort)

(
  cd apps/backend
  cp -n .env.example .env >/dev/null 2>&1 || true
  cargo run > /tmp/vote-api.log 2>&1
) &
API_PID=$!
trap 'kill ${API_PID} >/dev/null 2>&1 || true' EXIT

READY=0
for _ in $(seq 1 180); do
  if curl -sS http://localhost:8080/health >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -ne 1 ]; then
  echo "API did not become ready in time" >&2
  tail -n 80 /tmp/vote-api.log >&2 || true
  exit 1
fi

eval "$(bash scripts/seed_scenarios.sh --scenario student --status draft)"

get_tokens() {
  local email="$1"
  curl -sS -X POST "${API_BASE}/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${DEMO_PASSWORD}\"}" >/dev/null

  local code
  code=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc \
    "SELECT c.code FROM one_time_codes c JOIN users u ON u.id=c.user_id WHERE u.email='${email}' ORDER BY c.created_at DESC LIMIT 1;")

  curl -sS -X POST "${API_BASE}/auth/verify-otp" -H 'content-type: application/json' \
    -d "{\"email\":\"${email}\",\"code\":\"${code}\"}"
}

ADMIN_TOKENS=$(get_tokens "$DEMO_ADMIN_EMAIL")
ADMIN_ACCESS=$(echo "$ADMIN_TOKENS" | jq -r '.data.access_token')

VOTER_TOKENS=$(get_tokens "$DEMO_STUDENT_VOTER_EMAIL")
VOTER_ACCESS=$(echo "$VOTER_TOKENS" | jq -r '.data.access_token')

VOTER_PUBLISH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/publish" \
  -H "authorization: Bearer ${VOTER_ACCESS}")
[ "$VOTER_PUBLISH_STATUS" = "403" ]

curl -sS -X PATCH "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/publish" \
  -H "authorization: Bearer ${ADMIN_ACCESS}" >/dev/null

PRE_RESULT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/results" \
  -H "authorization: Bearer ${ADMIN_ACCESS}")
[ "$PRE_RESULT_STATUS" = "403" ]

IDEMPOTENCY_KEY=$(uuidgen | tr '[:upper:]' '[:lower:]')
VOTE_1=$(curl -sS -X POST "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/vote" \
  -H 'content-type: application/json' -H "authorization: Bearer ${VOTER_ACCESS}" \
  -d "{\"idempotency_key\":\"${IDEMPOTENCY_KEY}\",\"selections\":[{\"candidate_id\":\"${DEMO_STUDENT_CANDIDATE_A_ID}\"}]}")
RECEIPT_1=$(echo "$VOTE_1" | jq -r '.data.receipt_id')

VOTE_2=$(curl -sS -X POST "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/vote" \
  -H 'content-type: application/json' -H "authorization: Bearer ${VOTER_ACCESS}" \
  -d "{\"idempotency_key\":\"${IDEMPOTENCY_KEY}\",\"selections\":[{\"candidate_id\":\"${DEMO_STUDENT_CANDIDATE_A_ID}\"}]}")
RECEIPT_2=$(echo "$VOTE_2" | jq -r '.data.receipt_id')
[ "$RECEIPT_1" = "$RECEIPT_2" ]

SECOND_VOTE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/vote" \
  -H 'content-type: application/json' -H "authorization: Bearer ${VOTER_ACCESS}" \
  -d "{\"idempotency_key\":\"$(uuidgen | tr '[:upper:]' '[:lower:]')\",\"selections\":[{\"candidate_id\":\"${DEMO_STUDENT_CANDIDATE_A_ID}\"}]}")
[ "$SECOND_VOTE_STATUS" = "409" ]

curl -sS -X PATCH "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/close" \
  -H "authorization: Bearer ${ADMIN_ACCESS}" >/dev/null

RESULTS=$(curl -sS "${API_BASE}/elections/${DEMO_STUDENT_ELECTION_ID}/results" -H "authorization: Bearer ${ADMIN_ACCESS}")
COUNT=$(echo "$RESULTS" | jq -r '.data.results | length')
[ "$COUNT" -gt 0 ]

echo "Integration tests passed"
