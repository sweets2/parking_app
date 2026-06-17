/**
 * Unit tests for app/app.ts — F-46D
 *
 * Tests the new AppState model with ready mode, activeMode, and setActiveMode.
 * Legacy browsing/parked/storage tests are removed as those states no longer exist.
 *
 * NOTE: Does not import from tests/fixtures/signs.ts because that file reads
 * data/latest.json via readFileSync at module-load time and crashes with ENOENT
 * when the data file is absent (e.g. in CI). Inline constants are used instead.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../../app/app";
import type { AppState } from "../../app/app";
import type { Sign } from "../../shared/types";

// ─── Inline stable time references (avoid fixtures/signs.ts readFileSync) ─────

/** When the data file was fetched (matches the value in fixtures/signs.ts). */
const FETCH_TIME: Date = new Date("2026-06-09T13:52:50.509Z");

/** Noon ET on June 9 2026 — within the active window of most fixture signs. */
const NOW_STABLE: Date = new Date("2026-06-09T16:00:00.000Z");

// ─── Mock app/map for clearCheckResults / clearRulesInspection ───────────────

// All vi.fn() are created inline inside the factory — capturing module-level
// const variables would cause TDZ crashes because vi.mock factories are hoisted
// above variable declarations in vitest.
vi.mock("../../app/map", () => ({
  clearCheckResults: vi.fn(),
  renderCheckResults: vi.fn(),
  selectCheckSegment: vi.fn(),
  clearRulesInspection: vi.fn(),
  renderRulesInspection: vi.fn(),
  setRulesInspectionMarker: vi.fn(),
  showRulesControls: vi.fn(),
  hideRulesControls: vi.fn(),
  initMap: vi.fn(),
  registerMapClickHandler: vi.fn(),
  renderPositionMarker: vi.fn(),
  renderSignPins: vi.fn(),
  renderTowSegments: vi.fn(),
  renderSpotMarker: vi.fn(),
  clearPositionMarker: vi.fn(),
  clearSpotMarker: vi.fn(),
  centerOnSpot: vi.fn(),
  showStreetPopup: vi.fn(),
  initRoadGeometry: vi.fn(),
  setTowSignsVisible: vi.fn(),
  clearViolationHighlights: vi.fn(),
  renderViolationHighlights: vi.fn(),
  setViolationHighlightsVisible: vi.fn(),
  renderUpcomingSignPins: vi.fn(),
  renderUpcomingTowSegments: vi.fn(),
  setUpcomingSignsVisible: vi.fn(),
  renderGarageMarkers: vi.fn(),
  setGarageMarkersVisible: vi.fn(),
  renderSnowEmergencyRoutes: vi.fn(),
  setSnowRoutesVisible: vi.fn(),
  initStreetParity: vi.fn(),
  correctSignPositions: vi.fn((signs: unknown[]) => signs),
  getRoadGeometry: vi.fn(() => ({})),
}));

// Obtain typed references to the mocked map functions after module setup.
import * as _mapModule from "../../app/map";
const mockClearCheckResults = vi.mocked(_mapModule.clearCheckResults);
const mockClearRulesInspection = vi.mocked(_mapModule.clearRulesInspection);

// ─── Sign factory helpers ─────────────────────────────────────────────────────

function makeSign(
  id: string,
  opts: {
    lat?: number;
    lng?: number;
    startIso?: string;
    endIso?: string;
    activeAtFetch?: boolean;
  } = {}
): Sign {
  const {
    lat = 40.744,
    lng = -74.032,
    startIso = "2026-06-09T10:00:00",
    endIso = "2026-06-09T18:00:00",
    activeAtFetch = true,
  } = opts;
  return {
    id,
    address: "100 Test St",
    reason: "CONSTRUCTION",
    permit_number: "TEST-001",
    lat,
    lng,
    start_date: "6/9/2026",
    start_time: "10:00:00",
    stop_date: "6/9/2026",
    end_time: "18:00:00",
    start_iso: startIso,
    end_iso: endIso,
    active_at_fetch: activeAtFetch,
  };
}

