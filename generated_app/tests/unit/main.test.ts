/**
 * Unit tests for app/main.ts — F-17.5 / F-10 / F-14 / F-46D / F-50
 *
 * Tests the street popup click wiring: normalizeStreet helper, findCleaningEntries
 * helper, and the map click handler behavior in check vs rules mode.
 *
 * Also tests F-46D map click routing by activeMode.
 *
 * Also tests F-14: automatic re-fetch on open when a saved spot exists.
 * (F-14 now works without saved spots — we test it via fetch count).
 *
 * Also tests F-50: parking data loader — required data awaited before createApp.
 *
 * Leaflet and geo dependencies are mocked so this module runs in Node.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { StreetCleaningEntry, ParkingSegment, RulesInspectionSection, Sign } from "../../shared/types";
import type { App, AppState } from "../../app/app";
// Use an inline stable date rather than importing from fixtures/signs.ts,
// which reads data/latest.json via readFileSync at module-load time (ENOENT in CI).
const NOW_STABLE = new Date("2026-06-09T16:00:00.000Z"); // 12:00 ET

// ─── Mock app/map ─────────────────────────────────────────────────────────────

const mockShowStreetPopup = vi.fn();
const mockRenderPositionMarker = vi.fn();
const mockRegisterMapClickHandler = vi.fn();
const mockInitMap = vi.fn();
const mockRenderSignPins = vi.fn();
const mockRenderSpotMarker = vi.fn();
const mockRenderViolationHighlights = vi.fn();
const mockForgetViolationHighlights = vi.fn();
const mockRenderCheckResults = vi.fn();
const mockClearCheckResults = vi.fn();
const mockClearRulesInspection = vi.fn();
const mockSetRulesInspectionMarker = vi.fn();
const mockRenderRulesInspection = vi.fn();
// Stored as module-level variables so their implementations can be restored after
// vi.resetAllMocks() in F-14 beforeEach (vi.mock factories are not re-invoked on
// vi.resetModules(), so inline vi.fn() implementations get lost after resetAllMocks).
const mockCorrectSignPositions = vi.fn((signs: unknown[]) => signs);
const mockGetRoadGeometry = vi.fn(() => ({}));

vi.mock("../../app/map", () => ({
  initMap: mockInitMap,
  registerMapClickHandler: mockRegisterMapClickHandler,
  renderPositionMarker: mockRenderPositionMarker,
  renderSignPins: mockRenderSignPins,
  renderTowSegments: vi.fn(),
  renderSpotMarker: mockRenderSpotMarker,
  clearPositionMarker: vi.fn(),
  clearSpotMarker: vi.fn(),
  centerOnSpot: vi.fn(),
  showStreetPopup: mockShowStreetPopup,
  initRoadGeometry: vi.fn(),
  setTowSignsVisible: vi.fn(),
  clearViolationHighlights: vi.fn(),
  renderViolationHighlights: mockRenderViolationHighlights,
  forgetViolationHighlights: mockForgetViolationHighlights,
  setViolationHighlightsVisible: vi.fn(),
  renderUpcomingSignPins: vi.fn(),
  renderUpcomingTowSegments: vi.fn(),
  setUpcomingSignsVisible: vi.fn(),
  renderGarageMarkers: vi.fn(),
  setGarageMarkersVisible: vi.fn(),
  renderSnowEmergencyRoutes: vi.fn(),
  setSnowRoutesVisible: vi.fn(),
  initStreetParity: vi.fn(),
  initAddressArcIndex: vi.fn(),
  correctSignPositions: mockCorrectSignPositions,
  getRoadGeometry: mockGetRoadGeometry,
  clearCheckResults: mockClearCheckResults,
  renderCheckResults: mockRenderCheckResults,
  selectCheckSegment: vi.fn(),
  clearRulesInspection: mockClearRulesInspection,
  renderRulesInspection: mockRenderRulesInspection,
  setRulesInspectionMarker: mockSetRulesInspectionMarker,
  showRulesControls: vi.fn(),
  hideRulesControls: vi.fn(),
}));

// ─── Mock app/ui ──────────────────────────────────────────────────────────────

const mockShowSpotToast = vi.fn();
const mockRenderLoading = vi.fn();
const mockHideLoading = vi.fn();
const mockRenderBrowsingMode = vi.fn();
const mockRenderWarningBanner = vi.fn();
const mockRenderClearBanner = vi.fn();
const mockShowBottomSheet = vi.fn();
const mockHideBottomSheet = vi.fn();
const mockSetBottomSheetContent = vi.fn();
const mockSetBottomSheetMode = vi.fn();
const mockRenderCheckSegmentDetails = vi.fn((seg: unknown) => `<div>mock-segment-${(seg as { id: string }).id}</div>`);
vi.mock("../../app/ui", () => ({
  showSpotToast: mockShowSpotToast,
  renderLoading: mockRenderLoading,
  hideLoading: mockHideLoading,
  renderBrowsingMode: mockRenderBrowsingMode,
  renderWarningBanner: mockRenderWarningBanner,
  renderClearBanner: mockRenderClearBanner,
  TOAST_DURATION_MS: 4000,
  showBottomSheet: mockShowBottomSheet,
  hideBottomSheet: mockHideBottomSheet,
  setBottomSheetContent: mockSetBottomSheetContent,
  setBottomSheetMode: mockSetBottomSheetMode,
  renderCheckSegmentDetails: mockRenderCheckSegmentDetails,
}));

// ─── Mock shared/rules-inspector ─────────────────────────────────────────────

const mockInspectRulesAtLocation = vi.fn<[], RulesInspectionSection[]>(() => [
  { title: "No matching segment", content: "No parking segment found near this location.", priority: "unknown" },
]);

vi.mock("../../shared/rules-inspector", () => ({
  inspectRulesAtLocation: mockInspectRulesAtLocation,
  formatRuleSectionForSegment: vi.fn(),
}));

// ─── Mock shared/storage ──────────────────────────────────────────────────────

vi.mock("../../shared/storage", () => ({
  createSpotStorage: vi.fn(() => ({
    load: vi.fn(() => null),
    save: vi.fn(),
    clear: vi.fn(),
  })),
}));

// ─── Mock shared/segment-catalog ─────────────────────────────────────────────

const mockBuildParkingSegmentCatalog = vi.fn((): ParkingSegment[] => []);

vi.mock("../../shared/segment-catalog", () => ({
  buildParkingSegmentCatalog: mockBuildParkingSegmentCatalog,
}));

// ─── Mock app/app ─────────────────────────────────────────────────────────────

// We provide a controllable app mock for initBrowserApp tests
let mockAppState: AppState = {
  mode: "ready",
  activeMode: "check",
  allSigns: [],
  activeSigns: [],
  parkingSegments: [],
  checkQuery: { startTime: NOW_STABLE, endTime: NOW_STABLE, label: "Now", source: "duration" },
  checkResults: [],
  selectedCheckSegment: null,
  rulesTime: { mode: "now", selectedTime: NOW_STABLE },
  selectedRulesLocation: null,
  rulesInspectionSections: [],
};
const mockAppGetState = vi.fn<[], AppState>(() => mockAppState);
const mockAppSetActiveMode = vi.fn<[string], void>((mode) => {
  if (mockAppState.mode === "ready") {
    mockAppState = { ...mockAppState, activeMode: mode as "check" | "current" };
  }
});
const mockAppSetRulesLocation = vi.fn<[number, number], void>();
const mockAppSetRulesInspectionSections = vi.fn<[RulesInspectionSection[]], void>();
const mockAppSetRulesTimeNow = vi.fn<[Date], void>((selectedTime) => {
  if (mockAppState.mode === "ready") {
    mockAppState = { ...mockAppState, rulesTime: { mode: "now", selectedTime } };
  }
});
const mockAppSetRulesTimeCustom = vi.fn<[Date], void>((selectedTime) => {
  if (mockAppState.mode === "ready") {
    mockAppState = { ...mockAppState, rulesTime: { mode: "custom", selectedTime } };
  }
});
const mockAppReplaceParkingData = vi.fn();
const mockAppTick = vi.fn<[Date], void>();
let capturedRenderState: ((state: AppState) => void) | null = null;
const mockCreateApp = vi.fn(
  (deps: { renderState: (state: AppState) => void }, _initialData?: unknown, _now?: Date) => {
    capturedRenderState = deps.renderState;
    return {
      getState: mockAppGetState,
      setActiveMode: mockAppSetActiveMode,
      setRulesLocation: mockAppSetRulesLocation,
      setRulesInspectionSections: mockAppSetRulesInspectionSections,
      setRulesTimeNow: mockAppSetRulesTimeNow,
      setRulesTimeCustom: mockAppSetRulesTimeCustom,
      replaceParkingData: mockAppReplaceParkingData,
      tick: mockAppTick,
    } as App;
  }
);

vi.mock("../../app/app", () => ({
  createApp: mockCreateApp,
}));

// ─── Mock app/geo ─────────────────────────────────────────────────────────────

const mockGetStreetName = vi.fn<[number, number], Promise<string | null>>();
const mockGeocodeCrossStreet = vi.fn<[string, string?], Promise<{ lat: number; lng: number } | null>>();

vi.mock("../../app/geo", () => ({
  getStreetName: mockGetStreetName,
  geocodeCrossStreet: mockGeocodeCrossStreet,
  seedGeocodeCache: vi.fn(),
}));

// ─── Mock fetch for street-cleaning.json ──────────────────────────────────────

// We'll configure this per test
let mockFetchImpl: (() => Promise<Response>) | null = null;
global.fetch = vi.fn().mockImplementation(() => {
  if (mockFetchImpl) {
    return mockFetchImpl();
  }
  return Promise.reject(new Error("fetch not configured"));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCleaningEntry(overrides: Partial<StreetCleaningEntry> = {}): StreetCleaningEntry {
  return {
    street: "Washington Street",
    side: "East",
    schedule: "Monday - 8 am to 9 am",
    location: "9th St. to 10th St.",
    ...overrides,
  };
}

// Capture the callback registered with registerMapClickHandler
function getCapturedClickHandler(): ((lat: number, lng: number) => void) | null {
  const calls = mockRegisterMapClickHandler.mock.calls;
  if (calls.length === 0) return null;
  const lastCall = calls[calls.length - 1];
  if (!lastCall || lastCall.length === 0) return null;
  return lastCall[0] as (lat: number, lng: number) => void;
}

function makeReadyState(overrides: Partial<Extract<AppState, { mode: "ready" }>> = {}): AppState {
  return {
    mode: "ready",
    activeMode: "check",
    allSigns: [],
    activeSigns: [],
    parkingSegments: [],
    checkQuery: { startTime: NOW_STABLE, endTime: NOW_STABLE, label: "Now", source: "duration" },
    checkResults: [],
    selectedCheckSegment: null,
    rulesTime: { mode: "now", selectedTime: NOW_STABLE },
    selectedRulesLocation: null,
    rulesInspectionSections: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("F-17.5 main.ts street popup click wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchImpl = null;
    vi.resetModules();
  });

  // ─── normalizeStreet ────────────────────────────────────────────────────────

  describe("normalizeStreet", () => {
    it("lowercases the input", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Washington Street")).toBe("washington street");
    });

    it("expands St abbreviation to street", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Washington St")).toBe("washington street");
    });

    it("expands Ave abbreviation to avenue", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Park Ave")).toBe("park avenue");
    });

    it("expands Blvd abbreviation to boulevard", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Sinatra Blvd")).toBe("sinatra boulevard");
    });

    it("expands Dr abbreviation to drive", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Sinatra Dr")).toBe("sinatra drive");
    });

    it("expands Pl abbreviation to place", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Monroe Pl")).toBe("monroe place");
    });

    it("expands Hwy abbreviation to highway", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Observer Hwy")).toBe("observer highway");
    });

    it("normalizes Seventeenth St to 17th street", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Seventeenth St")).toBe("17th street");
    });

    it("normalizes Nineteenth St to 19th street", async () => {
      const { normalizeStreet } = await import("../../app/main");
      expect(normalizeStreet("Nineteenth St")).toBe("19th street");
    });
  });

  // ─── findCleaningEntries ────────────────────────────────────────────────────

  describe("findCleaningEntries", () => {
    it("returns matching entries for a road name", async () => {
      // Load fresh module and set up cleaning entries via successful fetch
      const washingtonEntry = makeCleaningEntry({ street: "Washington Street" });
      const otherEntry = makeCleaningEntry({ street: "9th Street", side: "North" });
      const streetCleaningData = {
        fetched_at: "2026-06-09T12:00:00Z",
        entries: [washingtonEntry, otherEntry],
      };

      mockFetchImpl = () =>
        Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);

      const { init, findCleaningEntries } = await import("../../app/main");
      await init();
      // Wait a tick for the fire-and-forget fetch to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      const results = findCleaningEntries("Washington Street");
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(washingtonEntry);
    });

    it("returns empty array when no entries match", async () => {
      const streetCleaningData = {
        fetched_at: "2026-06-09T12:00:00Z",
        entries: [makeCleaningEntry({ street: "9th Street" })],
      };

      mockFetchImpl = () =>
        Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);

      const { init, findCleaningEntries } = await import("../../app/main");
      await init();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const results = findCleaningEntries("Washington Street");
      expect(results).toHaveLength(0);
    });

    it("returns empty array when cleaningEntries is empty (fetch failed)", async () => {
      mockFetchImpl = () => Promise.reject(new Error("Network error"));

      const { init, findCleaningEntries } = await import("../../app/main");
      await init();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const results = findCleaningEntries("Washington Street");
      expect(results).toHaveLength(0);
    });
  });

  // ─── Click handler — parked mode (rules) ───────────────────────────────────

  describe("click handler in parked mode", () => {
    it("GIVEN parked mode and getStreetName resolves to 'Washington Street', THEN showStreetPopup is called with road name and matching entries", async () => {
      const washingtonEntry = makeCleaningEntry({ street: "Washington Street" });
      const streetCleaningData = {
        fetched_at: "2026-06-09T12:00:00Z",
        entries: [washingtonEntry],
      };

      mockFetchImpl = () =>
        Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);

      mockGetStreetName.mockResolvedValue("Washington Street");

      const { init } = await import("../../app/main");
      await init("parked");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.744, -74.032);

      expect(mockShowStreetPopup).toHaveBeenCalledOnce();
      const [lat, lng, road, entries] = mockShowStreetPopup.mock.calls[0] as [
        number,
        number,
        string,
        StreetCleaningEntry[]
      ];
      expect(lat).toBeCloseTo(40.744, 5);
      expect(lng).toBeCloseTo(-74.032, 5);
      expect(road).toBe("Washington Street");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(washingtonEntry);
    });

    it("GIVEN parked mode and getStreetName returns null, THEN showStreetPopup is not called", async () => {
      mockFetchImpl = () => Promise.reject(new Error("not needed"));
      mockGetStreetName.mockResolvedValue(null);

      const { init } = await import("../../app/main");
      await init("parked");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.744, -74.032);

      expect(mockShowStreetPopup).not.toHaveBeenCalled();
    });

    it("GIVEN street-cleaning.json fails to load, WHEN clicked in parked mode, THEN showStreetPopup is called with empty entries (no crash)", async () => {
      mockFetchImpl = () => Promise.reject(new Error("Network error"));
      mockGetStreetName.mockResolvedValue("Washington Street");

      const { init } = await import("../../app/main");
      await init("parked");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.744, -74.032);

      expect(mockShowStreetPopup).toHaveBeenCalledOnce();
      const [, , , entries] = mockShowStreetPopup.mock.calls[0] as [
        number,
        number,
        string,
        StreetCleaningEntry[]
      ];
      expect(entries).toHaveLength(0);
    });
  });

  // ─── Click handler — browsing mode (check) ─────────────────────────────────

  describe("click handler in browsing mode", () => {
    it("GIVEN browsing mode and map is clicked, THEN getStreetName is not called (position-setting branch runs)", async () => {
      mockFetchImpl = () => Promise.reject(new Error("not needed"));

      const { init } = await import("../../app/main");
      await init("browsing");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.744, -74.032);

      expect(mockGetStreetName).not.toHaveBeenCalled();
      expect(mockRenderPositionMarker).toHaveBeenCalledWith(40.744, -74.032);
    });
  });

  // ─── F-20 buildDetectSegmentCallback ───────────────────────────────────────

  describe("F-20 buildDetectSegmentCallback via parked-mode click handler", () => {
    it("F-20: GIVEN the parked-mode click handler fires at a known coordinate, THEN showStreetPopup is called with a fifth argument that is a function", async () => {
      const washingtonEntry = makeCleaningEntry({ street: "Washington Street", location: "9th St. to 10th St." });
      const streetCleaningData = {
        fetched_at: "2026-06-09T12:00:00Z",
        entries: [washingtonEntry],
      };

      mockFetchImpl = () =>
        Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);

      mockGetStreetName.mockResolvedValue("Washington Street");

      const { init } = await import("../../app/main");
      await init("parked");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.744, -74.032);

      expect(mockShowStreetPopup).toHaveBeenCalledOnce();
      const call = mockShowStreetPopup.mock.calls[0] as unknown[];
      // 5th argument should be a function (the detectSegment callback)
      expect(typeof call[4]).toBe("function");
    });

    it("F-20: GIVEN geocodeCrossStreet returns coordinates that bracket the click point, WHEN the detectSegment callback is called, THEN it resolves to the matching location string", async () => {
      // click at lat 40.745 (between 40.740 and 40.750)
      // N-S street: deltaLat(0.010) > deltaLng(0.000) => latitude check
      mockGeocodeCrossStreet
        .mockResolvedValueOnce({ lat: 40.740, lng: -74.032 }) // "9th St"
        .mockResolvedValueOnce({ lat: 40.750, lng: -74.032 }); // "10th St"

      const washingtonEntry = makeCleaningEntry({ street: "Washington Street", location: "9th St. to 10th St." });
      const streetCleaningData = {
        fetched_at: "2026-06-09T12:00:00Z",
        entries: [washingtonEntry],
      };

      mockFetchImpl = () =>
        Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);

      mockGetStreetName.mockResolvedValue("Washington Street");

      const { init } = await import("../../app/main");
      await init("parked");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.745, -74.032);

      expect(mockShowStreetPopup).toHaveBeenCalledOnce();
      const call = mockShowStreetPopup.mock.calls[0] as unknown[];
      const detectSegment = call[4] as (locations: string[]) => Promise<string[] | null>;
      expect(typeof detectSegment).toBe("function");

      const result = await detectSegment(["9th St. to 10th St."]);
      expect(result).toEqual(["9th St. to 10th St."]);
    });

    it("F-20: GIVEN geocodeCrossStreet returns null for all cross-streets, WHEN the callback is called, THEN it resolves to null", async () => {
      mockGeocodeCrossStreet.mockResolvedValue(null);

      const washingtonEntry = makeCleaningEntry({ street: "Washington Street", location: "9th St. to 10th St." });
      const streetCleaningData = {
        fetched_at: "2026-06-09T12:00:00Z",
        entries: [washingtonEntry],
      };

      mockFetchImpl = () =>
        Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);

      mockGetStreetName.mockResolvedValue("Washington Street");

      const { init } = await import("../../app/main");
      await init("parked");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.744, -74.032);

      const call = mockShowStreetPopup.mock.calls[0] as unknown[];
      const detectSegment = call[4] as (locations: string[]) => Promise<string[] | null>;
      const result = await detectSegment(["9th St. to 10th St."]);
      expect(result).toBeNull();
    });

    it("F-20: GIVEN extractCrossStreets returns null for a location (uses ' and '), THEN that location is skipped and geocodeCrossStreet is not called for it", async () => {
      mockGeocodeCrossStreet.mockResolvedValue(null);

      const washingtonEntry = makeCleaningEntry({ street: "Washington Street", location: "8th St. and 9th St." });
      const streetCleaningData = {
        fetched_at: "2026-06-09T12:00:00Z",
        entries: [washingtonEntry],
      };

      mockFetchImpl = () =>
        Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);

      mockGetStreetName.mockResolvedValue("Washington Street");

      const { init } = await import("../../app/main");
      await init("parked");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = getCapturedClickHandler();
      expect(handler).not.toBeNull();
      if (handler === null) return;

      await handler(40.744, -74.032);

      const call = mockShowStreetPopup.mock.calls[0] as unknown[];
      const detectSegment = call[4] as (locations: string[]) => Promise<string[] | null>;
      // "8th St. and 9th St." uses " and " — extractCrossStreets returns null, skip
      const result = await detectSegment(["8th St. and 9th St."]);
      expect(result).toBeNull();
      // geocodeCrossStreet should NOT have been called (location was skipped)
      expect(mockGeocodeCrossStreet).not.toHaveBeenCalled();
    });
  });
});

// ─── F-10.1 Open App Cold (No Saved Spot) ────────────────────────────────────

describe("F-10.1 initBrowserApp cold open", () => {
  function makeMockButton(id: string): HTMLButtonElement & { click(): void } {
    const listeners: Record<string, (() => void)[]> = {};
    const btn = {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener(event: string, fn: () => void) {
        if (!listeners[event]) listeners[event] = [];
        (listeners[event] as (() => void)[]).push(fn);
      },
      click() {
        (listeners["click"] ?? []).forEach((fn) => fn());
      },
    } as unknown as HTMLButtonElement & { click(): void };
    return btn;
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "save-btn": makeMockButton("save-btn"),
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-10.1 GIVEN no saved spot and latest.json resolves, WHEN initBrowserApp completes, THEN createApp was called and initial state is ready", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCreateApp).toHaveBeenCalledOnce();
    expect(mockAppGetState().mode).toBe("ready");
  });

  it("F-10.1 GIVEN no saved spot, WHEN initBrowserApp completes, THEN renderPositionMarker was not called (no stray position marker)", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRenderPositionMarker.mock.calls.length).toBe(0);
  });
});

// ─── F-10.2 Tap to Set Position ───────────────────────────────────────────────

describe("F-10.2 map tap sets position marker", () => {
  function makeMockButton(id: string): HTMLButtonElement & { click(): void } {
    const listeners: Record<string, (() => void)[]> = {};
    const btn = {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener(event: string, fn: () => void) {
        if (!listeners[event]) listeners[event] = [];
        (listeners[event] as (() => void)[]).push(fn);
      },
      click() {
        (listeners["click"] ?? []).forEach((fn) => fn());
      },
    } as unknown as HTMLButtonElement & { click(): void };
    return btn;
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "save-btn": makeMockButton("save-btn"),
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockInspectRulesAtLocation.mockReturnValue([
      { title: "No matching segment", content: "No parking segment found near this location.", priority: "unknown" },
    ]);
    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
    // Ensure getStreetName always returns a Promise (vi.resetAllMocks() clears implementations)
    mockGetStreetName.mockResolvedValue(null);
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-10.2 GIVEN check mode (activeMode=check), WHEN map click fires, THEN renderPositionMarker is NOT called (handleCheckClick is a stub)", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    // activeMode defaults to "check", handleCheckClick is a stub
    await handler(40.744, -74.032);

    // In check mode, handleCheckClick is a stub — no renderPositionMarker call
    expect(mockRenderPositionMarker).not.toHaveBeenCalled();
  });

  it("F-10.2 GIVEN rules mode (activeMode=rules), WHEN map click fires, THEN clearCheckResults is NOT called during the click", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    // Set up rules mode
    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockClearCheckResults.mockClear();
    await handler(40.744, -74.032);

    // handleRulesClick should not call clearCheckResults
    expect(mockClearCheckResults).not.toHaveBeenCalled();
  });
});

// ─── F-10.3 signEmoji ─────────────────────────────────────────────────────────
//
// signEmoji is exported from app/map.ts. Since the top-level vi.mock replaces
// app/map for main.ts tests, we use vi.importActual to access the real module.

describe("F-10.3 signEmoji", () => {
  it("signEmoji('CONSTRUCTION') returns an SVG dot", async () => {
    const actual = await vi.importActual<typeof import("../../app/map")>("../../app/map");
    expect(actual.signEmoji("CONSTRUCTION")).toContain("<svg");
    expect(actual.signEmoji("CONSTRUCTION")).toContain("#cc0000");
  });

  it("signEmoji('DELIVERY') returns an SVG dot", async () => {
    const actual = await vi.importActual<typeof import("../../app/map")>("../../app/map");
    expect(actual.signEmoji("DELIVERY")).toContain("<svg");
    expect(actual.signEmoji("DELIVERY")).toContain("#cc0000");
  });

  it("signEmoji('UNKNOWN_REASON') returns a hollow SVG ring (fallback)", async () => {
    const actual = await vi.importActual<typeof import("../../app/map")>("../../app/map");
    expect(actual.signEmoji("UNKNOWN_REASON")).toContain("<svg");
    expect(actual.signEmoji("UNKNOWN_REASON")).toContain("stroke=\"#dc2626\"");
  });

  it("F-10.3 GIVEN ready mode with 3 active signs, WHEN renderState fires, THEN renderSignPins is called with array of length 3", async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetchImpl = null;

    // Use a container to avoid TypeScript narrowing capturedRenderState to null
    const renderStateHolder: { fn: ((state: AppState) => void) | null } = { fn: null };

    // Re-install mocks
    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      renderStateHolder.fn = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });

    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response)
    );

    // Install HTMLButtonElement shim before document mock and module import
    class HTMLButtonElementShim {}
    (globalThis as Record<string, unknown>)["HTMLButtonElement"] = HTMLButtonElementShim;

    // Install document mock with save-btn as an instance of the shim
    const saveBtnEl = Object.assign(new HTMLButtonElementShim(), {
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
    });
    const elements: Record<string, unknown> = {
      "save-btn": saveBtnEl,
      "clear-btn": { style: { display: "" as string }, addEventListener: vi.fn() },
      "here-btn": { style: { display: "" as string }, addEventListener: vi.fn() },
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };

    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now simulate renderState being called with 3 active signs in ready state
    const threeSignState: AppState = makeReadyState({
      activeSigns: [
        { id: "1", address: "1 Test St", reason: "CONSTRUCTION", permit_number: "P1", lat: 40.744, lng: -74.032, start_date: "6/1/2026", start_time: "00:00:00", stop_date: "12/31/2026", end_time: "23:59:59", start_iso: "2026-06-01T00:00:00", end_iso: "2026-12-31T23:59:59", active_at_fetch: true },
        { id: "2", address: "2 Test St", reason: "DELIVERY", permit_number: "P2", lat: 40.744, lng: -74.031, start_date: "6/1/2026", start_time: "00:00:00", stop_date: "12/31/2026", end_time: "23:59:59", start_iso: "2026-06-01T00:00:00", end_iso: "2026-12-31T23:59:59", active_at_fetch: true },
        { id: "3", address: "3 Test St", reason: "MOVING", permit_number: "P3", lat: 40.745, lng: -74.032, start_date: "6/1/2026", start_time: "00:00:00", stop_date: "12/31/2026", end_time: "23:59:59", start_iso: "2026-06-01T00:00:00", end_iso: "2026-12-31T23:59:59", active_at_fetch: true },
      ],
    });

    // Call renderState via the holder (avoids TypeScript null narrowing issue)
    if (renderStateHolder.fn !== null) {
      renderStateHolder.fn(threeSignState);
    }

    // mockRenderSignPins from the top-level vi.mock should have been called with 3 signs
    expect(mockRenderSignPins).toHaveBeenCalled();
    const calls = mockRenderSignPins.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toBeDefined();
    expect((lastCall as unknown[])[0]).toHaveLength(3);

    // Cleanup
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
    delete (globalThis as Record<string, unknown>)["HTMLButtonElement"];
  });
});

// ─── F-10.3b normalizeStreet and findCleaningEntries ─────────────────────────

describe("F-10.3b normalizeStreet spec cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("normalizeStreet('11th St') returns '11th street'", async () => {
    const { normalizeStreet } = await import("../../app/main");
    expect(normalizeStreet("11th St")).toBe("11th street");
  });

  it("normalizeStreet('SINATRA DR') returns 'sinatra drive'", async () => {
    const { normalizeStreet } = await import("../../app/main");
    expect(normalizeStreet("SINATRA DR")).toBe("sinatra drive");
  });
});

describe("F-10.3b findCleaningEntries spec cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetchImpl = null;

    // Re-install the fetch mock implementation after resets
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  it("GIVEN cleaningEntries has entry with street 'Observer Hwy', findCleaningEntries('Observer Hwy') returns that entry", async () => {
    const observerEntry = makeCleaningEntry({ street: "Observer Hwy" });
    const streetCleaningData = {
      fetched_at: "2026-06-09T12:00:00Z",
      entries: [observerEntry],
    };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => streetCleaningData } as Response);

    const { init, findCleaningEntries } = await import("../../app/main");
    await init();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const results = findCleaningEntries("Observer Hwy");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(observerEntry);
  });

  it("GIVEN cleaningEntries has entry with street 'Observer Hwy', findCleaningEntries('observer highway') also returns that entry (normalized match)", async () => {
    const observerEntry = makeCleaningEntry({ street: "Observer Hwy" });
    const streetCleaningData = {
      fetched_at: "2026-06-09T12:00:00Z",
      entries: [observerEntry],
    };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => streetCleaningData } as Response);

    const { init, findCleaningEntries } = await import("../../app/main");
    await init();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const results = findCleaningEntries("observer highway");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(observerEntry);
  });

  it("GIVEN findCleaningEntries('Nonexistent St') is called, THEN it returns an empty array", async () => {
    const streetCleaningData = {
      fetched_at: "2026-06-09T12:00:00Z",
      entries: [makeCleaningEntry({ street: "Washington Street" })],
    };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => streetCleaningData } as Response);

    const { init, findCleaningEntries } = await import("../../app/main");
    await init();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const results = findCleaningEntries("Nonexistent St");
    expect(results).toHaveLength(0);
  });
});

// ─── F-46D Map click routing ──────────────────────────────────────────────────

describe("F-46D map click routing via initBrowserApp", () => {
  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
    };
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));
    mockInspectRulesAtLocation.mockReturnValue([
      { title: "No matching segment", content: "No parking segment found near this location.", priority: "unknown" },
    ]);
    mockInspectRulesAtLocation.mockReturnValue([
      { title: "No matching segment", content: "No parking segment found near this location.", priority: "unknown" },
    ]);

    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-46D: GIVEN activeMode is 'check', WHEN the map click handler fires, THEN clearRulesInspection is NOT called and clearCheckResults is NOT called (handleCheckClick is a stub)", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    mockAppState = makeReadyState({ activeMode: "check" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockClearCheckResults.mockClear();
    mockClearRulesInspection.mockClear();

    await handler(40.744, -74.032);

    // handleCheckClick is a stub — neither clear function is invoked by the click itself
    expect(mockClearRulesInspection).not.toHaveBeenCalled();
    expect(mockClearCheckResults).not.toHaveBeenCalled();
  });

  it("F-46D: GIVEN activeMode is 'rules', WHEN the map click handler fires, THEN clearCheckResults is NOT called during the click (handleRulesClick branch)", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    // App is already in rules mode
    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);
    mockGetStreetName.mockResolvedValue(null);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    // setActiveMode was previously called to reach current mode
    // (simulated by setting mockAppState.activeMode = "current")
    mockClearCheckResults.mockClear();

    await handler(40.744, -74.032);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // clearCheckResults is only called by setActiveMode, NOT by the click handler
    expect(mockClearCheckResults).not.toHaveBeenCalled();
  });
});

// ─── F-10.4 initBrowserApp map-click auto-save ───────────────────────────────
//
// These tests verify clicking the map in check mode runs handleCheckClick (stub),
// and the renderState callback correctly renders the ready UI.

describe("F-10.4 initBrowserApp map-click (check mode stub)", () => {
  function makeMockButton(id: string): HTMLButtonElement & { click(): void } {
    const listeners: Record<string, (() => void)[]> = {};
    const btn = {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener(event: string, fn: () => void) {
        if (!listeners[event]) listeners[event] = [];
        (listeners[event] as (() => void)[]).push(fn);
      },
      click() {
        (listeners["click"] ?? []).forEach((fn) => fn());
      },
    } as unknown as HTMLButtonElement & { click(): void };
    return btn;
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-10.4 GIVEN check mode, WHEN map click fires, THEN click handler completes without throwing", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    // handler returns void (handleCheckClick is a synchronous stub) — just call it
    expect(() => handler(40.744, -74.032)).not.toThrow();
  });

  it("F-10.4 GIVEN ready mode map click fires, WHEN renderState fires with ready state, THEN renderSignPins is called", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedRenderState).not.toBeNull();

    // Simulate renderState being called with ready state
    if (capturedRenderState !== null) {
      capturedRenderState(mockAppState);
    }

    expect(mockRenderSignPins).toHaveBeenCalled();
  });
});

// ─── F-14 Automatic Re-Fetch on Open ─────────────────────────────────────────
//
// When initBrowserApp runs, it fetches data/latest.json. Test that multiple
// fetch calls happen and data flows through correctly.

describe("F-14 automatic re-fetch on open", () => {
  // Minimal mock button factory
  function makeMockButton(id: string): HTMLButtonElement & { click(): void } {
    const listeners: Record<string, (() => void)[]> = {};
    const btn = {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener(event: string, fn: () => void) {
        if (!listeners[event]) listeners[event] = [];
        (listeners[event] as (() => void)[]).push(fn);
      },
      click() {
        (listeners["click"] ?? []).forEach((fn) => fn());
      },
    } as unknown as HTMLButtonElement & { click(): void };
    return btn;
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "save-btn": makeMockButton("save-btn"),
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    // vi.resetAllMocks() clears implementations on vi.fn() instances created at module
    // scope. Restore pass-through implementations.
    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));

    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) {
        return mockFetchImpl();
      }
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-14.1 GIVEN latest.json resolves, WHEN initBrowserApp runs, THEN createApp is called with the signs from latest.json", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCreateApp).toHaveBeenCalledOnce();
    const createAppCall = mockCreateApp.mock.calls[0];
    const initialData = createAppCall?.[1] as { signs: unknown[]; fetchTime: Date };
    expect(Array.isArray(initialData.signs)).toBe(true);
  });

  it("F-14.1 GIVEN 5 signs in latest.json, WHEN initBrowserApp runs, THEN createApp receives 5 signs", async () => {
    const freshSigns = Array.from({ length: 5 }, (_, i) => ({
      id: `fresh-${i}`,
      address: `${i} Test St`,
      reason: "CONSTRUCTION",
      permit_number: `P${i}`,
      lat: 40.744 + i * 0.0001,
      lng: -74.032,
      start_date: "6/1/2026",
      start_time: "00:00:00",
      stop_date: "12/31/2026",
      end_time: "23:59:59",
      start_iso: "2026-06-01T00:00:00",
      end_iso: "2026-12-31T23:59:59",
      active_at_fetch: true,
    }));
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: freshSigns };

    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();

    expect(mockCreateApp).toHaveBeenCalledOnce();
    const createAppCall = mockCreateApp.mock.calls[0];
    const initialData = createAppCall?.[1] as { signs: unknown[]; fetchTime: Date };
    expect(initialData.signs).toHaveLength(5);
  });

  it("F-14.1 GIVEN latest.json fetch fails, WHEN initBrowserApp runs, THEN createApp is NOT called (early return)", async () => {
    // All fetches fail
    mockFetchImpl = () => Promise.reject(new Error("Network error"));

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();

    // Should not throw, but createApp should not be called
    await expect(initBrowserApp()).resolves.toBeUndefined();

    expect(mockCreateApp).not.toHaveBeenCalled();
  });

  it("F-14.1 GIVEN no errors, WHEN initBrowserApp runs, THEN fetch is called for data/latest.json", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    const latestJsonCalls = fetchSpy.mock.calls.filter((call) => {
      const url = call[0] as string;
      return url === "data/latest.json";
    });
    expect(latestJsonCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Auto-refresh staleness check ────────────────────────────────────────────
//
// When the 60-second tick fires and _fetchedAt is from a previous UTC calendar
// day, silentRefresh should fetch data/latest.json with cache: "no-cache".

describe("auto-refresh staleness check", () => {
  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
    };
  }

  function installDocumentMockAR(): void {
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMockAR(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMockAR();
  });

  it("GIVEN _fetchedAt is from a previous UTC day, WHEN the 60s tick fires, THEN fetch is called with data/latest.json and cache: no-cache", async () => {
    // Initial fetch returns data timestamped yesterday so the staleness check fires
    const yesterdayPayload = { fetched_at: "2026-06-08T11:00:00Z", signs: [] };
    const todayPayload = { fetched_at: "2026-06-09T11:00:00Z", signs: [] };

    // Capture the 60-second tick callback by temporarily replacing setInterval
    const capturedCallbacks: Array<() => void> = [];
    const origSetInterval = globalThis.setInterval.bind(globalThis) as typeof setInterval;
    (globalThis as Record<string, unknown>)["setInterval"] = (fn: () => void, delay: number) => {
      if (delay === 60_000) { capturedCallbacks.push(fn); return 0; }
      return origSetInterval(fn as TimerHandler, delay);
    };

    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => yesterdayPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockAR();
    await initBrowserApp();
    await new Promise<void>((resolve) => origSetInterval(resolve as TimerHandler, 0));

    // Restore setInterval
    (globalThis as Record<string, unknown>)["setInterval"] = origSetInterval;

    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockClear();

    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => todayPayload } as Response);
    fetchSpy.mockImplementation(() => mockFetchImpl ? mockFetchImpl() : Promise.reject(new Error()));

    // Fire the tick manually and allow async fetch to settle
    const tick = capturedCallbacks[0];
    if (tick) tick();
    await new Promise<void>((resolve) => origSetInterval(resolve as TimerHandler, 10));

    const calls = fetchSpy.mock.calls as [string, RequestInit | undefined][];
    const staleRefreshCall = calls.find((call) => {
      const opts = call[1];
      return call[0] === "data/latest.json" && opts?.cache === "no-cache";
    });
    expect(staleRefreshCall).toBeDefined();
  });

  it("GIVEN refreshed sign data arrives, WHEN silent refresh completes, THEN app.replaceParkingData receives fresh signs and rebuilt segments", async () => {
    const yesterdayPayload = { fetched_at: "2026-06-08T11:00:00Z", signs: [] };
    const freshSign: Sign = {
      id: "fresh-sign",
      address: "100 TEST ST",
      reason: "CONSTRUCTION",
      permit_number: "P-1",
      lat: 40.744,
      lng: -74.032,
      start_date: "6/9/2026",
      start_time: "10:00:00",
      stop_date: "6/9/2026",
      end_time: "18:00:00",
      start_iso: "2026-06-09T10:00:00",
      end_iso: "2026-06-09T18:00:00",
      active_at_fetch: true,
    };
    const todayPayload = { fetched_at: "2026-06-09T11:00:00Z", signs: [freshSign] };
    const rebuiltSegment: ParkingSegment = {
      id: "rebuilt-segment",
      street: "TEST ST",
      location: "100 TEST ST",
      side: "Unknown",
      cleaningEntries: [],
      towSigns: [freshSign],
      snowRoutes: [],
    };

    const capturedCallbacks: Array<() => void> = [];
    const origSetInterval = globalThis.setInterval.bind(globalThis) as typeof setInterval;
    (globalThis as Record<string, unknown>)["setInterval"] = (fn: () => void, delay: number) => {
      if (delay === 60_000) { capturedCallbacks.push(fn); return 0; }
      return origSetInterval(fn as TimerHandler, delay);
    };

    mockBuildParkingSegmentCatalog.mockReturnValue(rebuiltSegment === undefined ? [] : [rebuiltSegment]);
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => yesterdayPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockAR();
    await initBrowserApp();
    await new Promise<void>((resolve) => origSetInterval(resolve as TimerHandler, 0));

    (globalThis as Record<string, unknown>)["setInterval"] = origSetInterval;
    mockAppReplaceParkingData.mockClear();

    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockImplementation((url: string) => {
      if (url === "data/latest.json") {
        return Promise.resolve({ ok: true, json: async () => todayPayload } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T11:00:00Z", signs: [] }) } as Response);
    });

    const tick = capturedCallbacks[0];
    if (tick) tick();
    await new Promise<void>((resolve) => origSetInterval(resolve as TimerHandler, 10));

    expect(mockAppReplaceParkingData).toHaveBeenCalledOnce();
    const call = mockAppReplaceParkingData.mock.calls[0];
    const dataArg = call?.[0] as { signs: unknown[]; fetchTime: Date; parkingSegments: ParkingSegment[] };
    expect(dataArg.signs).toEqual([freshSign]);
    expect(dataArg.fetchTime.toISOString()).toBe("2026-06-09T11:00:00.000Z");
    expect(dataArg.parkingSegments).toEqual([rebuiltSegment]);
  });
});

// ─── F-46B dev override removal ───────────────────────────────────────────────

describe("F-46B dev override removal", () => {
  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
    };
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
    vi.useRealTimers();
  });

  it("F-46B Test 1 — renderViolationHighlights receives unfiltered entries (both Washington St. and Observer Hwy.)", async () => {
    // Two entries: one for Washington St., one for Observer Hwy.
    const washingtonEntry: StreetCleaningEntry = {
      street: "Washington St.",
      side: "East",
      schedule: "Monday - 8 am to 9 am",
      location: "1st St. to 2nd St.",
    };
    const observerEntry: StreetCleaningEntry = {
      street: "Observer Hwy.",
      side: "North",
      schedule: "Tuesday - 9 am to 10 am",
      location: "Washington St. to Willow Ave.",
    };
    const streetCleaningData = {
      fetched_at: "2026-06-09T12:00:00Z",
      entries: [washingtonEntry, observerEntry],
    };
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };

    // Override fetch so street-cleaning.json gets the entries data
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/street-cleaning.json") {
        return Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => signsPayload,
      } as Response);
    });

    // Arrange: make createApp call renderState immediately with ready state
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      const readyState = makeReadyState();
      deps.renderState(readyState);
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    // Allow the awaited street-cleaning.json fetch to have been consumed
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now manually fire capturedRenderState so renderViolationHighlights is called
    // after cleaningEntries is populated. Must use rules mode — violation highlights
    // are suppressed in check mode by design.
    if (capturedRenderState !== null) {
      const readyState = makeReadyState({ activeMode: "current" });
      capturedRenderState(readyState);
    }

    // Find the call(s) to renderViolationHighlights with the entries array
    const rvhCalls = mockRenderViolationHighlights.mock.calls as [StreetCleaningEntry[], Date][];
    // Find a call that received 2 entries
    const callWithBothEntries = rvhCalls.find((call) => {
      const entries = call[0];
      return Array.isArray(entries) && entries.length === 2;
    });
    expect(callWithBothEntries).toBeDefined();
    // Confirm the 2-entry call contains Observer Hwy. (not just Washington St.)
    if (callWithBothEntries) {
      const entries = callWithBothEntries[0];
      const hasObserver = entries.some((e) => e.street === "Observer Hwy.");
      expect(hasObserver).toBe(true);
    }
  });

  it("F-46B Test 2 — scheduleViolationRefresh fires with both entries (unfiltered)", async () => {
    vi.useFakeTimers();

    const washingtonEntry: StreetCleaningEntry = {
      street: "Washington St.",
      side: "East",
      schedule: "Monday - 8 am to 9 am",
      location: "1st St. to 2nd St.",
    };
    const observerEntry: StreetCleaningEntry = {
      street: "Observer Hwy.",
      side: "North",
      schedule: "Tuesday - 9 am to 10 am",
      location: "Washington St. to Willow Ave.",
    };
    const streetCleaningData = {
      fetched_at: "2026-06-09T12:00:00Z",
      entries: [washingtonEntry, observerEntry],
    };
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };

    // Must use rules mode — scheduleViolationRefresh skips the call in check mode.
    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/street-cleaning.json") {
        return Promise.resolve({
          ok: true,
          json: async () => streetCleaningData,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => signsPayload,
      } as Response);
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();

    // Run initBrowserApp with fake timers active
    const initPromise = initBrowserApp();
    // Flush microtasks / promises by advancing 0ms
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);
    await initPromise;
    // Allow fire-and-forget fetches to resolve
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);

    // Reset the mock so we only count post-init calls
    mockRenderViolationHighlights.mockClear();

    // Advance past the maximum possible msUntilNextHour (3600 * 1000) plus a buffer
    // This guarantees the scheduleViolationRefresh setTimeout callback fires
    await vi.advanceTimersByTimeAsync(3_601_000);

    const rvhCalls = mockRenderViolationHighlights.mock.calls as [StreetCleaningEntry[], Date][];
    // There should be at least one call from the scheduled timeout
    expect(rvhCalls.length).toBeGreaterThanOrEqual(1);
    // The call should have been made with both entries (length 2)
    const callWithBothEntries = rvhCalls.find((call) => {
      const entries = call[0];
      return Array.isArray(entries) && entries.length === 2;
    });
    expect(callWithBothEntries).toBeDefined();
    if (callWithBothEntries) {
      const entries = callWithBothEntries[0];
      expect(entries.some((e) => e.street === "Observer Hwy.")).toBe(true);
      expect(entries.some((e) => e.street === "Washington St.")).toBe(true);
    }
  });
});

// ─── F-47 Check controls visibility ──────────────────────────────────────────

describe("F-47 check-controls visibility based on activeMode", () => {
  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
      getAttribute: vi.fn(() => null),
      setAttribute: vi.fn(),
      classList: { contains: vi.fn(() => false), toggle: vi.fn(), add: vi.fn() },
    };
  }

  let checkControlsEl: { style: { display: string } };

  function installDocumentMockF47(activeMode: "check" | "current"): void {
    checkControlsEl = { style: { display: "" } };
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
      "check-controls": checkControlsEl,
      "check-duration-30": makeMockButton("check-duration-30"),
      "check-duration-60": makeMockButton("check-duration-60"),
      "check-duration-120": makeMockButton("check-duration-120"),
      "check-query-input": { value: "", addEventListener: vi.fn() },
      "check-run-button": makeMockButton("check-run-button"),
      "check-until-input": { value: "", addEventListener: vi.fn() },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
      addEventListener: vi.fn(),
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };

    // Set up mock app state with the requested activeMode
    mockAppState = makeReadyState({ activeMode });
    mockAppGetState.mockImplementation(() => mockAppState);
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));
    mockInspectRulesAtLocation.mockReturnValue([
      { title: "No matching segment", content: "No parking segment found near this location.", priority: "unknown" },
    ]);
    mockAppSetRulesTimeNow.mockImplementation((selectedTime) => {
      if (mockAppState.mode === "ready") {
        mockAppState = { ...mockAppState, rulesTime: { mode: "now", selectedTime } };
      }
    });
    mockAppSetRulesTimeCustom.mockImplementation((selectedTime) => {
      if (mockAppState.mode === "ready") {
        mockAppState = { ...mockAppState, rulesTime: { mode: "custom", selectedTime } };
      }
    });

    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-47: GIVEN activeMode is 'current', WHEN renderState fires, THEN #check-controls has display='none'", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF47("current");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Trigger renderState with rules mode
    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "current" }));
    }

    expect(checkControlsEl.style.display).toBe("none");
  });

  it("F-47: GIVEN activeMode is 'check', WHEN renderState fires, THEN #check-controls does not have display='none'", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF47("check");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Trigger renderState with check mode
    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "check" }));
    }

    expect(checkControlsEl.style.display).not.toBe("none");
  });
});

// ─── F-50 Required Parking Data Loader ───────────────────────────────────────

describe("F-50 parking data loader", () => {
  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
      getAttribute: vi.fn(() => null),
      setAttribute: vi.fn(),
      classList: { contains: vi.fn(() => false), toggle: vi.fn(), add: vi.fn() },
    };
  }

  function installDocumentMock(): { bannerEl: { style: { display: string }; textContent: string } } {
    const bannerEl = { style: { display: "none" }, textContent: "" };
    const elements: Record<string, unknown> = {
      "banner": bannerEl,
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
      addEventListener: vi.fn(),
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
    return { bannerEl };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));

    mockAppState = makeReadyState();
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-50: GIVEN required static data files are available (latest.json returns 2 signs, street-cleaning.json returns 1 entry, snow-emergency-routes.json returns 1 route), WHEN initBrowserApp completes, THEN createApp was called with initialData.parkingSegments having length greater than 0", async () => {
    const signs = [
      { id: "s1", address: "100 WASHINGTON ST", reason: "CONSTRUCTION", permit_number: "P1", lat: 40.744, lng: -74.032, start_date: "6/1/2026", start_time: "00:00:00", stop_date: "12/31/2026", end_time: "23:59:59", start_iso: "2026-06-01T00:00:00", end_iso: "2026-12-31T23:59:59", active_at_fetch: true },
      { id: "s2", address: "200 WASHINGTON ST", reason: "MOVING", permit_number: "P2", lat: 40.745, lng: -74.032, start_date: "6/1/2026", start_time: "00:00:00", stop_date: "12/31/2026", end_time: "23:59:59", start_iso: "2026-06-01T00:00:00", end_iso: "2026-12-31T23:59:59", active_at_fetch: true },
    ];
    const cleaningEntry: StreetCleaningEntry = {
      street: "Washington Street",
      side: "East",
      schedule: "Monday   8 am – 9 am",
      location: "1st St. to 2nd St.",
    };
    const snowRoute = { street: "3RD ST", side: "Both", from: "Hudson St", to: "Willow Ave" };

    // Return a non-empty array to simulate buildParkingSegmentCatalog producing segments
    const fakeParkingSegments: ParkingSegment[] = [
      {
        id: "washington-street__east__1st-st-to-2nd-st",
        street: "Washington Street",
        location: "1st St. to 2nd St.",
        side: "East",
        cleaningEntries: [cleaningEntry],
        towSigns: [],
        snowRoutes: [],
      },
      {
        id: "washington-st__unknown__100-washington-st",
        street: "WASHINGTON ST",
        location: "100 WASHINGTON ST",
        side: "Unknown",
        cleaningEntries: [],
        towSigns: [signs[0] as import("../../shared/types").Sign],
        snowRoutes: [],
      },
    ];
    mockBuildParkingSegmentCatalog.mockImplementation(() => fakeParkingSegments);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/latest.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", signs }) } as Response);
      }
      if (url === "data/street-cleaning.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", entries: [cleaningEntry] }) } as Response);
      }
      if (url === "data/snow-emergency-routes.json") {
        return Promise.resolve({ ok: true, json: async () => ({ routes: [snowRoute] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCreateApp).toHaveBeenCalledOnce();
    const createAppCall = mockCreateApp.mock.calls[0];
    const initialData = createAppCall?.[1] as { signs: unknown[]; fetchTime: Date; parkingSegments: ParkingSegment[] };
    expect(initialData.parkingSegments.length).toBeGreaterThan(0);
  });

  it("F-50: GIVEN latest.json fetch throws a network error, WHEN initBrowserApp runs, THEN createApp is NOT called", async () => {
    mockFetchImpl = () => Promise.reject(new Error("Network error"));

    const { initBrowserApp } = await import("../../app/main");
    const { bannerEl } = installDocumentMock();
    await initBrowserApp();

    expect(mockCreateApp).not.toHaveBeenCalled();
    // Banner should have non-empty error text
    expect(bannerEl.textContent.length).toBeGreaterThan(0);
  });

  it("F-50: GIVEN latest.json resolves with a payload containing 3 signs, WHEN initBrowserApp completes, THEN createApp was called once with initialData.signs of length 3", async () => {
    const threeSigns = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      address: `${100 + i} WASHINGTON ST`,
      reason: "CONSTRUCTION",
      permit_number: `P${i}`,
      lat: 40.744 + i * 0.0001,
      lng: -74.032,
      start_date: "6/1/2026",
      start_time: "00:00:00",
      stop_date: "12/31/2026",
      end_time: "23:59:59",
      start_iso: "2026-06-01T00:00:00",
      end_iso: "2026-12-31T23:59:59",
      active_at_fetch: true,
    }));

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/latest.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", signs: threeSigns }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();

    expect(mockCreateApp).toHaveBeenCalledOnce();
    const createAppCall = mockCreateApp.mock.calls[0];
    const initialData = createAppCall?.[1] as { signs: unknown[]; fetchTime: Date; parkingSegments: ParkingSegment[] };
    expect(initialData.signs).toHaveLength(3);
  });

  it("F-50: GIVEN street-cleaning.json fetch fails, WHEN initBrowserApp completes, THEN createApp is still called (cleaning defaults to [])", async () => {
    mockBuildParkingSegmentCatalog.mockImplementation(() => []);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/latest.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", signs: [] }) } as Response);
      }
      if (url === "data/street-cleaning.json") {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();

    // createApp should still be called even if cleaning fetch fails
    expect(mockCreateApp).toHaveBeenCalledOnce();
    // buildParkingSegmentCatalog should have been called with empty cleaningEntries
    expect(mockBuildParkingSegmentCatalog).toHaveBeenCalledOnce();
    const catalogArgs = (mockBuildParkingSegmentCatalog.mock.calls as unknown[][])[0];
    const catalogArg = (catalogArgs as unknown[])[0] as { cleaningEntries: StreetCleaningEntry[] };
    expect(catalogArg.cleaningEntries).toHaveLength(0);
  });

  it("F-50: GIVEN snow-emergency-routes.json fetch fails, WHEN initBrowserApp completes, THEN createApp is still called (snow routes default to [])", async () => {
    mockBuildParkingSegmentCatalog.mockImplementation(() => []);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/latest.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", signs: [] }) } as Response);
      }
      if (url === "data/snow-emergency-routes.json") {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();

    expect(mockCreateApp).toHaveBeenCalledOnce();
    expect(mockBuildParkingSegmentCatalog).toHaveBeenCalledOnce();
    const catalogArgs2 = (mockBuildParkingSegmentCatalog.mock.calls as unknown[][])[0];
    const catalogArg2 = (catalogArgs2 as unknown[])[0] as { snowRoutes: unknown[] };
    expect(catalogArg2.snowRoutes).toHaveLength(0);
  });

  it("F-50: GIVEN road-geometry.json fetch fails, WHEN initBrowserApp completes, THEN createApp is still called (roadGeometry defaults to undefined)", async () => {
    mockBuildParkingSegmentCatalog.mockImplementation(() => []);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/latest.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", signs: [] }) } as Response);
      }
      if (url === "data/road-geometry.json") {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();

    expect(mockCreateApp).toHaveBeenCalledOnce();
    expect(mockBuildParkingSegmentCatalog).toHaveBeenCalledOnce();
    const catalogArgs3 = (mockBuildParkingSegmentCatalog.mock.calls as unknown[][])[0];
    const catalogArg3 = (catalogArgs3 as unknown[])[0] as { roadGeometry: unknown };
    expect(catalogArg3.roadGeometry).toBeUndefined();
  });

  it("F-50: GIVEN street-cleaning.json fetch succeeds before createApp, WHEN buildParkingSegmentCatalog is called, THEN it receives the loaded cleaning entries", async () => {
    const cleaningEntry: StreetCleaningEntry = {
      street: "Washington Street",
      side: "East",
      schedule: "Monday   8 am – 9 am",
      location: "1st St. to 2nd St.",
    };
    mockBuildParkingSegmentCatalog.mockImplementation(() => []);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "data/latest.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", signs: [] }) } as Response);
      }
      if (url === "data/street-cleaning.json") {
        return Promise.resolve({ ok: true, json: async () => ({ fetched_at: "2026-06-09T12:00:00Z", entries: [cleaningEntry] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();

    expect(mockBuildParkingSegmentCatalog).toHaveBeenCalledOnce();
    const catalogArgs4 = (mockBuildParkingSegmentCatalog.mock.calls as unknown[][])[0];
    const catalogArg4 = (catalogArgs4 as unknown[])[0] as { cleaningEntries: StreetCleaningEntry[] };
    expect(catalogArg4.cleaningEntries).toHaveLength(1);
    expect(catalogArg4.cleaningEntries[0]).toEqual(cleaningEntry);
  });
});

// ─── F-51 Check Result Renderer — mode switch clears check results ─────────────

describe("F-51 mode switch clears check results", () => {
  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
      getAttribute: vi.fn(() => null),
      setAttribute: vi.fn(),
      classList: { contains: vi.fn(() => false), toggle: vi.fn(), add: vi.fn() },
    };
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
      "check-controls": { style: { display: "" } },
      "check-duration-30": makeMockButton("check-duration-30"),
      "check-duration-60": makeMockButton("check-duration-60"),
      "check-duration-120": makeMockButton("check-duration-120"),
      "check-query-input": { value: "", addEventListener: vi.fn() },
      "check-run-button": makeMockButton("check-run-button"),
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
      addEventListener: vi.fn(),
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));

    mockAppState = makeReadyState({ activeMode: "check" });
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-51: Given activeMode switches to 'rules', When renderState fires with rules mode, Then renderCheckResults is called (check results persist as reference overlay)", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedRenderState).not.toBeNull();

    // Clear mock calls from setup
    mockClearCheckResults.mockClear();
    mockRenderCheckResults.mockClear();

    // Simulate renderState being called with current mode (activeMode switch to "current")
    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "current" }));
    }

    expect(mockRenderCheckResults).toHaveBeenCalledOnce();
  });

  it("F-51: Given activeMode is 'check', When renderState fires with check mode, Then clearCheckResults is NOT called during render", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedRenderState).not.toBeNull();

    mockClearCheckResults.mockClear();

    // Simulate renderState being called with check mode
    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "check" }));
    }

    expect(mockClearCheckResults).not.toHaveBeenCalled();
  });
});

// ─── Violation highlights / Check mode conflict fix ──────────────────────────

describe("violation highlights vs check mode conflict (bug fix)", () => {
  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      addEventListener: vi.fn(),
      getAttribute: vi.fn(() => null),
      setAttribute: vi.fn(),
      classList: { contains: vi.fn(() => false), toggle: vi.fn(), add: vi.fn() },
    };
  }

  function installDocumentMock(): void {
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
      "check-controls": { style: { display: "" } },
      "check-duration-30": makeMockButton("check-duration-30"),
      "check-duration-60": makeMockButton("check-duration-60"),
      "check-duration-120": makeMockButton("check-duration-120"),
      "check-query-input": { value: "", addEventListener: vi.fn() },
      "check-run-button": makeMockButton("check-run-button"),
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
      addEventListener: vi.fn(),
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));

    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
    vi.useRealTimers();
  });

  it("state subscriber in Check mode: renderViolationHighlights NOT called; forgetViolationHighlights IS called; renderCheckResults IS called", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    mockAppState = makeReadyState({ activeMode: "check" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedRenderState).not.toBeNull();

    mockRenderViolationHighlights.mockClear();
    mockForgetViolationHighlights.mockClear();
    mockRenderCheckResults.mockClear();

    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "check" }));
    }

    expect(mockRenderViolationHighlights).not.toHaveBeenCalled();
    expect(mockForgetViolationHighlights).toHaveBeenCalled();
    expect(mockRenderCheckResults).toHaveBeenCalled();
  });

  it("state subscriber in Rules mode: renderViolationHighlights IS called; renderCheckResults IS called (persists as reference overlay)", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedRenderState).not.toBeNull();

    mockRenderViolationHighlights.mockClear();
    mockForgetViolationHighlights.mockClear();
    mockRenderCheckResults.mockClear();

    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "current" }));
    }

    expect(mockRenderViolationHighlights).toHaveBeenCalled();
    expect(mockRenderCheckResults).toHaveBeenCalled();
  });

  it("scheduleViolationRefresh fires when activeMode is 'check': renderViolationHighlights NOT called", async () => {
    vi.useFakeTimers();

    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response)
    );

    mockAppState = makeReadyState({ activeMode: "check" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();

    const initPromise = initBrowserApp();
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);
    await initPromise;
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);

    mockRenderViolationHighlights.mockClear();

    await vi.advanceTimersByTimeAsync(3_601_000);

    expect(mockRenderViolationHighlights).not.toHaveBeenCalled();
  });

  it("scheduleViolationRefresh fires when activeMode is 'rules': renderViolationHighlights IS called", async () => {
    vi.useFakeTimers();

    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response)
    );

    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();

    const initPromise = initBrowserApp();
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);
    await initPromise;
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);

    mockRenderViolationHighlights.mockClear();

    await vi.advanceTimersByTimeAsync(3_601_000);

    expect(mockRenderViolationHighlights).toHaveBeenCalled();
  });

  it("initial F-34 render with activeMode='current' (default): renderViolationHighlights IS called on startup", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    // App defaults to activeMode: "current"
    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMock();

    mockRenderViolationHighlights.mockClear();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRenderViolationHighlights).toHaveBeenCalled();
  });
});

// ─── F-53 Rules Mode Time Selector ───────────────────────────────────────────

describe("F-53 rules mode time selector", () => {
  function makeMockButton(id: string) {
    const listeners: Record<string, Array<(e?: Event) => void>> = {};
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      getAttribute: vi.fn((attr: string) => attr === "aria-pressed" ? "false" : null),
      setAttribute: vi.fn(),
      classList: {
        contains: vi.fn(() => false),
        toggle: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
      },
      addEventListener(event: string, fn: (e?: Event) => void) {
        if (!listeners[event]) listeners[event] = [];
        (listeners[event] as Array<(e?: Event) => void>).push(fn);
      },
      click() {
        (listeners["click"] ?? []).forEach((fn) => fn());
      },
    };
  }

  function makeTimeInput(initialValue = "") {
    const listeners: Record<string, Array<(e?: Event) => void>> = {};
    return {
      id: "rules-time-input",
      value: initialValue,
      addEventListener(event: string, fn: (e?: Event) => void) {
        if (!listeners[event]) listeners[event] = [];
        (listeners[event] as Array<(e?: Event) => void>).push(fn);
      },
      change(val: string) {
        this.value = val;
        (listeners["change"] ?? []).forEach((fn) => fn());
      },
    };
  }

  let rulesTimeNowBtn: ReturnType<typeof makeMockButton>;
  let rulesTimeCustomBtn: ReturnType<typeof makeMockButton>;
  let rulesTimeInput: ReturnType<typeof makeTimeInput>;
  let rulesControlsEl: { style: { display: string } };
  let rulesLayerPanelEl: { style: { display: string } };

  function installDocumentMockF53(activeMode: "check" | "current"): void {
    rulesControlsEl = { style: { display: "" } };
    rulesLayerPanelEl = { style: { display: "" } };
    rulesTimeNowBtn = makeMockButton("rules-time-now");
    rulesTimeCustomBtn = makeMockButton("rules-time-custom");
    rulesTimeInput = makeTimeInput("");

    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
      "check-controls": { style: { display: "" } },
      "check-duration-30": makeMockButton("check-duration-30"),
      "check-duration-60": makeMockButton("check-duration-60"),
      "check-duration-120": makeMockButton("check-duration-120"),
      "check-query-input": { value: "", addEventListener: vi.fn() },
      "check-run-button": makeMockButton("check-run-button"),
      "check-until-input": { value: "", addEventListener: vi.fn() },
      "current-controls": rulesControlsEl,
      "rules-time-now": rulesTimeNowBtn,
      "rules-time-custom": rulesTimeCustomBtn,
      "rules-time-input": rulesTimeInput,
      "rules-layer-panel": rulesLayerPanelEl,
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
      addEventListener: vi.fn(),
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };

    mockAppState = makeReadyState({ activeMode });
    mockAppGetState.mockImplementation(() => mockAppState);
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));
    mockInspectRulesAtLocation.mockReturnValue([
      { title: "No matching segment", content: "No parking segment found near this location.", priority: "unknown" },
    ]);
    mockAppSetRulesTimeNow.mockImplementation((selectedTime) => {
      if (mockAppState.mode === "ready") {
        mockAppState = { ...mockAppState, rulesTime: { mode: "now", selectedTime } };
      }
    });
    mockAppSetRulesTimeCustom.mockImplementation((selectedTime) => {
      if (mockAppState.mode === "ready") {
        mockAppState = { ...mockAppState, rulesTime: { mode: "custom", selectedTime } };
      }
    });

    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-53: GIVEN activeMode is 'current', WHEN renderState fires, THEN #current-controls has display != 'none'", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF53("current");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "current" }));
    }

    expect(rulesControlsEl.style.display).not.toBe("none");
  });

  it("F-53: GIVEN activeMode is 'check', WHEN renderState fires, THEN #current-controls has display='none'", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF53("check");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "check" }));
    }

    expect(rulesControlsEl.style.display).toBe("none");
  });

  it("F-53: GIVEN activeMode is 'current', WHEN rulesTime state is read, THEN rulesTime.mode is 'now' by default", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF53("current");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = mockAppGetState();
    expect(state.mode).toBe("ready");
    if (state.mode === "ready") {
      expect(state.rulesTime.mode).toBe("now");
    }
  });

  it("F-53: GIVEN #rules-time-now is clicked, WHEN the app handles the click, THEN no error is thrown", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF53("current");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(() => rulesTimeNowBtn.click()).not.toThrow();
    expect(mockAppSetRulesTimeNow).toHaveBeenCalledOnce();
  });

  it("F-53: GIVEN #rules-time-custom is clicked and a valid time is entered (09:30), WHEN the change event fires on #rules-time-input, THEN no error is thrown", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF53("current");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Click custom button, then change input
    expect(() => {
      rulesTimeCustomBtn.click();
      rulesTimeInput.change("09:30");
    }).not.toThrow();
    expect(mockAppSetRulesTimeCustom).toHaveBeenCalledOnce();
    const selectedTime = mockAppSetRulesTimeCustom.mock.calls[0]?.[0];
    expect(selectedTime?.getHours()).toBe(9);
    expect(selectedTime?.getMinutes()).toBe(30);
  });

  it("F-53: GIVEN custom rules time is set, WHEN map is clicked in rules mode, THEN inspectRulesAtLocation receives that custom time", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    installDocumentMockF53("current");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    rulesTimeCustomBtn.click();
    rulesTimeInput.change("09:30");

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockInspectRulesAtLocation.mockClear();
    await handler(40.744, -74.032);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const callArgs = (mockInspectRulesAtLocation.mock.calls[0] as unknown[])[0] as {
      selectedTime: Date;
    };
    expect(callArgs.selectedTime.getHours()).toBe(9);
    expect(callArgs.selectedTime.getMinutes()).toBe(30);
  });

  it("F-53: GIVEN the mode switches to 'current', WHEN renderState fires with current mode, THEN #current-controls is visible", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    // Start in check mode
    installDocumentMockF53("check");
    const { initBrowserApp } = await import("../../app/main");
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Simulate a switch to rules mode via renderState
    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "current" }));
    }

    expect(rulesControlsEl.style.display).not.toBe("none");
  });
});

// ─── F-55 Rules Inspection UI ─────────────────────────────────────────────────

describe("F-55 rules inspection UI", () => {

  function makeMockButton(id: string) {
    return {
      id,
      style: { display: "" as string },
      disabled: false as boolean,
      getAttribute: vi.fn((attr: string) => attr === "aria-pressed" ? "false" : null),
      setAttribute: vi.fn(),
      classList: {
        contains: vi.fn(() => false),
        toggle: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
      },
      addEventListener: vi.fn(),
    };
  }

  function installDocumentMockF55(): void {
    const elements: Record<string, unknown> = {
      "clear-btn": makeMockButton("clear-btn"),
      "here-btn": makeMockButton("here-btn"),
      "banner": { style: { display: "none" }, textContent: "" },
      "check-controls": { style: { display: "" } },
      "check-duration-30": makeMockButton("check-duration-30"),
      "check-duration-60": makeMockButton("check-duration-60"),
      "check-duration-120": makeMockButton("check-duration-120"),
      "check-query-input": { value: "", addEventListener: vi.fn() },
      "check-run-button": makeMockButton("check-run-button"),
      "current-controls": { style: { display: "none" } },
      "rules-time-now": makeMockButton("rules-time-now"),
      "rules-time-custom": makeMockButton("rules-time-custom"),
      "rules-time-input": { value: "", addEventListener: vi.fn() },
    };
    (globalThis as Record<string, unknown>)["document"] = {
      getElementById: (id: string) => elements[id] ?? null,
      addEventListener: vi.fn(),
    };
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }

  function removeDocumentMock(): void {
    delete (globalThis as Record<string, unknown>)["document"];
    delete (globalThis as Record<string, unknown>)["localStorage"];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    mockFetchImpl = null;
    vi.resetModules();

    mockBuildParkingSegmentCatalog.mockImplementation(() => []);
    mockCorrectSignPositions.mockImplementation((signs: unknown[]) => signs);
    mockGetRoadGeometry.mockImplementation(() => ({}));

    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);
    capturedRenderState = null;
    mockCreateApp.mockImplementation((deps: { renderState: (state: AppState) => void }) => {
      capturedRenderState = deps.renderState;
      return {
        getState: mockAppGetState,
        setActiveMode: mockAppSetActiveMode,
        setRulesLocation: mockAppSetRulesLocation,
        setRulesInspectionSections: mockAppSetRulesInspectionSections,
        setRulesTimeNow: mockAppSetRulesTimeNow,
        setRulesTimeCustom: mockAppSetRulesTimeCustom,
        replaceParkingData: mockAppReplaceParkingData,
        tick: mockAppTick,
      } as App;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mockFetchImpl) return mockFetchImpl();
      return Promise.reject(new Error("fetch not configured"));
    });
  });

  afterEach(() => {
    removeDocumentMock();
  });

  it("F-55: Given activeMode is 'rules', When the map is clicked at lat 40.744 lng -74.032, Then selectedRulesLocation is set to { lat: 40.744, lng: -74.032 }", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const section: RulesInspectionSection = {
      title: "No matching segment",
      content: "No parking segment found near this location.",
      priority: "unknown",
    };
    mockInspectRulesAtLocation.mockReturnValue([section]);

    mockAppState = makeReadyState({ activeMode: "current", rulesTime: { mode: "now", selectedTime: NOW_STABLE } });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockF55();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockAppSetRulesLocation.mockClear();
    await handler(40.744, -74.032);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // AC-1: selectedRulesLocation is stored in app state via setRulesLocation
    expect(mockAppSetRulesLocation).toHaveBeenCalledOnce();
    expect(mockAppSetRulesLocation).toHaveBeenCalledWith(40.744, -74.032);
  });

  it("F-55: Given activeMode is 'rules', When the map is clicked, Then inspectRulesAtLocation is called once with { lat, lng, selectedTime: NOW_STABLE, segments: [] }", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const segment1: RulesInspectionSection = { title: "S1", content: "No restriction.", priority: "safe" };
    mockInspectRulesAtLocation.mockReturnValue([segment1]);
    mockBuildParkingSegmentCatalog.mockReturnValue([]);

    mockAppState = makeReadyState({
      activeMode: "current",
      rulesTime: { mode: "now", selectedTime: NOW_STABLE },
      parkingSegments: [],
    });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockF55();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockInspectRulesAtLocation.mockClear();
    await handler(40.744, -74.032);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockInspectRulesAtLocation).toHaveBeenCalledOnce();
    const callArgs = (mockInspectRulesAtLocation.mock.calls[0] as unknown[])[0] as {
      lat: number; lng: number; selectedTime: Date; segments: unknown[];
    };
    expect(callArgs.lat).toBe(40.744);
    expect(callArgs.lng).toBe(-74.032);
    expect(callArgs.selectedTime).toEqual(NOW_STABLE);
    expect(callArgs.segments).toEqual([]);
  });

  it("F-55: Given activeMode is 'rules' and inspectRulesAtLocation returns 2 sections, When the map is clicked, Then setBottomSheetContent is called with HTML containing exactly 2 'rules-section' class occurrences", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const twoSections: RulesInspectionSection[] = [
      { title: "Washington St (East side, 1st–7th)", content: "Street cleaning: Mon 8–9 am.", priority: "ticket" },
      { title: "Washington St (West side, 1st–7th)", content: "No restriction at this time.", priority: "safe" },
    ];
    mockInspectRulesAtLocation.mockReturnValue(twoSections);

    mockAppState = makeReadyState({ activeMode: "current", rulesTime: { mode: "now", selectedTime: NOW_STABLE } });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockF55();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockSetBottomSheetContent.mockClear();
    await handler(40.744, -74.032);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSetBottomSheetContent).toHaveBeenCalledOnce();
    const htmlArg = (mockSetBottomSheetContent.mock.calls[0] as string[])[0];
    // Count outer section divs — each section begins with <div class="rules-section rules-section--
    // (the priority class follows), distinguishing the outer div from sub-divs like rules-section-title
    const sectionDivs = (htmlArg.match(/<div class="rules-section rules-section--/g) ?? []).length;
    expect(sectionDivs).toBe(2);
  });

  it("F-55: Given activeMode switches from 'rules' to 'check', When renderState fires with check mode, Then clearRulesInspection is called exactly 1 time", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    mockAppState = makeReadyState({ activeMode: "current" });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockF55();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedRenderState).not.toBeNull();
    mockClearRulesInspection.mockClear();

    // Simulate renderState being called with check mode (activeMode switch to "check")
    if (capturedRenderState !== null) {
      capturedRenderState(makeReadyState({ activeMode: "check" }));
    }

    expect(mockClearRulesInspection).toHaveBeenCalledOnce();
  });

  it("F-55: Given no matching segment, When the map is clicked, Then setBottomSheetContent includes text 'No parking segment found near this location.'", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const noMatchSection: RulesInspectionSection = {
      title: "No matching segment",
      content: "No parking segment found near this location.",
      priority: "unknown",
    };
    mockInspectRulesAtLocation.mockReturnValue([noMatchSection]);

    mockAppState = makeReadyState({ activeMode: "current", rulesTime: { mode: "now", selectedTime: NOW_STABLE } });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockF55();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockSetBottomSheetContent.mockClear();
    await handler(40.744, -74.032);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSetBottomSheetContent).toHaveBeenCalledOnce();
    const htmlArg = (mockSetBottomSheetContent.mock.calls[0] as string[])[0];
    expect(htmlArg).toContain("No parking segment found near this location.");
  });

  it("F-55: Given inspectRulesAtLocation returns a section with content including 'Next: Street cleaning starting 2026-06-10T14:00:00.000Z.', When the map is clicked, Then setBottomSheetContent renders that Next text verbatim", async () => {
    const signsPayload = { fetched_at: "2026-06-09T12:00:00Z", signs: [] };
    mockFetchImpl = () =>
      Promise.resolve({ ok: true, json: async () => signsPayload } as Response);

    const nextText = "Next: Street cleaning starting 2026-06-10T14:00:00.000Z.";
    const sectionWithNext: RulesInspectionSection = {
      title: "Washington St (East side, 1st–7th)",
      content: `No restriction at this time. ${nextText}`,
      priority: "safe",
    };
    mockInspectRulesAtLocation.mockReturnValue([sectionWithNext]);

    mockAppState = makeReadyState({ activeMode: "current", rulesTime: { mode: "now", selectedTime: NOW_STABLE } });
    mockAppGetState.mockImplementation(() => mockAppState);

    const { initBrowserApp } = await import("../../app/main");
    installDocumentMockF55();
    await initBrowserApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const handler = getCapturedClickHandler();
    expect(handler).not.toBeNull();
    if (handler === null) return;

    mockSetBottomSheetContent.mockClear();
    await handler(40.744, -74.032);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSetBottomSheetContent).toHaveBeenCalledOnce();
    const htmlArg = (mockSetBottomSheetContent.mock.calls[0] as string[])[0];
    expect(htmlArg).toContain(nextText);
  });
});

// ─── F-56 renderCheckSegmentDetails ──────────────────────────────────────────

describe("F-56 renderCheckSegmentDetails", () => {
  // Import the real (unmocked) ui module to test the function directly
  // We use vi.importActual to bypass the vi.mock at the top of the file.

  it("F-56 AC-1: Given a segment with status='ticket' and primaryConflict.reason='Street Cleaning', Then the returned string contains 'status-ticket' and 'Street Cleaning'", async () => {
    const { renderCheckSegmentDetails } = await vi.importActual<typeof import("../../app/ui")>("../../app/ui");
    const segment: import("../../shared/types").CheckResultSegment = {
      id: "test-seg-1",
      street: "Observer Hwy",
      location: "1st St to 2nd St",
      side: "East",
      status: "ticket",
      conflicts: [],
      primaryConflict: {
        status: "ticket",
        reason: "Street Cleaning",
        label: "Mon–Fri 8–9 AM",
        startsAt: undefined,
        endsAt: undefined,
      },
    };
    const html = renderCheckSegmentDetails(segment);
    expect(html).toContain("status-ticket");
    expect(html).toContain("Street Cleaning");
  });

  it("F-56 AC-2: Given a segment with side='East' and street='Observer Hwy' and location='1st St to 2nd St', Then the returned string contains 'East'", async () => {
    const { renderCheckSegmentDetails } = await vi.importActual<typeof import("../../app/ui")>("../../app/ui");
    const segment: import("../../shared/types").CheckResultSegment = {
      id: "test-seg-2",
      street: "Observer Hwy",
      location: "1st St to 2nd St",
      side: "East",
      status: "safe",
      conflicts: [],
      primaryConflict: undefined,
    };
    const html = renderCheckSegmentDetails(segment);
    expect(html).toContain("East");
  });

  it("F-56 AC-3: Given a segment with location='Observer Hwy to 4th St', Then the returned string contains 'Observer Hwy to 4th St'", async () => {
    const { renderCheckSegmentDetails } = await vi.importActual<typeof import("../../app/ui")>("../../app/ui");
    const segment: import("../../shared/types").CheckResultSegment = {
      id: "test-seg-3",
      street: "Washington St",
      location: "Observer Hwy to 4th St",
      side: "West",
      status: "safe",
      conflicts: [],
      primaryConflict: undefined,
    };
    const html = renderCheckSegmentDetails(segment);
    expect(html).toContain("Observer Hwy to 4th St");
  });

  it("F-56 AC-4: Given a segment with status='safe' and no primaryConflict, Then the returned string contains 'status-safe' and does not contain 'status-ticket'", async () => {
    const { renderCheckSegmentDetails } = await vi.importActual<typeof import("../../app/ui")>("../../app/ui");
    const segment: import("../../shared/types").CheckResultSegment = {
      id: "test-seg-4",
      street: "Washington St",
      location: "1st St to 2nd St",
      side: "East",
      status: "safe",
      conflicts: [],
      primaryConflict: undefined,
    };
    const html = renderCheckSegmentDetails(segment);
    expect(html).toContain("status-safe");
    expect(html).not.toContain("status-ticket");
  });

  it("F-56 AC-5: Given a segment with primaryConflict.label='Tue 7–8 AM', Then the returned string contains 'Tue 7–8 AM'", async () => {
    const { renderCheckSegmentDetails } = await vi.importActual<typeof import("../../app/ui")>("../../app/ui");
    const segment: import("../../shared/types").CheckResultSegment = {
      id: "test-seg-5",
      street: "Washington St",
      location: "1st St to 2nd St",
      side: "North",
      status: "ticket",
      conflicts: [],
      primaryConflict: {
        status: "ticket",
        reason: "No Parking",
        label: "Tue 7–8 AM",
        startsAt: undefined,
        endsAt: undefined,
      },
    };
    const html = renderCheckSegmentDetails(segment);
    expect(html).toContain("Tue 7–8 AM");
  });
});
