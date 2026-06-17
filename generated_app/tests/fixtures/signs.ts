/**
 * Test fixtures derived from data/latest.json (fetched 2026-06-09T13:52:50.509612Z).
 *
 * This file reads data/latest.json at import time, transforms every raw record
 * into a typed Sign, and exports named constants for use in tests.
 *
 * Hoboken bounding box used for bad-coordinate detection:
 *   lat:  40.733 – 40.773
 *   lng: -74.060 – -74.010
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { SIGN_REASONS } from "../../shared/types";
import type { Sign, ParkingData } from "../../shared/types";

// ---------------------------------------------------------------------------
// Hoboken bounding box
// ---------------------------------------------------------------------------
export const HOBOKEN_BOUNDS = {
  latMin: 40.7300,
  latMax: 40.7650,
  lngMin: -74.0650,
  lngMax: -74.0100,
} as const;

// ---------------------------------------------------------------------------
// Stable time references — always use these in tests; never use new Date()
// ---------------------------------------------------------------------------

/** When the data file was fetched. Raw value: "2026-06-09T13:52:50.509612Z" */
export const FETCH_TIME: Date = new Date("2026-06-09T13:52:50.509Z");

/**
 * A point in time that falls well within the active window of most signs
 * in the dataset (many signs span 6/08/2026–6/12/2026).
 * Represents noon ET on June 9 2026.
 */
export const NOW_STABLE: Date = new Date("2026-06-09T16:00:00.000Z"); // 12:00 ET

/**
 * A point in time after all non-permanent signs in the dataset have expired.
 * All short-lived signs end by 11/30/2026; permanent sentinel signs end
 * 12/31/2030.  This timestamp falls after even those.
 */
