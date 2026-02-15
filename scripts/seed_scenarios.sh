#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080/api/v1}"
PG_CONTAINER="${PG_CONTAINER:-vote-postgres}"
PG_USER="${PG_USER:-vote}"
PG_DB="${PG_DB:-vote}"

usage() {
  cat <<'USAGE'
Seed demo data for the vote platform.

Usage:
  bash scripts/seed_scenarios.sh [--scenario student|national|both] [--status draft|published]

Env overrides:
  SCENARIO         student|national|both (default: both)
  ELECTION_STATUS  draft|published (default: published)

Notes:
  - Backend must be running (health check).
  - This script prints `export ...` lines. Use:
      eval "$(bash scripts/seed_scenarios.sh ...)"
USAGE
}

SCENARIO="${SCENARIO:-both}"
ELECTION_STATUS="${ELECTION_STATUS:-published}"

while [ "${1:-}" != "" ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --scenario)
      SCENARIO="${2:-}"
      shift 2
      ;;
    --status)
      ELECTION_STATUS="${2:-}"
      shift 2
      ;;
    student|national|both)
      SCENARIO="$1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$SCENARIO" in
  student) SEED_STUDENT=1; SEED_NATIONAL=0 ;;
  national) SEED_STUDENT=0; SEED_NATIONAL=1 ;;
  both) SEED_STUDENT=1; SEED_NATIONAL=1 ;;
  *)
    echo "Invalid scenario: ${SCENARIO} (expected: student|national|both)" >&2
    exit 2
    ;;
esac

case "$ELECTION_STATUS" in
  draft|published) ;;
  *)
    echo "Invalid status: ${ELECTION_STATUS} (expected: draft|published)" >&2
    exit 2
    ;;
esac

PASSWORD="${PASSWORD:-Password123!}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.local}"
OFFICER_EMAIL="${OFFICER_EMAIL:-officer@demo.local}"
AUDITOR_EMAIL="${AUDITOR_EMAIL:-auditor@demo.local}"

STUDENT_VOTER_EMAIL="${STUDENT_VOTER_EMAIL:-student.voter@demo.local}"
NATIONAL_VOTER_BKK1_EMAIL="${NATIONAL_VOTER_BKK1_EMAIL:-voter.bkk.d1@demo.local}"
NATIONAL_VOTER_BKK2_EMAIL="${NATIONAL_VOTER_BKK2_EMAIL:-voter.bkk.d2@demo.local}"
NATIONAL_VOTER_CM1_EMAIL="${NATIONAL_VOTER_CM1_EMAIL:-voter.chiangmai.d1@demo.local}"

if ! curl -fsS "${API_BASE%/api/v1}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${API_BASE}. Start backend first, then rerun this script." >&2
  exit 1
fi

register_user() {
  local email="$1"
  local full_name="$2"

  curl -fsS -X POST "${API_BASE}/auth/register" -H 'content-type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${PASSWORD}\",\"full_name\":\"${full_name}\"}" >/dev/null 2>&1 || true
}

register_user "$ADMIN_EMAIL" "Demo Admin"
register_user "$OFFICER_EMAIL" "Demo Election Officer"
register_user "$AUDITOR_EMAIL" "Demo Auditor"
register_user "$STUDENT_VOTER_EMAIL" "Student Voter"
register_user "$NATIONAL_VOTER_BKK1_EMAIL" "Bangkok District 1 Voter"
register_user "$NATIONAL_VOTER_BKK2_EMAIL" "Bangkok District 2 Voter"
register_user "$NATIONAL_VOTER_CM1_EMAIL" "Chiang Mai District 1 Voter"

ADMIN_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${ADMIN_EMAIL}' LIMIT 1;")
OFFICER_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${OFFICER_EMAIL}' LIMIT 1;")
AUDITOR_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${AUDITOR_EMAIL}' LIMIT 1;")

