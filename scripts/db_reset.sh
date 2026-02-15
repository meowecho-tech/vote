#!/usr/bin/env bash
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-vote-postgres}"
PG_USER="${PG_USER:-vote}"
PG_DB="${PG_DB:-vote}"

if [ "${CONFIRM:-}" != "yes" ]; then
  echo "Refusing to reset database without explicit confirmation." >&2
  echo "This will DROP ALL TABLES in ${PG_DB} (container: ${PG_CONTAINER})." >&2
  echo "" >&2
  echo "Run with: CONFIRM=yes bash scripts/db_reset.sh" >&2
  exit 1
fi

cp -n infra/.env.example infra/.env >/dev/null 2>&1 || true
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d >/dev/null

DROP_SQL=$(
  cat <<'SQL'
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS vote_receipts CASCADE;
DROP TABLE IF EXISTS voter_rolls CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS contests CASCADE;
DROP TABLE IF EXISTS elections CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS one_time_codes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
SQL
)

docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$DROP_SQL" >/dev/null

mapfile -t MIGRATIONS < <(find apps/backend/migrations -maxdepth 1 -type f -name '*.sql' | sort)
for file in "${MIGRATIONS[@]}"; do
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 < "$file" >/dev/null
done

echo "Database reset complete."

