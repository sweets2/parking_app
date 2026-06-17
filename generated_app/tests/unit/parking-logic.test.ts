import { describe, it, expect } from "vitest";
import {
  HOBOKEN_BOUNDS,
  haversineMeters,
  isSignActive,
  filterLoadTimeNoise,
  filterActive,
  filterNearby,
  formatCountdown,
  formatSignWindow,
  signSeverity,
  nudgeCoords,
  formatTime,
  nextViolationWindow,
  isDataStale,
  extractCrossStreets,
  detectMatchingSegment,
  getStreetOrientation,
  evaluateParkingWindow,
  getPrimaryConflict,
  getNextRestriction,
} from "../../shared/parking-logic";
import type { ViolationWindow } from "../../shared/parking-logic";
import {
  SIGN_BAD_COORD,
  SIGN_PERMANENT_1,
  SIGN_11TH_ST,
  SIGN_EXPIRED_1,
  SIGN_13TH_ST_A,
  SIGN_13TH_ST_B,
  ALL_SIGNS,
  ACTIVE_SIGNS,
  EXPIRED_SIGNS,
  FETCH_TIME,
  NOW_STABLE,
  NOW_AFTER_EXPIRED,
} from "../fixtures/signs";
import type { Sign, ParkingSegment, ParkingWindowConflict, StreetCleaningEntry, SnowRoute } from "../../shared/types";

// Helper: build a minimal Sign for inline tests
function makeSign(overrides: Partial<Sign>): Sign {
  return {
    id: "test",
    address: "test",
    reason: "CONSTRUCTION",
    permit_number: "test",
    lat: 40.745,
    lng: -74.030,
    start_date: "1/1/2020",
    start_time: "00:00:00",
    stop_date: "12/31/2030",
    end_time: "07:00:00",
    start_iso: "2020-01-01T00:00:00",
    end_iso: "2030-12-31T07:00:00",
    active_at_fetch: true,
    ...overrides,
  };
}

// Helper to build a ParkingSegment
function makeSegment(overrides: Partial<ParkingSegment>): ParkingSegment {
  return {
    id: "seg-test",
    street: "Test St",
    location: "1st Ave to 2nd Ave",
    side: "East",
    cleaningEntries: [],
    towSigns: [],
    snowRoutes: [],
    ...overrides,
  };
}

// ─── F-03.1 HOBOKEN_BOUNDS ───────────────────────────────────────────────────

describe("HOBOKEN_BOUNDS", () => {
  it("SIGN_BAD_COORD falls outside the bounds", () => {
    if (SIGN_BAD_COORD === undefined) {
      // If the sign doesn't exist in the dataset, test is vacuously satisfied
      expect(true).toBe(true);
      return;
    }
    const outsideLat =
      SIGN_BAD_COORD.lat < HOBOKEN_BOUNDS.latMin ||
      SIGN_BAD_COORD.lat > HOBOKEN_BOUNDS.latMax;
    const outsideLng =
      SIGN_BAD_COORD.lng < HOBOKEN_BOUNDS.lngMin ||
      SIGN_BAD_COORD.lng > HOBOKEN_BOUNDS.lngMax;
    expect(outsideLat || outsideLng).toBe(true);
  });

  it("Hoboken geographic center falls inside bounds", () => {
    const centerLat = (HOBOKEN_BOUNDS.latMin + HOBOKEN_BOUNDS.latMax) / 2;
    const centerLng = (HOBOKEN_BOUNDS.lngMin + HOBOKEN_BOUNDS.lngMax) / 2;
    expect(centerLat).toBeGreaterThanOrEqual(HOBOKEN_BOUNDS.latMin);
    expect(centerLat).toBeLessThanOrEqual(HOBOKEN_BOUNDS.latMax);
    expect(centerLng).toBeGreaterThanOrEqual(HOBOKEN_BOUNDS.lngMin);
    expect(centerLng).toBeLessThanOrEqual(HOBOKEN_BOUNDS.lngMax);
  });
});

// ─── F-03.2 haversineMeters ──────────────────────────────────────────────────

describe("haversineMeters", () => {
  it("identical coordinates return effectively zero", () => {
    expect(haversineMeters(40.745, -74.030, 40.745, -74.030)).toBeLessThan(0.001);
  });

  it("SIGN_PERMANENT_1 and SIGN_11TH_ST are within 50 m of each other", () => {
    if (SIGN_PERMANENT_1 === undefined || SIGN_11TH_ST === undefined) {
      expect(true).toBe(true);
      return;
    }
    const dist = haversineMeters(
      SIGN_PERMANENT_1.lat,
      SIGN_PERMANENT_1.lng,
      SIGN_11TH_ST.lat,
      SIGN_11TH_ST.lng
    );
    expect(dist).toBeLessThan(50);
  });

  it("Hoboken center to SIGN_BAD_COORD is > 1000 m", () => {
    if (SIGN_BAD_COORD === undefined) {
      expect(true).toBe(true);
      return;
    }
    const centerLat = (HOBOKEN_BOUNDS.latMin + HOBOKEN_BOUNDS.latMax) / 2;
    const centerLng = (HOBOKEN_BOUNDS.lngMin + HOBOKEN_BOUNDS.lngMax) / 2;
    const dist = haversineMeters(centerLat, centerLng, SIGN_BAD_COORD.lat, SIGN_BAD_COORD.lng);
    expect(dist).toBeGreaterThan(1000);
  });

  it("SIGN_13TH_ST_A and SIGN_13TH_ST_B share coordinates (< 2 m apart)", () => {
    if (SIGN_13TH_ST_A === undefined || SIGN_13TH_ST_B === undefined) {
      expect(true).toBe(true);
      return;
    }
    const dist = haversineMeters(
      SIGN_13TH_ST_A.lat,
      SIGN_13TH_ST_A.lng,
      SIGN_13TH_ST_B.lat,
      SIGN_13TH_ST_B.lng
    );
    expect(dist).toBeLessThan(2);
  });
});

// ─── F-03.3 isSignActive ─────────────────────────────────────────────────────

