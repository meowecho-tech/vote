# TODO - Vote Platform

## 1) Completed (from current implementation)

### Repo / Platform setup
- [x] Monorepo scaffold (`apps/frontend`, `apps/backend`, `infra`, `scripts`)
- [x] Docker Compose for PostgreSQL + Redis
- [x] Root `Makefile` for common commands
- [x] Project docs (`README.md`, backend/frontend README)

### Backend core (Rust + Actix + PostgreSQL)
- [x] Core API structure and modular routing
- [x] Health endpoint (`/health`)
- [x] Auth: register/login/OTP verify
- [x] JWT access token + refresh token flow
- [x] Refresh token hashing + rotation on refresh
- [x] Logout endpoint (revoke refresh token)
- [x] OTP attempt limit fields and enforcement
- [x] In-memory auth rate limiting
- [x] RBAC roles (`admin`, `election_officer`, `auditor`, `voter`)
- [x] Role checks on protected endpoints

### Election / Voting domain
- [x] Create election (with validation)
- [x] Update election (title/description/window while draft)
- [x] Publish election
- [x] Close election
- [x] Get election detail
- [x] List elections
- [x] Get ballot
- [x] Cast vote with idempotency key
- [x] One-person-one-vote enforcement
- [x] Vote receipt retrieval
- [x] Results after close only
- [x] Audit event write on vote cast

### Admin operations
- [x] Organizations API: list/create
- [x] Candidate API: list/create/update/delete
- [x] Voter roll API: list/add/remove/import (CSV/JSON + validation report)
- [x] Pagination support for elections/candidates/voter-roll APIs

### Database / Migration
- [x] Initial schema migration
- [x] Backward-compatible migration adjustments (`ALTER ... IF NOT EXISTS` style)
- [x] Tables include core election/auth/vote models

### Frontend (Next.js)
- [x] Auth UI: login + OTP pages
- [x] Voter flow page: load ballot + submit vote
- [x] Admin election console (single page)
- [x] Organization management UI
- [x] Election create/manage UI
- [x] Candidate and voter-roll management UI
- [x] Voter-roll bulk import UI (CSV/JSON, dry-run + import report)
- [x] Results loading UI
- [x] Elections list + search + status filters
- [x] Pagination controls for elections/candidates/voter-roll lists
- [x] Confirmation prompts for destructive admin actions
- [x] Home page auth-state behavior (`Signed in` / `Sign out`)
- [x] Frontend admin role guard
- [x] Access token auto-refresh and retry on 401

### Testing / Scripts
- [x] Backend unit tests (JWT/rate limiter)
- [x] Integration test script (auth + RBAC + idempotency + results timing)
- [x] Frontend smoke test script
- [x] Seed demo script

---

## 2) Remaining to reach "system complete" (production-ready)

### A. Critical security hardening
- [ ] Replace in-memory rate limiter with distributed limiter (Redis-based)
- [ ] Add brute-force lockout policy for login and OTP per account + IP
- [ ] Add JWT key rotation strategy (KID/JWKS or versioned secrets)
- [ ] Add refresh-token reuse detection and global session revocation
- [ ] Add stricter input validation (length/format constraints) for all DTOs
- [ ] Add security headers, strict CORS by environment, trusted proxy config
- [ ] Add request audit for admin mutations (who/when/what old->new)

### B. Auth / Identity completeness
- [ ] Implement real OTP delivery (SES/SMTP) instead of DB-only retrieval
- [ ] Add password reset and email verification flows
- [ ] Add user/session management endpoints (list/revoke sessions)
- [ ] Add optional SSO/OIDC provider support

### C. Election management completeness
- [ ] Add archived elections and soft-delete policies

### D. Frontend UX completeness
- [ ] Add dedicated admin elections index page (not only in create/manage screen)
- [ ] Add global auth guard middleware/layout handling
- [ ] Add standardized API error UI and toast system
- [ ] Add loading/skeleton states for all admin async sections
- [ ] Add i18n/localization support (TH/EN)

### E. Reliability / observability
- [ ] Add structured logging with request IDs across frontend/backend
- [ ] Add metrics (latency, error rate, vote throughput) + dashboards
- [ ] Add tracing (OpenTelemetry)
- [ ] Add health/readiness checks for DB/Redis dependencies
- [ ] Add backup + restore runbook and disaster recovery drills

### F. Testing depth
- [ ] Add integration tests for organizations/candidate/voter-roll CRUD
- [ ] Add integration tests for refresh-token edge cases
- [ ] Add E2E browser tests (Playwright) for admin and voter flows
- [ ] Add load tests for voting peak and publish/close transitions
- [ ] Add fuzz/property tests for vote integrity invariants

### G. DevOps / delivery
- [ ] Add CI pipeline (lint/test/integration/smoke) on PRs
- [ ] Add Dockerfiles for frontend/backend production images
- [ ] Add environment matrix (`dev`/`staging`/`prod`) and secret management
- [ ] Add deployment manifests (ECS/EKS/K8s) + rollback strategy
- [ ] Add DB migration workflow in CI/CD with safety checks

### H. Compliance / governance
- [ ] Define retention policy for audit/security/auth logs
- [ ] Add immutable/tamper-evident audit export process
- [ ] Define election operation SOPs (open, monitor, close, certify)
- [ ] Add incident response playbook
- [ ] Add legal/privacy documentation and consent flows

---

## 3) Suggested execution order (recommended)

- [ ] Phase 1: Security hardening (A) + Auth completeness (B)
- [ ] Phase 2: Election management completeness (C) + UX improvements (D)
- [ ] Phase 3: Reliability/observability (E) + testing depth (F)
- [ ] Phase 4: DevOps productionization (G) + governance/compliance (H)

---

## 4) Definition of Done (system complete)

- [ ] Functional: End-to-end admin + voter workflows fully supported from UI without manual SQL
- [ ] Security: Independent security review passes, high/critical issues resolved
- [ ] Reliability: Load/SLA targets met under expected peak traffic
- [ ] Quality: CI green with unit + integration + E2E + smoke tests
- [ ] Operations: Monitoring/alerting/runbooks in place, backup-restore proven
- [ ] Governance: Auditability/compliance documents and procedures approved
