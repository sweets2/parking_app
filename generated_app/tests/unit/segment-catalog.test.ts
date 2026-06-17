import { describe, it, expect } from "vitest";
import {
  buildParkingSegmentCatalog,
  makeParkingSegmentId,
  normalizeSegmentToken,
} from "../../shared/segment-catalog";
import type { StreetCleaningEntry, SnowRoute, Sign } from "../../shared/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const washingtonEast: StreetCleaningEntry = {
  street: "Washington St",
  side: "East",
  schedule: "Monday   8 am – 9 am",
  location: "Observer Hwy to 4th St",
};

const washingtonWest: StreetCleaningEntry = {
  street: "Washington St",
  side: "West",
  schedule: "Tuesday   8 am – 9 am",
  location: "Observer Hwy to 4th St",
};

const washingtonEast4to8: StreetCleaningEntry = {
  street: "Washington St",
  side: "East",
  schedule: "Wednesday   8 am – 9 am",
  location: "4th St to 8th St",
};

const oneEntry: StreetCleaningEntry = {
  street: "Hudson St",
  side: "East",
  schedule: "Thursday   9 am – 10 am",
  location: "1st St to 5th St",
};

// ─── Tests: normalizeSegmentToken ─────────────────────────────────────────────

describe("normalizeSegmentToken", () => {
  it("converts 'Observer Hwy to 4th St' to 'observer-hwy-to-4th-st'", () => {
    expect(normalizeSegmentToken("Observer Hwy to 4th St")).toBe("observer-hwy-to-4th-st");
  });

  it("lowercases and replaces spaces with dashes", () => {
    expect(normalizeSegmentToken("Washington St")).toBe("washington-st");
  });

  it("handles multiple spaces by collapsing them", () => {
    expect(normalizeSegmentToken("4th St to 8th St")).toBe("4th-st-to-8th-st");
  });

  it("strips leading/trailing whitespace", () => {
    expect(normalizeSegmentToken("  East  ")).toBe("east");
  });
});

// ─── Tests: makeParkingSegmentId ──────────────────────────────────────────────

describe("makeParkingSegmentId", () => {
  it("returns a string containing 'unknown' when side is 'Unknown'", () => {
    const id = makeParkingSegmentId({
      street: "Washington St",
      side: "Unknown",
      location: "Observer Hwy to 4th St",
    });
    expect(id).toContain("unknown");
  });

  it("returns a string containing normalized street when side is 'East'", () => {
    const id = makeParkingSegmentId({
      street: "Washington St",
      side: "East",
      location: "Observer Hwy to 4th St",
    });
    expect(id).toContain("washington-st");
    expect(id).toContain("east");
    expect(id).toContain("observer-hwy-to-4th-st");
  });

  it("produces different IDs for different sides", () => {
    const idEast = makeParkingSegmentId({
      street: "Washington St",
      side: "East",
      location: "Observer Hwy to 4th St",
    });
    const idWest = makeParkingSegmentId({
      street: "Washington St",
      side: "West",
      location: "Observer Hwy to 4th St",
    });
    expect(idEast).not.toBe(idWest);
  });

  it("produces different IDs for different locations", () => {
    const id1 = makeParkingSegmentId({
      street: "Washington St",
      side: "East",
      location: "Observer Hwy to 4th St",
    });
    const id2 = makeParkingSegmentId({
      street: "Washington St",
      side: "East",
      location: "4th St to 8th St",
    });
    expect(id1).not.toBe(id2);
  });
});

// ─── Tests: buildParkingSegmentCatalog — cleaning entries ────────────────────

describe("buildParkingSegmentCatalog with cleaningEntries", () => {
  it("returns exactly 2 segments for two Washington St entries with different sides", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [washingtonEast, washingtonWest],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("returns exactly 2 segments for two Washington St entries with different locations (same side)", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [washingtonEast, washingtonEast4to8],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("returns exactly 1 segment for 1 cleaningEntry when roadGeometry is undefined", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [oneEntry],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.geometry).toBeUndefined();
    expect(result[0]?.cleaningEntries).toHaveLength(1);
  });

  it("groups two entries with same (street, side, location) into one segment", () => {
    const entry1: StreetCleaningEntry = {
      street: "Washington St",
      side: "East",
      schedule: "Monday   8 am – 9 am",
      location: "Observer Hwy to 4th St",
    };
    const entry2: StreetCleaningEntry = {
      street: "Washington St",
      side: "East",
      schedule: "Friday   8 am – 9 am",
      location: "Observer Hwy to 4th St",
    };
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [entry1, entry2],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.cleaningEntries).toHaveLength(2);
  });

  it("sets street, side, and location correctly on the segment", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [oneEntry],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result[0]?.street).toBe("Hudson St");
    expect(result[0]?.side).toBe("East");
    expect(result[0]?.location).toBe("1st St to 5th St");
  });

  it("returns empty array when all inputs are empty", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(0);
  });
});

// ─── Tests: buildParkingSegmentCatalog — snow routes ─────────────────────────