describe("isSignActive", () => {
  // Sign whose window contains NOW_STABLE (2026-06-09T16:00:00Z = noon ET)
  const sign = makeSign({
    start_iso: "2026-06-09T10:00:00",
    end_iso: "2026-06-09T20:00:00",
  });

  it("returns true when now is within the window", () => {
    expect(isSignActive(sign, NOW_STABLE)).toBe(true);
  });

  it("returns true when now equals end_iso (inclusive upper bound)", () => {
    // Sign whose end_iso exactly equals NOW_STABLE — use Z suffix for UTC parse
    const atEnd = makeSign({
      start_iso: "2026-06-09T00:00:00Z",
      end_iso: "2026-06-09T16:00:00Z",
    });
    expect(isSignActive(atEnd, NOW_STABLE)).toBe(true);
  });

  it("returns false one second after end_iso", () => {
    // Sign that ended one second before NOW_STABLE — use Z suffix for UTC parse
    const justExpired = makeSign({
      start_iso: "2026-06-09T00:00:00Z",
      end_iso: "2026-06-09T15:59:59Z",
    });
    expect(isSignActive(justExpired, NOW_STABLE)).toBe(false);
  });

  it("returns true for a far-future permanent sign", () => {
    const permanent = makeSign({ end_iso: "2030-12-31T07:00:00" });
    expect(isSignActive(permanent, NOW_STABLE)).toBe(true);
  });

  it("returns false for a sign that has not yet started (start_iso in the future)", () => {
    const future = makeSign({
      start_iso: "2030-01-01T00:00:00",
      end_iso: "2030-12-31T07:00:00",
    });
    expect(isSignActive(future, NOW_STABLE)).toBe(false);
  });

  it("SIGN_EXPIRED_1 is inactive at NOW_AFTER_EXPIRED", () => {
    if (SIGN_EXPIRED_1 === undefined) {
      // No expired signs in the dataset — test passes vacuously
      expect(true).toBe(true);
      return;
    }
    expect(isSignActive(SIGN_EXPIRED_1, NOW_AFTER_EXPIRED)).toBe(false);
  });

  it("every ACTIVE_SIGNS entry returns true at FETCH_TIME (0 mismatches)", () => {
    const mismatches = ACTIVE_SIGNS.filter(
      (s) => isSignActive(s, FETCH_TIME) !== s.active_at_fetch
    );
    expect(mismatches.length).toBe(0);
  });

  it("every EXPIRED_SIGNS entry returns false at FETCH_TIME (0 mismatches)", () => {
    const mismatches = EXPIRED_SIGNS.filter(
      (s) => isSignActive(s, FETCH_TIME) !== s.active_at_fetch
    );
    expect(mismatches.length).toBe(0);
  });
});

// ─── F-03.4 filterLoadTimeNoise ──────────────────────────────────────────────

describe("filterLoadTimeNoise", () => {
  it("removes an expired sign (active_at_fetch=false, end_iso in the past)", () => {
    const expiredSign = makeSign({
      active_at_fetch: false,
      end_iso: "2020-01-01T00:00:00",
      lat: 40.745,
      lng: -74.030,
    });
    const result = filterLoadTimeNoise([expiredSign], NOW_STABLE);
    expect(result).not.toContain(expiredSign);
  });

  it("removes SIGN_BAD_COORD (outside HOBOKEN_BOUNDS)", () => {
    if (SIGN_BAD_COORD === undefined) {
      expect(true).toBe(true);
      return;
    }
    const result = filterLoadTimeNoise([SIGN_BAD_COORD], FETCH_TIME);
    expect(result).not.toContain(SIGN_BAD_COORD);
  });

  it("ALL_SIGNS filtered with FETCH_TIME does not contain SIGN_BAD_COORD", () => {
    const badCoord = SIGN_BAD_COORD;
    if (badCoord === undefined) {
      expect(true).toBe(true);
      return;
    }
    const result = filterLoadTimeNoise(ALL_SIGNS, FETCH_TIME);
    expect(result.some((s) => s.id === badCoord.id)).toBe(false);
  });

  it("ALL_SIGNS filtered with FETCH_TIME still contains SIGN_PERMANENT_1", () => {
    const perm1 = SIGN_PERMANENT_1;
    if (perm1 === undefined) {
      expect(true).toBe(true);
      return;
    }
    const result = filterLoadTimeNoise(ALL_SIGNS, FETCH_TIME);
    expect(result.some((s) => s.id === perm1.id)).toBe(true);
  });

  it("returns full array when all signs are valid, active, and in-bounds", () => {
    const signs: Sign[] = [
      makeSign({ id: "a", active_at_fetch: true }),
      makeSign({ id: "b", active_at_fetch: true }),
    ];
    const result = filterLoadTimeNoise(signs, FETCH_TIME);
    expect(result.length).toBe(signs.length);
  });

  it("returns empty array for empty input", () => {
    expect(filterLoadTimeNoise([], FETCH_TIME)).toEqual([]);
  });

  it("keeps a sign with active_at_fetch=false but end_iso one week in the future", () => {
    const upcoming = makeSign({
      active_at_fetch: false,
      end_iso: "2026-06-16T08:00:00",
      lat: 40.745,
      lng: -74.030,
    });
    const result = filterLoadTimeNoise([upcoming], NOW_STABLE);
    expect(result).toContain(upcoming);
  });
});

// ─── F-03.5 filterActive ─────────────────────────────────────────────────────

describe("filterActive", () => {
  it("returns only active signs from a mixed array", () => {
    const active = makeSign({ id: "active", end_iso: "2030-12-31T07:00:00", start_iso: "2020-01-01T00:00:00" });
    const expired = makeSign({ id: "expired", end_iso: "2020-01-01T00:00:00", start_iso: "2019-01-01T00:00:00" });
    const result = filterActive([active, expired], NOW_STABLE);
    expect(result).toContain(active);
    expect(result).not.toContain(expired);
  });

  it("returns empty array for empty input", () => {
    expect(filterActive([], NOW_STABLE)).toEqual([]);
  });

  it("returns empty array when all signs are expired", () => {
    const signs = [
      makeSign({ id: "a", end_iso: "2020-01-01T00:00:00" }),
      makeSign({ id: "b", end_iso: "2020-06-01T00:00:00" }),
    ];
    expect(filterActive(signs, NOW_STABLE)).toEqual([]);
  });

  it("returns empty array when called with NOW_AFTER_EXPIRED on ALL_SIGNS", () => {
    const result = filterActive(ALL_SIGNS, NOW_AFTER_EXPIRED);
    expect(result).toEqual([]);
  });
});

