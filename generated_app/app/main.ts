/**
 * app/main.ts — F-10 / F-11 / F-14 / F-15 / F-17.5 / F-46D / F-50 / F-53
 *
 * Browser entry point. Initializes the map, fetches sign and street cleaning
 * data, creates the app state machine, wires UI buttons, and registers the
 * map click handler.
 *
 * In check mode: map tap invokes handleCheckClick.
 * In rules mode: map tap invokes handleRulesClick.
 *
 * Exports: normalizeStreet, findCleaningEntries, init, initBrowserApp (for testing)
 */

import { initFeedback } from "./feedback";
import { track } from "./analytics";
import {
  initMap,
  registerMapClickHandler,
  renderPositionMarker,
  renderSignPins,
  renderTowSegments,
  centerOnSpot,
  showStreetPopup,
  initRoadGeometry,
  renderViolationHighlights,
  forgetViolationHighlights,
  renderUpcomingSignPins,
  renderUpcomingTowSegments,
  renderGarageMarkers,
  renderSnowEmergencyRoutes,
  initStreetParity,
  initAddressArcIndex,
  correctSignPositions,
  getRoadGeometry,
  clearCheckResults,
  renderCheckResults,
  clearRulesInspection,
} from "./map";
import { getStreetName, geocodeCrossStreet, seedGeocodeCache } from "./geo";
import { createApp } from "./app";
import type { App, AppState } from "./app";
import {
  loadCrossStreetCache,
  loadFutureSignData,
  loadGarages,
  loadSignData,
  loadStartupStaticData,
} from "./data-loader";
import { wireLayerToggles } from "./layer-toggles";
import { getCheckResults, wireCheckControls } from "./check-controller";
import { renderRulesClickInspection, wireCurrentControls } from "./rules-controller";
import {
  filterLoadTimeNoise,
  extractCrossStreets,
  detectMatchingSegment,
  isSignActive,
} from "../shared/parking-logic";
import type { Sign, StreetCleaningEntry, StreetCleaningData, RoadGeometry, SnowRoute, ParkingSegment, AppMode } from "../shared/types";
import { buildParkingSegmentCatalog } from "../shared/segment-catalog";
import {
  renderLoading,
  hideLoading,
  renderBrowsingMode,
  hideBottomSheet,
} from "./ui";

// ─── Module state ─────────────────────────────────────────────────────────────

let cleaningEntries: StreetCleaningEntry[] = [];
let upcomingSignsData: Sign[] = [];
let roadGeometryData: RoadGeometry | undefined = undefined;
let snowRoutesData: SnowRoute[] = [];

/** ISO string of when sign data was last successfully fetched — used for staleness detection. */
let _fetchedAt: string = new Date().toISOString();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lowercase and expand common street abbreviations so that Nominatim road
 * names can be matched against the scraped cleaning schedule entries.
 *
 * Expansions:
 *   St  → street
 *   Ave → avenue
 *   Blvd → boulevard
 *   Dr  → drive
 *   Pl  → place
 *   Hwy → highway
 */
export function normalizeStreet(s: string): string {
  return s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bst\b/g, "street")
    .replace(/\bave\b/g, "avenue")
    .replace(/\bblvd\b/g, "boulevard")
    .replace(/\bdr\b/g, "drive")
    .replace(/\bpl\b/g, "place")
    .replace(/\bhwy\b/g, "highway")
    .replace(/\bfirst\b/g, "1st")
    .replace(/\bsecond\b/g, "2nd")
    .replace(/\bthird\b/g, "3rd")
    .replace(/\bfourth\b/g, "4th")
    .replace(/\bfifth\b/g, "5th")
    .replace(/\bsixth\b/g, "6th")
    .replace(/\bseventh\b/g, "7th")
    .replace(/\beighth\b/g, "8th")
    .replace(/\bninth\b/g, "9th")
    .replace(/\btenth\b/g, "10th")
    .replace(/\beleventh\b/g, "11th")
    .replace(/\btwelfth\b/g, "12th")
    .replace(/\bthirteenth\b/g, "13th")
    .replace(/\bfourteenth\b/g, "14th")
    .replace(/\bfifteenth\b/g, "15th")
    .replace(/\bsixteenth\b/g, "16th")
    .replace(/\bseventeenth\b/g, "17th")
    .replace(/\beighteenth\b/g, "18th")
    .replace(/\bnineteenth\b/g, "19th")
    .replace(/\btwentieth\b/g, "20th");
}

/**
 * Return all cleaning entries whose normalized street name equals the
 * normalized form of `roadName`.
 */
