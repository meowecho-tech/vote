# Vote Platform Monorepo

Production-oriented voting platform scaffold with:
- Frontend: Next.js (TypeScript), Tailwind CSS, shadcn-style UI primitives
- Backend: Rust + Actix Web + PostgreSQL + SQLx

## Repository Layout

- `apps/frontend`: Next.js app (voter/admin web)
- `apps/backend`: Rust API service
- `infra`: Docker Compose and environment examples

## Quick Start

### 1) Infrastructure

```bash
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml up -d
```

### 2) Backend

```bash
cd apps/backend
cp .env.example .env
cargo run
```

### 3) Frontend

```bash
cd apps/frontend
cp .env.example .env.local
bun install
bun run dev
```

## API Base

- `http://localhost:8080/api/v1`

## Notes

- This scaffold implements core flows for election management and vote submission with idempotency and audit events.
- OTP delivery is currently simulated by writing OTP records to database; integrate SES/SMTP for production.