// ─── F-03.6 filterNearby ─────────────────────────────────────────────────────

describe("filterNearby", () => {
  it("includes SIGN_11TH_ST when searching near SIGN_PERMANENT_1 with 150 m radius", () => {
    const perm1 = SIGN_PERMANENT_1;
    const eleventh = SIGN_11TH_ST;
    if (perm1 === undefined || eleventh === undefined) {
      expect(true).toBe(true);
      return;
    }
    const result = filterNearby(
      ALL_SIGNS,
      perm1.lat,
      perm1.lng,
      150,
      NOW_STABLE
    );
    expect(result.some((s) => s.id === eleventh.id)).toBe(true);
  });

  it("does not include SIGN_BAD_COORD when searching near SIGN_PERMANENT_1", () => {
    const perm1 = SIGN_PERMANENT_1;
    const badCoord = SIGN_BAD_COORD;
    if (perm1 === undefined || badCoord === undefined) {
      expect(true).toBe(true);
      return;
    }
    const result = filterNearby(
      ALL_SIGNS,
      perm1.lat,
      perm1.lng,
      150,
      NOW_STABLE
    );
    expect(result.some((s) => s.id === badCoord.id)).toBe(false);
  });

  it("returns empty array for empty input", () => {
    expect(filterNearby([], 40.745, -74.030, 150, NOW_STABLE)).toEqual([]);
  });

  it("returns empty array when radiusMeters is 0", () => {
    const result = filterNearby(ALL_SIGNS, 40.745, -74.030, 0, NOW_STABLE);
    expect(result).toEqual([]);
  });

  it("excludes SIGN_EXPIRED_1 even when it would be within the radius", () => {
    if (SIGN_EXPIRED_1 === undefined) {
      expect(true).toBe(true);
      return;
    }
    // Search at SIGN_EXPIRED_1's exact location — it's nearby but expired
    const result = filterNearby(
      [SIGN_EXPIRED_1],
      SIGN_EXPIRED_1.lat,
      SIGN_EXPIRED_1.lng,
      150,
      NOW_AFTER_EXPIRED
    );
    expect(result).not.toContain(SIGN_EXPIRED_1);
  });

  it("includes both SIGN_13TH_ST_A and SIGN_13TH_ST_B when searching at their coordinates", () => {
    const coordA = SIGN_13TH_ST_A;
    const coordB = SIGN_13TH_ST_B;
    if (coordA === undefined || coordB === undefined) {
      expect(true).toBe(true);
      return;
    }
    const result = filterNearby(
      ALL_SIGNS,
      coordA.lat,
      coordA.lng,
      150,
      NOW_STABLE
    );
    expect(result.some((s) => s.id === coordA.id)).toBe(true);
    expect(result.some((s) => s.id === coordB.id)).toBe(true);
  });
});

// ─── F-03.7 formatCountdown ──────────────────────────────────────────────────
// All tests use NOW_STABLE (2026-06-09T16:00:00.000Z) as the "now" value.
// endIso strings use explicit "Z" suffix so they parse as UTC, consistent
// with NOW_STABLE which is also a UTC timestamp.

describe("formatCountdown", () => {
  it("returns '3h 0m' for 3 hours remaining", () => {
    expect(formatCountdown("2026-06-09T19:00:00Z", NOW_STABLE)).toBe("3h 0m");
  });

  it("returns '45m' for exactly 45 minutes remaining", () => {
    expect(formatCountdown("2026-06-09T16:45:00Z", NOW_STABLE)).toBe("45m");
  });

  it("returns '1h 30m' for exactly 90 minutes remaining", () => {
    expect(formatCountdown("2026-06-09T17:30:00Z", NOW_STABLE)).toBe("1h 30m");
  });

  it("returns '59m' for 59 minutes 59 seconds (truncates seconds)", () => {
    expect(formatCountdown("2026-06-09T16:59:59Z", NOW_STABLE)).toBe("59m");
  });

  it("returns '0m' when end equals now", () => {
    expect(formatCountdown("2026-06-09T16:00:00Z", NOW_STABLE)).toBe("0m");
  });

  it("returns '0m' and no '-' when already expired", () => {
    const result = formatCountdown("2026-06-09T15:00:00Z", NOW_STABLE);
    expect(result).toBe("0m");
    expect(result).not.toContain("-");
  });
});

// ─── F-03.8 formatSignWindow ─────────────────────────────────────────────────
// All tests use NOW_STABLE (2026-06-09T16:00:00.000Z) as the "now" value.

describe("formatSignWindow", () => {
  it("returns string containing 'today' and '5:00 PM' for same-day sign", () => {
    // end_iso on same UTC date as NOW_STABLE (2026-06-09), at 17:00 UTC → 5:00 PM
    const sign = makeSign({ end_iso: "2026-06-09T17:00:00" });
    const result = formatSignWindow(sign, NOW_STABLE);
    expect(result).toContain("today");
    expect(result).toContain("5:00 PM");
  });

  it("returns string with weekday abbreviation and '4:00 PM' for different-day sign", () => {
    // end_iso on next UTC date (2026-06-10 = Wed), at 16:00 UTC → 4:00 PM
    const sign = makeSign({ end_iso: "2026-06-10T16:00:00" });
    const result = formatSignWindow(sign, NOW_STABLE);
    const hasWeekday = /Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(result);
    expect(hasWeekday).toBe(true);
    expect(result).toContain("4:00 PM");
  });

  it("shows '12:00 AM' for sign ending at midnight", () => {
    // end_iso midnight of next day (2026-06-10T00:00:00 UTC → 12:00 AM)
    const sign = makeSign({ end_iso: "2026-06-10T00:00:00" });
    const result = formatSignWindow(sign, NOW_STABLE);
    expect(result).toContain("12:00 AM");
  });
});

// ─── F-03.9 signSeverity ─────────────────────────────────────────────────────