/**
 * A set of signs where at least one is out-of-bounds (will be filtered by
 * filterLoadTimeNoise) so that allSigns.length < ALL_SIGNS_FIXTURE.length.
 */
const OUT_OF_BOUNDS_SIGN = makeSign("obb-1", { lat: 0.0, lng: 0.0 });
const VALID_SIGN_1 = makeSign("valid-1");
const VALID_SIGN_2 = makeSign("valid-2", { endIso: "2026-06-09T18:30:00" });
const ALL_SIGNS_FIXTURE: Sign[] = [OUT_OF_BOUNDS_SIGN, VALID_SIGN_1, VALID_SIGN_2];

// ─── makeApp helper ───────────────────────────────────────────────────────────

function makeApp(signs = ALL_SIGNS_FIXTURE) {
  const renderState = vi.fn();
  const app = createApp(
    { renderState },
    { signs, fetchTime: FETCH_TIME, parkingSegments: [] },
    NOW_STABLE
  );
  return { app, renderState };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("F-46D Initial state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given app creation succeeds, When getState() is called, Then state.mode is 'ready' and state.activeMode is 'check'", () => {
    const { app } = makeApp();
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.activeMode).toBe("check");
    }
  });

  it("Given app creation succeeds, When getState() is called, Then state.allSigns.length is less than ALL_SIGNS.length (noise filtered) and state.activeSigns is an array", () => {
    const { app } = makeApp();
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      // OUT_OF_BOUNDS_SIGN is filtered out by filterLoadTimeNoise
      expect(state.allSigns.length).toBeLessThan(ALL_SIGNS_FIXTURE.length);
      expect(Array.isArray(state.activeSigns)).toBe(true);
    }
  });

  it("Given app creation succeeds, When getState() is called, Then state.checkResults is an empty array", () => {
    const { app } = makeApp();
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.checkResults).toEqual([]);
    }
  });

  it("Given app creation succeeds, When getState() is called, Then state.selectedCheckSegment is null", () => {
    const { app } = makeApp();
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.selectedCheckSegment).toBeNull();
    }
  });

  it("Given app creation succeeds, When getState() is called, Then state.selectedRulesLocation is null", () => {
    const { app } = makeApp();
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.selectedRulesLocation).toBeNull();
    }
  });

  it("Given app creation succeeds, When getState() is called, Then state.rulesInspectionSections is an empty array", () => {
    const { app } = makeApp();
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.rulesInspectionSections).toEqual([]);
    }
  });

  it("Given app creation succeeds, When getState() is called, Then state.rulesTime.mode is 'now' and selectedTime matches the 'now' parameter", () => {
    const { app } = makeApp();
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.rulesTime.mode).toBe("now");
      expect(state.rulesTime.selectedTime.getTime()).toBe(NOW_STABLE.getTime());
    }
  });
});

describe("F-46D setActiveMode — check to rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given the app is in ready/check mode (activeMode === 'check'), When setActiveMode('rules') is called, Then getState().activeMode is 'rules'", () => {
    const { app } = makeApp();
    app.setActiveMode("rules");
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.activeMode).toBe("rules");
    }
  });

  it("Given the app is in ready/check mode, When setActiveMode('rules') is called, Then clearCheckResults was called exactly once", () => {
    const { app } = makeApp();
    mockClearCheckResults.mockClear();
    app.setActiveMode("rules");
    expect(mockClearCheckResults).toHaveBeenCalledTimes(1);
  });

  it("Given the app is in ready/check mode, When setActiveMode('rules') is called, Then clearRulesInspection is not called", () => {
    const { app } = makeApp();
    mockClearRulesInspection.mockClear();
    app.setActiveMode("rules");
    expect(mockClearRulesInspection).not.toHaveBeenCalled();
  });
});