export function findCleaningEntries(roadName: string): StreetCleaningEntry[] {
  const normalizedRoad = normalizeStreet(roadName);
  return cleaningEntries.filter(
    (entry) => normalizeStreet(entry.street) === normalizedRoad
  );
}

// ─── F-20 buildDetectSegmentCallback ─────────────────────────────────────────

/**
 * Factory that returns a callback suitable for passing as the `detectSegment`
 * argument to `showStreetPopup`. The callback iterates a list of location strings,
 * geocodes their cross-street coordinates, and returns the first location that
 * brackets the click point.
 *
 * Requests are sequential so the shared rate-limit clock in geo.ts works correctly.
 */
function buildDetectSegmentCallback(
  clickLat: number,
  clickLng: number,
  roadName: string
): (locations: string[]) => Promise<string[] | null> {
  return async (locations: string[]) => {
    const matched: string[] = [];
    for (const location of locations) {
      const crossStreets = extractCrossStreets(location);
      if (crossStreets === null) continue;
      const [from, to] = crossStreets;
      const fromCoord = await geocodeCrossStreet(normalizeStreet(from), normalizeStreet(roadName));
      if (fromCoord === null) continue;
      const toCoord = await geocodeCrossStreet(normalizeStreet(to), normalizeStreet(roadName));
      if (toCoord === null) continue;
      if (detectMatchingSegment(clickLat, clickLng, fromCoord, toCoord)) {
        matched.push(location);
      }
    }
    return matched.length > 0 ? matched : null;
  };
}

// ─── Map click handlers ───────────────────────────────────────────────────────

/**
 * Handle a map click in Check mode.
 * Currently a stub — real Check behavior is added in later features.
 */
function handleCheckClick(_lat: number, _lng: number): void {
  // stub: Check click behavior added in later features
}

// ─── renderState callback ─────────────────────────────────────────────────────

/**
 * Called by the app state machine whenever state changes.
 * Updates the map and UI to reflect the new state.
 * Only used in browser context where document is defined.
 */
function renderState(state: AppState): void {
  const now = new Date();

  if (state.mode === "loading") {
    renderLoading();
    return;
  }

  hideLoading();

  if (state.mode === "error") {
    const banner = document.getElementById("banner");
    if (banner) {
      banner.style.display = "";
      banner.textContent = state.message;
    }
    return;
  }

  if (state.mode === "ready") {
    // Sync mode nav active class
    if (typeof document.querySelectorAll === "function") {
      document.querySelectorAll<HTMLButtonElement>(".mode-nav-btn").forEach((btn) => {
        btn.classList.toggle("mode-nav-btn--active", btn.dataset.mode === state.activeMode);
      });
    }

    // Update check-controls visibility based on activeMode
    const checkControls = document.getElementById("check-controls");
    if (checkControls !== null) {
      checkControls.style.display = state.activeMode === "current" ? "none" : "";
    }

    // F-53: Update current-controls visibility based on activeMode
    const currentControls = document.getElementById("current-controls");
    if (currentControls !== null) {
      currentControls.style.display = state.activeMode === "current" ? "" : "none";
    }

    // F-55: when switching to check mode, clear Rules inspection layers
    if (state.activeMode === "check") {
      clearRulesInspection();
    }

    renderBrowsingMode(state.activeSigns, now);
    renderSignPins(state.activeSigns, now);
    renderTowSegments(state.activeSigns);
    if (state.activeMode === "check") {
      forgetViolationHighlights();
    } else {
      renderViolationHighlights(cleaningEntries, now);
    }
    renderCheckResults(getCheckResults());
    renderUpcomingSignPins(upcomingSignsData, now);
    renderUpcomingTowSegments(upcomingSignsData);

    const queryBar = document.getElementById("query-bar");
    if (queryBar !== null) {
      queryBar.style.display = state.activeMode === "current" ? "none" : "";
    }

    const checkLegend = document.getElementById("check-legend");
    if (checkLegend !== null) {
      checkLegend.style.display = state.activeMode === "check" ? "" : "none";
    }

    return;
  }
}

// ─── Silent auto-refresh ──────────────────────────────────────────────────────

async function silentRefresh(app: App, now: Date): Promise<void> {
  try {
    const refreshed = await loadSignData("no-cache");
    _fetchedAt = refreshed.fetchedAt;
    const correctedSigns = correctSignPositions(refreshed.signs, getRoadGeometry());
    const parkingSegments = buildParkingSegmentCatalog({
      signs: correctedSigns,
      cleaningEntries,
      snowRoutes: snowRoutesData,
      roadGeometry: roadGeometryData,
    });
    app.replaceParkingData(
      { signs: correctedSigns, fetchTime: refreshed.fetchTime, parkingSegments },
      now
    );
    // Refresh upcoming signs
    const futureData = await loadFutureSignData("no-cache");
    if (futureData !== null) {
      upcomingSignsData = filterLoadTimeNoise(futureData.signs, futureData.fetchTime)
        .filter((s) => !isSignActive(s, now));
    }
    renderUpcomingSignPins(upcomingSignsData, now);
    renderUpcomingTowSegments(upcomingSignsData);
  } catch {
    // Silent — cached data remains in use
  }
}