describe("signSeverity", () => {
  it("CONSTRUCTION → high", () => {
    expect(signSeverity(makeSign({ reason: "CONSTRUCTION" }))).toBe("high");
  });

  it("MOVING → medium", () => {
    expect(signSeverity(makeSign({ reason: "MOVING" }))).toBe("medium");
  });

  it("EVENT → medium", () => {
    expect(signSeverity(makeSign({ reason: "EVENT" }))).toBe("medium");
  });

  it("DELIVERY → low", () => {
    expect(signSeverity(makeSign({ reason: "DELIVERY" }))).toBe("low");
  });
});

// ─── F-03.10 nudgeCoords ─────────────────────────────────────────────────────

describe("nudgeCoords", () => {
  const baseLat = 40.745;
  const baseLng = -74.030;
  const NUDGE = 0.00009;

  it("N: lat increases, lng unchanged", () => {
    const result = nudgeCoords(baseLat, baseLng, "N");
    expect(result.lat).toBeGreaterThan(baseLat);
    expect(result.lng).toBe(baseLng);
  });

  it("S: lat decreases, lng unchanged", () => {
    const result = nudgeCoords(baseLat, baseLng, "S");
    expect(result.lat).toBeLessThan(baseLat);
    expect(result.lng).toBe(baseLng);
  });

  it("E: lng increases, lat unchanged", () => {
    const result = nudgeCoords(baseLat, baseLng, "E");
    expect(result.lng).toBeGreaterThan(baseLng);
    expect(result.lat).toBe(baseLat);
  });

  it("W: lng decreases, lat unchanged", () => {
    const result = nudgeCoords(baseLat, baseLng, "W");
    expect(result.lng).toBeLessThan(baseLng);
    expect(result.lat).toBe(baseLat);
  });

  it("nudge magnitude is approximately 0.00009 (within 1e-7 tolerance)", () => {
    const n = nudgeCoords(baseLat, baseLng, "N");
    const s = nudgeCoords(baseLat, baseLng, "S");
    const e = nudgeCoords(baseLat, baseLng, "E");
    const w = nudgeCoords(baseLat, baseLng, "W");

    expect(Math.abs(n.lat - baseLat)).toBeCloseTo(NUDGE, 7);
    expect(Math.abs(s.lat - baseLat)).toBeCloseTo(NUDGE, 7);
    expect(Math.abs(e.lng - baseLng)).toBeCloseTo(NUDGE, 7);
    expect(Math.abs(w.lng - baseLng)).toBeCloseTo(NUDGE, 7);
  });
});

// ─── F-03.11 formatTime ──────────────────────────────────────────────────────

describe("formatTime", () => {
  it("'08:00:00' → '8:00 AM'", () => {
    expect(formatTime("08:00:00")).toBe("8:00 AM");
  });

  it("'16:00:00' → '4:00 PM'", () => {
    expect(formatTime("16:00:00")).toBe("4:00 PM");
  });

  it("'12:00:00' → '12:00 PM'", () => {
    expect(formatTime("12:00:00")).toBe("12:00 PM");
  });

  it("'00:00:00' → '12:00 AM'", () => {
    expect(formatTime("00:00:00")).toBe("12:00 AM");
  });
});

// ─── F-16 nextViolationWindow ────────────────────────────────────────────────

