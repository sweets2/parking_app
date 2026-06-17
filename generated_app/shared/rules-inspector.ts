/**
 * shared/rules-inspector.ts — F-54 Rules Inspection Engine
 *
 * Pure domain logic that returns all relevant rules for a selected map
 * location and time. No browser APIs, no Leaflet, no DOM, no data fetching.
 */

import type {
  ParkingSegment,
  ParkingStatus,
  RulesInspectionSection,
  NextRestriction,
} from "../shared/types";
import { haversineMeters, isSignActive, getNextRestriction } from "../shared/parking-logic";

// ─── Priority ordering ────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<ParkingStatus, number> = {
  tow:     5,
  snow:    4,
  ticket:  3,
  limited: 2,
  unknown: 1,
  safe:    0,
};

function higherPriority(a: ParkingStatus, b: ParkingStatus): ParkingStatus {
  return STATUS_PRIORITY[a] >= STATUS_PRIORITY[b] ? a : b;
}

// ─── Centroid computation ─────────────────────────────────────────────────────

/**
 * Compute the centroid (average lat/lng) of a segment's geometry ways.
 * Returns null if no coordinates are available.
 */
function computeCentroid(segment: ParkingSegment): { lat: number; lng: number } | null {
  if (segment.geometry !== undefined && segment.geometry.ways.length > 0) {
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;
    for (const way of segment.geometry.ways) {
      for (const coord of way) {
        sumLat += coord[0];
        sumLng += coord[1];
        count++;
      }
    }
    if (count > 0) {
      return { lat: sumLat / count, lng: sumLng / count };
    }
  }

  // No geometry: fall back to midpoint derived from location string if parseable.
  // Format expected: "CrossA to CrossB" — but we have no geocoding here so we
  // cannot extract lat/lng from street names. Per spec: "if parseable, otherwise skip it."
  // Without geocoding in a pure logic module, we cannot parse a lat/lng from
  // a cross-street location string — skip the segment.
  return null;
}

// ─── Active restriction evaluation ───────────────────────────────────────────

/**
 * Determine the highest-priority ParkingStatus for a segment at selectedTime.
 * Returns "safe" if no restriction is active.
 */
function getActivePriority(
  segment: ParkingSegment,
  selectedTime: Date
): ParkingStatus {
  let priority: ParkingStatus = "safe";

  // Tow signs
  for (const sign of segment.towSigns) {
    if (isSignActive(sign, selectedTime)) {
      priority = higherPriority(priority, "tow");
    }
  }

  // Snow routes are always-active seasonal restrictions
  if (segment.snowRoutes.length > 0) {
    priority = higherPriority(priority, "snow");
  }

  // Street cleaning entries — check if any schedule is active right now.
  // We reuse the schedule parsing from parking-logic by importing isScheduleActiveNow.
  // However, we do not import it here to avoid coupling; instead we inline the check
  // using the segment's cleaningEntries and the selectedTime.
  // Since parking-logic is in scope (same shared/ directory), we import directly.
  for (const entry of segment.cleaningEntries) {
    if (isCleaningActive(entry.schedule, selectedTime)) {
      priority = higherPriority(priority, "ticket");
    }
  }

  return priority;
}

// ─── Inline schedule active check ────────────────────────────────────────────

/**
 * Re-implements isScheduleActiveNow locally so we don't create a circular
 * dependency chain. Mirrors the logic in parking-logic.ts.
 */
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
    minutesOfDay: (rawHour % 24) * 60 + minute,
  };
}

function isCleaningActive(schedule: string, now: Date): boolean {
  const { dayIdx, minutesOfDay } = getEasternParts(now);
  if (dayIdx === -1) return false;

  const sepIdx = schedule.indexOf("   ");
  if (sepIdx === -1) return false;
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
  if (startDayIdx === -1 || endDayIdx === -1) return false;
  if (dayIdx < startDayIdx || dayIdx > endDayIdx) return false;

  const timeMatch = timePart.match(/^(.+?)\s*[–-]\s*(.+)$/);
  if (!timeMatch) return false;
  const startHour = parseScheduleHour(timeMatch[1]);
  const endHour   = parseScheduleHour(timeMatch[2]);
  if (startHour === -1 || endHour === -1) return false;

  const startMinutes = startHour * 60;
  const endMinutes   = endHour   * 60;
  return minutesOfDay >= startMinutes && minutesOfDay < endMinutes;
}

