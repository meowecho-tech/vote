# vote-api

Actix Web API for election workflows.

## Setup

```bash
cp .env.example .env
cargo run
```

If frontend runs on a different port, update CORS origins in `apps/backend/.env`:

```env
CORS_ALLOWED_ORIGINS=http://localhost:3002
```

## Endpoints

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/organizations` (admin/election officer/auditor)
- `POST /api/v1/organizations` (admin/election officer)
- `POST /api/v1/elections` (admin/election officer)
- `GET /api/v1/elections` (admin/election officer/auditor)
- `GET /api/v1/elections/{id}` (admin/election officer/auditor)
- `PATCH /api/v1/elections/{id}` (admin/election officer, draft only)
- `PATCH /api/v1/elections/{id}/publish` (admin/election officer)
- `PATCH /api/v1/elections/{id}/close` (admin/election officer)
- `GET /api/v1/elections/{id}/candidates` (admin/election officer/voter)
- `POST /api/v1/elections/{id}/candidates` (admin/election officer)
- `PATCH /api/v1/elections/{id}/candidates/{candidate_id}` (admin/election officer)
- `DELETE /api/v1/elections/{id}/candidates/{candidate_id}` (admin/election officer)
- `GET /api/v1/elections/{id}/voter-rolls` (admin/election officer)
- `POST /api/v1/elections/{id}/voter-rolls` (admin/election officer)
- `POST /api/v1/elections/{id}/voter-rolls/import` (admin/election officer)
- `DELETE /api/v1/elections/{id}/voter-rolls/{user_id}` (admin/election officer)
- `GET /api/v1/elections/{id}/contests` (admin/election officer/auditor)
- `POST /api/v1/elections/{id}/contests` (admin/election officer, draft only)
- `PATCH /api/v1/contests/{id}` (admin/election officer, draft only)
- `DELETE /api/v1/contests/{id}` (admin/election officer, draft only)
- `GET /api/v1/contests/{id}/candidates` (admin/election officer/auditor)
- `POST /api/v1/contests/{id}/candidates` (admin/election officer, draft only)
- `PATCH /api/v1/contests/{id}/candidates/{candidate_id}` (admin/election officer, draft only)
- `DELETE /api/v1/contests/{id}/candidates/{candidate_id}` (admin/election officer, draft only)
- `GET /api/v1/contests/{id}/voter-rolls` (admin/election officer/auditor)
- `POST /api/v1/contests/{id}/voter-rolls` (admin/election officer, draft only)
- `POST /api/v1/contests/{id}/voter-rolls/import` (admin/election officer, draft only)
- `DELETE /api/v1/contests/{id}/voter-rolls/{user_id}` (admin/election officer, draft only)
- `GET /api/v1/elections/{id}/ballot` (voter/admin)
- `POST /api/v1/elections/{id}/vote` (voter/admin)
- `GET /api/v1/elections/{id}/receipt/{receipt_id}` (voter/admin)
- `GET /api/v1/me/contests/votable` (voter/admin)
- `GET /api/v1/elections/{id}/contests/my` (voter/admin)
- `GET /api/v1/contests/{id}/ballot` (voter/admin)
- `POST /api/v1/contests/{id}/vote` (voter/admin)
- `GET /api/v1/contests/{id}/receipt/{receipt_id}` (voter/admin)
- `GET /api/v1/contests/{id}/results` (admin/election officer/auditor, only after close)
- `GET /api/v1/elections/{id}/results` (admin/election officer/auditor, only after close)

## Migration

```bash
for file in migrations/*.sql; do
  docker exec -i vote-postgres psql -U vote -d vote < "$file"
done
```
