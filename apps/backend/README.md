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
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/elections` (admin/election officer)
- `PATCH /api/v1/elections/{id}/publish` (admin/election officer)
- `PATCH /api/v1/elections/{id}/close` (admin/election officer)
- `GET /api/v1/elections/{id}/ballot` (voter/admin)
- `POST /api/v1/elections/{id}/vote` (voter/admin)
- `GET /api/v1/elections/{id}/receipt/{receipt_id}` (voter/admin)
- `GET /api/v1/elections/{id}/results` (admin/election officer/auditor, only after close)

## Migration

```bash
docker exec -i vote-postgres psql -U vote -d vote < migrations/0001_init.sql
```