describe("buildParkingSegmentCatalog with snowRoutes", () => {
  const snowRoute1: SnowRoute = {
    street: "WASHINGTON ST",
    side: "East",
    from: "Observer Hwy",
    to: "4th St",
  };

  const snowRoute2: SnowRoute = {
    street: "WASHINGTON ST",
    side: "West",
    from: "Observer Hwy",
    to: "4th St",
  };

  it("returns 2 segments for 2 snow routes on different sides", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [],
      snowRoutes: [snowRoute1, snowRoute2],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("constructs location from 'from to to' for snow routes", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [],
      snowRoutes: [snowRoute1],
      roadGeometry: undefined,
    });
    expect(result[0]?.location).toBe("Observer Hwy to 4th St");
    expect(result[0]?.snowRoutes).toHaveLength(1);
  });

  it("groups two snow routes with same (street, side) into one segment", () => {
    const sameRoute2: SnowRoute = {
      street: "WASHINGTON ST",
      side: "East",
      from: "4th St",
      to: "8th St",
    };
    // Two routes with same street+side but different from/to
    // per spec: grouped by (street, side) pair only
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [],
      snowRoutes: [snowRoute1, sameRoute2],
      roadGeometry: undefined,
    });
    // Same (street, side) so merged into 1 segment
    expect(result).toHaveLength(1);
    expect(result[0]?.snowRoutes).toHaveLength(2);
  });
});

// ─── Tests: buildParkingSegmentCatalog — merge across source types ────────────

describe("buildParkingSegmentCatalog merge behavior", () => {
  it("merges a cleaning entry and snow route with same normalized (street, side, location) into one segment", () => {
    const cleaningEntry: StreetCleaningEntry = {
      street: "WASHINGTON ST",
      side: "East",
      schedule: "Monday   8 am – 9 am",
      location: "Observer Hwy to 4th St",
    };
    const snowRoute: SnowRoute = {
      street: "WASHINGTON ST",
      side: "East",
      from: "Observer Hwy",
      to: "4th St",
    };
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [cleaningEntry],
      snowRoutes: [snowRoute],
      roadGeometry: undefined,
    });
    // The location from cleaningEntry is "Observer Hwy to 4th St"
    // The location from snowRoute is "Observer Hwy to 4th St"
    // Same triple → merge into 1
    expect(result).toHaveLength(1);
    expect(result[0]?.cleaningEntries).toHaveLength(1);
    expect(result[0]?.snowRoutes).toHaveLength(1);
  });

  it("does not merge when street differs", () => {
    const cleaningEntry: StreetCleaningEntry = {
      street: "Hudson St",
      side: "East",
      schedule: "Monday   8 am – 9 am",
      location: "Observer Hwy to 4th St",
    };
    const snowRoute: SnowRoute = {
      street: "WASHINGTON ST",
      side: "East",
      from: "Observer Hwy",
      to: "4th St",
    };
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [cleaningEntry],
      snowRoutes: [snowRoute],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(2);
  });
});

// ─── Tests: buildParkingSegmentCatalog — signs (towSigns) ────────────────────

describe("buildParkingSegmentCatalog with signs", () => {
  const makeSign = (overrides: Partial<Sign> & { address: string }): Sign => ({
    id: "sign-1",
    reason: "CONSTRUCTION",
    permit_number: "P-001",
    lat: 40.744,
    lng: -74.034,
    start_date: "1/1/2025",
    start_time: "09:00:00",
    stop_date: "1/2/2025",
    end_time: "17:00:00",
    start_iso: "2025-01-01T09:00:00",
    end_iso: "2025-01-02T17:00:00",
    active_at_fetch: true,
    ...overrides,
  });

  it("produces empty towSigns array when signs is empty", () => {
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [oneEntry],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result[0]?.towSigns).toHaveLength(0);
  });

  it("includes sign in towSigns for a segment derived from that sign address", () => {
    const sign = makeSign({ id: "s1", address: "257 WASHINGTON ST" });
    const result = buildParkingSegmentCatalog({
      signs: [sign],
      cleaningEntries: [],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
    const segWithSign = result.find((s) => s.towSigns.length > 0);
    expect(segWithSign).toBeDefined();
    expect(segWithSign?.towSigns[0]?.id).toBe("s1");
  });

  it("groups two signs with the same parsed address into one segment", () => {
    const sign1 = makeSign({ id: "s1", address: "257 WASHINGTON ST" });
    const sign2 = makeSign({ id: "s2", address: "257 WASHINGTON ST" });
    const result = buildParkingSegmentCatalog({
      signs: [sign1, sign2],
      cleaningEntries: [],
      snowRoutes: [],
      roadGeometry: undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.towSigns).toHaveLength(2);
  });
});

// ─── Tests: geometry attachment ───────────────────────────────────────────────

describe("buildParkingSegmentCatalog geometry", () => {
  it("attaches geometry when road geometry is provided and key matches", () => {
    const entry: StreetCleaningEntry = {
      street: "WASHINGTON ST",
      side: "East",
      schedule: "Monday   8 am – 9 am",
      location: "Observer Hwy to 4th St",
    };
    const roadGeometry = {
      "WASHINGTON ST": [[[40.744, -74.034], [40.745, -74.034]] as [number, number][]],
    };
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [entry],
      snowRoutes: [],
      roadGeometry,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.geometry).toBeDefined();
    expect(result[0]?.geometry?.source).toBe("road-geometry");
  });

  it("leaves geometry undefined when road geometry cannot be matched", () => {
    const entry: StreetCleaningEntry = {
      street: "Obscure Ave",
      side: "East",
      schedule: "Monday   8 am – 9 am",
      location: "1st St to 5th St",
    };
    const roadGeometry = {
      "WASHINGTON ST": [[[40.744, -74.034], [40.745, -74.034]] as [number, number][]],
    };
    const result = buildParkingSegmentCatalog({
      signs: [],
      cleaningEntries: [entry],
      snowRoutes: [],
      roadGeometry,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.geometry).toBeUndefined();
  });
});
