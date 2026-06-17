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

## Auto-Analysis (recurring failures)

> Auto-generated after multiple blocked runs. Additive only — does not change spec requirements.

**Failures repeated across runs:** "Spec item 3 — sample of raw JSON response structure: the document shows only the top-level {status, data} wrapper with /* array of sign objects */ as a placeholder, but does not include any actual sign object fields or their data types", "Spec requirement #3 missing: docs/api-discovery.md does not include a sample of the raw sign object fields and data types. The JSON block shows the outer envelope ({ \"status\", \"data\" }) but uses /* array of sign objects */ as a placeholder — no actual sign field names or their data types are documented"

### Suggested spec amendments

- Output requirement #3 currently reads "A sample of the raw JSON response structure (sign fields, data types)" but agents have repeatedly produced only the outer envelope `{ "status": "...", "data": [ /* array of sign objects */ ] }` without expanding the sign object itself. The spec should be changed to explicitly state: "A sample of the raw JSON response structure that includes at least one complete sign object with all discovered field names and their data types — e.g. `id`, `location`, `startTime`, `endTime`, `signType`, coordinates, etc. A placeholder comment such as `/* array of sign objects */` does not satisfy this requirement; real field names and example values must appear in the JSON sample."
