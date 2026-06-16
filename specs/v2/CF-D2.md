# CF-D2 — Data Schema Analysis

## What this is

A discovery feature (no code, no tests). Fetch live data from the Hoboken parking API and document the schema, then write `data/latest.json` with the result.

## Output

1. `docs/data-schema.md` — documents every field in a sign object: name, type, example value, and semantics. Must cover: `id`, `address`, `reason`, `permit_number`, `lat`, `lng`, `start_date`, `start_time`, `stop_date`, `end_time`, `start_iso`, `end_iso`, `active_at_fetch`.

2. `data/latest.json` — a real fetched snapshot from the API with structure:
   ```json
   {
     "fetched_at": "<ISO timestamp>",
     "count": <number>,
     "signs": [ ... ]
   }
   ```
   `count` must equal `signs.length`. `signs` must be non-empty. Each sign must have at least 4 fields.

## Definition of done

- Both files exist and are non-empty.
- `data/latest.json` passes the structural validation above.

## Hard constraints

This is a discovery feature (`run_tests: false`). No TypeScript, no tests. Output is documentation + data files only.