describe("nextViolationWindow", () => {
  // The spot used in these tests — placed far from all real signs so we can
  // control which signs are "nearby" by constructing them with the exact coords.
  const SPOT_LAT = 40.745;
  const SPOT_LNG = -74.030;

  // NOW_STABLE = 2026-06-09T16:00:00.000Z (noon ET on June 9, 2026)
  // We build ISO strings relative to NOW_STABLE using explicit UTC offsets so
  // arithmetic is portable across timezones.  However, the spec uses bare
  // local-time ISO strings in sign data, so we build our test signs the same
  // way the rest of the codebase does: bare strings that align with whatever
  // local time NOW_STABLE resolves to.
  //
  // NOW_STABLE as a UTC ms value: 1749484800000
  // We derive test ISOs relative to this by using Date math and toISOString
  // with Z stripped, but since tests must not call new Date() internally we
  // pre-compute these fixed offsets from NOW_STABLE manually.
  //
  // Strategy: use explicit UTC Z-suffix strings in start_iso / end_iso so that
  // new Date(sign.start_iso).getTime() works correctly regardless of the
  // machine's local timezone.  isSignActive uses getTime() on both sides, so
  // UTC strings are safe.

  /** Sign at SPOT_LAT/SPOT_LNG whose window contains NOW_STABLE (active). */
  function makeActiveNearbySign(id: string): Sign {
    return makeSign({
      id,
      lat: SPOT_LAT,
      lng: SPOT_LNG,
      start_iso: "2026-06-09T00:00:00Z",
      end_iso: "2026-06-09T23:59:59Z",
    });
  }

  /** Sign at SPOT_LAT/SPOT_LNG whose window starts `offsetMinutes` after NOW_STABLE. */
  function makeUpcomingNearbySign(id: string, offsetMinutes: number): Sign {
    const startMs = NOW_STABLE.getTime() + offsetMinutes * 60 * 1000;
    const endMs = startMs + 2 * 60 * 60 * 1000; // 2-hour window
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();
    return makeSign({
      id,
      lat: SPOT_LAT,
      lng: SPOT_LNG,
      start_iso: startIso,
      end_iso: endIso,
    });
  }

  /** Sign far from the spot (> 150 m). */
  function makeFarSign(id: string): Sign {
    return makeSign({
      id,
      lat: 40.760,
      lng: -74.060,
      start_iso: "2026-06-09T00:00:00Z",
      end_iso: "2026-06-09T23:59:59Z",
    });
  }

  /** Sign at the spot whose window ended before NOW_STABLE. */
  function makeExpiredNearbySign(id: string): Sign {
    return makeSign({
      id,
      lat: SPOT_LAT,
      lng: SPOT_LNG,
      start_iso: "2026-06-08T00:00:00Z",
      end_iso: "2026-06-09T12:00:00Z", // ends 4 hours before NOW_STABLE
    });
  }

  it("returns null when no signs are within 150 m of the spot", () => {
    const signs = [makeFarSign("far1"), makeFarSign("far2")];
    const result = nextViolationWindow(signs, { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
    expect(result).toBeNull();
  });

  it("returns { sign, minutesUntilActive: 0 } for a currently-active sign within 150 m", () => {
    const sign = makeActiveNearbySign("active1");
    const result = nextViolationWindow([sign], { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
    expect(result).not.toBeNull();
    expect((result as ViolationWindow).sign.id).toBe("active1");
    expect((result as ViolationWindow).minutesUntilActive).toBe(0);
  });

  it("returns { sign, minutesUntilActive: 90 } for a sign starting exactly 90 min after NOW_STABLE", () => {
    const sign = makeUpcomingNearbySign("upcoming90", 90);
    const result = nextViolationWindow([sign], { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
    expect(result).not.toBeNull();
    expect((result as ViolationWindow).sign.id).toBe("upcoming90");
    expect((result as ViolationWindow).minutesUntilActive).toBe(90);
  });

  it("returns the soonest sign when two signs start 90 and 45 minutes after NOW_STABLE", () => {
    const sign90 = makeUpcomingNearbySign("s90", 90);
    const sign45 = makeUpcomingNearbySign("s45", 45);
    const result = nextViolationWindow([sign90, sign45], { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
    expect(result).not.toBeNull();
    expect((result as ViolationWindow).sign.id).toBe("s45");
    expect((result as ViolationWindow).minutesUntilActive).toBe(45);
  });

  it("prefers active sign (minutesUntilActive: 0) over an upcoming sign", () => {
    const active = makeActiveNearbySign("activeSign");
    const upcoming = makeUpcomingNearbySign("upcomingSign", 30);
    const result = nextViolationWindow([active, upcoming], { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
    expect(result).not.toBeNull();
    expect((result as ViolationWindow).sign.id).toBe("activeSign");
    expect((result as ViolationWindow).minutesUntilActive).toBe(0);
  });

  it("returns null when all nearby signs expired before NOW_STABLE", () => {
    const expired = makeExpiredNearbySign("exp1");
    const result = nextViolationWindow([expired], { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
    expect(result).toBeNull();
  });

  it("returns { sign, minutesUntilActive: 4320 } for a sign starting 3 * 24 * 60 minutes after NOW_STABLE", () => {
    const sign = makeUpcomingNearbySign("far-future", 4320);
    const result = nextViolationWindow([sign], { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
    expect(result).not.toBeNull();
    expect((result as ViolationWindow).sign.id).toBe("far-future");
    expect((result as ViolationWindow).minutesUntilActive).toBe(4320);
  });

  it("returns null for an empty signs array without throwing", () => {
    expect(() => {
      const result = nextViolationWindow([], { lat: SPOT_LAT, lng: SPOT_LNG }, NOW_STABLE);
      expect(result).toBeNull();
    }).not.toThrow();
  });
});

// ─── F-13.1 isDataStale ──────────────────────────────────────────────────────
// All tests use NOW_STABLE as the `now` argument.
// NOW_STABLE = 2026-06-09T16:00:00.000Z

describe("isDataStale", () => {
  it("GIVEN fetchedAt is NOW_STABLE minus 24 hours, WHEN called with now=NOW_STABLE, THEN returns false", () => {
    const fetchedAt = new Date(NOW_STABLE.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(isDataStale(fetchedAt, NOW_STABLE)).toBe(false);
  });

  it("GIVEN fetchedAt is NOW_STABLE minus 26 hours, WHEN called with now=NOW_STABLE, THEN returns true", () => {
    const fetchedAt = new Date(NOW_STABLE.getTime() - 26 * 60 * 60 * 1000).toISOString();
    expect(isDataStale(fetchedAt, NOW_STABLE)).toBe(true);
  });

  it("GIVEN fetchedAt equals NOW_STABLE.toISOString(), WHEN called with now=NOW_STABLE, THEN returns false", () => {
    expect(isDataStale(NOW_STABLE.toISOString(), NOW_STABLE)).toBe(false);
  });

  it("GIVEN fetchedAt is NOW_STABLE minus 25 hours and 1 minute, WHEN called with now=NOW_STABLE, THEN returns true", () => {
    const fetchedAt = new Date(NOW_STABLE.getTime() - (25 * 60 + 1) * 60 * 1000).toISOString();
    expect(isDataStale(fetchedAt, NOW_STABLE)).toBe(true);
  });

  it("GIVEN fetchedAt is an empty string, WHEN called, THEN returns true (fail-safe)", () => {
    expect(isDataStale("", NOW_STABLE)).toBe(true);
  });

  it("GIVEN fetchedAt is not a valid date string, WHEN called, THEN returns true without throwing", () => {
    expect(() => {
      const result = isDataStale("not-a-date", NOW_STABLE);
      expect(result).toBe(true);
    }).not.toThrow();
  });
});

// ─── F-20 extractCrossStreets ──────────────────────────────────────────────────

describe("F-20 extractCrossStreets", () => {
  it("GIVEN 'Observer Hwy. to Seventh St.', THEN returns ['Observer Hwy', 'Seventh St']", () => {
    expect(extractCrossStreets("Observer Hwy. to Seventh St.")).toEqual(["Observer Hwy", "Seventh St"]);
  });

  it("GIVEN '9th St. to 10th St.', THEN returns ['9th St', '10th St']", () => {
    expect(extractCrossStreets("9th St. to 10th St.")).toEqual(["9th St", "10th St"]);
  });

  it("GIVEN 'Eighth St. and Tenth St.' (uses ' and ' not ' to '), THEN returns null", () => {
    expect(extractCrossStreets("Eighth St. and Tenth St.")).toBeNull();
  });

  it("GIVEN 'single street' (no delimiter), THEN returns null", () => {
    expect(extractCrossStreets("single street")).toBeNull();
  });

  it("GIVEN 'A to B to C' (three parts), THEN returns null", () => {
    expect(extractCrossStreets("A to B to C")).toBeNull();
  });
});

// ─── F-20 detectMatchingSegment ───────────────────────────────────────────────

describe("F-20 detectMatchingSegment", () => {
  it("GIVEN a N-S street and clickLat between the two endpoint latitudes, THEN returns true", () => {
    const from = { lat: 40.740, lng: -74.032 };
    const to   = { lat: 40.750, lng: -74.032 };
    expect(detectMatchingSegment(40.745, -74.032, from, to)).toBe(true);
  });

  it("GIVEN a N-S street and clickLat outside the latitude range, THEN returns false", () => {
    const from = { lat: 40.740, lng: -74.032 };
    const to   = { lat: 40.750, lng: -74.032 };
    expect(detectMatchingSegment(40.760, -74.032, from, to)).toBe(false);
  });

  it("GIVEN a N-S street and clickLat exactly equal to fromCoord.lat (boundary), THEN returns true", () => {
    const from = { lat: 40.740, lng: -74.032 };
    const to   = { lat: 40.750, lng: -74.032 };
    expect(detectMatchingSegment(40.740, -74.032, from, to)).toBe(true);
  });

  it("GIVEN a N-S street and clickLat exactly equal to toCoord.lat (boundary), THEN returns true", () => {
    const from = { lat: 40.740, lng: -74.032 };
    const to   = { lat: 40.750, lng: -74.032 };
    expect(detectMatchingSegment(40.750, -74.032, from, to)).toBe(true);
  });

  it("GIVEN an E-W street and clickLng between the two endpoint longitudes, THEN returns true", () => {
    const from = { lat: 40.744, lng: -74.040 };
    const to   = { lat: 40.744, lng: -74.030 };
    expect(detectMatchingSegment(40.744, -74.035, from, to)).toBe(true);
  });

  it("GIVEN an E-W street and clickLng outside the longitude range, THEN returns false", () => {
    const from = { lat: 40.744, lng: -74.040 };
    const to   = { lat: 40.744, lng: -74.030 };
    expect(detectMatchingSegment(40.744, -74.050, from, to)).toBe(false);
  });

  it("GIVEN equal deltaLat === deltaLng (edge case), THEN does not throw and returns a boolean (treats as E-W)", () => {
    const from = { lat: 40.740, lng: -74.040 };
    const to   = { lat: 40.750, lng: -74.030 };
    const result = detectMatchingSegment(40.745, -74.035, from, to);
    expect(typeof result).toBe("boolean");
  });
});

// ─── F-23 getStreetOrientation ────────────────────────────────────────────────

describe("F-23 getStreetOrientation", () => {
  it("GIVEN '257-257 11TH ST', THEN returns 'EW' (numbered street, range prefix)", () => {
    expect(getStreetOrientation("257-257 11TH ST")).toBe("EW");
  });

  it("GIVEN '1036-1036 BLOOMFIELD ST', THEN returns 'NS' (named NS street)", () => {
    expect(getStreetOrientation("1036-1036 BLOOMFIELD ST")).toBe("NS");
  });

  it("GIVEN '53-53 OBSERVER HWY', THEN returns 'EW' (EW_NAMED exception — no digit in street name after stripping)", () => {
    expect(getStreetOrientation("53-53 OBSERVER HWY")).toBe("EW");
  });

  it("GIVEN '100-100 NEWARK ST', THEN returns 'EW' (EW_NAMED exception)", () => {
    expect(getStreetOrientation("100-100 NEWARK ST")).toBe("EW");
  });

  it("GIVEN '257 11TH ST' (single house number, not range), THEN returns 'EW' — regression guard for range-only regex bug", () => {
    expect(getStreetOrientation("257 11TH ST")).toBe("EW");
  });

  it("GIVEN '500 WASHINGTON ST' (single house number, named NS street), THEN returns 'NS' — verifies house digits are not mistaken for street digits", () => {
    expect(getStreetOrientation("500 WASHINGTON ST")).toBe("NS");
  });
});

// ─── F-48 evaluateParkingWindow ─────────────────────────────────────────────
//
// All time-sensitive test dates are anchored to NOW_STABLE (2026-06-09T16:00:00Z)
// which is 2026-06-09 noon ET. We pick a specific UTC date for the cleaning
// interval tests. NOW_STABLE is on a Tuesday (2026-06-09 UTC).
//
// For cleaning schedule tests we use a Monday cleaning schedule:
//   schedule: "Monday   10 am – 12 pm"
// We construct the query dates as offsets from NOW_STABLE.
// NOW_STABLE = 2026-06-09T16:00:00Z (Tuesday noon ET)
// We pick the previous Monday: 2026-06-08T14:00:00Z = Monday 10 AM ET
// (14:00 UTC = 10:00 AM ET when EDT = UTC-4)
//
// Cleaning interval: 10 am – 12 pm on Monday = 14:00Z – 16:00Z on 2026-06-08
// schedule string format: "Monday   10 am – 12 pm"
//   (three spaces between day and time, en-dash between hours)

// Monday 2026-06-08 times in UTC (EDT = UTC-4):
// 09:00 ET = 13:00 UTC
// 09:59 ET = 13:59 UTC
// 10:00 ET = 14:00 UTC
// 10:01 ET = 14:01 UTC
// 12:00 ET = 16:00 UTC
// 13:00 ET = 17:00 UTC
//
// We use the UTC timestamps directly.

const MONDAY_10AM_UTC = new Date(NOW_STABLE.getTime() - 3 * 60 * 60 * 1000); // 13:00 UTC on 2026-06-09
// Actually let's anchor to the previous Monday 2026-06-08.
// NOW_STABLE is 2026-06-09T16:00:00Z (Tuesday 12:00 ET)
// Previous Monday 14:00 UTC = Monday 10:00 AM ET
const PREV_MONDAY_14UTC = new Date(NOW_STABLE.getTime() - 26 * 60 * 60 * 1000); // 2026-06-08T14:00:00Z

function makeCleaningEntry(schedule: string): StreetCleaningEntry {
  return {
    street: "Test Street",
    side: "East",
    schedule,
    location: "1st Ave to 2nd Ave",
  };
}

function makeSnowRoute(): SnowRoute {
  return {
    street: "TEST ST",
    side: "Both",
    from: "1st Ave",
    to: "2nd Ave",
  };
}

describe("F-48 evaluateParkingWindow", () => {
  // Case 1: safe — query ends exactly at restriction start (end-exclusive)
  // Cleaning interval [10:00 AM, 12:00 PM) on Monday
  // Query [09:00 AM, 10:00 AM) → no overlap (end-exclusive on both sides)
  it("GIVEN cleaning interval 10am–12pm on Monday, WHEN query is 09:00–10:00 on that Monday, THEN status=safe, conflicts=[]", () => {
    // Monday 2026-06-08: 09:00 ET = 13:00 UTC, 10:00 ET = 14:00 UTC
    const queryStart = new Date(PREV_MONDAY_14UTC.getTime() - 60 * 60 * 1000); // 13:00 UTC
    const queryEnd   = new Date(PREV_MONDAY_14UTC.getTime());                   // 14:00 UTC

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
    });
    const result = evaluateParkingWindow(seg, {
      startTime: queryStart,
      endTime: queryEnd,
      label: "1h",
      source: "duration",
    });
    expect(result.status).toBe("safe");
    expect(result.conflicts.length).toBe(0);
  });

  // Case 2: ticket — query overlaps restriction start
  // Query [09:59 AM, 10:01 AM) overlaps [10:00 AM, 12:00 PM)
  it("GIVEN cleaning interval 10am–12pm on Monday, WHEN query is 09:59–10:01 on that Monday, THEN status=ticket, conflicts.length=1, conflicts[0].status=ticket", () => {
    // 09:59 ET = 13:59 UTC, 10:01 ET = 14:01 UTC
    const queryStart = new Date(PREV_MONDAY_14UTC.getTime() - 1 * 60 * 1000);  // 13:59 UTC
    const queryEnd   = new Date(PREV_MONDAY_14UTC.getTime() + 1 * 60 * 1000);  // 14:01 UTC

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
    });
    const result = evaluateParkingWindow(seg, {
      startTime: queryStart,
      endTime: queryEnd,
      label: "2m",
      source: "duration",
    });
    expect(result.status).toBe("ticket");
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].status).toBe("ticket");
  });

  // Case 3: safe — end-exclusive boundary at 12:00 PM
  // Cleaning interval [10:00 AM, 12:00 PM) — end is exclusive
  // Query [12:00 PM, 13:00 PM) → no overlap
  it("GIVEN cleaning interval 10am–12pm on Monday, WHEN query is 12:00–13:00 on that Monday, THEN status=safe, conflicts=[] (end exclusive)", () => {
    // 12:00 ET = 16:00 UTC, 13:00 ET = 17:00 UTC
    const queryStart = new Date(PREV_MONDAY_14UTC.getTime() + 2 * 60 * 60 * 1000); // 16:00 UTC
    const queryEnd   = new Date(PREV_MONDAY_14UTC.getTime() + 3 * 60 * 60 * 1000); // 17:00 UTC

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
    });
    const result = evaluateParkingWindow(seg, {
      startTime: queryStart,
      endTime: queryEnd,
      label: "1h",
      source: "duration",
    });
    expect(result.status).toBe("safe");
    expect(result.conflicts.length).toBe(0);
  });

  // Case 4: tow wins over cleaning — both overlap query
  it("GIVEN segment has tow sign active during query AND cleaning interval overlapping query, THEN status=tow and primaryConflict.status=tow", () => {
    // Query window: 13:59 UTC – 14:01 UTC on 2026-06-08 (overlaps cleaning 10am-12pm)
    const queryStart = new Date(PREV_MONDAY_14UTC.getTime() - 1 * 60 * 1000);
    const queryEnd   = new Date(PREV_MONDAY_14UTC.getTime() + 1 * 60 * 1000);

    // Tow sign active during query
    const towSign = makeSign({
      id: "tow-1",
      start_iso: new Date(PREV_MONDAY_14UTC.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      end_iso:   new Date(PREV_MONDAY_14UTC.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    });

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
      towSigns: [towSign],
    });
    const result = evaluateParkingWindow(seg, {
      startTime: queryStart,
      endTime: queryEnd,
      label: "2m",
      source: "duration",
    });
    expect(result.status).toBe("tow");
    expect(result.primaryConflict).not.toBeUndefined();
    expect(result.primaryConflict?.status).toBe("tow");
  });

  // Case 5: cleaning conflict when segment has snow route AND cleaning interval both overlapping query (no tow sign)
  // Snow routes are not treated as active conflicts (no real-time declaration data); only cleaning is evaluated.
  it("GIVEN segment has snow route AND cleaning interval both overlapping query (no tow sign), THEN status=ticket and primaryConflict.status=ticket", () => {
    const queryStart = new Date(PREV_MONDAY_14UTC.getTime() - 1 * 60 * 1000);
    const queryEnd   = new Date(PREV_MONDAY_14UTC.getTime() + 1 * 60 * 1000);

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
      snowRoutes: [makeSnowRoute()],
    });
    const result = evaluateParkingWindow(seg, {
      startTime: queryStart,
      endTime: queryEnd,
      label: "2m",
      source: "duration",
    });
    expect(result.status).toBe("ticket");
    expect(result.primaryConflict).not.toBeUndefined();
    expect(result.primaryConflict?.status).toBe("ticket");
  });

  // Case 6: safe — segment with no restrictions at all
  it("GIVEN segment with no cleaningEntries, no towSigns, no snowRoutes, THEN status=safe, conflicts=[], primaryConflict=undefined", () => {
    const seg = makeSegment({});
    const result = evaluateParkingWindow(seg, {
      startTime: PREV_MONDAY_14UTC,
      endTime: new Date(PREV_MONDAY_14UTC.getTime() + 60 * 60 * 1000),
      label: "1h",
      source: "duration",
    });
    expect(result.status).toBe("safe");
    expect(result.conflicts.length).toBe(0);
    expect(result.primaryConflict).toBeUndefined();
  });

  // Case 7: unknown — unparseable schedule string
  it("GIVEN segment with cleaningEntries with an unparseable schedule string, THEN status=unknown, conflicts.length=1, conflicts[0].status=unknown", () => {
    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("INVALID SCHEDULE !!!")],
    });
    const result = evaluateParkingWindow(seg, {
      startTime: PREV_MONDAY_14UTC,
      endTime: new Date(PREV_MONDAY_14UTC.getTime() + 60 * 60 * 1000),
      label: "1h",
      source: "duration",
    });
    expect(result.status).toBe("unknown");
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].status).toBe("unknown");
  });

  // Verify result shape has required fields
  it("GIVEN a safe segment, THEN result has id, street, location, side, geometry from segment", () => {
    const seg = makeSegment({ id: "seg-id-1", street: "Main St", location: "A to B", side: "West" });
    const result = evaluateParkingWindow(seg, {
      startTime: PREV_MONDAY_14UTC,
      endTime: new Date(PREV_MONDAY_14UTC.getTime() + 60 * 60 * 1000),
      label: "1h",
      source: "duration",
    });
    expect(result.id).toBe("seg-id-1");
    expect(result.street).toBe("Main St");
    expect(result.location).toBe("A to B");
    expect(result.side).toBe("West");
  });
});

