.PHONY: infra-up infra-down backend-run frontend-dev

infra-up:
	docker compose -f infra/docker-compose.yml --env-file infra/.env up -d

infra-down:
	docker compose -f infra/docker-compose.yml --env-file infra/.env down

backend-run:
	cd apps/backend && cargo run

frontend-dev:
	cd apps/frontend && npm run dev
