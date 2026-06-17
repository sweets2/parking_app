# Hoboken Parking API — Discovery Notes

## Base URL

```
https://api-hpuvp.hobokennj.gov/api/v1/parking
```

## Endpoints

### Current / Active Signs

```
GET https://api-hpuvp.hobokennj.gov/api/v1/parking
```

Returns all parking restriction signs that are currently active or recently active. The response envelope wraps the sign array in a `data` field with a top-level `status` field.

### Future / Upcoming Signs

```
GET https://api-hpuvp.hobokennj.gov/api/v1/parking/future
```

Returns signs whose start date is in the future (not yet active at the time of the request). The same response shape is used; the difference is purely temporal — signs here have `start_iso` values that are after the fetch time.

## Response Shape

Both endpoints return the same JSON envelope:

```json
{
  "status": "success",
  "data": [
    {
      "id": "216439",
      "address": "361-365 1ST ST",
      "reason": "CONSTRUCTION",
      "permit_number": "640946",
      "latitude": 40.738214,
      "longitude": -74.0360203,
      "start_date": "6/12/2026",
      "start_time": "08:00:00",
      "stop_date": "6/12/2026",
      "end_time": "16:00:00"
    }
  ]
}
```

### Field types (raw API)

| Field          | Type   | Notes                                      |
|----------------|--------|--------------------------------------------|
| `id`           | string | Unique sign identifier                     |
| `address`      | string | House number range + street name           |
| `reason`       | string | One of: `EVENT`, `CONSTRUCTION`, `UTILITY` |
| `permit_number`| string | City-issued permit number                  |
| `latitude`     | number | Decimal degrees, WGS-84                    |
| `longitude`    | number | Decimal degrees, WGS-84 (negative = west)  |
| `start_date`   | string | `M/D/YYYY` format                          |
| `start_time`   | string | `HH:MM:SS` (local time, no timezone)       |
| `stop_date`    | string | `M/D/YYYY` format                          |
| `end_time`     | string | `HH:MM:SS` (local time, no timezone)       |

## How the Future Endpoint Differs

- `/parking` — includes signs that are currently active (fetch time falls between `start_date/time` and `stop_date/time`).
- `/parking/future` — returns signs whose `start_date/time` is strictly after the fetch time. Signs that are already active do not appear here. Zero upcoming signs is a valid response (the `data` array will be empty).

The fetcher transforms both responses identically: it converts `start_date` + `start_time` and `stop_date` + `end_time` into ISO 8601 strings (`YYYY-MM-DDTHH:MM:SS`, no timezone suffix) and computes an `active_at_fetch` boolean. For the future endpoint, only signs with `start_iso > fetchLocalIso` are kept in the output file (`data/future.json`).

## Notes

- Dates use `M/D/YYYY` (not zero-padded) in the raw API; the fetcher normalizes them.
- Times are local (America/New_York) with no UTC offset in the raw API.
- `latitude`/`longitude` in the raw API become `lat`/`lng` in the normalized `Sign` type stored in `data/latest.json` and `data/future.json`.
- The API does not paginate; all active or future signs are returned in a single response.
- A response with `status !== "success"` or `data` not being an array is treated as fatal.
