# CF-D1 — API Discovery

## What this is

A discovery feature (no code, no tests). Research the Hoboken parking API and document it.

## Output

`docs/api-discovery.md` — a markdown document containing:

1. The base URL of the Hoboken parking API.
2. At least one working example endpoint URL (resolvable via DNS).
3. A sample of the raw JSON response structure (sign fields, data types).
4. Notes on the `future` endpoint and how it differs from the main endpoint.

## Definition of done

- `docs/api-discovery.md` exists and is non-empty.
- Contains at least one valid HTTP/HTTPS URL whose hostname resolves via DNS.

## Hard constraints

This is a discovery feature (`run_tests: false`). No TypeScript, no tests. Output is documentation only.
