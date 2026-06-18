/**
 * Unit tests for CF-16 Address Arc Index
 *
 * Tests run in environment: "node". No DOM, no Leaflet imports.
 * All tests use synthetic data — no real address-arc.json or road geometry required.
 */

import { describe, it, expect, beforeEach } from "vitest";

// We test interpolateHouseNumToArcM, clipWaysToArcRange, and flattenWaysToArcPath
// by importing them from app/map.ts after providing a minimal Leaflet mock.

// ─── Minimal Leaflet mock (required before importing map.ts) ─────────────────

const mockPolylines: Array<{ latlngs: [number, number][]; options: Record<string, unknown> }> = [];

const mockPolyline = (
  latlngs: [number, number][],
  options: Record<string, unknown>
) => {
  const obj = { latlngs, options, remove: () => {}, addTo: () => obj, setStyle: () => obj };
  mockPolylines.push({ latlngs, options });
  return obj;
};

const L = {
  map: () => ({
    setView: () => ({}),
    on: () => ({}),
    off: () => ({}),
    getZoom: () => 15,
    getContainer: () => ({ addEventListener: () => {} }),
    createPane: () => ({ style: {} }),
    getPane: () => ({ style: {} }),
    closePopup: () => {},
    panTo: () => {},
    getCenter: () => ({ lat: 40.744, lng: -74.032 }),
  }),
  tileLayer: () => ({ addTo: () => {} }),
  circleMarker: () => ({ addTo: () => {}, remove: () => {}, setRadius: () => {} }),
  marker: () => ({ addTo: () => {}, remove: () => {}, bindPopup: () => ({ on: () => {} }), on: () => {} }),
  divIcon: () => ({}),
  popup: () => ({
    setLatLng: () => ({ setContent: () => ({ openOn: () => {} }) }),
    setContent: () => {},
    openOn: () => {},
    remove: () => {},
  }),
  polyline: mockPolyline,
};

// Set up the global L before importing map.ts
(globalThis as Record<string, unknown>)["L"] = L;

import {
  initAddressArcIndex,
  interpolateHouseNumToArcM,
  clipWaysToArcRange,
  flattenWaysToArcPath,
} from "../../app/map";

// ─── Helper ───────────────────────────────────────────────────────────────────

function resetArcIndex(data: Record<string, [number, number][]>): void {
  initAddressArcIndex(data);
}

// ─── interpolateHouseNumToArcM tests ─────────────────────────────────────────

describe("interpolateHouseNumToArcM", () => {
  const KEY = "BLOOMFIELD ST";

  beforeEach(() => {
    resetArcIndex({
      [KEY]: [[100, 0.0], [200, 50.0]],
    });
  });

  it("exact interpolation — midpoint returns 25.0", () => {
    const result = interpolateHouseNumToArcM(KEY, 150);
    expect(result).not.toBeNull();
    expect(result?.arcM).toBeCloseTo(25.0);
    expect(result?.clamped).toBe(false);
  });

  it("clamp low — houseNum below min returns first arcM with clamped=true", () => {
    const result = interpolateHouseNumToArcM(KEY, 50);
    expect(result).not.toBeNull();
    expect(result?.arcM).toBeCloseTo(0.0);
    expect(result?.clamped).toBe(true);
  });

  it("clamp high — houseNum above max returns last arcM with clamped=true", () => {
    const result = interpolateHouseNumToArcM(KEY, 300);
    expect(result).not.toBeNull();
    expect(result?.arcM).toBeCloseTo(50.0);
    expect(result?.clamped).toBe(true);
  });

  it("unknown street returns null", () => {
    const result = interpolateHouseNumToArcM("UNKNOWN ST", 150);
    expect(result).toBeNull();
  });

  it("exact match on boundary — houseNum 100 returns arcM 10.0", () => {
    resetArcIndex({ [KEY]: [[100, 10.0], [200, 60.0]] });
    const result = interpolateHouseNumToArcM(KEY, 100);
    expect(result).not.toBeNull();
    expect(result?.arcM).toBeCloseTo(10.0);
    expect(result?.clamped).toBe(false);
  });
});

// ─── flattenWaysToArcPath tests ───────────────────────────────────────────────

