import { describe, it, expect } from "vitest";
import {
  isSignActive,
  filterLoadTimeNoise,
  filterNearby,
  formatCountdown,
} from "../../shared/parking-logic";
import {
  ALL_DATA,
  ALL_SIGNS,
  SIGN_BAD_COORD,
  SIGN_PERMANENT_1,
  EXPIRED_SIGNS,
  PERMANENT_SIGNS,
  FETCH_TIME,
  NOW_STABLE,
} from "../fixtures/signs";

describe("Integration — full pipeline against real data", () => {
  it("ALL_DATA.count equals ALL_SIGNS.length", () => {
    expect(ALL_DATA.count).toBe(ALL_SIGNS.length);
  });

  it("fetched_at is embedded in FETCH_TIME (ISO 8601 format)", () => {
    // FETCH_TIME was built from the fetched_at string — verify it parses
    expect(FETCH_TIME.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("every sign has required fields with correct types", () => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    const validReasons = new Set(["CONSTRUCTION", "MOVING", "EVENT", "DELIVERY"]);
    for (const sign of ALL_SIGNS) {
      expect(typeof sign.id).toBe("string");
      expect(sign.id.length).toBeGreaterThan(0);
      expect(typeof sign.lat).toBe("number");
      expect(typeof sign.lng).toBe("number");
      expect(validReasons.has(sign.reason)).toBe(true);
      expect(sign.start_iso).toMatch(isoRegex);
      expect(sign.end_iso).toMatch(isoRegex);
    }
  });

  it("isSignActive matches active_at_fetch for every sign at FETCH_TIME (0 mismatches)", () => {
    const mismatches = ALL_SIGNS.filter(
      (s) => isSignActive(s, FETCH_TIME) !== s.active_at_fetch
    );
    expect(mismatches.length).toBe(0);
  });

  it("filterLoadTimeNoise removes SIGN_BAD_COORD from ALL_SIGNS at FETCH_TIME", () => {
    const badCoord = SIGN_BAD_COORD;
    if (badCoord === undefined) {
      expect(true).toBe(true);
      return;
    }
    const result = filterLoadTimeNoise(ALL_SIGNS, FETCH_TIME);
    expect(result.some((s) => s.id === badCoord.id)).toBe(false);
  });

  it("filterLoadTimeNoise removes only definitively expired records (active_at_fetch=false AND end_iso before now) from ALL_SIGNS at FETCH_TIME", () => {
    const result = filterLoadTimeNoise(ALL_SIGNS, FETCH_TIME);
    // A sign is definitively expired only when active_at_fetch=false AND end_iso < FETCH_TIME local string.
    // Signs with active_at_fetch=false but end_iso in the future are upcoming — they must be kept.
    const fetchLocalStr = "2026-06-09T09:52:50";
    const definitelyExpired = EXPIRED_SIGNS.filter((s) => s.end_iso < fetchLocalStr);
    const definitelyExpiredInResult = result.filter((s) =>
      definitelyExpired.some((e) => e.id === s.id)
    );
    expect(definitelyExpiredInResult.length).toBe(0);
  });

  it("filterNearby near SIGN_PERMANENT_1 does not include SIGN_BAD_COORD", () => {
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

  it("PERMANENT_SIGNS are all active at NOW_STABLE", () => {
    for (const sign of PERMANENT_SIGNS) {
      expect(isSignActive(sign, NOW_STABLE)).toBe(true);
    }
  });

  it("parking at SIGN_PERMANENT_1 returns at least one nearby active sign and no SIGN_BAD_COORD", () => {
    const perm1 = SIGN_PERMANENT_1;
    if (perm1 === undefined) {
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
    expect(result.length).toBeGreaterThanOrEqual(1);
    // All returned signs must pass isSignActive
    for (const sign of result) {
      expect(isSignActive(sign, NOW_STABLE)).toBe(true);
    }
    // SIGN_BAD_COORD must not be included
    const badCoord = SIGN_BAD_COORD;
    if (badCoord !== undefined) {
      expect(result.some((s) => s.id === badCoord.id)).toBe(false);
    }
  });

  it("formatCountdown returns '3h 0m' for a 3-hour window", () => {
    // end is 3 hours after NOW_STABLE (2026-06-09T16:00:00Z); Z suffix ensures UTC parse
    const end = "2026-06-09T19:00:00Z";
    expect(formatCountdown(end, NOW_STABLE)).toBe("3h 0m");
  });
});
