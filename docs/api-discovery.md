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
  "data": [ /* array of sign objects */ ]
}
```

- `status`: `"success"` on a normal response. Any non-`"success"` value indicates an error condition — the fetcher should treat it as a fatal error.
- `data`: array of raw sign records. As of June 2026, a typical response returns ~100–270 records depending on the endpoint.

## Observed Behavior

- HTTP 200 on every successful request.
- No pagination — all signs are returned in a single response.
- Empty `data` arrays have not been observed in production, but the fetcher must guard against them (see F-01.5).
- The API is operated by GeoSpoc on behalf of Hoboken Parking Utility (HPU).
