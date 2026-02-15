# Demo Usecases (2 Scenarios)

This repo supports both:
1) Small elections (example: **Student President**) using the default contest model
2) National-style elections (example: **Province -> District -> Candidates**) using **multiple contests** under one election

This document assumes:
- Backend: `http://localhost:8080`
- Frontend: `http://localhost:3000`
- Docker container name: `vote-postgres`

## 0) Reset DB + Seed Demo Data

Terminal 1 (infra + db):

```bash
make infra-up
make db-reset
```

Terminal 2 (backend):

```bash
cd apps/backend
cp -n .env.example .env || true
cargo run
```

Terminal 3 (seed scenarios):

```bash
# Seed both scenarios (student + national):
eval "$(make -s seed-scenarios)"

# Or seed just one scenario:
# eval "$(make -s seed-student)"
# eval "$(make -s seed-national)"
```

Frontend:

```bash
cd apps/frontend
bun run dev
```

## 1) Demo Accounts

All accounts use the same password: `${DEMO_PASSWORD}` (from the seed output).

- Admin: `${DEMO_ADMIN_EMAIL}`
- Election Officer: `${DEMO_OFFICER_EMAIL}`
- Auditor: `${DEMO_AUDITOR_EMAIL}`
- Student voter: `${DEMO_STUDENT_VOTER_EMAIL}`
- National voters:
  - `${DEMO_NATIONAL_VOTER_BKK1_EMAIL}`
  - `${DEMO_NATIONAL_VOTER_BKK2_EMAIL}`
  - `${DEMO_NATIONAL_VOTER_CM1_EMAIL}`

## 2) How To Get OTP Code (for login)

After you submit the email/password on `/login`, the backend generates an OTP code into the DB.
You can fetch it with:

```bash
EMAIL='admin@demo.local'
docker exec -i vote-postgres psql -U vote -d vote -Atc \
  "SELECT c.code FROM one_time_codes c JOIN users u ON u.id=c.user_id WHERE u.email='${EMAIL}' ORDER BY c.created_at DESC LIMIT 1;"
```

Use the returned code on `/verify-otp`.

## 3) Scenario A: Student President Election (Small Election)

Concept mapping:
- `Election` = the whole event ("Student President Election")
- `Contest` = the ballot (default contest only)
- `Candidates` = the students
- `Voter Roll` = students who can vote

Seeded objects:
- Election title: `Student President Election (Demo)`
- Contest title: `Student President`

Usecase steps:
1) Login as admin (or election officer).
2) Open admin console: `/admin/elections`
3) Find election: `Student President Election (Demo)` then click **Manage This Election**.
4) (Optional) Add candidates / voter-roll (this is contest-scoped under the hood).
5) Publish the election if it is still draft.
6) Login as the student voter and go to home page `/`.
7) You will see a ballot card. Click **Go to vote** and submit.
8) Admin closes the election.
9) Admin loads results for the contest.

## 4) Scenario B: National Election (Province -> District)

Concept mapping:
- `Election` = the overall event ("Thailand General Election")
- `Contest` = a district race ("Bangkok - District 1", etc.)
- `Candidates` = candidates in that district
- `Voter Roll` = eligible voters per district (contest-scoped)

Seeded objects:
- Election title: `Thailand General Election (Demo)`
- Contests:
  - `Bangkok - District 1`
  - `Bangkok - District 2`
  - `Chiang Mai - District 1`

Usecase steps (voter experience):
1) Login as one of the national voters (example: `${DEMO_NATIONAL_VOTER_BKK1_EMAIL}`).
2) Home `/` shows the contest(s) you are eligible for.
3) Click **Go to vote** to open `/voter/contests/{contestId}` and submit.
4) Repeat with other district voter accounts to simulate multiple districts.

Usecase steps (admin management):
1) Login as admin/election officer.
2) Admin console: `/admin/elections`
3) Manage election: `Thailand General Election (Demo)`
4) Create additional contests for other provinces/districts.
5) For each contest, add candidates and import voter roll.
6) Publish election and monitor.
7) Close election.
8) Load results per contest.