// ─── F-34 scheduleViolationRefresh ───────────────────────────────────────────

function scheduleViolationRefresh(getState: () => AppState): void {
  const now = new Date();
  const secIntoHour = now.getMinutes() * 60 + now.getSeconds();
  const msUntilNextHour = (3600 - secIntoHour) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    const st = getState();
    if (st.mode === "ready" && st.activeMode !== "check") {
      renderViolationHighlights(cleaningEntries, new Date());
    }
    scheduleViolationRefresh(getState);
  }, msUntilNextHour);
}

// ─── Coffee button wiring ─────────────────────────────────────────────────────

/**
 * Wire the coffee-cup donation button and its popover card.
 * Exported for isolated testing without invoking initBrowserApp().
 */
export function initCoffee(): void {
  const coffeeBtn = document.getElementById('coffee-btn');
  const coffeePopover = document.getElementById('coffee-popover');

  coffeeBtn?.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    const isOpen = coffeePopover?.classList.contains('open') ?? false;
    coffeePopover?.classList.toggle('open', !isOpen);
    coffeePopover?.setAttribute('aria-hidden', String(isOpen));
  });

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e: MouseEvent) => {
      if (coffeePopover?.classList.contains('open') &&
          !coffeePopover.contains(e.target as Node)) {
        coffeePopover.classList.remove('open');
        coffeePopover.setAttribute('aria-hidden', 'true');
      }
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        coffeePopover?.classList.remove('open');
        coffeePopover?.setAttribute('aria-hidden', 'true');
      }
    });
  }
}

// ─── Full browser app wiring ──────────────────────────────────────────────────