STUDENT_VOTER_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${STUDENT_VOTER_EMAIL}' LIMIT 1;")
VOTER_BKK1_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${NATIONAL_VOTER_BKK1_EMAIL}' LIMIT 1;")
VOTER_BKK2_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${NATIONAL_VOTER_BKK2_EMAIL}' LIMIT 1;")
VOTER_CM1_ID=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id FROM users WHERE email='${NATIONAL_VOTER_CM1_EMAIL}' LIMIT 1;")

if [ -z "$ADMIN_ID" ] || [ -z "$OFFICER_ID" ] || [ -z "$AUDITOR_ID" ]; then
  echo "Failed to resolve admin/officer/auditor user IDs. Is the backend connected to the same DB container?" >&2
  exit 1
fi

if [ "$SEED_STUDENT" -eq 1 ] && [ -z "$STUDENT_VOTER_ID" ]; then
  echo "Failed to resolve student voter user ID." >&2
  exit 1
fi

if [ "$SEED_NATIONAL" -eq 1 ] && { [ -z "$VOTER_BKK1_ID" ] || [ -z "$VOTER_BKK2_ID" ] || [ -z "$VOTER_CM1_ID" ]; }; then
  echo "Failed to resolve national voter user IDs." >&2
  exit 1
fi

SCHOOL_ORG_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
ELECTIONS_ORG_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

STUDENT_ELECTION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
NATIONAL_ELECTION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

STUDENT_CONTEST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
NATIONAL_DEFAULT_CONTEST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
NATIONAL_BKK1_CONTEST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
NATIONAL_BKK2_CONTEST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
NATIONAL_CM1_CONTEST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

CAND_STUDENT_1=$(uuidgen | tr '[:upper:]' '[:lower:]')
CAND_STUDENT_2=$(uuidgen | tr '[:upper:]' '[:lower:]')

CAND_BKK1_A=$(uuidgen | tr '[:upper:]' '[:lower:]')
CAND_BKK1_B=$(uuidgen | tr '[:upper:]' '[:lower:]')
CAND_BKK1_C=$(uuidgen | tr '[:upper:]' '[:lower:]')

CAND_BKK2_A=$(uuidgen | tr '[:upper:]' '[:lower:]')
CAND_BKK2_B=$(uuidgen | tr '[:upper:]' '[:lower:]')
CAND_BKK2_C=$(uuidgen | tr '[:upper:]' '[:lower:]')

CAND_CM1_A=$(uuidgen | tr '[:upper:]' '[:lower:]')
CAND_CM1_B=$(uuidgen | tr '[:upper:]' '[:lower:]')
CAND_CM1_C=$(uuidgen | tr '[:upper:]' '[:lower:]')

STUDENT_SECTION=""
if [ "$SEED_STUDENT" -eq 1 ]; then
  STUDENT_SECTION=$(cat <<SQL
-- Student election (school)
INSERT INTO organizations(id, name) VALUES ('${SCHOOL_ORG_ID}', 'Demo School') ON CONFLICT DO NOTHING;

INSERT INTO elections(id, organization_id, title, description, opens_at, closes_at, status)
VALUES ('${STUDENT_ELECTION_ID}', '${SCHOOL_ORG_ID}', 'Student President Election (Demo)', 'Choose the student president', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 day', '${ELECTION_STATUS}')
ON CONFLICT DO NOTHING;

INSERT INTO contests (id, election_id, title, description, max_selections, metadata, is_default)
VALUES ('${STUDENT_CONTEST_ID}', '${STUDENT_ELECTION_ID}', 'Student President', 'Select 1 candidate', 1, jsonb_build_object('scope','school','type','student_president'), true)
ON CONFLICT DO NOTHING;

INSERT INTO candidates(id, election_id, contest_id, name, manifesto)
VALUES ('${CAND_STUDENT_1}', '${STUDENT_ELECTION_ID}', '${STUDENT_CONTEST_ID}', 'Student Candidate A', 'Transparency, activities, and student welfare')
ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, contest_id, name, manifesto)
VALUES ('${CAND_STUDENT_2}', '${STUDENT_ELECTION_ID}', '${STUDENT_CONTEST_ID}', 'Student Candidate B', 'Better cafeteria, clubs, and learning support')
ON CONFLICT DO NOTHING;

INSERT INTO voter_rolls(id, election_id, contest_id, user_id)
VALUES (uuid_generate_v4(), '${STUDENT_ELECTION_ID}', '${STUDENT_CONTEST_ID}', '${STUDENT_VOTER_ID}')
ON CONFLICT DO NOTHING;
SQL
)
fi

