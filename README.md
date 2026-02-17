# Vote Platform Monorepo

Production-oriented voting platform scaffold with:
- Frontend: Next.js (TypeScript), Tailwind CSS, shadcn-style UI primitives
- Backend: Rust + Actix Web + PostgreSQL + SQLx

## Repository Layout

- `apps/frontend`: Next.js app (voter/admin web)
- `apps/backend`: Rust API service
- `infra`: Docker Compose and environment examples
- `scripts`: Seed and automated test scripts

## Quick Start

```bash
cp infra/.env.example infra/.env
make infra-up
make migrate
```

Terminal 1:

```bash
cd apps/backend
cp .env.example .env
cargo run
```

Terminal 2:

```bash
cd apps/frontend
cp .env.example .env.local
bun install
bun run dev
```

## Useful Commands

- `make seed` - seed demo data (alias for `make seed-scenarios`)
- `make db-reset` - drop all tables and re-apply migrations (local dev only)
- `make seed-scenarios` - seed both "student" + "national" scenarios (requires backend running)
- `make seed-student` - seed only student president scenario (requires backend running)
- `make seed-national` - seed only national (province/district) scenario (requires backend running)
- `make bulk-import-national ELECTION_ID=<uuid> ACCESS_TOKEN=<token>` - bulk import contests/candidates/voter-rolls from CSV (see `docs/NATIONAL_BULK_IMPORT.md`)
- `make test-backend` - run Rust tests
- `make test-integration` - run API integration flow tests
- `make test-frontend-smoke` - smoke test key frontend routes

## Demo Usecases

See `docs/DEMO_USECASES.md`.

## Bulk Import (National Scale)

See `docs/NATIONAL_BULK_IMPORT.md` for CSV format, dry-run workflow, and commands.

## API Base

- `http://localhost:8080/api/v1`

## Security Features (MVP+)

- JWT access tokens + refresh token rotation
- RBAC for admin/election-officer/auditor/voter
- OTP retry limit
- In-memory rate limiting for auth endpoints
- Idempotent vote submission and one-person-one-vote constraint
