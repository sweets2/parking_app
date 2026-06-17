# Hoboken Parking API — Discovery Notes

## Endpoint

```
GET https://api-hpuvp.hobokennj.gov/api/v1/parking
```

This is the backend for the Hoboken VVP (Visitor Virtual Parking) web app at `https://hpuvp.hobokennj.gov/parking/`. It is publicly accessible with no authentication.

A second endpoint returns current signs plus signs up to 14 days in advance:

```
GET https://api-hpuvp.hobokennj.gov/api/v1/parking/future
```

The fetcher uses the base `/parking` endpoint (active signs only). The map UI uses `/parking/future` to show upcoming restrictions.

## Required Headers

None. The endpoint returns JSON without any `Authorization`, `X-API-Key`, or other custom header.

Standard browser headers are accepted; a plain `curl` request with no extra headers succeeds with HTTP 200.

## Rate Limiting

The API returns rate-limit headers on every response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: <N>
```

The limit is 60 requests per minute per IP. The fetcher runs once daily, so this is not a concern in normal operation.

## Top-Level Response Shape

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

### Sign Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique permit sign identifier (numeric string, e.g. `"216439"`) |
| `address` | string | Street address range of the sign (e.g. `"361-365 1ST ST"`) |
| `reason` | string | Reason code for the restriction. Known values: `"CONSTRUCTION"`, `"EVENT"`, `"FILM"`, `"UTILITY"`, `"OTHER"` |
| `permit_number` | string | Permit number associated with the sign (e.g. `"640946"`) |
| `latitude` | number | WGS-84 latitude of the sign location (e.g. `40.738214`) |
| `longitude` | number | WGS-84 longitude of the sign location (e.g. `-74.0360203`) |
| `start_date` | string | Start date in `"M/D/YYYY"` format (e.g. `"6/12/2026"`) |
| `start_time` | string | Start time in `"HH:MM:SS"` 24-hour format (e.g. `"08:00:00"`) |
| `stop_date` | string | End date in `"M/D/YYYY"` format (e.g. `"6/12/2026"`) |
| `end_time` | string | End time in `"HH:MM:SS"` 24-hour format (e.g. `"16:00:00"`) |

- `status`: `"success"` on a normal response. Any non-`"success"` value indicates an error condition — the fetcher should treat it as a fatal error.
- `data`: array of raw sign records. As of June 2026, a typical response returns ~100–270 records depending on the endpoint.

## Observed Behavior

- HTTP 200 on every successful request.
- No pagination — all signs are returned in a single response.
- Empty `data` arrays have not been observed in production, but the fetcher must guard against them (see F-01.5).
- The API is operated by GeoSpoc on behalf of Hoboken Parking Utility (HPU).
