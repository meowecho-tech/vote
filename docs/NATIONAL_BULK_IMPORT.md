# National Bulk Import (Contests + Candidates + Voter Rolls)

Use this flow when one election has many districts/contests (for example, country-scale elections).

Script:
- `scripts/bulk_import_national.sh`

Make target:
- `make bulk-import-national`

## Prerequisites

1) Infra and backend are running.
2) You already have an **admin/election-officer** access token.
3) Target election already exists and is in `draft` status.

## CSV Files

Use these templates:
- `docs/examples/national_import/contests.csv`
- `docs/examples/national_import/candidates.csv`
- `docs/examples/national_import/voter_rolls.csv`

### `contests.csv`

```csv
contest_key,title,max_selections,province,district
bkk-d1,Bangkok - District 1,1,Bangkok,1
```

### `candidates.csv`

```csv
contest_key,name,manifesto
bkk-d1,Candidate A,Education and transparency
```

### `voter_rolls.csv`

```csv
contest_key,identifier
bkk-d1,voter1@example.com
bkk-d1,550e8400-e29b-41d4-a716-446655440000
```

Notes:
- `contest_key` is your stable import key; script stores it in `contest.metadata.import_key`.
- `identifier` can be user email or user UUID.
- Keep CSV as simple comma-separated rows (avoid quoted-comma fields).

## Run (Recommended 2 Steps)

1) Dry run voter import first (`VOTER_DRY_RUN=true`):

```bash
make bulk-import-national \
  ELECTION_ID="<election_uuid>" \
  ACCESS_TOKEN="<access_token>" \
  VOTER_DRY_RUN=<true|false>
```

2) If report looks correct, execute real voter import (`VOTER_DRY_RUN=false`):

```bash
make bulk-import-national \
  ELECTION_ID="<election_uuid>" \
  ACCESS_TOKEN="<access_token>" \
  VOTER_DRY_RUN=<true|false>
```

Optional overrides:
- `API_BASE` (default `http://localhost:8080/api/v1`)
- `CONTESTS_CSV`, `CANDIDATES_CSV`, `VOTER_ROLLS_CSV`

## Behavior

- Contests:
  - If `contest_key` already exists in election (`metadata.import_key`), contest is **updated**.
  - If not found, contest is **created**.
- Candidates:
  - Inserted per contest.
  - Duplicate names in the same contest are skipped (case-insensitive).
- Voter rolls:
  - Imported per contest via `/contests/{id}/voter-rolls/import`.
  - Summary includes `valid_rows`, `inserted_rows`, `duplicate_rows`, `already_in_roll_rows`, `not_found_rows`.

## Common Errors

- `Election ... must be draft`:
  - Reopen or create a new draft election, then import again.
- `unknown contest_key=...`:
  - `candidates.csv` or `voter_rolls.csv` contains a key not present in `contests.csv`.
- `user_not_found` in voter report:
  - The identifier email/UUID does not match any user in DB.
