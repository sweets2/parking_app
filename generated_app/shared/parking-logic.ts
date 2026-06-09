import type { Sign } from "../shared/types";

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
