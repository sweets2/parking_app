/**
 * tests/unit/rules-inspector.test.ts
 * F-54 — Rules Inspection Engine
 */

import { describe, it, expect } from "vitest";
import {
  inspectRulesAtLocation,
  formatRuleSectionForSegment,
} from "../../shared/rules-inspector";
import type { ParkingSegment } from "../../shared/types";
import { NOW_STABLE, NOW_AFTER_EXPIRED } from "../fixtures/signs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal ParkingSegment with geometry centroid at (lat, lng).
 */
function makeSegment(
  overrides: Partial<ParkingSegment> & { lat?: number; lng?: number }
): ParkingSegment {
  const { lat = 40.744, lng = -74.030, ...rest } = overrides;
  const ways: Array<Array<[number, number]>> = [[[lat, lng]]];
  return {
    id: rest.id ?? "test-segment",
    street: rest.street ?? "Test Street",
    location: rest.location ?? "A St to B St",
    side: rest.side ?? "Unknown",
    geometry: rest.geometry ?? { ways, clipped: false, source: "road-geometry" },
    cleaningEntries: rest.cleaningEntries ?? [],
    towSigns: rest.towSigns ?? [],
    snowRoutes: rest.snowRoutes ?? [],
  };
}

/**
 * Build a Sign-like tow sign active at NOW_STABLE.
 */
function makeTowSign(active: boolean) {
  if (active) {
    return {
      id: "tow-1",
      address: "100 TEST ST",
      reason: "CONSTRUCTION" as const,
      permit_number: "P001",
      lat: 40.744,
      lng: -74.030,
      start_date: "6/1/2026",
      start_time: "00:00:00",
      stop_date: "12/31/2026",
      end_time: "23:59:59",
      start_iso: "2026-06-01T00:00:00",
      end_iso: "2026-12-31T23:59:59",
      active_at_fetch: true,
    };
  } else {
    // Sign that starts AFTER NOW_AFTER_EXPIRED — future sign
    return {
      id: "tow-future",
      address: "100 TEST ST",
      reason: "MOVING" as const,
      permit_number: "P002",
      lat: 40.744,
      lng: -74.030,
      start_date: "1/1/2032",
      start_time: "08:00:00",
      stop_date: "1/2/2032",
      end_time: "17:00:00",
      start_iso: "2032-01-01T08:00:00",
      end_iso: "2032-01-02T17:00:00",
      active_at_fetch: false,
    };
  }
}

// ─── inspectRulesAtLocation ───────────────────────────────────────────────────