export const NOW_AFTER_EXPIRED: Date = new Date("2031-01-01T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Shape of a sign entry in data/latest.json (normalized field names). */
interface RawJsonSign {
  id: string;
  address: string;
  start_date: string;
  start_time: string;
  stop_date: string;
  end_time: string;
  reason: string;
  permit_number: string;
  lat: number;
  lng: number;
  start_iso: string;
  end_iso: string;
  active_at_fetch: boolean;
}

/** Shape of the top-level object in data/latest.json. */
interface RawJsonFile {
  fetched_at: string;
  count: number;
  signs: RawJsonSign[];
}

/** Convert "M/D/YYYY" + "HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" (local time). */
function toIso(date: string, time: string): string {
  const [m, d, y] = date.split("/");
  const mm = (m ?? "").padStart(2, "0");
  const dd = (d ?? "").padStart(2, "0");
  return `${y}-${mm}-${dd}T${time}`;
}

/**
 * Determine active_at_fetch by checking that the sign's window contains the
 * fetch instant: start_iso <= fetchLocalStr <= end_iso.  Both bounds are
 * compared as local-time strings (ET).  FETCH_TIME is 2026-06-09T13:52:50Z
 * which is 2026-06-09T09:52:50 ET.
 */
function isActiveAtFetch(startIso: string, endIso: string): boolean {
  const fetchLocalStr = "2026-06-09T09:52:50";
  return startIso <= fetchLocalStr && endIso >= fetchLocalStr;
}

/** Validate reason field against the known enum values. */
function toSignReason(raw: string): Sign["reason"] {
  if ((SIGN_REASONS as readonly string[]).includes(raw)) {
    return raw as Sign["reason"];
  }
  // Fall back to CONSTRUCTION for unrecognised values (fixture tolerance).
  return "CONSTRUCTION";
}

/** Transform a raw JSON sign entry into a typed Sign. */
function transform(raw: RawJsonSign): Sign {
  const startIso = toIso(raw.start_date, raw.start_time);
  const endIso = toIso(raw.stop_date, raw.end_time);
  return {
    id: raw.id,
    address: raw.address,
    reason: toSignReason(raw.reason),
    permit_number: raw.permit_number,
    lat: raw.lat,
    lng: raw.lng,
    start_date: raw.start_date,
    start_time: raw.start_time,
    stop_date: raw.stop_date,
    end_time: raw.end_time,
    start_iso: startIso,
    end_iso: endIso,
    active_at_fetch: isActiveAtFetch(startIso, endIso),
  };
}

// ---------------------------------------------------------------------------
// Load and transform all signs from data/latest.json
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataPath = join(__dirname, "../../data/latest.json");
const raw = JSON.parse(readFileSync(dataPath, "utf-8")) as RawJsonFile;

/** Mirrors the top-level ParkingData shape (count + signs length must match). */
export const ALL_DATA: Pick<ParkingData, "count"> = { count: raw.count };

/** Every sign from data/latest.json, fully transformed. */
export const ALL_SIGNS: Sign[] = raw.signs.map(transform);

// ---------------------------------------------------------------------------
// Aggregate subsets
// ---------------------------------------------------------------------------

/** All signs with active_at_fetch === true. */
export const ACTIVE_SIGNS: Sign[] = ALL_SIGNS.filter((s) => s.active_at_fetch);

/** All signs with active_at_fetch === false. */
export const EXPIRED_SIGNS: Sign[] = ALL_SIGNS.filter((s) => !s.active_at_fetch);

/**
 * Signs whose stop_date sentinel is "12/31/2030" (indefinitely active /
 * permanent restriction).
 */
export const PERMANENT_SIGNS: Sign[] = ALL_SIGNS.filter(
  (s) => s.stop_date === "12/31/2030"
);

// ---------------------------------------------------------------------------
// Named individual representative signs
// ---------------------------------------------------------------------------

/**
 * Sign whose longitude (-73.9804315) falls well outside Hoboken's lng range.
 * Raw record id 215864 — "38-48 PARK AVE".
 */
export const SIGN_BAD_COORD: Sign | undefined = ALL_SIGNS.find(
  (s) => s.id === "215864"
);

/**
 * A sign with stop_date "12/31/2030" — treated as indefinitely active.
 * Raw record id 200471 — "257-257 11TH ST".
 */
export const SIGN_PERMANENT: Sign | undefined = ALL_SIGNS.find(
  (s) => s.id === "200471"
);

/**
 * A sign that is clearly active at fetch time (start_iso <= fetch <= end_iso).
 * Raw record id 213435 — "306-310 SINATRA DR", window 2026-04-01 to 2026-11-30.
 */
export const SIGN_ACTIVE: Sign | undefined = ALL_SIGNS.find(
  (s) => s.id === "213435"
);

/**
 * A sign that was expired at fetch time.  The live dataset fetched on
 * 2026-06-09 at 09:52 ET contained no signs whose end_iso preceded the
 * fetch moment.  EXPIRED_SIGNS may therefore be empty from real data; this
 * constant is the first expired sign if any exists, or undefined otherwise.
 */
export const SIGN_EXPIRED: Sign | undefined = EXPIRED_SIGNS[0];

/**
 * Two signs at identical coordinates (lat/lng pair shared by ids 200484 and 200485).
 */
export const SIGN_SAME_COORD_A: Sign | undefined = ALL_SIGNS.find(
  (s) => s.id === "200484"
);

export const SIGN_SAME_COORD_B: Sign | undefined = ALL_SIGNS.find(
  (s) => s.id === "200485"
);

// ── F-03 spec aliases ─────────────────────────────────────────────────────────

/** Alias for SIGN_PERMANENT — permanent sign at "257-257 11TH ST" (id 200471). */
export const SIGN_PERMANENT_1: Sign | undefined = SIGN_PERMANENT;

/** Second sign on 11th St close to SIGN_PERMANENT_1 — "259-265 11TH ST" (id 216275). */
export const SIGN_11TH_ST: Sign | undefined = ALL_SIGNS.find(
  (s) => s.id === "216275"
);

/** Alias for SIGN_EXPIRED — first expired sign in the dataset, if any. */
export const SIGN_EXPIRED_1: Sign | undefined = SIGN_EXPIRED;

/** Alias for SIGN_SAME_COORD_A — signs sharing coordinates on Bloomfield St. */
export const SIGN_13TH_ST_A: Sign | undefined = SIGN_SAME_COORD_A;

/** Alias for SIGN_SAME_COORD_B. */
export const SIGN_13TH_ST_B: Sign | undefined = SIGN_SAME_COORD_B;