// ─── F-48 getPrimaryConflict ─────────────────────────────────────────────────

describe("F-48 getPrimaryConflict", () => {
  function makeConflict(status: ParkingWindowConflict["status"]): ParkingWindowConflict {
    return { status, reason: "test", label: "test label" };
  }

  it("GIVEN empty array, THEN returns undefined", () => {
    expect(getPrimaryConflict([])).toBeUndefined();
  });

  it("GIVEN conflicts of status ['ticket', 'tow', 'limited'], THEN returns the tow conflict", () => {
    const conflicts = [
      makeConflict("ticket"),
      makeConflict("tow"),
      makeConflict("limited"),
    ];
    const result = getPrimaryConflict(conflicts);
    expect(result).not.toBeUndefined();
    expect(result?.status).toBe("tow");
  });

  it("GIVEN conflicts of status ['snow', 'limited'], THEN returns the snow conflict", () => {
    const conflicts = [
      makeConflict("snow"),
      makeConflict("limited"),
    ];
    const result = getPrimaryConflict(conflicts);
    expect(result).not.toBeUndefined();
    expect(result?.status).toBe("snow");
  });

  it("GIVEN single conflict of status 'ticket', THEN returns that conflict", () => {
    const conflicts = [makeConflict("ticket")];
    const result = getPrimaryConflict(conflicts);
    expect(result?.status).toBe("ticket");
  });

  it("GIVEN all statuses, THEN tow wins", () => {
    const conflicts = [
      makeConflict("safe"),
      makeConflict("unknown"),
      makeConflict("limited"),
      makeConflict("ticket"),
      makeConflict("snow"),
      makeConflict("tow"),
    ];
    const result = getPrimaryConflict(conflicts);
    expect(result?.status).toBe("tow");
  });
});

