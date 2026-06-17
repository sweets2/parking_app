import type { Sign, ParkingSegment, CheckQuery, CheckResultSegment, ParkingWindowConflict, NextRestriction } from "../shared/types";
export {
  getEasternParts,
  isScheduleActiveNow,
  isScheduleUpcomingSoon,
  parseScheduleRange,
} from "./schedule";
import { getEasternParts, parseScheduleRange } from "./schedule";

// ─── F-03.1 HOBOKEN_BOUNDS ───────────────────────────────────────────────────

export const HOBOKEN_BOUNDS: {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
} = {
  latMin: 40.7300,
  latMax: 40.7650,
  lngMin: -74.0650,
  lngMax: -74.0100,
};

// ─── F-03.2 haversineMeters ──────────────────────────────────────────────────

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── F-03.3 isSignActive ─────────────────────────────────────────────────────

/**
 * Convert a Date to a local-time ISO-like string "YYYY-MM-DDTHH:MM:SS".
 * Sign ISO strings are stored as bare local-time strings (no timezone suffix),
 * so comparisons must use the local representation of `now` for consistency
 * across any system timezone.
 */
function toLocalIsoString(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function isSignActive(sign: Sign, now: Date): boolean {
  const nowMs = now.getTime();
  const startMs = new Date(sign.start_iso).getTime();
  const endMs = new Date(sign.end_iso).getTime();
  return startMs <= nowMs && nowMs <= endMs;
}

// ─── F-03.4 filterLoadTimeNoise ──────────────────────────────────────────────

function isInBounds(sign: Sign): boolean {
  return (
    sign.lat >= HOBOKEN_BOUNDS.latMin &&
    sign.lat <= HOBOKEN_BOUNDS.latMax &&
    sign.lng >= HOBOKEN_BOUNDS.lngMin &&
    sign.lng <= HOBOKEN_BOUNDS.lngMax
  );
}

export function filterLoadTimeNoise(signs: Sign[], now: Date): Sign[] {
  const nowStr = toLocalIsoString(now);
  return signs.filter((sign) => {
    // Remove signs outside Hoboken bounds regardless of active status
    if (!isInBounds(sign)) {
      return false;
    }
    // Remove definitively expired signs: inactive at fetch AND end_iso before now
    if (!sign.active_at_fetch) {
      if (sign.end_iso < nowStr) {
        return false;
      }
    }
    return true;
  });
}

// ─── F-03.5 filterActive ─────────────────────────────────────────────────────

export function filterActive(signs: Sign[], now: Date): Sign[] {
  return signs.filter((sign) => isSignActive(sign, now));
}

// ─── F-03.6 filterNearby ─────────────────────────────────────────────────────

export function filterNearby(
  signs: Sign[],
  lat: number,
  lng: number,
  radiusMeters: number,
  now: Date
): Sign[] {
  return signs.filter((sign) => {
    if (!isSignActive(sign, now)) {
      return false;
    }
    const dist = haversineMeters(lat, lng, sign.lat, sign.lng);
    return dist < radiusMeters;
  });
}

// ─── F-03.7 formatCountdown ──────────────────────────────────────────────────

export function formatCountdown(endIso: string, now: Date): string {
  const endTime = new Date(endIso).getTime();
  const diffMs = endTime - now.getTime();
  if (diffMs <= 0) {
    return "0m";
  }
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// ─── F-03.8 formatSignWindow ─────────────────────────────────────────────────

function formatAmPm(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const amPm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 === 0 ? 12 : hours % 12;
  const mm = minutes.toString().padStart(2, "0");
  return `${h}:${mm} ${amPm}`;
}

export function formatSignWindow(sign: Sign, now: Date): string {
  const endDate = new Date(sign.end_iso);
  const isSameDay =
    endDate.getFullYear() === now.getFullYear() &&
    endDate.getMonth() === now.getMonth() &&
    endDate.getDate() === now.getDate();

  const timeStr = formatAmPm(endDate);

  if (isSameDay) {
    return `today at ${timeStr}`;
  }

  // Format: "Www Mmm D at H:MM AM/PM"
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const dayStr = DAYS[endDate.getDay()] ?? "";
  const monthStr = MONTHS[endDate.getMonth()] ?? "";
  const dayNum = endDate.getDate();

  return `${dayStr} ${monthStr} ${dayNum} at ${timeStr}`;
}

// ─── F-03.9 signSeverity ─────────────────────────────────────────────────────

export function signSeverity(sign: Sign): "high" | "medium" | "low" {
  switch (sign.reason) {
    case "CONSTRUCTION":
      return "high";
    case "MOVING":
      return "medium";
    case "EVENT":
      return "medium";
    case "DELIVERY":
      return "low";
  }
}

// ─── F-03.10 nudgeCoords ─────────────────────────────────────────────────────

const NUDGE_DEG = 0.00009;

export function nudgeCoords(
  lat: number,
  lng: number,
  side: "N" | "S" | "E" | "W"
): { lat: number; lng: number } {
  switch (side) {
    case "N":
      return { lat: lat + NUDGE_DEG, lng };
    case "S":
      return { lat: lat - NUDGE_DEG, lng };
    case "E":
      return { lat, lng: lng + NUDGE_DEG };
    case "W":
      return { lat, lng: lng - NUDGE_DEG };
  }
}

// ─── F-03.11 formatTime ──────────────────────────────────────────────────────

export function formatTime(timeStr: string): string {
  const parts = timeStr.split(":");
  const hoursRaw = parseInt(parts[0] ?? "0", 10);
  const minutesRaw = parseInt(parts[1] ?? "0", 10);
  const amPm = hoursRaw >= 12 ? "PM" : "AM";
  const h = hoursRaw % 12 === 0 ? 12 : hoursRaw % 12;
  const mm = minutesRaw.toString().padStart(2, "0");
  return `${h}:${mm} ${amPm}`;
}

// ─── F-13.1 isDataStale ──────────────────────────────────────────────────────

/**
 * Returns true if more than 25 hours have elapsed since fetchedAt.
 * Returns true for unparseable input (fail-safe).
 */
export function isDataStale(fetchedAt: string, now: Date): boolean {
  if (!fetchedAt) {
    return true;
  }
  const fetchedMs = new Date(fetchedAt).getTime();
  if (isNaN(fetchedMs)) {
    return true;
  }
  const elapsedMs = now.getTime() - fetchedMs;
  return elapsedMs > 25 * 60 * 60 * 1000;
}

// ─── F-16 ViolationWindow / nextViolationWindow ──────────────────────────────

export type ViolationWindow = {
  sign: Sign;
  minutesUntilActive: number; // 0 if already active, positive if upcoming
};

/**
 * Returns the next (soonest) violation window among signs within 150 m of the
 * given spot.  An active window has minutesUntilActive === 0.  An upcoming
 * window has minutesUntilActive > 0.  Returns null if no relevant sign exists.
 *
 * Known data limitation: the Hoboken API only returns signs already posted;
 * signs not yet in latest.json cannot be warned about here.
 */

// ─── F-23 getStreetOrientation ────────────────────────────────────────────────

/**
 * Named East-West streets that contain no digit but run E-W (not N-S).
 * Constructed once at module level so the Set is not rebuilt on each call.
 */
const EW_NAMED = new Set(["OBSERVER HWY", "NEWARK ST"]);

/**
 * Classify a sign address as East-West ("EW") or North-South ("NS").
 *
 * Algorithm:
 * 1. Strip the leading house-number token (handles both "257 11TH ST" and
 *    "257-257 11TH ST" formats).
 * 2. If the stripped street name contains a digit → "EW" (numbered streets).
 * 3. If the stripped street name is in EW_NAMED → "EW".
 * 4. Otherwise → "NS".
 */
export function getStreetOrientation(address: string): "EW" | "NS" {
  const street = address.replace(/^\d[\d-]*\s+/, "").trim();
  if (/\d/.test(street)) {
    return "EW";
  }
  if (EW_NAMED.has(street)) {
    return "EW";
  }
  return "NS";
}

// ─── F-20 extractCrossStreets ──────────────────────────────────────────────────

/**
 * Parses a raw StreetCleaningEntry.location string like "Observer Hwy. to Seventh St."
 * into a [from, to] tuple, stripping trailing periods from each part.
 * Returns null if the string cannot be parsed.
 */
export function extractCrossStreets(location: string): [string, string] | null {
  const parts = location.split(" to ");
  if (parts.length !== 2) {
    return null;
  }
  const from = (parts[0] ?? "").replace(/\.$/, "");
  const to   = (parts[1] ?? "").replace(/\.$/, "");
  return [from, to];
}

// ─── F-20 detectMatchingSegment ───────────────────────────────────────────────

/**
 * Returns true if the click coordinate falls between the two geocoded cross-street
 * coordinates. Uses the dominant axis (lat for N-S streets, lng for E-W streets).
 * When deltaLat === deltaLng, treats as E-W (uses longitude axis).
 */
export function detectMatchingSegment(
  clickLat: number,
  clickLng: number,
  fromCoord: { lat: number; lng: number },
  toCoord: { lat: number; lng: number }
): boolean {
  const deltaLat = Math.abs(fromCoord.lat - toCoord.lat);
  const deltaLng = Math.abs(fromCoord.lng - toCoord.lng);
  if (deltaLat > deltaLng) {
    // N-S street — check latitude
    const minLat = Math.min(fromCoord.lat, toCoord.lat);
    const maxLat = Math.max(fromCoord.lat, toCoord.lat);
    return clickLat >= minLat && clickLat <= maxLat;
  } else {
    // E-W street (or equal delta — treat as E-W) — check longitude
    const minLng = Math.min(fromCoord.lng, toCoord.lng);
    const maxLng = Math.max(fromCoord.lng, toCoord.lng);
    return clickLng >= minLng && clickLng <= maxLng;
  }
}

// ─── F-48 Priority ordering ──────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  tow:     5,
  snow:    4,
  ticket:  3,
  limited: 2,
  unknown: 1,
  safe:    0,
};

function statusPriority(s: string): number {
  return STATUS_PRIORITY[s] ?? 0;
}

// ─── F-48 evaluateParkingWindow ──────────────────────────────────────────────

/**
 * Expand a cleaning schedule into an interval on a specific day and check
 * whether it overlaps [queryStartMs, queryEndMs).
 * Returns a ParkingWindowConflict if overlap, else null.
 * Returns a "unknown" conflict if schedule cannot be parsed.
 */
function evaluateCleaningEntry(
  schedule: string,
  queryStartMs: number,
  queryEndMs: number
): ParkingWindowConflict | null {
  const r = parseScheduleRange(schedule);
  if (!r) {
    // Unparseable schedule → unknown
    return {
      status: "unknown",
      reason: `Could not parse schedule: "${schedule}"`,
      label: "Unknown schedule",
      sourceType: "unknown",
    };
  }

  // Evaluate for each day in the query window
  // We iterate over all calendar days that intersect the query window.
  // For each day, if the day of week matches the schedule day range, we check
  // if the schedule interval overlaps the query interval.
  //
  // Strategy: iterate from queryStartMs day to queryEndMs day (inclusive),
  // check each day's Eastern time dayIdx against the schedule.
  //
  // To avoid complexity with DST, we iterate by day (86400000 ms steps)
  // anchored at the start of each day in Eastern time.

  // Walk days from the day containing queryStart to the day containing queryEnd
  // We check up to 8 days (covers any week span in the query range).
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // Start from the beginning of the day containing queryStart (rounded down to nearest day)
  // We'll iterate from queryStartMs minus 1 day (to catch edge cases) to queryEndMs plus 1 day.
  const iterStart = queryStartMs - MS_PER_DAY;
  const iterEnd   = queryEndMs   + MS_PER_DAY;

  for (let dayAnchor = iterStart; dayAnchor <= iterEnd; dayAnchor += MS_PER_DAY) {
    const anchorDate = new Date(dayAnchor);
    const { dayIdx } = getEasternParts(anchorDate);
    if (dayIdx === -1) continue;
    if (dayIdx < r.startDayIdx || dayIdx > r.endDayIdx) continue;

    // Compute ET midnight for this day by measuring how many minutes of day
    // the anchor is at in Eastern time, then subtracting that from the anchor.
    const { minutesOfDay: anchorMinutes } = getEasternParts(anchorDate);
    const etMidnightMs = dayAnchor - anchorMinutes * 60 * 1000;

    // Schedule interval in UTC ms
    const schedStartMs = etMidnightMs + r.startMinutes * 60 * 1000;
    const schedEndMs   = etMidnightMs + r.endMinutes   * 60 * 1000;

    // Check overlap: [queryStart, queryEnd) overlaps [schedStart, schedEnd)
    // Overlap condition: queryStart < schedEnd AND queryEnd > schedStart
    if (queryStartMs < schedEndMs && queryEndMs > schedStartMs) {
      return {
        status: "ticket",
        reason: `Street cleaning: ${schedule}`,
        label: `Street cleaning`,
        startsAt: new Date(schedStartMs),
        endsAt:   new Date(schedEndMs),
        sourceType: "street-cleaning",
      };
    }
  }

  return null;
}

export function evaluateParkingWindow(
  segment: ParkingSegment,
  query: CheckQuery
): CheckResultSegment {
  const conflicts: ParkingWindowConflict[] = [];
  const queryStartMs = query.startTime.getTime();
  const queryEndMs   = query.endTime.getTime();

  // --- Tow signs ---
  for (const sign of segment.towSigns) {
    const signStartMs = new Date(sign.start_iso).getTime();
    const signEndMs   = new Date(sign.end_iso).getTime();
    // Overlap: [queryStart, queryEnd) overlaps [signStart, signEnd)
    if (queryStartMs < signEndMs && queryEndMs > signStartMs) {
      conflicts.push({
        status: "tow",
        reason: `Tow sign: ${sign.reason} at ${sign.address}`,
        label: `Tow zone`,
        startsAt: new Date(signStartMs),
        endsAt:   new Date(signEndMs),
        sourceId:   sign.id,
        sourceType: "tow-sign",
      });
    }
  }

  // --- Snow routes ---
  for (const route of segment.snowRoutes) {
    // Snow routes are always-active seasonal restrictions
    conflicts.push({
      status: "snow",
      reason: `Snow emergency route: ${route.street} (${route.from} to ${route.to})`,
      label: `Snow emergency route`,
      sourceType: "snow-route",
    });
  }

  // --- Street cleaning entries ---
  // Track whether any entry was unparseable
  let hasUnparseable = false;
  for (const entry of segment.cleaningEntries) {
    const conflict = evaluateCleaningEntry(entry.schedule, queryStartMs, queryEndMs);
    if (conflict !== null) {
      if (conflict.status === "unknown") {
        hasUnparseable = true;
      }
      conflicts.push(conflict);
    }
  }

  // Determine status
  let status: CheckResultSegment["status"] = "safe";
  if (hasUnparseable && conflicts.length === 1 && conflicts[0]?.status === "unknown") {
    status = "unknown";
  } else if (conflicts.length > 0) {
    let maxPriority = -1;
    for (const c of conflicts) {
      const p = statusPriority(c.status);
      if (p > maxPriority) {
        maxPriority = p;
        status = c.status;
      }
    }
  }

  const primaryConflict = getPrimaryConflict(conflicts);

  return {
    id:        segment.id,
    street:    segment.street,
    location:  segment.location,
    side:      segment.side,
    geometry:  segment.geometry,
    status,
    conflicts,
    primaryConflict,
  };
}

// ─── F-48 getPrimaryConflict ─────────────────────────────────────────────────

export function getPrimaryConflict(
  conflicts: ParkingWindowConflict[]
): ParkingWindowConflict | undefined {
  if (conflicts.length === 0) return undefined;

  let best: ParkingWindowConflict | undefined = undefined;
  let bestPriority = -1;

  for (const c of conflicts) {
    const p = statusPriority(c.status);
    if (p > bestPriority) {
      bestPriority = p;
      best = c;
    }
  }

  return best;
}

// ─── F-48 getNextRestriction ─────────────────────────────────────────────────

export function getNextRestriction(
  segment: ParkingSegment,
  after: Date
): NextRestriction | undefined {
  const afterMs = after.getTime();
  let best: NextRestriction | undefined = undefined;

  // --- Tow signs ---
  for (const sign of segment.towSigns) {
    const startMs = new Date(sign.start_iso).getTime();
    const endMs   = new Date(sign.end_iso).getTime();

    // Must start strictly after `after`
    if (startMs <= afterMs) continue;

    const candidate: NextRestriction = {
      startsAt: new Date(startMs),
      endsAt:   new Date(endMs),
      label:    `Tow zone: ${sign.reason} at ${sign.address}`,
      status:   "tow",
    };

    if (best === undefined || startMs < best.startsAt.getTime()) {
      best = candidate;
    }
  }

  // Snow routes produce no time-bound restriction per spec.

  return best;
}

export function nextViolationWindow(
  signs: Sign[],
  spot: { lat: number; lng: number },
  now: Date
): ViolationWindow | null {
  const RADIUS_METERS = 150;
  const nowMs = now.getTime();

  let best: ViolationWindow | null = null;

  for (const sign of signs) {
    const dist = haversineMeters(spot.lat, spot.lng, sign.lat, sign.lng);
    if (dist >= RADIUS_METERS) {
      continue;
    }

    const startMs = new Date(sign.start_iso).getTime();
    const endMs = new Date(sign.end_iso).getTime();

    // Skip signs that have fully expired
    if (endMs < nowMs) {
      continue;
    }

    // Skip signs that haven't started yet but whose start is irrelevant —
    // actually we WANT upcoming signs, so only skip truly expired ones above.
    // Upcoming signs are those where startMs > nowMs.

    let minutesUntilActive: number;
    if (startMs <= nowMs) {
      // Currently active (window started, not yet ended)
      minutesUntilActive = 0;
    } else {
      // Upcoming — compute floor of minutes until start
      minutesUntilActive = Math.floor((startMs - nowMs) / (60 * 1000));
    }

    if (best === null || minutesUntilActive < best.minutesUntilActive) {
      best = { sign, minutesUntilActive };
    }
  }

  return best;
}
