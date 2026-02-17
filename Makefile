.PHONY: infra-up infra-down migrate backend-run frontend-dev seed test-integration test-frontend-smoke test-backend
.PHONY: db-reset seed-scenarios seed-student seed-national bulk-import-national

CONTESTS_CSV ?= docs/examples/national_import/contests.csv
CANDIDATES_CSV ?= docs/examples/national_import/candidates.csv
VOTER_ROLLS_CSV ?= docs/examples/national_import/voter_rolls.csv
VOTER_DRY_RUN ?= true

infra-up:
	docker compose -f infra/docker-compose.yml --env-file infra/.env up -d

infra-down:
	docker compose -f infra/docker-compose.yml --env-file infra/.env down

migrate:
	for file in $$(ls -1 apps/backend/migrations/*.sql | sort); do \
	  docker exec -i vote-postgres psql -U vote -d vote < $$file; \
	done

backend-run:
	cd apps/backend && cargo run

frontend-dev:
	cd apps/frontend && bun run dev

seed:
	@bash scripts/seed_scenarios.sh --scenario both

db-reset:
	CONFIRM=yes bash scripts/db_reset.sh

seed-scenarios:
	@bash scripts/seed_scenarios.sh --scenario both

seed-student:
	@bash scripts/seed_scenarios.sh --scenario student

seed-national:
	@bash scripts/seed_scenarios.sh --scenario national

bulk-import-national:
	@if [ -z "$(ELECTION_ID)" ] || [ -z "$(ACCESS_TOKEN)" ]; then \
	  echo "Usage: make bulk-import-national ELECTION_ID=<uuid> ACCESS_TOKEN=<token> [API_BASE=http://localhost:8080/api/v1]"; \
	  echo "Optional: CONTESTS_CSV=... CANDIDATES_CSV=... VOTER_ROLLS_CSV=... VOTER_DRY_RUN=true|false"; \
	  exit 2; \
	fi
	@API_BASE="$(API_BASE)" bash scripts/bulk_import_national.sh \
	  --election-id "$(ELECTION_ID)" \
	  --token "$(ACCESS_TOKEN)" \
	  --contests "$(CONTESTS_CSV)" \
	  --candidates "$(CANDIDATES_CSV)" \
	  --voter-rolls "$(VOTER_ROLLS_CSV)" \
	  --voter-dry-run "$(VOTER_DRY_RUN)"

test-backend:
	cd apps/backend && cargo test

test-integration:
	bash scripts/test_integration.sh

test-frontend-smoke:
	bash scripts/test_frontend_smoke.sh
