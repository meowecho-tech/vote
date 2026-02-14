#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080/api/v1}"
PG_CONTAINER="${PG_CONTAINER:-vote-postgres}"
PG_USER="${PG_USER:-vote}"
PG_DB="${PG_DB:-vote}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.local}"
VOTER_EMAIL="${VOTER_EMAIL:-voter@demo.local}"
PASSWORD="${PASSWORD:-Password123!}"

if curl -fsS "${API_BASE%/api/v1}/health" >/dev/null 2>&1; then
  curl -fsS -X POST "${API_BASE}/auth/register" -H 'content-type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${PASSWORD}\",\"full_name\":\"Demo Admin\"}" >/dev/null 2>&1 || true
  curl -fsS -X POST "${API_BASE}/auth/register" -H 'content-type: application/json' \
    -d "{\"email\":\"${VOTER_EMAIL}\",\"password\":\"${PASSWORD}\",\"full_name\":\"Demo Voter\"}" >/dev/null 2>&1 || true
fi

ADMIN_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${ADMIN_EMAIL}' LIMIT 1;")
VOTER_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${VOTER_EMAIL}' LIMIT 1;")

ORG_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
ELECTION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
CANDIDATE_A=$(uuidgen | tr '[:upper:]' '[:lower:]')
CANDIDATE_B=$(uuidgen | tr '[:upper:]' '[:lower:]')

SQL=$(cat <<SQL
UPDATE users SET role='admin' WHERE id='${ADMIN_ID}';
UPDATE users SET role='voter' WHERE id='${VOTER_ID}';
INSERT INTO organizations(id, name) VALUES ('${ORG_ID}', 'Demo Organization') ON CONFLICT DO NOTHING;
INSERT INTO elections(id, organization_id, title, description, opens_at, closes_at, status)
VALUES ('${ELECTION_ID}', '${ORG_ID}', 'Student President Election', 'Demo election', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 day', 'draft')
ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, name) VALUES ('${CANDIDATE_A}', '${ELECTION_ID}', 'Candidate A') ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, name) VALUES ('${CANDIDATE_B}', '${ELECTION_ID}', 'Candidate B') ON CONFLICT DO NOTHING;
INSERT INTO voter_rolls(id, election_id, user_id) VALUES (uuid_generate_v4(), '${ELECTION_ID}', '${VOTER_ID}') ON CONFLICT DO NOTHING;
SQL
)

docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$SQL" >/dev/null

echo "export DEMO_ADMIN_EMAIL='${ADMIN_EMAIL}'"
echo "export DEMO_VOTER_EMAIL='${VOTER_EMAIL}'"
echo "export DEMO_PASSWORD='${PASSWORD}'"
echo "export DEMO_ADMIN_ID='${ADMIN_ID}'"
echo "export DEMO_VOTER_ID='${VOTER_ID}'"
echo "export DEMO_ORG_ID='${ORG_ID}'"
echo "export DEMO_ELECTION_ID='${ELECTION_ID}'"
echo "export DEMO_CANDIDATE_ID='${CANDIDATE_A}'"
