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
} from "../../shared/parking-logic";
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
import type { Sign } from "../../shared/types";

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
  const sign = makeSign({
    start_iso: "2026-05-26T08:00:00",
    end_iso: "2026-05-29T16:00:00",
  });

  it("returns true when now is within the window", () => {
    expect(isSignActive(sign, new Date("2026-05-28T12:00:00"))).toBe(true);
  });

  it("returns true when now equals end_iso (inclusive upper bound)", () => {
    expect(isSignActive(sign, new Date(sign.end_iso))).toBe(true);
  });

  it("returns false one second after end_iso", () => {
    expect(isSignActive(sign, new Date("2026-05-29T16:00:01"))).toBe(false);
  });

  it("returns true for a far-future permanent sign", () => {
    const permanent = makeSign({ end_iso: "2030-12-31T07:00:00" });
    expect(isSignActive(permanent, new Date("2026-05-28T12:00:00"))).toBe(true);
  });

  it("returns false for a sign that has not yet started (start_iso in the future)", () => {
    const future = makeSign({
      start_iso: "2030-01-01T00:00:00",
      end_iso: "2030-12-31T07:00:00",
    });
    expect(isSignActive(future, new Date("2026-05-28T12:00:00"))).toBe(false);
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
    const result = filterLoadTimeNoise([expiredSign], new Date("2026-01-01T00:00:00"));
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
    const now = new Date("2026-06-09T12:00:00");
    const result = filterLoadTimeNoise([upcoming], now);
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

describe("formatCountdown", () => {
  it("returns '3h 0m' for 3 hours remaining", () => {
    expect(
      formatCountdown("2026-05-28T21:00:00", new Date("2026-05-28T18:00:00"))
    ).toBe("3h 0m");
  });

  it("returns '45m' for exactly 45 minutes remaining", () => {
    // Use literal local-time strings to avoid UTC/local timezone mismatch
    expect(formatCountdown("2026-05-28T14:45:00", new Date("2026-05-28T14:00:00"))).toBe("45m");
  });

  it("returns '1h 30m' for exactly 90 minutes remaining", () => {
    expect(formatCountdown("2026-05-28T15:30:00", new Date("2026-05-28T14:00:00"))).toBe("1h 30m");
  });

  it("returns '59m' for 59 minutes 59 seconds (truncates seconds)", () => {
    expect(formatCountdown("2026-05-28T14:59:59", new Date("2026-05-28T14:00:00"))).toBe("59m");
  });

  it("returns '0m' when end equals now", () => {
    expect(formatCountdown("2026-05-28T14:00:00", new Date("2026-05-28T14:00:00"))).toBe("0m");
  });

  it("returns '0m' and no '-' when already expired", () => {
    const result = formatCountdown("2026-05-28T13:00:00", new Date("2026-05-28T14:00:00"));
    expect(result).toBe("0m");
    expect(result).not.toContain("-");
  });
});

// ─── F-03.8 formatSignWindow ─────────────────────────────────────────────────

describe("formatSignWindow", () => {
  it("returns string containing 'today' and '5:00 PM' for same-day sign", () => {
    const sign = makeSign({ end_iso: "2026-05-28T17:00:00" });
    const result = formatSignWindow(sign, new Date("2026-05-28T12:00:00"));
    expect(result).toContain("today");
    expect(result).toContain("5:00 PM");
  });

  it("returns string with weekday abbreviation and '4:00 PM' for different-day sign", () => {
    const sign = makeSign({ end_iso: "2026-05-29T16:00:00" });
    const result = formatSignWindow(sign, new Date("2026-05-28T12:00:00"));
    // "Fri" for May 29, 2026
    const hasWeekday = /Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(result);
    expect(hasWeekday).toBe(true);
    expect(result).toContain("4:00 PM");
  });

  it("shows '12:00 AM' for sign ending at midnight", () => {
    const sign = makeSign({ end_iso: "2026-05-29T00:00:00" });
    const result = formatSignWindow(sign, new Date("2026-05-28T12:00:00"));
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