describe("inspectRulesAtLocation", () => {
  it("returns 1 section with correct street name and priority=tow when segment centroid is within 100 m and has active tow sign at NOW_STABLE", () => {
    // Centroid at (40.744, -74.030) — the click point is the same
    const segment = makeSegment({
      street: "Washington Street",
      side: "East",
      location: "Observer Hwy to 4th St",
      towSigns: [makeTowSign(true)],
      lat: 40.744,
      lng: -74.030,
    });

    const result = inspectRulesAtLocation({
      lat: 40.744,
      lng: -74.030,
      selectedTime: NOW_STABLE,
      segments: [segment],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe("tow");
    expect(result[0]?.title).toContain("Washington Street");
  });

  it("returns 2 sections for two Washington St segments (East and West) both within 100 m", () => {
    const eastSegment = makeSegment({
      id: "wash-east",
      street: "Washington Street",
      side: "East",
      location: "1st St to 2nd St",
      lat: 40.744,
      lng: -74.030,
    });
    const westSegment = makeSegment({
      id: "wash-west",
      street: "Washington Street",
      side: "West",
      location: "1st St to 2nd St",
      lat: 40.744,
      lng: -74.030,
    });

    const result = inspectRulesAtLocation({
      lat: 40.744,
      lng: -74.030,
      selectedTime: NOW_STABLE,
      segments: [eastSegment, westSegment],
    });

    expect(result).toHaveLength(2);
    const titles = result.map((r) => r.title);
    expect(titles.some((t) => t.includes("East"))).toBe(true);
    expect(titles.some((t) => t.includes("West"))).toBe(true);
  });

  it("returns 'No matching segment' section when segments array is empty", () => {
    const result = inspectRulesAtLocation({
      lat: 40.744,
      lng: -74.030,
      selectedTime: NOW_STABLE,
      segments: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("No matching segment");
    expect(result[0]?.content).toBe("No parking segment found near this location.");
    expect(result[0]?.priority).toBe("unknown");
  });

  it("returns 'No matching segment' section when all segment centroids are more than 100 m away", () => {
    // Place segment centroid far from the clicked point
    const farSegment = makeSegment({
      street: "Far Street",
      lat: 40.800,  // many km away
      lng: -74.100,
    });

    const result = inspectRulesAtLocation({
      lat: 40.744,
      lng: -74.030,
      selectedTime: NOW_STABLE,
      segments: [farSegment],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("No matching segment");
    expect(result[0]?.content).toBe("No parking segment found near this location.");
    expect(result[0]?.priority).toBe("unknown");
  });

  it("returns safe priority when segment has no active restrictions at NOW_STABLE", () => {
    const segment = makeSegment({
      street: "Park Avenue",
      side: "North",
      location: "A St to B St",
      lat: 40.744,
      lng: -74.030,
      towSigns: [],
      cleaningEntries: [],
      snowRoutes: [],
    });

    const result = inspectRulesAtLocation({
      lat: 40.744,
      lng: -74.030,
      selectedTime: NOW_STABLE,
      segments: [segment],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe("safe");
  });

  it("does not deduplicate Washington St segments — returns one section per matching segment", () => {
    const seg1 = makeSegment({
      id: "wash-1",
      street: "Washington Street",
      side: "East",
      location: "1st St to 2nd St",
      lat: 40.744,
      lng: -74.030,
    });
    const seg2 = makeSegment({
      id: "wash-2",
      street: "Washington Street",
      side: "West",
      location: "1st St to 2nd St",
      lat: 40.744,
      lng: -74.030,
    });
    const seg3 = makeSegment({
      id: "wash-3",
      street: "Washington Street",
      side: "East",
      location: "2nd St to 3rd St",
      lat: 40.744,
      lng: -74.031,
    });

    const result = inspectRulesAtLocation({
      lat: 40.744,
      lng: -74.030,
      selectedTime: NOW_STABLE,
      segments: [seg1, seg2, seg3],
    });

    // All three are within 100m, none collapsed
    expect(result).toHaveLength(3);
  });

  it("includes segment within 100 m but excludes segment beyond 100 m", () => {
    // ~0 m away — should be included
    const nearSegment = makeSegment({
      id: "near",
      street: "Near Street",
      lat: 40.744,
      lng: -74.030,
    });
    // Place far enough to exceed 100 m (about 0.001 deg lat ≈ 111 m)
    const farSegment = makeSegment({
      id: "far",
      street: "Far Street",
      lat: 40.7451,
      lng: -74.030,
    });

    const result = inspectRulesAtLocation({
      lat: 40.744,
      lng: -74.030,
      selectedTime: NOW_STABLE,
      segments: [nearSegment, farSegment],
    });

    // Should include near but not far
    const streets = result.map((r) => r.title);
    expect(streets.some((t) => t.includes("Near Street"))).toBe(true);
    expect(streets.some((t) => t.includes("Far Street"))).toBe(false);
  });
});

// ─── formatRuleSectionForSegment ─────────────────────────────────────────────

describe("formatRuleSectionForSegment", () => {
  it("returns array of length 1 with priority=tow when tow sign is active at NOW_STABLE", () => {
    const segment = makeSegment({
      street: "Test Street",
      side: "East",
      location: "A St to B St",
      towSigns: [makeTowSign(true)],
    });

    const result = formatRuleSectionForSegment({
      segment,
      selectedTime: NOW_STABLE,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe("tow");
  });

  it("returns array of length 1 with priority=safe and content including 'Next:' when no active restriction but future tow sign exists at NOW_AFTER_EXPIRED", () => {
    const segment = makeSegment({
      street: "Test Street",
      side: "East",
      location: "A St to B St",
      towSigns: [makeTowSign(false)], // starts in 2032, after NOW_AFTER_EXPIRED
    });

    const result = formatRuleSectionForSegment({
      segment,
      selectedTime: NOW_AFTER_EXPIRED,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe("safe");
    expect(result[0]?.content).toContain("Next:");
  });

  it("returns title without side clause when side is 'Unknown'", () => {
    const segment = makeSegment({
      street: "Test Street",
      side: "Unknown",
      location: "A St to B St",
    });

    const result = formatRuleSectionForSegment({
      segment,
      selectedTime: NOW_STABLE,
    });

    expect(result).toHaveLength(1);
    // Title should be "<street> (<location>)" without side clause
    expect(result[0]?.title).toBe("Test Street (A St to B St)");
    expect(result[0]?.title).not.toContain("Unknown");
  });

  it("returns title with side clause when side is known (e.g., East)", () => {
    const segment = makeSegment({
      street: "Washington Street",
      side: "East",
      location: "1st St to 2nd St",
    });

    const result = formatRuleSectionForSegment({
      segment,
      selectedTime: NOW_STABLE,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Washington Street (East side, 1st St to 2nd St)");
  });

  it("returns priority=safe and content 'No restriction at this time.' when no restrictions exist", () => {
    const segment = makeSegment({
      street: "Empty Street",
      side: "West",
      location: "C St to D St",
      towSigns: [],
      cleaningEntries: [],
      snowRoutes: [],
    });

    const result = formatRuleSectionForSegment({
      segment,
      selectedTime: NOW_STABLE,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe("safe");
    expect(result[0]?.content).toBe("No restriction at this time.");
  });

  it("returns priority=snow when segment has a snow route", () => {
    const segment = makeSegment({
      street: "3rd Street",
      side: "Both",
      location: "Washington St to Hudson St",
      snowRoutes: [
        {
          street: "3RD ST",
          side: "Both",
          from: "Washington St",
          to: "Hudson St",
        },
      ],
    });

    const result = formatRuleSectionForSegment({
      segment,
      selectedTime: NOW_STABLE,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe("snow");
  });

  it("returns the highest priority (tow > snow) when multiple restrictions are active", () => {
    const segment = makeSegment({
      street: "Mixed Street",
      side: "North",
      location: "A St to B St",
      towSigns: [makeTowSign(true)],
      snowRoutes: [
        {
          street: "MIXED ST",
          side: "North",
          from: "A St",
          to: "B St",
        },
      ],
    });

    const result = formatRuleSectionForSegment({
      segment,
      selectedTime: NOW_STABLE,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe("tow");
  });

  it("does not mutate input segment", () => {
    const towSigns = [makeTowSign(true)];
    const segment = makeSegment({
      street: "Immutable St",
      side: "East",
      location: "A to B",
      towSigns,
    });
    const originalLength = segment.towSigns.length;

    formatRuleSectionForSegment({ segment, selectedTime: NOW_STABLE });

    expect(segment.towSigns.length).toBe(originalLength);
    expect(segment.street).toBe("Immutable St");
  });
});
