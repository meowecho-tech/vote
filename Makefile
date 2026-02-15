.PHONY: infra-up infra-down migrate backend-run frontend-dev seed test-integration test-frontend-smoke test-backend

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
	bash scripts/seed_demo.sh

test-backend:
	cd apps/backend && cargo test

test-integration:
	bash scripts/test_integration.sh

test-frontend-smoke:
	bash scripts/test_frontend_smoke.sh
