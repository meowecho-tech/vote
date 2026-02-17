#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080/api/v1}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
ELECTION_ID="${ELECTION_ID:-}"
CONTESTS_CSV="${CONTESTS_CSV:-}"
CANDIDATES_CSV="${CANDIDATES_CSV:-}"
VOTER_ROLLS_CSV="${VOTER_ROLLS_CSV:-}"
VOTER_DRY_RUN="${VOTER_DRY_RUN:-false}"

usage() {
  cat <<'USAGE'
Bulk import national-election data using Admin API.

Usage:
  bash scripts/bulk_import_national.sh \
    --election-id <uuid> \
    --token <access_token> \
    --contests <contests.csv> \
    --candidates <candidates.csv> \
    --voter-rolls <voter_rolls.csv> \
    [--voter-dry-run true|false]

CSV formats:

1) contests.csv
   contest_key,title,max_selections,province,district
   bkk-d1,Bangkok - District 1,1,Bangkok,1

2) candidates.csv
   contest_key,name,manifesto
   bkk-d1,Candidate A,Manifesto text

3) voter_rolls.csv
   contest_key,identifier
   bkk-d1,voter1@example.com
   bkk-d1,550e8400-e29b-41d4-a716-446655440000

Notes:
- Election must be in `draft` status (Admin APIs enforce this).
- Contest mapping uses metadata.import_key (contest_key).
- Voter import uses `/contests/{id}/voter-rolls/import` with format=json.
USAGE
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

api_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local body_file
  body_file="$(mktemp)"

  local status
  if [ -n "$payload" ]; then
    status="$(
      curl -sS -o "$body_file" -w "%{http_code}" \
        -X "$method" "${API_BASE}${path}" \
        -H "authorization: Bearer ${ACCESS_TOKEN}" \
        -H "content-type: application/json" \
        --data "$payload"
    )"
  else
    status="$(
      curl -sS -o "$body_file" -w "%{http_code}" \
        -X "$method" "${API_BASE}${path}" \
        -H "authorization: Bearer ${ACCESS_TOKEN}" \
        -H "content-type: application/json"
    )"
  fi

  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    local err
    err="$(jq -r '.error // .message // "request failed"' "$body_file" 2>/dev/null || echo "request failed")"
    echo "API ${method} ${path} failed (${status}): ${err}" >&2
    cat "$body_file" >&2
    rm -f "$body_file"
    exit 1
  fi

  cat "$body_file"
  rm -f "$body_file"
}

map_get() {
  local key="$1"
  local map_file="$2"
  awk -F '\t' -v k="$key" '$1==k { print $2; exit }' "$map_file"
}

map_set() {
  local key="$1"
  local value="$2"
  local map_file="$3"
  local tmp_file="${map_file}.tmp"
  awk -F '\t' -v k="$key" '$1!=k' "$map_file" > "$tmp_file"
  mv "$tmp_file" "$map_file"
  printf "%s\t%s\n" "$key" "$value" >> "$map_file"
}

normalize_bool() {
  local raw
  raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    true|1|yes) printf 'true' ;;
    false|0|no) printf 'false' ;;
    *)
      echo "Invalid boolean value: $1 (expected true/false)" >&2
      exit 2
      ;;
  esac
}

candidate_cache_file_for() {
  local contest_id="$1"
  printf '%s/candidates_%s.txt' "$TMP_DIR" "$contest_id"
}

load_candidate_cache() {
  local contest_id="$1"
  local cache_file
  cache_file="$(candidate_cache_file_for "$contest_id")"

  if [ -f "$cache_file" ]; then
    return 0
  fi

  : > "$cache_file"
  local page=1
  while true; do
    local response
    response="$(api_request GET "/contests/${contest_id}/candidates?page=${page}&per_page=100")"
    printf '%s' "$response" | jq -r '.data.candidates[].name' | tr '[:upper:]' '[:lower:]' >> "$cache_file"

    local total_pages
    total_pages="$(printf '%s' "$response" | jq -r '.data.pagination.total_pages // 1')"
    if [ "$page" -ge "$total_pages" ]; then
      break
    fi
    page=$((page + 1))
  done
}

candidate_exists_in_cache() {
  local contest_id="$1"
  local name="$2"
  local cache_file
  cache_file="$(candidate_cache_file_for "$contest_id")"
  local normalized
  normalized="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
  grep -Fqx "$normalized" "$cache_file"
}

append_candidate_cache() {
  local contest_id="$1"
  local name="$2"
  local cache_file
  cache_file="$(candidate_cache_file_for "$contest_id")"
  printf '%s\n' "$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" >> "$cache_file"
}

while [ "${1:-}" != "" ]; do
  case "$1" in
    --election-id) ELECTION_ID="${2:-}"; shift 2 ;;
    --token) ACCESS_TOKEN="${2:-}"; shift 2 ;;
    --contests) CONTESTS_CSV="${2:-}"; shift 2 ;;
    --candidates) CANDIDATES_CSV="${2:-}"; shift 2 ;;
    --voter-rolls) VOTER_ROLLS_CSV="${2:-}"; shift 2 ;;
    --voter-dry-run) VOTER_DRY_RUN="${2:-}"; shift 2 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$ACCESS_TOKEN" ] || [ -z "$ELECTION_ID" ] || [ -z "$CONTESTS_CSV" ] || [ -z "$CANDIDATES_CSV" ] || [ -z "$VOTER_ROLLS_CSV" ]; then
  usage >&2
  exit 2
