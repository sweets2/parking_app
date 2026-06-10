/**
 * Unit tests for app/map.ts — F-07 and F-07.6
 *
 * Leaflet is not available in Node. We create a minimal mock of the Leaflet `L`
 * global before importing map.ts so all L.* calls are intercepted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Sign, StreetCleaningEntry } from "../../shared/types";
import { NOW_STABLE } from "../fixtures/signs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSign(overrides: Partial<Sign> = {}): Sign {
  return {
    id: "test-1",
    address: "123 Test St",
    reason: "CONSTRUCTION",
    permit_number: "P-001",
    lat: 40.744,
    lng: -74.032,
    start_date: "6/1/2026",
    start_time: "08:00:00",
    stop_date: "6/30/2026",
    end_time: "18:00:00",
    start_iso: "2026-06-01T08:00:00",
    end_iso: "2026-06-30T18:00:00",
    active_at_fetch: true,
    ...overrides,
  };
}

function makeCleaningEntry(overrides: Partial<StreetCleaningEntry> = {}): StreetCleaningEntry {
  return {
    street: "Washington Street",
    side: "East",
    schedule: "Monday - 8 am to 9 am",
    location: "9th St. to 10th St.",
    ...overrides,
  };
}

// ─── Leaflet Mock ─────────────────────────────────────────────────────────────

type LatLng = { lat: number; lng: number };

interface MockPopup {
  _content: string;
  _lat: number;
  _lng: number;
  _open: boolean;
  setLatLng: (latlng: [number, number]) => MockPopup;
  setContent: (html: string) => MockPopup;
  openOn: (map: MockMap) => MockPopup;
  remove: () => void;
  isOpen: () => boolean;
}

interface MockMarker {
  _lat: number;
  _lng: number;
  _options: Record<string, unknown>;
  _popup: string | null;
  _clickHandler: ((e: unknown) => void) | null;
  addTo: (map: MockMap) => MockMarker;
  remove: () => void;
  bindPopup: (html: string) => MockMarker;
  openPopup: () => MockMarker;
  on: (event: string, handler: (e: unknown) => void) => MockMarker;
}

interface MockTileLayer {
  _url: string;
  addTo: (map: MockMap) => MockTileLayer;
}

interface MockMap {
  _layers: MockMarker[];
  _center: LatLng;
  _zoom: number;
  _clickHandler: ((e: { latlng: LatLng }) => void) | null;
  _openPopups: MockPopup[];
  setView: (center: [number, number], zoom: number) => MockMap;
  panTo: (center: [number, number] | LatLng) => MockMap;
  getCenter: () => LatLng;
  on: (event: string, handler: (e: { latlng: LatLng }) => void) => MockMap;
  off: (event: string) => MockMap;
  addLayer: (layer: MockMarker) => MockMap;
  removeLayer: (layer: MockMarker) => MockMap;
  _fireClick: (lat: number, lng: number) => void;
}

function createMockMap(): MockMap {
  const map: MockMap = {
    _layers: [],
    _center: { lat: 40.744, lng: -74.032 },
    _zoom: 15,
    _clickHandler: null,
    _openPopups: [],
    setView(center, zoom) {
      map._center = { lat: center[0], lng: center[1] };
      map._zoom = zoom;
      return map;
    },
    panTo(center) {
      if (Array.isArray(center)) {
        map._center = { lat: center[0], lng: center[1] };
      } else {
        map._center = center as LatLng;
      }
      return map;
    },
    getCenter() {
      return map._center;
    },
    on(event, handler) {
      if (event === "click") {
        map._clickHandler = handler;
      }
      return map;
    },
    off(_event) {
      map._clickHandler = null;
      return map;
    },
    addLayer(layer) {
      map._layers.push(layer);
      return map;
    },
    removeLayer(layer) {
      const idx = map._layers.indexOf(layer);
      if (idx !== -1) map._layers.splice(idx, 1);
      return map;
    },
    _fireClick(lat, lng) {
      if (map._clickHandler) {
        map._clickHandler({ latlng: { lat, lng } });
      }
    },
  };
  return map;
}

let mockMapInstance: MockMap;
let mockPopupInstances: MockPopup[] = [];

function createMockPopup(): MockPopup {
  const popup: MockPopup = {
    _content: "",
    _lat: 0,
    _lng: 0,
    _open: false,
    setLatLng(latlng) {
      popup._lat = latlng[0];
      popup._lng = latlng[1];
      return popup;
    },
    setContent(html) {
      popup._content = html;
      return popup;
    },
    openOn(map) {
      popup._open = true;
      map._openPopups.push(popup);
      return popup;
    },
    remove() {
      popup._open = false;
      mockMapInstance._openPopups = mockMapInstance._openPopups.filter((p) => p !== popup);
    },
    isOpen() {
      return popup._open;
    },
  };
  mockPopupInstances.push(popup);
  return popup;
}

function createMockMarker(lat: number, lng: number, options: Record<string, unknown> = {}): MockMarker {
  const marker: MockMarker = {
    _lat: lat,
    _lng: lng,
    _options: options,
    _popup: null,
    _clickHandler: null,
    addTo(m) {
      m._layers.push(marker);
      return marker;
    },
    remove() {
      mockMapInstance._layers = mockMapInstance._layers.filter((l) => l !== marker);
    },
    bindPopup(html) {
      marker._popup = html;
      return marker;
    },
    openPopup() {
      return marker;
    },
    on(event, handler) {
      if (event === "click") {
        marker._clickHandler = handler;
      }
      return marker;
    },
  };
  return marker;
}

function createMockTileLayer(url: string): MockTileLayer {
  return {
    _url: url,
    addTo(m) {
      // tile layers don't need to be tracked as regular markers
      void m;
      return this;
    },
  };
}

// Install the global L mock
function installLeafletMock(): void {
  mockMapInstance = createMockMap();
  mockPopupInstances = [];

  const L = {
    map: vi.fn((_el: string) => {
      mockMapInstance = createMockMap();
      return mockMapInstance;
    }),
    tileLayer: vi.fn((url: string, _opts: unknown) => createMockTileLayer(url)),
    circleMarker: vi.fn((latlng: [number, number], opts: Record<string, unknown> = {}) => {
      return createMockMarker(latlng[0], latlng[1], opts);
    }),
    popup: vi.fn(() => {
      return createMockPopup();
    }),
  };

  // Expose as global
  (globalThis as Record<string, unknown>)["L"] = L;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("F-07 map module", () => {
  beforeEach(() => {
    installLeafletMock();
    // Clear module cache so map.ts re-runs with fresh state
    vi.resetModules();
  });

  // ─── F-07.1 Map Initialization ─────────────────────────────────────────────

  describe("F-07.1 initMap", () => {
    it("returns a map instance without throwing given a #map element", async () => {
      const { initMap } = await import("../../app/map");
      const result = initMap();
      expect(result).toBeDefined();
    });

    it("tile layer URL contains openstreetmap.org", async () => {
      const { initMap } = await import("../../app/map");
      initMap();
      const L = (globalThis as Record<string, unknown>)["L"] as {
        tileLayer: ReturnType<typeof vi.fn>;
      };
      expect(L.tileLayer).toHaveBeenCalled();
      const url = (L.tileLayer.mock.calls[0] as [string])[0];
      expect(url).toContain("openstreetmap.org");
    });
  });

  // ─── F-07.2 Sign Pins ──────────────────────────────────────────────────────

  describe("F-07.2 renderSignPins", () => {
    it("places three markers for three signs with different reasons", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const signs: Sign[] = [
        makeSign({ id: "1", reason: "CONSTRUCTION" }),
        makeSign({ id: "2", reason: "MOVING" }),
        makeSign({ id: "3", reason: "EVENT" }),
      ];
      renderSignPins(signs, NOW_STABLE);
      expect(mockMapInstance._layers.length).toBe(3);
    });

    it("CONSTRUCTION sign marker has fill color #e53e3e", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const signs: Sign[] = [makeSign({ id: "1", reason: "CONSTRUCTION" })];
      renderSignPins(signs, NOW_STABLE);
      const marker = mockMapInstance._layers[0];
      expect(marker).toBeDefined();
      expect(marker._options["fillColor"]).toBe("#e53e3e");
    });

    it("MOVING sign marker has fill color #dd6b20", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const signs: Sign[] = [makeSign({ id: "1", reason: "MOVING" })];
      renderSignPins(signs, NOW_STABLE);
      const marker = mockMapInstance._layers[0];
      expect(marker).toBeDefined();
      expect(marker._options["fillColor"]).toBe("#dd6b20");
    });

    it("EVENT sign marker has fill color #d69e2e", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const signs: Sign[] = [makeSign({ id: "1", reason: "EVENT" })];
      renderSignPins(signs, NOW_STABLE);
      const marker = mockMapInstance._layers[0];
      expect(marker).toBeDefined();
      expect(marker._options["fillColor"]).toBe("#d69e2e");
    });

    it("DELIVERY sign marker has fill color #3182ce", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const signs: Sign[] = [makeSign({ id: "1", reason: "DELIVERY" })];
      renderSignPins(signs, NOW_STABLE);
      const marker = mockMapInstance._layers[0];
      expect(marker).toBeDefined();
      expect(marker._options["fillColor"]).toBe("#3182ce");
    });

    it("clicking a pin shows a popup containing address, start date, end date, permit number", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const sign = makeSign({
        id: "1",
        reason: "CONSTRUCTION",
        address: "42 Answer Blvd",
        permit_number: "XYZ-999",
        start_date: "6/1/2026",
        stop_date: "6/30/2026",
      });
      renderSignPins([sign], NOW_STABLE);
      const marker = mockMapInstance._layers[0];
      expect(marker).toBeDefined();
      // Trigger click
      if (marker._clickHandler) {
        marker._clickHandler({});
      }
      expect(marker._popup).not.toBeNull();
      expect(marker._popup).toContain("42 Answer Blvd");
      expect(marker._popup).toContain("6/1/2026");
      expect(marker._popup).toContain("6/30/2026");
      expect(marker._popup).toContain("XYZ-999");
    });

    // F-10.3: popup also shows the reason
    it("F-10.3 clicking a pin shows a popup containing the sign reason", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const sign = makeSign({
        id: "1",
        reason: "CONSTRUCTION",
        address: "42 Answer Blvd",
        permit_number: "XYZ-999",
      });
      renderSignPins([sign], NOW_STABLE);
      const marker = mockMapInstance._layers[0];
      expect(marker).toBeDefined();
      if (marker._clickHandler) {
        marker._clickHandler({});
      }
      expect(marker._popup).not.toBeNull();
      // Popup must contain the sign reason
      expect(marker._popup).toContain("CONSTRUCTION");
    });

    // F-10.3: 67 active signs → 67 pins on the map
    it("F-10.3 GIVEN 67 active signs, WHEN renderSignPins is called, THEN 67 pins appear on the map", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const signs: Sign[] = Array.from({ length: 67 }, (_, i) =>
        makeSign({
          id: String(i + 1),
          lat: 40.744 + i * 0.0001,
          lng: -74.032,
          reason: i % 2 === 0 ? "CONSTRUCTION" : "DELIVERY",
        })
      );
      renderSignPins(signs, NOW_STABLE);
      expect(mockMapInstance._layers.length).toBe(67);
    });

    it("calling renderSignPins a second time replaces previous pins", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      const first: Sign[] = [
        makeSign({ id: "1", reason: "CONSTRUCTION" }),
        makeSign({ id: "2", reason: "MOVING" }),
      ];
      const second: Sign[] = [makeSign({ id: "3", reason: "EVENT" })];
      renderSignPins(first, NOW_STABLE);
      expect(mockMapInstance._layers.length).toBe(2);
      renderSignPins(second, NOW_STABLE);
      expect(mockMapInstance._layers.length).toBe(1);
    });

    it("renders empty array without error and leaves no markers on map", async () => {
      const { initMap, renderSignPins } = await import("../../app/map");
      initMap();
      expect(() =>
        renderSignPins([], NOW_STABLE)
      ).not.toThrow();
      expect(mockMapInstance._layers.length).toBe(0);
    });
  });

  // ─── F-07.3 Position Marker ────────────────────────────────────────────────

  describe("F-07.3 renderPositionMarker / clearPositionMarker", () => {
    it("no position marker is present before any tap", async () => {
      const { initMap } = await import("../../app/map");
      initMap();
      expect(mockMapInstance._layers.length).toBe(0);
    });

    it("renderPositionMarker places a marker at given coordinates", async () => {
      const { initMap, renderPositionMarker } = await import("../../app/map");
      initMap();
      renderPositionMarker(40.744, -74.032);
      expect(mockMapInstance._layers.length).toBe(1);
      const marker = mockMapInstance._layers[0];
      expect(marker._lat).toBeCloseTo(40.744, 5);
      expect(marker._lng).toBeCloseTo(-74.032, 5);
    });

    it("calling renderPositionMarker twice replaces the first marker", async () => {
      const { initMap, renderPositionMarker } = await import("../../app/map");
      initMap();
      renderPositionMarker(40.744, -74.032);
      renderPositionMarker(40.745, -74.033);
      expect(mockMapInstance._layers.length).toBe(1);
      const marker = mockMapInstance._layers[0];
      expect(marker._lat).toBeCloseTo(40.745, 5);
      expect(marker._lng).toBeCloseTo(-74.033, 5);
    });

    it("clearPositionMarker removes the position marker", async () => {
      const { initMap, renderPositionMarker, clearPositionMarker } = await import("../../app/map");
      initMap();
      renderPositionMarker(40.744, -74.032);
      expect(mockMapInstance._layers.length).toBe(1);
      clearPositionMarker();
      expect(mockMapInstance._layers.length).toBe(0);
    });
  });

  // ─── F-07.4 Saved Spot Marker ──────────────────────────────────────────────

  describe("F-07.4 renderSpotMarker / clearSpotMarker", () => {
    it("renderSpotMarker places a marker at saved spot coordinates", async () => {
      const { initMap, renderSpotMarker } = await import("../../app/map");
      initMap();
      renderSpotMarker({ lat: 40.7503, lng: -74.0303, side: "N", savedAt: "2026-06-09T12:00:00Z", address: null });
      expect(mockMapInstance._layers.length).toBe(1);
      const marker = mockMapInstance._layers[0];
      expect(marker._lat).toBeCloseTo(40.7503, 5);
      expect(marker._lng).toBeCloseTo(-74.0303, 5);
    });

    it("spot marker and sign pin are visually distinct (different fillColor)", async () => {
      const { initMap, renderSignPins, renderSpotMarker } = await import("../../app/map");
      initMap();
      renderSignPins(
        [makeSign({ id: "1", reason: "CONSTRUCTION" })],
        NOW_STABLE
      );
      renderSpotMarker({ lat: 40.7503, lng: -74.0303, side: "N", savedAt: "2026-06-09T12:00:00Z", address: null });
      expect(mockMapInstance._layers.length).toBe(2);
      const [signMarker, spotMarker] = mockMapInstance._layers;
      // They must differ in at least one visual property
      const signColor = signMarker._options["fillColor"];
      const spotColor = spotMarker._options["fillColor"];
      expect(signColor).not.toBe(spotColor);
    });

    it("clearSpotMarker removes the spot marker without throwing", async () => {
      const { initMap, renderSpotMarker, clearSpotMarker } = await import("../../app/map");
      initMap();
      renderSpotMarker({ lat: 40.7503, lng: -74.0303, side: "N", savedAt: "2026-06-09T12:00:00Z", address: null });
      expect(mockMapInstance._layers.length).toBe(1);
      expect(() => clearSpotMarker()).not.toThrow();
      expect(mockMapInstance._layers.length).toBe(0);
    });
  });

  // ─── F-07.5 Map Centering and Click Handler ────────────────────────────────

  describe("F-07.5 centerOnSpot / registerMapClickHandler", () => {
    it("centerOnSpot pans the map to within 0.0001 degrees of the spot", async () => {
      const { initMap, centerOnSpot } = await import("../../app/map");
      initMap();
      centerOnSpot({ lat: 40.7503, lng: -74.0303, side: "N", savedAt: "2026-06-09T12:00:00Z", address: null });
      const center = mockMapInstance.getCenter();
      expect(Math.abs(center.lat - 40.7503)).toBeLessThan(0.0001);
      expect(Math.abs(center.lng - -74.0303)).toBeLessThan(0.0001);
    });

    it("registerMapClickHandler invokes callback with clicked coordinates", async () => {
      const { initMap, registerMapClickHandler } = await import("../../app/map");
      initMap();
      const callback = vi.fn();
      registerMapClickHandler(callback);
      mockMapInstance._fireClick(40.744, -74.032);
      expect(callback).toHaveBeenCalledWith(40.744, -74.032);
    });

    it("registering a second click handler replaces the first (no double-firing)", async () => {
      const { initMap, registerMapClickHandler } = await import("../../app/map");
      initMap();
      const first = vi.fn();
      const second = vi.fn();
      registerMapClickHandler(first);
      registerMapClickHandler(second);
      mockMapInstance._fireClick(40.744, -74.032);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  // ─── F-07.6 Street Click Popup ────────────────────────────────────────────

  describe("F-07.6 showStreetPopup", () => {
    it("GIVEN entries for a N-S street with East and West sides, THEN the popup contains the street name, 'East' and 'West' labels, and both schedule strings", async () => {
      const { initMap, showStreetPopup } = await import("../../app/map");
      initMap();
      const entries: StreetCleaningEntry[] = [
        makeCleaningEntry({ street: "Washington Street", side: "East", schedule: "Monday - 8 am to 9 am", location: "9th St. to 10th St." }),
        makeCleaningEntry({ street: "Washington Street", side: "West", schedule: "Tuesday - 9 am to 10 am", location: "9th St. to 10th St." }),
      ];
      showStreetPopup(40.744, -74.032, "Washington Street", entries);
      expect(mockPopupInstances.length).toBeGreaterThan(0);
      const popup = mockPopupInstances[mockPopupInstances.length - 1];
      expect(popup._content).toContain("Washington Street");
      expect(popup._content).toContain("East");
      expect(popup._content).toContain("West");
      expect(popup._content).toContain("Monday - 8 am to 9 am");
      expect(popup._content).toContain("Tuesday - 9 am to 10 am");
    });

    it("GIVEN entries for an E-W street with North and South sides, THEN the popup contains the street name, 'North' and 'South' labels, and both schedule strings", async () => {
      const { initMap, showStreetPopup } = await import("../../app/map");
      initMap();
      const entries: StreetCleaningEntry[] = [
        makeCleaningEntry({ street: "9th Street", side: "North", schedule: "Wednesday - 8 am to 9 am", location: "Washington St. to Bloomfield St." }),
        makeCleaningEntry({ street: "9th Street", side: "South", schedule: "Thursday - 9 am to 10 am", location: "Washington St. to Bloomfield St." }),
      ];
      showStreetPopup(40.744, -74.032, "9th Street", entries);
      expect(mockPopupInstances.length).toBeGreaterThan(0);
      const popup = mockPopupInstances[mockPopupInstances.length - 1];
      expect(popup._content).toContain("9th Street");
      expect(popup._content).toContain("North");
      expect(popup._content).toContain("South");
      expect(popup._content).toContain("Wednesday - 8 am to 9 am");
      expect(popup._content).toContain("Thursday - 9 am to 10 am");
    });

    it("GIVEN an entry whose location is '9th St. to 10th St.', THEN the popup header contains 'between 9th St and 10th St'", async () => {
      const { initMap, showStreetPopup } = await import("../../app/map");
      initMap();
      const entries: StreetCleaningEntry[] = [
        makeCleaningEntry({ location: "9th St. to 10th St." }),
      ];
      showStreetPopup(40.744, -74.032, "Washington Street", entries);
      const popup = mockPopupInstances[mockPopupInstances.length - 1];
      expect(popup._content).toContain("between 9th St and 10th St");
    });

    it("GIVEN showStreetPopup is called twice in succession, THEN only one popup exists on the map", async () => {
      const { initMap, showStreetPopup } = await import("../../app/map");
      initMap();
      const entries: StreetCleaningEntry[] = [
        makeCleaningEntry({ street: "Washington Street" }),
      ];
      showStreetPopup(40.744, -74.032, "Washington Street", entries);
      showStreetPopup(40.745, -74.033, "Washington Street", entries);
      const openPopups = mockMapInstance._openPopups;
      expect(openPopups.length).toBe(1);
    });

    it("GIVEN entries is an empty array, THEN the popup contains the street name and a 'no schedule' message, and no error is thrown", async () => {
      const { initMap, showStreetPopup } = await import("../../app/map");
      initMap();
      expect(() => showStreetPopup(40.744, -74.032, "Washington Street", [])).not.toThrow();
      const popup = mockPopupInstances[mockPopupInstances.length - 1];
      expect(popup._content).toContain("Washington Street");
      expect(popup._content.toLowerCase()).toContain("no");
    });

    it("GIVEN initMap has not been called, WHEN showStreetPopup is called, THEN it returns without throwing", async () => {
      const { showStreetPopup } = await import("../../app/map");
      expect(() => showStreetPopup(40.744, -74.032, "Washington Street", [])).not.toThrow();
    });

    it("GIVEN entries with two different location values (multi-block), THEN the popup contains both block context strings", async () => {
      const { initMap, showStreetPopup } = await import("../../app/map");
      initMap();
      const entries: StreetCleaningEntry[] = [
        makeCleaningEntry({ street: "Washington Street", side: "East", schedule: "Monday - 8 am to 9 am", location: "1st St. to 2nd St." }),
        makeCleaningEntry({ street: "Washington Street", side: "West", schedule: "Tuesday - 9 am to 10 am", location: "1st St. to 2nd St." }),
        makeCleaningEntry({ street: "Washington Street", side: "East", schedule: "Wednesday - 8 am to 9 am", location: "3rd St. to 4th St." }),
        makeCleaningEntry({ street: "Washington Street", side: "West", schedule: "Thursday - 9 am to 10 am", location: "3rd St. to 4th St." }),
      ];
      showStreetPopup(40.744, -74.032, "Washington Street", entries);
      const popup = mockPopupInstances[mockPopupInstances.length - 1];
      expect(popup._content).toContain("between 1st St and 2nd St");
      expect(popup._content).toContain("between 3rd St and 4th St");
    });
  });
});