// ─── Content summary ──────────────────────────────────────────────────────────

/**
 * Build a human-readable content string for a segment at selectedTime.
 * Summarises active restriction(s) or states no restriction.
 * Appends "Next: <label> starting <ISO date>." when a NextRestriction exists.
 */
function buildContent(
  segment: ParkingSegment,
  selectedTime: Date,
  activePriority: ParkingStatus,
  next: NextRestriction | undefined
): string {
  let main: string;

  if (activePriority === "safe") {
    main = "No restriction at this time.";
  } else {
    // Collect active restriction labels
    const labels: string[] = [];

    for (const sign of segment.towSigns) {
      if (isSignActive(sign, selectedTime)) {
        labels.push(`Tow zone (${sign.reason} at ${sign.address})`);
      }
    }

    if (segment.snowRoutes.length > 0) {
      for (const route of segment.snowRoutes) {
        labels.push(`Snow emergency route (${route.street})`);
      }
    }

    for (const entry of segment.cleaningEntries) {
      if (isCleaningActive(entry.schedule, selectedTime)) {
        labels.push(`Street cleaning: ${entry.schedule}`);
      }
    }

    if (labels.length === 0) {
      main = "Restriction active.";
    } else {
      main = labels.join("; ") + ".";
    }
  }

  if (next !== undefined) {
    const isoStr = next.startsAt.toISOString();
    main += ` Next: ${next.label} starting ${isoStr}.`;
  }

  return main;
}

// ─── Title formatting ─────────────────────────────────────────────────────────

/**
 * Build the section title from segment fields.
 * Format: "<street> (<side> side, <location>)" or "<street> (<location>)" if side is Unknown.
 */
function buildTitle(segment: ParkingSegment): string {
  const { street, side, location } = segment;
  if (side === "Unknown") {
    return `${street} (${location})`;
  }
  return `${street} (${side} side, ${location})`;
}

// ─── formatRuleSectionForSegment ─────────────────────────────────────────────

/**
 * Returns exactly one RulesInspectionSection for the given segment at selectedTime.
 * The returned array always has length 1.
 */
export function formatRuleSectionForSegment(input: {
  segment: ParkingSegment;
  selectedTime: Date;
}): RulesInspectionSection[] {
  const { segment, selectedTime } = input;

  const priority = getActivePriority(segment, selectedTime);

  // Only look for next restriction if no currently active restriction
  let next: NextRestriction | undefined = undefined;
  if (priority === "safe") {
    next = getNextRestriction(segment, selectedTime);
  }

  const title   = buildTitle(segment);
  const content = buildContent(segment, selectedTime, priority, next);

  return [{ title, content, priority }];
}

// ─── inspectRulesAtLocation ───────────────────────────────────────────────────

const DISTANCE_THRESHOLD_METERS = 100;

/**
 * Find all segments within 100 m of (lat, lng) and return one
 * RulesInspectionSection per matching segment.
 *
 * If no segment is within 100 m, returns a single "No matching segment" section.
 * Washington St segments are never collapsed — each segment produces its own section.
 */
export function inspectRulesAtLocation(input: {
  lat: number;
  lng: number;
  selectedTime: Date;
  segments: ParkingSegment[];
}): RulesInspectionSection[] {
  const { lat, lng, selectedTime, segments } = input;

  const matching: ParkingSegment[] = [];

  for (const segment of segments) {
    const centroid = computeCentroid(segment);
    if (centroid === null) {
      // No geometry and location string not parseable into coordinates — skip
      continue;
    }

    const dist = haversineMeters(lat, lng, centroid.lat, centroid.lng);
    if (dist <= DISTANCE_THRESHOLD_METERS) {
      matching.push(segment);
    }
  }

  if (matching.length === 0) {
    return [
      {
        title: "No matching segment",
        content: "No parking segment found near this location.",
        priority: "unknown",
      },
    ];
  }

  // Return one section per matching segment — no deduplication
  return matching.map((segment) =>
    formatRuleSectionForSegment({ segment, selectedTime })[0] as RulesInspectionSection
  );
}
