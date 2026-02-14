# vote-api

Actix Web API for election workflows.

## Setup

```bash
cp .env.example .env
cargo run
```

## Endpoints

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/elections`
- `PATCH /api/v1/elections/{id}/publish`
- `PATCH /api/v1/elections/{id}/close`
- `GET /api/v1/elections/{id}/ballot`
- `POST /api/v1/elections/{id}/vote`
- `GET /api/v1/elections/{id}/receipt/{receipt_id}`
- `GET /api/v1/elections/{id}/results`

## Migration

Run SQL in `migrations/0001_init.sql` against PostgreSQL.

Example:

```bash
psql "$DATABASE_URL" -f migrations/0001_init.sql
```