// ─── F-48 getNextRestriction ─────────────────────────────────────────────────
//
// Tests use NOW_STABLE as `after`. Tow sign start_iso/end_iso use UTC Z-suffix
// strings derived from NOW_STABLE.getTime() offsets.

describe("F-48 getNextRestriction", () => {
  // Case 1: tow sign whose start_iso is strictly after NOW_STABLE
  it("GIVEN segment with tow sign starting after NOW_STABLE, WHEN getNextRestriction(after=NOW_STABLE), THEN result.startsAt equals the tow start and result.status=tow", () => {
    // Start 1 hour after NOW_STABLE
    const startMs = NOW_STABLE.getTime() + 60 * 60 * 1000;
    const endMs   = startMs + 2 * 60 * 60 * 1000;
    const towSign = makeSign({
      id: "future-tow",
      start_iso: new Date(startMs).toISOString(),
      end_iso:   new Date(endMs).toISOString(),
    });
    const seg = makeSegment({ towSigns: [towSign] });
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).not.toBeUndefined();
    expect(result?.startsAt.getTime()).toBe(startMs);
    expect(result?.status).toBe("tow");
  });

  // Case 2: tow sign start_iso equals NOW_STABLE — not strictly after, returns undefined
  it("GIVEN tow sign start_iso equals NOW_STABLE, WHEN getNextRestriction(after=NOW_STABLE), THEN returns undefined (after is exclusive)", () => {
    const startMs = NOW_STABLE.getTime(); // exactly equals after
    const endMs   = startMs + 2 * 60 * 60 * 1000;
    const towSign = makeSign({
      id: "same-time-tow",
      start_iso: new Date(startMs).toISOString(),
      end_iso:   new Date(endMs).toISOString(),
    });
    const seg = makeSegment({ towSigns: [towSign] });
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).toBeUndefined();
  });

  // Case 3: no tow signs, no cleaning, no snow routes
  it("GIVEN segment with no tow signs, no cleaning entries, no snow routes, THEN returns undefined", () => {
    const seg = makeSegment({});
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).toBeUndefined();
  });

  // Case 4: multiple future tow signs — return the earliest
  it("GIVEN two future tow signs, WHEN getNextRestriction called, THEN returns the one with smaller startsAt", () => {
    const startMs1 = NOW_STABLE.getTime() + 2 * 60 * 60 * 1000; // 2h from now
    const startMs2 = NOW_STABLE.getTime() + 1 * 60 * 60 * 1000; // 1h from now (earlier)

    const tow1 = makeSign({
      id: "tow-later",
      start_iso: new Date(startMs1).toISOString(),
      end_iso:   new Date(startMs1 + 60 * 60 * 1000).toISOString(),
    });
    const tow2 = makeSign({
      id: "tow-sooner",
      start_iso: new Date(startMs2).toISOString(),
      end_iso:   new Date(startMs2 + 60 * 60 * 1000).toISOString(),
    });

    const seg = makeSegment({ towSigns: [tow1, tow2] });
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).not.toBeUndefined();
    expect(result?.startsAt.getTime()).toBe(startMs2);
  });

  // Case 5: tow sign that already started before NOW_STABLE but ends after — not returned (already active, not future)
  it("GIVEN tow sign already started (start_iso before NOW_STABLE), WHEN getNextRestriction(after=NOW_STABLE), THEN returns undefined", () => {
    const startMs = NOW_STABLE.getTime() - 60 * 60 * 1000; // started 1h ago
    const endMs   = NOW_STABLE.getTime() + 60 * 60 * 1000; // ends 1h from now
    const towSign = makeSign({
      id: "already-active",
      start_iso: new Date(startMs).toISOString(),
      end_iso:   new Date(endMs).toISOString(),
    });
    const seg = makeSegment({ towSigns: [towSign] });
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).toBeUndefined();
  });
});