describe("F-46D setActiveMode — rules to check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given the app is in ready/rules mode (activeMode === 'rules'), When setActiveMode('check') is called, Then getState().activeMode is 'check'", () => {
    const { app } = makeApp();
    app.setActiveMode("rules");
    app.setActiveMode("check");
    const state = app.getState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.activeMode).toBe("check");
    }
  });

  it("Given the app is in ready/rules mode, When setActiveMode('check') is called, Then clearRulesInspection was called exactly once", () => {
    const { app } = makeApp();
    app.setActiveMode("rules");
    mockClearRulesInspection.mockClear();
    mockClearCheckResults.mockClear();
    app.setActiveMode("check");
    expect(mockClearRulesInspection).toHaveBeenCalledTimes(1);
  });

  it("Given the app is in ready/rules mode, When setActiveMode('check') is called, Then clearCheckResults is not called (only clearRulesInspection)", () => {
    const { app } = makeApp();
    app.setActiveMode("rules");
    mockClearCheckResults.mockClear();
    app.setActiveMode("check");
    expect(mockClearCheckResults).not.toHaveBeenCalled();
  });
});

describe("F-46D setActiveMode no-op cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given activeMode is 'check', When setActiveMode('check') is called again, Then clearCheckResults and clearRulesInspection are NOT called", () => {
    const { app } = makeApp();
    mockClearCheckResults.mockClear();
    mockClearRulesInspection.mockClear();
    app.setActiveMode("check");
    expect(mockClearCheckResults).not.toHaveBeenCalled();
    expect(mockClearRulesInspection).not.toHaveBeenCalled();
  });

  it("Given activeMode is 'rules', When setActiveMode('rules') is called again, Then no clear functions are called", () => {
    const { app } = makeApp();
    app.setActiveMode("rules");
    mockClearCheckResults.mockClear();
    mockClearRulesInspection.mockClear();
    app.setActiveMode("rules");
    expect(mockClearCheckResults).not.toHaveBeenCalled();
    expect(mockClearRulesInspection).not.toHaveBeenCalled();
  });
});

describe("F-46D tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given app is in ready mode, When tick(now) is called, Then state.mode remains 'ready' and no error is thrown", () => {
    const { app } = makeApp();
    expect(() => app.tick(NOW_STABLE)).not.toThrow();
    const state = app.getState();
    expect(state.mode).toBe("ready");
  });

  it("Given a sign whose window closes between ticks, When tick(now) called after end_iso, THEN activeSigns does not contain that sign", () => {
    const expiringSign = makeSign("test-expiring", {
      startIso: "2026-06-09T10:00:00",
      endIso: "2026-06-09T17:00:00",
    });

    const renderState = vi.fn();
    const app = createApp(
      { renderState },
      { signs: [expiringSign], fetchTime: FETCH_TIME, parkingSegments: [] },
      NOW_STABLE
    );

    app.tick(NOW_STABLE);
    const stateAtStable = app.getState();
    if (stateAtStable.mode === "ready") {
      expect(stateAtStable.activeSigns.some((s) => s.id === "test-expiring")).toBe(true);
    }

    // After NOW_AFTER_EXPIRED the sign is no longer active
    const NOW_AFTER_EXPIRED = new Date("2031-01-01T12:00:00.000Z");
    app.tick(NOW_AFTER_EXPIRED);
    const stateAfterExpiry = app.getState();
    if (stateAfterExpiry.mode === "ready") {
      expect(stateAfterExpiry.activeSigns.some((s) => s.id === "test-expiring")).toBe(false);
    }
  });
});

describe("F-46D renderState callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given createApp is called, Then renderState is called with the initial ready state", () => {
    const renderState = vi.fn();
    createApp(
      { renderState },
      { signs: ALL_SIGNS_FIXTURE, fetchTime: FETCH_TIME, parkingSegments: [] },
      NOW_STABLE
    );
    expect(renderState).toHaveBeenCalledTimes(1);
    const calledState = renderState.mock.calls[0]?.[0] as AppState;
    expect(calledState.mode).toBe("ready");
  });
});