NATIONAL_SECTION=""
if [ "$SEED_NATIONAL" -eq 1 ]; then
  NATIONAL_SECTION=$(cat <<SQL
-- National election (province -> district contests)
INSERT INTO organizations(id, name) VALUES ('${ELECTIONS_ORG_ID}', 'Demo Election Commission') ON CONFLICT DO NOTHING;

INSERT INTO elections(id, organization_id, title, description, opens_at, closes_at, status)
VALUES ('${NATIONAL_ELECTION_ID}', '${ELECTIONS_ORG_ID}', 'Thailand General Election (Demo)', 'Province -> District contests', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 day', '${ELECTION_STATUS}')
ON CONFLICT DO NOTHING;

INSERT INTO contests (id, election_id, title, description, max_selections, metadata, is_default)
VALUES ('${NATIONAL_DEFAULT_CONTEST_ID}', '${NATIONAL_ELECTION_ID}', 'Default Ballot', 'Compatibility default contest', 1, '{}'::jsonb, true)
ON CONFLICT DO NOTHING;

INSERT INTO contests (id, election_id, title, description, max_selections, metadata, is_default)
VALUES ('${NATIONAL_BKK1_CONTEST_ID}', '${NATIONAL_ELECTION_ID}', 'Bangkok - District 1', 'Select 1 candidate', 1, jsonb_build_object('country','TH','province','Bangkok','district',1), false)
ON CONFLICT DO NOTHING;

INSERT INTO contests (id, election_id, title, description, max_selections, metadata, is_default)
VALUES ('${NATIONAL_BKK2_CONTEST_ID}', '${NATIONAL_ELECTION_ID}', 'Bangkok - District 2', 'Select 1 candidate', 1, jsonb_build_object('country','TH','province','Bangkok','district',2), false)
ON CONFLICT DO NOTHING;

INSERT INTO contests (id, election_id, title, description, max_selections, metadata, is_default)
VALUES ('${NATIONAL_CM1_CONTEST_ID}', '${NATIONAL_ELECTION_ID}', 'Chiang Mai - District 1', 'Select 1 candidate', 1, jsonb_build_object('country','TH','province','Chiang Mai','district',1), false)
ON CONFLICT DO NOTHING;

INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_BKK1_A}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK1_CONTEST_ID}', 'BKK D1 - Candidate A') ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_BKK1_B}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK1_CONTEST_ID}', 'BKK D1 - Candidate B') ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_BKK1_C}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK1_CONTEST_ID}', 'BKK D1 - Candidate C') ON CONFLICT DO NOTHING;

INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_BKK2_A}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK2_CONTEST_ID}', 'BKK D2 - Candidate A') ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_BKK2_B}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK2_CONTEST_ID}', 'BKK D2 - Candidate B') ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_BKK2_C}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK2_CONTEST_ID}', 'BKK D2 - Candidate C') ON CONFLICT DO NOTHING;

INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_CM1_A}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_CM1_CONTEST_ID}', 'CM D1 - Candidate A') ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_CM1_B}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_CM1_CONTEST_ID}', 'CM D1 - Candidate B') ON CONFLICT DO NOTHING;
INSERT INTO candidates(id, election_id, contest_id, name) VALUES ('${CAND_CM1_C}', '${NATIONAL_ELECTION_ID}', '${NATIONAL_CM1_CONTEST_ID}', 'CM D1 - Candidate C') ON CONFLICT DO NOTHING;

