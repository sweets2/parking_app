/**
 * shared/query-parser.ts — F-47
 *
 * Pure logic module: parses simple parking duration queries and creates CheckQuery objects.
 *
 * No browser globals, no DOM, no localStorage, no fetch, no I/O.
 * No new Date() calls except through the injected `now` parameter.
 * Only named exports.
 */

import type { CheckQuery } from "./types";

// ─── Label helpers ────────────────────────────────────────────────────────────

/**
 * Return a human-readable label for a duration in minutes.
 */
function minutesToLabel(minutes: number): string {
  if (minutes === 30) return "30 min";
  if (minutes === 60) return "1 hour";
  if (minutes === 120) return "2 hours";
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} min`;
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Create a CheckQuery for a fixed duration (e.g. 30 min, 1 hour, 2 hours).
 *
 * @param minutes - Duration in minutes
 * @param now     - The current time (injected; never call new Date() internally)
 */
export function createDurationCheckQuery(
  minutes: number,
  now: Date
): CheckQuery {
  return {
    startTime: now,
    endTime: new Date(now.getTime() + minutes * 60 * 1000),
    label: minutesToLabel(minutes),
    source: "duration",
  };
}

/**
 * Parse a natural-language check query string into a CheckQuery.
 *
 * Supported patterns:
 *   "30 min"    → now + 30 minutes
 *   "1 hour"    → now + 60 minutes
 *   "2 hours"   → now + 120 minutes
 *   "until Xpm" → now through the next occurrence of X:00 PM Eastern Time
 *
 * Returns null if the text is not recognized.
 *
 * @param text - The query string to parse (case-insensitive)
 * @param now  - The current time (injected; never call new Date() internally)
 */
export function parseCheckQuery(
  text: string,
  now: Date
): CheckQuery | null {
  const trimmed = text.trim().toLowerCase();

  // "30 min"
  if (trimmed === "30 min") {
    return {
      startTime: now,
      endTime: new Date(now.getTime() + 30 * 60 * 1000),
      label: "30 min",
      source: "parser",
    };
  }

  // "1 hour"
  if (trimmed === "1 hour") {
    return {
      startTime: now,
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      label: "1 hour",
      source: "parser",
    };
  }

  // "2 hours"
  if (trimmed === "2 hours") {
    return {
      startTime: now,
      endTime: new Date(now.getTime() + 120 * 60 * 1000),
      label: "2 hours",
      source: "parser",
    };
  }

  // "until Xpm" or "until X pm" — interpret as Eastern Time (America/New_York)
  // The spec states: NOW_STABLE is 12:00 PM ET and "until 6pm" should yield
  // endTime = now + 360 minutes (6 PM ET = 22:00 UTC, 6 hours from 16:00 UTC).
  const untilMatch = /^until\s+(\d{1,2})\s*(am|pm)$/.exec(trimmed);
  if (untilMatch !== null) {
    const hourStr = untilMatch[1];
    const meridiem = untilMatch[2];
    if (hourStr === undefined || meridiem === undefined) return null;

    const hour12 = parseInt(hourStr, 10);
    if (isNaN(hour12) || hour12 < 1 || hour12 > 12) return null;

    // Convert to 24-hour clock (Eastern Time hour of day)
    let hourET: number;
    if (meridiem === "am") {
      hourET = hour12 === 12 ? 0 : hour12;
    } else {
      hourET = hour12 === 12 ? 12 : hour12 + 12;
    }

    // Compute the target time in Eastern Time.
    // We use Intl.DateTimeFormat to get the current ET hour, then derive
    // the delta in minutes to the target ET hour.
    const nowEtHour = getEasternHourOfDay(now);
    const nowEtMinute = now.getUTCMinutes();
    const nowEtSecond = now.getUTCSeconds();
    const nowEtMs = now.getUTCMilliseconds();

    // Minutes since midnight ET for now
    const nowEtMinutesSinceMidnight =
      nowEtHour * 60 + nowEtMinute + nowEtSecond / 60 + nowEtMs / 60000;

    // Target minutes since midnight ET
    const targetEtMinutesSinceMidnight = hourET * 60;

    // How many minutes forward to the target (always forward / wrap to next day)
    let deltaMinutes =
      targetEtMinutesSinceMidnight - nowEtMinutesSinceMidnight;
    if (deltaMinutes <= 0) {
      // Past or equal — wrap to next day
      deltaMinutes += 24 * 60;
    }

    // Round to whole minutes (drop sub-minute precision from now)
    const deltaMs = Math.round(deltaMinutes * 60 * 1000);

    return {
      startTime: now,
      endTime: new Date(now.getTime() + deltaMs),
      label: `Until ${hour12}${meridiem}`,
      source: "parser",
    };
  }

  return null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Return the current hour of day (0–23) in Eastern Time for the given date.
 * Uses Intl.DateTimeFormat to correctly handle DST transitions.
 */
function getEasternHourOfDay(date: Date): number {
  // Format hour in 24-hour ET to get the local hour.
  // We request hour12:false so midnight is 0 (some engines return 24, we clamp below).
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(date);

  const parsed = parseInt(formatted, 10);
  if (isNaN(parsed)) return date.getUTCHours(); // fallback
  // Some engines return 24 for midnight — normalize to 0
  return parsed % 24;
}