fi

require_cmd curl
require_cmd jq

for f in "$CONTESTS_CSV" "$CANDIDATES_CSV" "$VOTER_ROLLS_CSV"; do
  if [ ! -f "$f" ]; then
    echo "File not found: $f" >&2
    exit 1
  fi
done

VOTER_DRY_RUN="$(normalize_bool "$VOTER_DRY_RUN")"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
MAP_FILE="$TMP_DIR/contest_map.tsv"
touch "$MAP_FILE"

echo "Checking election status..."
election_json="$(api_request GET "/elections/${ELECTION_ID}")"
election_status="$(printf '%s' "$election_json" | jq -r '.data.status')"
if [ "$election_status" != "draft" ]; then
  echo "Election ${ELECTION_ID} must be draft. Current status: ${election_status}" >&2
  exit 1
fi

echo "Loading existing contests for election ${ELECTION_ID}..."
contests_json="$(api_request GET "/elections/${ELECTION_ID}/contests")"
printf '%s' "$contests_json" | jq -r '
  .data.contests[]
  | select(.metadata.import_key? != null and (.metadata.import_key|type == "string") and (.metadata.import_key|length > 0))
  | "\(.metadata.import_key)\t\(.id)"
' > "$MAP_FILE"

echo "Importing contests from ${CONTESTS_CSV}..."
contest_created=0
contest_updated=0
line_no=0
while IFS=',' read -r raw_key raw_title raw_max raw_province raw_district rest; do
  line_no=$((line_no + 1))

  raw_key="${raw_key//$'\r'/}"
  raw_title="${raw_title//$'\r'/}"
  raw_max="${raw_max//$'\r'/}"
  raw_province="${raw_province//$'\r'/}"
  raw_district="${raw_district//$'\r'/}"

  key="$(trim "$raw_key")"
  title="$(trim "$raw_title")"
  max_sel="$(trim "$raw_max")"
  province="$(trim "$raw_province")"
  district="$(trim "$raw_district")"

  if [ "$line_no" -eq 1 ] && [ "$key" = "contest_key" ]; then
    continue
  fi
  if [ -z "$key" ] && [ -z "$title" ] && [ -z "$max_sel" ]; then
    continue
  fi
  if [ -z "$key" ]; then
    echo "contests.csv line ${line_no}: contest_key is required" >&2
    exit 1
  fi
  if [ -z "$title" ]; then
    echo "contests.csv line ${line_no}: title is required (contest_key=${key})" >&2
    exit 1
  fi
  case "$max_sel" in
    ''|*[!0-9]*)
      echo "contests.csv line ${line_no}: max_selections must be integer >= 1 (contest_key=${key})" >&2
      exit 1
      ;;
  esac
  if [ "$max_sel" -lt 1 ]; then
    echo "contests.csv line ${line_no}: max_selections must be integer >= 1 (contest_key=${key})" >&2
    exit 1
  fi

  metadata="$(
    jq -nc \
      --arg import_key "$key" \
      --arg province "$province" \
      --arg district "$district" \
      '
      {
        import_key: $import_key,
        country: "TH"
      }
      + (if ($province | length) > 0 then { province: $province } else {} end)
      + (
          if ($district | length) > 0
          then { district: (try ($district | tonumber) catch $district) }
          else {}
          end
        )
      '
  )"

  payload="$(
    jq -nc \
      --arg title "$title" \
      --argjson max_selections "$max_sel" \
      --argjson metadata "$metadata" \
      '
      {
        title: $title,
        description: null,
        max_selections: $max_selections,
        metadata: $metadata
      }
      '
  )"

  contest_id="$(map_get "$key" "$MAP_FILE")"
  if [ -n "$contest_id" ]; then
    api_request PATCH "/contests/${contest_id}" "$payload" >/dev/null
    contest_updated=$((contest_updated + 1))
  else
    create_res="$(api_request POST "/elections/${ELECTION_ID}/contests" "$payload")"
    contest_id="$(printf '%s' "$create_res" | jq -r '.data.contest_id')"
    if [ -z "$contest_id" ] || [ "$contest_id" = "null" ]; then
      echo "Failed to parse contest_id for contest_key=${key}" >&2
      exit 1
    fi
    contest_created=$((contest_created + 1))
  fi

  map_set "$key" "$contest_id" "$MAP_FILE"
done < "$CONTESTS_CSV"