export async function initBrowserApp(): Promise<void> {
  renderLoading();
  initMap();
  initFeedback();
  initCoffee();

  void loadCrossStreetCache()
    .then((data) => {
      if (data !== null) seedGeocodeCache(data);
    });

  const staticData = await loadStartupStaticData();
  roadGeometryData = staticData.roadGeometry;
  if (staticData.roadGeometry !== undefined) {
    initRoadGeometry(staticData.roadGeometry);
  }
  if (staticData.streetParity !== undefined) {
    initStreetParity(staticData.streetParity);
  }
  if (staticData.addressArc !== undefined) {
    initAddressArcIndex(staticData.addressArc);
  }
  cleaningEntries = staticData.cleaningEntries;
  snowRoutesData = staticData.snowRoutes;

  // Fetch sign data — required; return early on failure
  let signsData: { signs: Sign[]; fetchTime: Date };
  try {
    const latest = await loadSignData();
    _fetchedAt = latest.fetchedAt;
    signsData = {
      signs: latest.signs,
      fetchTime: latest.fetchTime,
    };
  } catch {
    hideLoading();
    const banner = document.getElementById("banner");
    if (banner) {
      banner.style.display = "";
      banner.textContent = "Failed to load parking data.";
    }
    return;
  }

  // Fetch upcoming signs (fire-and-forget, non-fatal)
  const futureData = await loadFutureSignData();
  if (futureData !== null) {
    const now = new Date();
    upcomingSignsData = filterLoadTimeNoise(futureData.signs, futureData.fetchTime)
      .filter((s) => !isSignActive(s, now));
  }

  // Use address numbers as source of truth — fix signs whose geocoded position
  // violates the monotonic house-number ordering along their street.
  signsData = { ...signsData, signs: correctSignPositions(signsData.signs, getRoadGeometry()) };

  // Build the parking segment catalog from all loaded data sources
  const parkingSegments = buildParkingSegmentCatalog({
    signs: signsData.signs,
    cleaningEntries,
    snowRoutes: snowRoutesData,
    roadGeometry: roadGeometryData,
  });

  // Create app state machine (no storage — saved-spot flow removed in F-46D)
  const now = new Date();
  const app: App = createApp(
    { renderState },
    { signs: signsData.signs, fetchTime: signsData.fetchTime, parkingSegments },
    now
  );
  track("app-loaded");

  // Wire Check/Rules mode nav buttons
  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll<HTMLButtonElement>(".mode-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode as AppMode | undefined;
        if (mode === "check" || mode === "current") {
          app.setActiveMode(mode);
        }
      });
    });
  }

  // Wire bottom sheet close button
  document.getElementById("bottom-sheet-close")?.addEventListener("click", () => {
    hideBottomSheet();
  });

  // F-34: initial violation highlight render + hourly schedule
  const initialState = app.getState();
  if (initialState.mode === "ready" && initialState.activeMode !== "check") {
    renderViolationHighlights(cleaningEntries, now);
  }
  scheduleViolationRefresh(app.getState.bind(app));

  // Fire-and-forget: fetch municipal garages and render markers.
  void loadGarages()
    .then((garages) => {
      if (garages !== null) renderGarageMarkers(garages, true);
    });

  // Render snow emergency routes now that we have the data (already awaited above)
  if (snowRoutesData.length > 0) {
    renderSnowEmergencyRoutes(snowRoutesData, false);
  }

  wireLayerToggles();

  // Wire "Get Current Location" button
  const locateBtn = document.getElementById("locate-btn");
  if (locateBtn !== null) {
    locateBtn.addEventListener("click", () => {
      track("locate-requested");
      if (!("geolocation" in navigator)) return;
      locateBtn.setAttribute("disabled", "");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locateBtn.removeAttribute("disabled");
          renderPositionMarker(pos.coords.latitude, pos.coords.longitude);
          centerOnSpot({ lat: pos.coords.latitude, lng: pos.coords.longitude, savedAt: new Date().toISOString(), address: null });
        },
        () => {
          locateBtn.removeAttribute("disabled");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  wireCheckControls(app);
  wireCurrentControls(app);

  // Wire the single map click handler — routes by activeMode.
  registerMapClickHandler((lat: number, lng: number) => {
    const state = app.getState();
    if (state.mode !== "ready") return;
    if (state.activeMode === "check") {
      handleCheckClick(lat, lng);
    } else {
      // Store selected location in app state before computing sections
      app.setRulesLocation(lat, lng);
      const sections = renderRulesClickInspection({
        lat,
        lng,
        selectedTime: state.rulesTime.selectedTime,
        segments: state.parkingSegments,
      });
      app.setRulesInspectionSections(sections);
    }
  });

  // Start 60-second tick; auto-refresh data when it's from a previous UTC calendar day.
  setInterval(() => {
    const tickNow = new Date();
    const fetched = new Date(_fetchedAt);
    const stale =
      fetched.getUTCFullYear() !== tickNow.getUTCFullYear() ||
      fetched.getUTCMonth() !== tickNow.getUTCMonth() ||
      fetched.getUTCDate() !== tickNow.getUTCDate();
    if (stale) void silentRefresh(app, tickNow);
    app.tick(tickNow);
  }, 60_000);

  // F-12.2: Register service worker for PWA offline support.
  // Errors are caught and logged but do not prevent the app from functioning.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (err) {
      console.error("Service worker registration failed:", err);
    }
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Initialize the app: set up the map, fetch street-cleaning data, and wire
 * the map click handler.
 *
 * The optional `initialMode` parameter is accepted for testing purposes;
 * production code omits it and defaults to "browsing" (now "check" in F-46D).
 *
 * In a test environment (no document), only the map click handler is wired
 * so the F-17.5 click tests continue to work.
 *
 * @deprecated Legacy compatibility entry point. Production uses initBrowserApp()
 * and the Check | Rules state machine.
 */
export async function init(initialMode: "browsing" | "parked" = "browsing"): Promise<void> {
  initMap();

  // Fire-and-forget: fetch street cleaning schedule after map is ready.
  // Failure is non-fatal — leave cleaningEntries empty.
  fetch("data/street-cleaning.json")
    .then((res) => res.json())
    .then((data: unknown) => {
      const typed = data as StreetCleaningData;
      cleaningEntries = typed.entries;
    })
    .catch(() => {
      // Non-fatal — cleaningEntries stays empty
    });

  registerMapClickHandler(async (lat: number, lng: number) => {
    if (initialMode === "browsing") {
      // Check mode (was browsing): set the tapped position marker
      renderPositionMarker(lat, lng);
    } else {
      // Rules mode (was parked): show street cleaning popup
      const road = await getStreetName(lat, lng);
      if (road !== null) {
        const detectSegment = buildDetectSegmentCallback(lat, lng, road);
        showStreetPopup(lat, lng, road, findCleaningEntries(road), detectSegment, new Date());
      }
    }
  });
}

// ─── Browser entry point ──────────────────────────────────────────────────────

function shouldAutoStartBrowserApp(): boolean {
  if (typeof document === "undefined") return false;
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.["VITEST"] !== "true";
}

// Only run in real browser context. Vitest may provide jsdom's document while
// importing helpers from this module, but tests call initBrowserApp explicitly.
if (shouldAutoStartBrowserApp()) {
  void initBrowserApp();
}