INSERT INTO voter_rolls(id, election_id, contest_id, user_id)
VALUES (uuid_generate_v4(), '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK1_CONTEST_ID}', '${VOTER_BKK1_ID}')
ON CONFLICT DO NOTHING;
INSERT INTO voter_rolls(id, election_id, contest_id, user_id)
VALUES (uuid_generate_v4(), '${NATIONAL_ELECTION_ID}', '${NATIONAL_BKK2_CONTEST_ID}', '${VOTER_BKK2_ID}')
ON CONFLICT DO NOTHING;
INSERT INTO voter_rolls(id, election_id, contest_id, user_id)
VALUES (uuid_generate_v4(), '${NATIONAL_ELECTION_ID}', '${NATIONAL_CM1_CONTEST_ID}', '${VOTER_CM1_ID}')
ON CONFLICT DO NOTHING;
SQL
)
fi

SQL=$(cat <<SQL
-- Roles
UPDATE users SET role='admin' WHERE id='${ADMIN_ID}';
UPDATE users SET role='election_officer' WHERE id='${OFFICER_ID}';
UPDATE users SET role='auditor' WHERE id='${AUDITOR_ID}';
UPDATE users SET role='voter' WHERE id IN ('${STUDENT_VOTER_ID}', '${VOTER_BKK1_ID}', '${VOTER_BKK2_ID}', '${VOTER_CM1_ID}');

${STUDENT_SECTION}

${NATIONAL_SECTION}
SQL
)

docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$SQL" >/dev/null

echo "export DEMO_PASSWORD='${PASSWORD}'"
echo "export DEMO_ADMIN_EMAIL='${ADMIN_EMAIL}'"
echo "export DEMO_OFFICER_EMAIL='${OFFICER_EMAIL}'"
echo "export DEMO_AUDITOR_EMAIL='${AUDITOR_EMAIL}'"
echo "export DEMO_STUDENT_VOTER_EMAIL='${STUDENT_VOTER_EMAIL}'"
echo "export DEMO_NATIONAL_VOTER_BKK1_EMAIL='${NATIONAL_VOTER_BKK1_EMAIL}'"
echo "export DEMO_NATIONAL_VOTER_BKK2_EMAIL='${NATIONAL_VOTER_BKK2_EMAIL}'"
echo "export DEMO_NATIONAL_VOTER_CM1_EMAIL='${NATIONAL_VOTER_CM1_EMAIL}'"

echo "export DEMO_SCENARIO='${SCENARIO}'"
echo "export DEMO_ELECTION_STATUS='${ELECTION_STATUS}'"

if [ "$SEED_STUDENT" -eq 1 ]; then
  echo "export DEMO_STUDENT_ELECTION_ID='${STUDENT_ELECTION_ID}'"
  echo "export DEMO_STUDENT_CONTEST_ID='${STUDENT_CONTEST_ID}'"
  echo "export DEMO_STUDENT_CANDIDATE_A_ID='${CAND_STUDENT_1}'"
  echo "export DEMO_STUDENT_CANDIDATE_B_ID='${CAND_STUDENT_2}'"
fi

if [ "$SEED_NATIONAL" -eq 1 ]; then
  echo "export DEMO_NATIONAL_ELECTION_ID='${NATIONAL_ELECTION_ID}'"
  echo "export DEMO_NATIONAL_CONTEST_BKK1_ID='${NATIONAL_BKK1_CONTEST_ID}'"
  echo "export DEMO_NATIONAL_CONTEST_BKK2_ID='${NATIONAL_BKK2_CONTEST_ID}'"
  echo "export DEMO_NATIONAL_CONTEST_CM1_ID='${NATIONAL_CM1_CONTEST_ID}'"
fi