echo "Importing candidates from ${CANDIDATES_CSV}..."
candidate_created=0
candidate_skipped=0
line_no=0
while IFS=',' read -r raw_key raw_name raw_manifesto; do
  line_no=$((line_no + 1))
  raw_key="${raw_key//$'\r'/}"
  raw_name="${raw_name//$'\r'/}"
  raw_manifesto="${raw_manifesto//$'\r'/}"

  key="$(trim "$raw_key")"
  name="$(trim "$raw_name")"
  manifesto="$(trim "$raw_manifesto")"

  if [ "$line_no" -eq 1 ] && [ "$key" = "contest_key" ]; then
    continue
  fi
  if [ -z "$key" ] && [ -z "$name" ] && [ -z "$manifesto" ]; then
    continue
  fi
  if [ -z "$key" ] || [ -z "$name" ]; then
    echo "candidates.csv line ${line_no}: contest_key and name are required" >&2
    exit 1
  fi

  contest_id="$(map_get "$key" "$MAP_FILE")"
  if [ -z "$contest_id" ]; then
    echo "candidates.csv line ${line_no}: unknown contest_key=${key}" >&2
    exit 1
  fi

  load_candidate_cache "$contest_id"
  if candidate_exists_in_cache "$contest_id" "$name"; then
    candidate_skipped=$((candidate_skipped + 1))
    continue
  fi

  payload="$(
    jq -nc \
      --arg name "$name" \
      --arg manifesto "$manifesto" \
      '
      {
        name: $name,
        manifesto: (if ($manifesto | length) > 0 then $manifesto else null end)
      }
      '
  )"
  api_request POST "/contests/${contest_id}/candidates" "$payload" >/dev/null
  append_candidate_cache "$contest_id" "$name"
  candidate_created=$((candidate_created + 1))
done < "$CANDIDATES_CSV"

echo "Preparing voter-roll payloads from ${VOTER_ROLLS_CSV}..."
line_no=0
while IFS=',' read -r raw_key raw_identifier rest; do
  line_no=$((line_no + 1))
  raw_key="${raw_key//$'\r'/}"
  raw_identifier="${raw_identifier//$'\r'/}"

  key="$(trim "$raw_key")"
  identifier="$(trim "$raw_identifier")"

  if [ "$line_no" -eq 1 ] && [ "$key" = "contest_key" ]; then
    continue
  fi
  if [ -z "$key" ] && [ -z "$identifier" ]; then
    continue
  fi
  if [ -z "$key" ] || [ -z "$identifier" ]; then
    echo "voter_rolls.csv line ${line_no}: contest_key and identifier are required" >&2
    exit 1
  fi

  contest_id="$(map_get "$key" "$MAP_FILE")"
  if [ -z "$contest_id" ]; then
    echo "voter_rolls.csv line ${line_no}: unknown contest_key=${key}" >&2
    exit 1
  fi

  printf '%s\n' "$identifier" >> "$TMP_DIR/voters_${contest_id}.txt"
done < "$VOTER_ROLLS_CSV"

echo "Importing voter rolls by contest (dry_run=${VOTER_DRY_RUN})..."
voter_total_rows=0
voter_valid_rows=0
voter_inserted_rows=0
voter_duplicates=0
voter_already_in_roll=0
voter_not_found=0

for file in "$TMP_DIR"/voters_*.txt; do
  if [ ! -e "$file" ]; then
    continue
  fi

  contest_id="$(basename "$file" | sed 's/^voters_//; s/\.txt$//')"
  identifiers_json="$(jq -R -s '
    split("\n")
    | map(gsub("\r"; "") | gsub("^\\s+|\\s+$"; ""))
    | map(select(length > 0))
  ' "$file")"

  payload="$(
    jq -nc \
      --arg format "json" \
      --arg data "$identifiers_json" \
      --argjson dry_run "$VOTER_DRY_RUN" \
      '
      {
        format: $format,
        data: $data,
        dry_run: $dry_run
      }
      '
  )"

  report="$(api_request POST "/contests/${contest_id}/voter-rolls/import" "$payload")"
  voter_total_rows=$((voter_total_rows + $(printf '%s' "$report" | jq -r '.data.total_rows')))
  voter_valid_rows=$((voter_valid_rows + $(printf '%s' "$report" | jq -r '.data.valid_rows')))
  voter_inserted_rows=$((voter_inserted_rows + $(printf '%s' "$report" | jq -r '.data.inserted_rows')))
  voter_duplicates=$((voter_duplicates + $(printf '%s' "$report" | jq -r '.data.duplicate_rows')))
  voter_already_in_roll=$((voter_already_in_roll + $(printf '%s' "$report" | jq -r '.data.already_in_roll_rows')))
  voter_not_found=$((voter_not_found + $(printf '%s' "$report" | jq -r '.data.not_found_rows')))
done

echo ""
echo "Bulk import completed:"
echo "- contests: created=${contest_created}, updated=${contest_updated}"
echo "- candidates: created=${candidate_created}, skipped_existing=${candidate_skipped}"
echo "- voter_rolls: total_rows=${voter_total_rows}, valid_rows=${voter_valid_rows}, inserted_rows=${voter_inserted_rows}, duplicate_rows=${voter_duplicates}, already_in_roll_rows=${voter_already_in_roll}, not_found_rows=${voter_not_found}, dry_run=${VOTER_DRY_RUN}"
echo ""
echo "contest_key -> contest_id:"
sort "$MAP_FILE" | sed 's/\t/ -> /g'
