import * as nodePath from "path";
import * as nodeFs from "fs";
import type { Sign, ParkingData, RawSign, RawApiResponse } from "../shared/types";

const API_URL = "https://api-hpuvp.hobokennj.gov/api/v1/parking";
const FUTURE_API_URL = "https://api-hpuvp.hobokennj.gov/api/v1/parking/future";

// Resolve data directory relative to this file at runtime
const DATA_DIR = nodePath.resolve(
  nodePath.dirname(new URL(import.meta.url).pathname),
  "../data"
);

/**
 * Converts "M/D/YYYY" + "HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" (local time, no tz suffix).
 */
export function toIsoDatetime(dateStr: string, timeStr: string): string {
  const parts = dateStr.split("/");
  const monthStr = parts[0] ?? "";
  const dayStr = parts[1] ?? "";
  const yearStr = parts[2] ?? "";
  const month = String(Number(monthStr)).padStart(2, "0");
  const day = String(Number(dayStr)).padStart(2, "0");
  return `${yearStr}-${month}-${day}T${timeStr}`;
}

/**
 * Returns true if fetchedAt (ISO string) falls within [sign.start_iso, sign.end_iso].
 * Comparison is done by truncating fetchedAt to "YYYY-MM-DDTHH:MM:SS" (dropping sub-seconds and Z).
 */
export function computeActiveAtFetch(
  sign: { start_iso: string; end_iso: string },
  fetchedAt: string
): boolean {
  // Normalize fetchedAt: strip milliseconds and timezone to get local-comparable string
  // fetchedAt may be like "2026-06-09T13:52:50.509Z" — truncate at the seconds boundary
  const truncated = fetchedAt.slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
  return truncated >= sign.start_iso && truncated <= sign.end_iso;
}

/**
 * Type guard: checks top-level shape of API response.
 * Returns true only if raw is a non-null object with a "data" array property.
 */
export function validateResponseShape(raw: unknown): raw is RawApiResponse {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  if (!("data" in obj) || !Array.isArray(obj["data"])) {
    return false;
  }
  return true;
}

/**
 * Type guard: checks individual sign shape.
 * Returns true only if raw is a non-null object with string fields:
 * id, address, start_date, start_time, stop_date, end_time, lat, lng.
 */
export function validateSign(raw: unknown): raw is RawSign {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  const stringFields = [
    "id",
    "address",
    "start_date",
    "start_time",
    "stop_date",
    "end_time",
  ] as const;
  for (const field of stringFields) {
    if (typeof obj[field] !== "string") {
      return false;
    }
  }
  // lat and lng must be present (can be number or string per spec — spec says "string fields: id, address, start_date, start_time, stop_date, end_time, lat, lng")
  // spec says "string fields: id, address, start_date, start_time, stop_date, end_time, lat, lng"
  // but lat/lng come as numbers from the API per types.ts; let's treat them as requiring presence with string type
  if (typeof obj["lat"] !== "string" && typeof obj["lat"] !== "number") {
    return false;
  }
  if (typeof obj["lng"] !== "string" && typeof obj["lng"] !== "number") {
    return false;
  }
  return true;
}

/**
 * Logs a warning if newCount < 50% of prevCount (unusual data drop).
 * Does not throw; always returns undefined.
 */
export function checkCountDrop(newCount: number, prevCount: number): void {
  if (newCount < prevCount * 0.5) {
    console.warn(
      `Warning: sign count dropped from ${prevCount} to ${newCount} (${Math.round((newCount / prevCount) * 100)}% of previous count)`
    );
  }
}

/**
 * Injectable file system interface for testability.
 * Uses synchronous methods to match Node fs module's sync API.
 */
