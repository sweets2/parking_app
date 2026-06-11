import type { Sign } from "../shared/types";

// ─── Street cleaning active-now / upcoming checks ────────────────────────────

const SCHEDULE_DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function parseScheduleHour(token: string): number {
  const m = token.trim().match(/^(\d+)\s+(am|pm)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const p = m[2].toLowerCase();
  if (p === "pm" && h !== 12) h += 12;
  if (p === "am" && h === 12) h = 0;
  return h;
}

function getEasternParts(now: Date): { dayIdx: number; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();
  const rawHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute  = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return {
    dayIdx: SCHEDULE_DAY_INDEX[weekday] ?? -1,
    minutesOfDay: (rawHour % 24) * 60 + minute, // % 24 normalises "24" for midnight
  };
}

type ScheduleRange = { startDayIdx: number; endDayIdx: number; startMinutes: number; endMinutes: number };

function parseScheduleRange(schedule: string): ScheduleRange | null {
  const sepIdx = schedule.indexOf("   ");
  if (sepIdx === -1) return null;
  const dayPart  = schedule.slice(0, sepIdx).trim();
  const timePart = schedule.slice(sepIdx).trim();

  const throughMatch = dayPart.match(/^(.+?)\s+through\s+(.+)$/i);
  let startDayIdx: number, endDayIdx: number;
  if (throughMatch) {
    startDayIdx = SCHEDULE_DAY_INDEX[throughMatch[1].toLowerCase().trim()] ?? -1;
    endDayIdx   = SCHEDULE_DAY_INDEX[throughMatch[2].toLowerCase().trim()] ?? -1;
  } else {
    startDayIdx = SCHEDULE_DAY_INDEX[dayPart.toLowerCase()] ?? -1;
    endDayIdx   = startDayIdx;
  }
  if (startDayIdx === -1 || endDayIdx === -1) return null;

  const timeMatch = timePart.match(/^(.+?)\s*[–-]\s*(.+)$/);
  if (!timeMatch) return null;
  const startHour = parseScheduleHour(timeMatch[1]);
  const endHour   = parseScheduleHour(timeMatch[2]);
  if (startHour === -1 || endHour === -1) return null;

  return { startDayIdx, endDayIdx, startMinutes: startHour * 60, endMinutes: endHour * 60 };
}

/** Returns true if `schedule` is currently active in Eastern Time. */
export function isScheduleActiveNow(schedule: string, now: Date): boolean {
  const { dayIdx, minutesOfDay } = getEasternParts(now);
  if (dayIdx === -1) return false;
  const r = parseScheduleRange(schedule);
  if (!r) return false;
  if (dayIdx < r.startDayIdx || dayIdx > r.endDayIdx) return false;
  return minutesOfDay >= r.startMinutes && minutesOfDay < r.endMinutes;
}

/** Returns true if `schedule` starts within the next 60 minutes in Eastern Time. */
export function isScheduleUpcomingSoon(schedule: string, now: Date): boolean {
  const { dayIdx, minutesOfDay } = getEasternParts(now);
  if (dayIdx === -1) return false;
  const r = parseScheduleRange(schedule);
  if (!r) return false;
  if (dayIdx < r.startDayIdx || dayIdx > r.endDayIdx) return false;
  return minutesOfDay >= r.startMinutes - 60 && minutesOfDay < r.startMinutes;
}

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