describe("flattenWaysToArcPath", () => {
  it("wayEnds tracking — two ways of 3 points each", () => {
    const way0: [number, number][] = [[40.740, -74.030], [40.741, -74.030], [40.742, -74.030]];
    const way1: [number, number][] = [[40.745, -74.030], [40.746, -74.030], [40.747, -74.030]];
    const { wayEnds } = flattenWaysToArcPath([way0, way1]);
    // way0 has 3 points → last index = 2
    expect(wayEnds[0]).toBe(2);
    // way1 has 3 points → last index in flat array = 5
    expect(wayEnds[1]).toBe(5);
  });

  it("cumArc is monotonically non-decreasing", () => {
    const way0: [number, number][] = [[40.740, -74.030], [40.741, -74.030], [40.742, -74.030]];
    const { cumArc } = flattenWaysToArcPath([way0]);
    for (let i = 1; i < cumArc.length; i++) {
      expect(cumArc[i]).toBeGreaterThanOrEqual(cumArc[i - 1] ?? 0);
    }
  });

  it("first cumArc is 0", () => {
    const way0: [number, number][] = [[40.740, -74.030], [40.741, -74.030]];
    const { cumArc } = flattenWaysToArcPath([way0]);
    expect(cumArc[0]).toBe(0);
  });
});

// ─── clipWaysToArcRange tests ─────────────────────────────────────────────────

describe("clipWaysToArcRange", () => {
  it("basic clip — single way, clip [30, 70] metres", () => {
    // A single way with 3 points. 0.001° lat ≈ 111.32 m apart → ~222m total
    // so [30, 70] m is well within the way
    const way: [number, number][] = [[0, 0], [0, 0.001], [0, 0.002]];
    const result = clipWaysToArcRange([way], 30, 70);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const seg = result[0];
    expect(seg).toBeDefined();
    expect((seg as [number, number][]).length).toBeGreaterThanOrEqual(2);
    // First point of clipped segment should be approximately 30m from start
    // 30m / (111320 m/deg) ≈ 0.0002695 deg in lng
    const firstPt = (seg as [number, number][])[0];
    expect(firstPt).toBeDefined();
    // The segment should start near 30m and end near 70m from [0,0]
    const lastPt = (seg as [number, number][])[(seg as [number, number][]).length - 1];
    expect(lastPt).toBeDefined();
    // firstPt should be further along lng than start (0)
    expect(firstPt[1]).toBeGreaterThan(0);
    // lastPt should be further along lng than firstPt
    expect(lastPt[1]).toBeGreaterThan(firstPt[1]);
  });

  it("does not bridge way gap — two disconnected ways across arc range", () => {
    // Arc positions use global cumulative distance (not per-way reset).
    // wayA: [40.740,-74.030]→[40.741,-74.030] ≈ 111.32m (lat delta 0.001°)
    // gap:  [40.741,-74.030]→[40.745,-74.030] ≈ 445.28m (lat delta 0.004°)
    // wayB first point: cumArc ≈ 556.6m; second point: ≈ 667.9m
    // Range [50, 620] captures the tail of wayA (50-111.32m) and start of wayB (556.6-620m).
    const wayA: [number, number][] = [[40.740, -74.030], [40.741, -74.030]];
    const wayB: [number, number][] = [[40.745, -74.030], [40.746, -74.030]];
    const result = clipWaysToArcRange([wayA, wayB], 50, 620);
    // Must be two separate segments (one per way), not one bridged segment
    expect(result.length).toBe(2);
  });

  it("entirely outside range — clip range beyond total length returns empty", () => {
    const way: [number, number][] = [[40.740, -74.030], [40.741, -74.030]]; // ~111m long
    // 200m to 300m is beyond the way
    const result = clipWaysToArcRange([way], 200, 300);
    expect(result.length).toBe(0);
  });

  it("min/max swap — fromArcM > toArcM gives same result as swapped", () => {
    const way: [number, number][] = [[0, 0], [0, 0.001], [0, 0.002]];
    const r1 = clipWaysToArcRange([way], 30, 70);
    const r2 = clipWaysToArcRange([way], 70, 30);
    // Both should produce the same number of segments with same point count
    expect(r1.length).toBe(r2.length);
    if (r1.length > 0 && r2.length > 0) {
      expect(r1[0]?.length).toBe(r2[0]?.length);
    }
  });
});