export interface FsBackend {
  writeFileSync(path: string, data: string): void;
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

const realFs: FsBackend = {
  writeFileSync: (p, data) => nodeFs.writeFileSync(p, data, "utf8"),
  existsSync: (p) => nodeFs.existsSync(p),
  readFileSync: (p, encoding) => nodeFs.readFileSync(p, encoding),
  mkdirSync: (p, options) => { nodeFs.mkdirSync(p, options); },
};

function transformRawSign(raw: RawSign, fetchedAt: string): Sign {
  const start_iso = toIsoDatetime(raw.start_date, raw.start_time);
  const end_iso = toIsoDatetime(raw.stop_date, raw.end_time);
  const active_at_fetch = computeActiveAtFetch({ start_iso, end_iso }, fetchedAt);

  return {
    id: raw.id,
    address: raw.address,
    reason: raw.reason as Sign["reason"],
    permit_number: raw.permit_number,
    lat: raw.latitude,
    lng: raw.longitude,
    start_date: raw.start_date,
    start_time: raw.start_time,
    stop_date: raw.stop_date,
    end_time: raw.end_time,
    start_iso,
    end_iso,
    active_at_fetch,
  };
}

/**
 * Fetches the main endpoint, parses and validates the response,
 * writes data/latest.json and a timestamped archive file under data/archive/.
 */
export async function runFetcher(fs: FsBackend): Promise<void> {
  const fetchedAt = new Date().toISOString();

  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}`);
  }

  const rawBody: unknown = await response.json();

  if (!validateResponseShape(rawBody)) {
    throw new Error("Invalid API response shape");
  }

  const signs: Sign[] = rawBody.data.map((raw) =>
    transformRawSign(raw, fetchedAt)
  );

  // Check for count drop if previous data exists
  const latestPath = nodePath.join(DATA_DIR, "latest.json");
  if (fs.existsSync(latestPath)) {
    try {
      const existing = fs.readFileSync(latestPath, "utf8");
      const parsed = JSON.parse(existing) as { count?: unknown };
      if (typeof parsed.count === "number") {
        checkCountDrop(signs.length, parsed.count);
      }
    } catch {
      // Ignore read/parse errors
    }
  }

  const output: ParkingData = {
    fetched_at: fetchedAt,
    count: signs.length,
    signs,
  };

  const json = JSON.stringify(output, null, 2);

  // Write latest.json
  fs.writeFileSync(latestPath, json);

  // Write timestamped archive
  fs.mkdirSync(nodePath.join(DATA_DIR, "archive"), { recursive: true });
  const dateTag = fetchedAt.slice(0, 10); // "YYYY-MM-DD"
  const archivePath = nodePath.join(DATA_DIR, "archive", `parking_${dateTag}.json`);
  fs.writeFileSync(archivePath, json);

  console.log(`Wrote ${signs.length} signs to ${latestPath} and ${archivePath}`);
}

/**
 * Fetches the future endpoint, parses and validates the response,
 * writes data/future.json via fs.writeFileSync.
 */
export async function runFutureFetcherWithFs(fs: FsBackend): Promise<void> {
  const fetchedAt = new Date().toISOString();

  const response = await fetch(FUTURE_API_URL);
  if (!response.ok) {
    throw new Error(`Future API returned HTTP ${response.status}`);
  }

  const rawBody: unknown = await response.json();

  if (!validateResponseShape(rawBody)) {
    throw new Error("Invalid future API response shape");
  }

  const signs: Sign[] = rawBody.data.map((raw) =>
    transformRawSign(raw, fetchedAt)
  );

  const futurePath = nodePath.join(DATA_DIR, "future.json");
  const output = {
    fetched_at: fetchedAt,
    count: signs.length,
    signs,
  };

  fs.writeFileSync(futurePath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${signs.length} signs to ${futurePath}`);
}

/**
 * Runs runFetcher and runFutureFetcherWithFs sequentially (await each in order).
 * If runFetcher throws, runFutureFetcherWithFs is NOT called.
 */
export async function runFetcherWithFs(fs: FsBackend): Promise<void> {
  await runFetcher(fs);
  await runFutureFetcherWithFs(fs);
}

// Run if this is the entry point (when executed directly via tsx)
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("fetch.ts") || process.argv[1].endsWith("fetch.js"));

if (isMain) {
  runFetcherWithFs(realFs).catch((err: unknown) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
