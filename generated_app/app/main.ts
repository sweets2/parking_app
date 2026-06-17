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
import { createDurationCheckQuery, parseCheckQuery } from "../shared/query-parser";
import {
  initMap,
  registerMapClickHandler,
  renderPositionMarker,
  renderSignPins,
  renderTowSegments,
  centerOnSpot,
  showStreetPopup,
  setTowSignsVisible,
  initRoadGeometry,
  renderViolationHighlights,
  setViolationHighlightsVisible,
  renderUpcomingSignPins,
  renderUpcomingTowSegments,
  setUpcomingSignsVisible,
  renderGarageMarkers,
  setGarageMarkersVisible,
  renderSnowEmergencyRoutes,
  setSnowRoutesVisible,
  initStreetParity,
  correctSignPositions,
  getRoadGeometry,
  clearCheckResults,
  renderCheckResults,
  clearRulesInspection,
  setRulesInspectionMarker,
  renderRulesInspection,
} from "./map";
import { getStreetName, geocodeCrossStreet, seedGeocodeCache } from "./geo";
import { createApp } from "./app";
import type { App, AppState } from "./app";
import {
  filterLoadTimeNoise,
  filterActive,
  extractCrossStreets,
  detectMatchingSegment,
  isSignActive,
} from "../shared/parking-logic";
import type { Sign, StreetCleaningEntry, StreetCleaningData, RoadGeometry, Garage, SnowRoute, ParkingSegment, RulesInspectionSection } from "../shared/types";
import { buildParkingSegmentCatalog } from "../shared/segment-catalog";
import { inspectRulesAtLocation } from "../shared/rules-inspector";
import {
  renderLoading,
  hideLoading,
  renderBrowsingMode,
  showBottomSheet,
  setBottomSheetContent,
  setBottomSheetMode,
} from "./ui";

// ─── Module state ─────────────────────────────────────────────────────────────

let cleaningEntries: StreetCleaningEntry[] = [];
let upcomingSignsData: Sign[] = [];

/** F-53: Rules time selection state — local to main.ts, not yet in app state machine. */
const rulesState: { mode: "now" | "custom"; selectedTime: Date } = {
  mode: "now",
  selectedTime: new Date(),
};

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

/**
 * Handle a map click in Rules mode.
 * Inspects rules at the clicked location and renders the results in the bottom sheet.
 * Returns the computed sections so the caller can store them in app state.
 */
function handleRulesClick(
  lat: number,
  lng: number,
  selectedTime: Date,
  segments: ParkingSegment[]
): RulesInspectionSection[] {
  const sections = inspectRulesAtLocation({ lat, lng, selectedTime, segments });
  setRulesInspectionMarker(lat, lng);
  renderRulesInspection(sections);

  // Build bottom sheet HTML — one .rules-section div per returned section
  const html = sections
    .map((section) => {
      const priorityClass = `rules-section--${section.priority}`;
      return (
        `<div class="rules-section ${priorityClass}">` +
        `<div class="rules-section-title">${section.title}</div>` +
        `<div class="rules-section-content">${section.content}</div>` +
        `</div>`
      );
    })
    .join("");

  setBottomSheetContent(html);
  setBottomSheetMode("rules");
  showBottomSheet();
  return sections;
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
    // Update check-controls visibility based on activeMode
    const checkControls = document.getElementById("check-controls");
    if (checkControls !== null) {
      checkControls.style.display = state.activeMode === "rules" ? "none" : "";
    }

    // F-53: Update rules-controls visibility based on activeMode
    const rulesControls = document.getElementById("rules-controls");
    if (rulesControls !== null) {
      rulesControls.style.display = state.activeMode === "rules" ? "" : "none";
    }

    // F-51: when switching to rules mode, clear Check result layers
    if (state.activeMode === "rules") {
      clearCheckResults();
    }

    // F-55: when switching to check mode, clear Rules inspection layers
    if (state.activeMode === "check") {
      clearRulesInspection();
    }

    renderBrowsingMode(state.activeSigns, now);
    renderSignPins(state.activeSigns, now);
    renderTowSegments(state.activeSigns);
    renderViolationHighlights(cleaningEntries, now);
    renderUpcomingSignPins(upcomingSignsData, now);
    renderUpcomingTowSegments(upcomingSignsData);

    // F-51: render check results when in check mode
    if (state.activeMode === "check") {
      renderCheckResults(state.checkResults);
    }

    return;
  }
}

// ─── Silent auto-refresh ──────────────────────────────────────────────────────

async function silentRefresh(app: App, now: Date): Promise<void> {
  try {
    const res = await fetch("data/latest.json", { cache: "no-cache" });
    const json = await res.json() as { fetched_at: string; signs: Sign[] };
    _fetchedAt = json.fetched_at;
    const filtered = filterLoadTimeNoise(json.signs, new Date(json.fetched_at));
    const activeNow = filterActive(filtered, now);
    const state = app.getState();
    if (state.mode === "ready") {
      renderSignPins(activeNow, now);
      renderTowSegments(activeNow);
      renderViolationHighlights(cleaningEntries, now);
      renderBrowsingMode(activeNow, now);
    }
    // Refresh upcoming signs
    try {
      const futureRes = await fetch("data/future.json", { cache: "no-cache" });
      const futureJson = await futureRes.json() as { fetched_at: string; signs: Sign[] };
      upcomingSignsData = filterLoadTimeNoise(futureJson.signs, new Date(futureJson.fetched_at))
        .filter((s) => !isSignActive(s, now));
    } catch {
      // Silent — upcoming data stays as-is
    }
    renderUpcomingSignPins(upcomingSignsData, now);
    renderUpcomingTowSegments(upcomingSignsData);
    app.tick(now);
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
    if (st.mode === "ready") {
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

  // Fire-and-forget: seed the geocode cache from the build-time lookup table.
  // If the file is absent or stale, geocodeCrossStreet falls back to Nominatim.
  fetch("data/cross-streets.json")
    .then((res) => res.json())
    .then((data: unknown) => {
      seedGeocodeCache(data as Record<string, { lat: number; lng: number } | null>);
    })
    .catch(() => { /* non-fatal — runtime Nominatim calls serve as fallback */ });

  // Await road geometry + street parity + street cleaning + snow routes before
  // calling createApp — all four are needed to build parkingSegments.
  let loadedRoadGeometry: RoadGeometry | undefined = undefined;
  let loadedCleaningEntries: StreetCleaningEntry[] = [];
  let loadedSnowRoutes: SnowRoute[] = [];

  await Promise.all([
    fetch("data/road-geometry.json")
      .then((r) => r.json())
      .then((g: RoadGeometry) => {
        loadedRoadGeometry = g;
        initRoadGeometry(g);
      })
      .catch(() => { /* non-fatal — road geometry stays undefined */ }),
    fetch("data/street-parity.json")
      .then((r) => r.json())
      .then((data: unknown) => { initStreetParity(data as Record<string, 1 | -1>); })
      .catch(() => { /* non-fatal */ }),
    fetch("data/street-cleaning.json")
      .then((res) => res.json())
      .then((data: unknown) => {
        const entries = (data as { entries?: StreetCleaningEntry[] }).entries;
        loadedCleaningEntries = entries ?? [];
        // Also update the module-level variable used by renderViolationHighlights
        cleaningEntries = loadedCleaningEntries;
      })
      .catch(() => { /* non-fatal — cleaningEntries stays empty */ }),
    fetch("data/snow-emergency-routes.json")
      .then((r) => r.json())
      .then((data: unknown) => {
        const routes = (data as { routes?: SnowRoute[] }).routes;
        loadedSnowRoutes = routes ?? [];
      })
      .catch(() => { /* non-fatal — snowRoutes stays empty */ }),
  ]);

  // Fetch sign data — required; return early on failure
  let signsData: { signs: Sign[]; fetchTime: Date };
  try {
    const res = await fetch("data/latest.json");
    const json = await res.json() as { fetched_at: string; signs: Sign[] };
    _fetchedAt = json.fetched_at;
    signsData = {
      signs: json.signs,
      fetchTime: new Date(json.fetched_at),
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
  try {
    const futureRes = await fetch("data/future.json");
    const futureJson = await futureRes.json() as { fetched_at: string; signs: Sign[] };
    const now = new Date();
    upcomingSignsData = filterLoadTimeNoise(futureJson.signs, new Date(futureJson.fetched_at))
      .filter((s) => !isSignActive(s, now));
  } catch {
    // file missing or network error — layer stays empty
  }

  // Use address numbers as source of truth — fix signs whose geocoded position
  // violates the monotonic house-number ordering along their street.
  signsData = { ...signsData, signs: correctSignPositions(signsData.signs, getRoadGeometry()) };

  // Build the parking segment catalog from all loaded data sources
  const parkingSegments = buildParkingSegmentCatalog({
    signs: signsData.signs,
    cleaningEntries: loadedCleaningEntries,
    snowRoutes: loadedSnowRoutes,
    roadGeometry: loadedRoadGeometry,
  });

  // Create app state machine (no storage — saved-spot flow removed in F-46D)
  const now = new Date();
  const app: App = createApp(
    { renderState },
    { signs: signsData.signs, fetchTime: signsData.fetchTime, parkingSegments },
    now
  );
  track("app-loaded");

  // F-34: initial violation highlight render + hourly schedule
  const initialState = app.getState();
  if (initialState.mode === "ready") {
    renderViolationHighlights(cleaningEntries, now);
  }
  scheduleViolationRefresh(app.getState.bind(app));

  // Fire-and-forget: fetch municipal garages and render markers.
  fetch("data/garages.json")
    .then((r) => r.json())
    .then((garages: Garage[]) => { renderGarageMarkers(garages, true); })
    .catch(() => { /* non-fatal */ });

  // Render snow emergency routes now that we have the data (already awaited above)
  if (loadedSnowRoutes.length > 0) {
    renderSnowEmergencyRoutes(loadedSnowRoutes, true);
  }

  // Wire tow-zones legend toggle
  const towLegend = document.getElementById("tow-legend");
  const towToggle = document.getElementById("tow-toggle");
  if (towLegend !== null && towToggle !== null) {
    towToggle.addEventListener("click", () => {
      const isOn = !towLegend.classList.contains("tow-off");
      setTowSignsVisible(!isOn);
      track("tow-zones-toggled", { enabled: !isOn });
      towLegend.classList.toggle("tow-off", isOn);
      towToggle.setAttribute("aria-pressed", String(!isOn));
    });
  }

  // Wire violation highlights legend toggle
  const violationLegend = document.getElementById("violation-legend");
  const violationToggle = document.getElementById("violation-toggle");
  if (violationLegend !== null && violationToggle !== null) {
    violationToggle.addEventListener("click", () => {
      const isOn = !violationLegend.classList.contains("violation-off");
      setViolationHighlightsVisible(!isOn);
      track("violation-highlights-toggled", { enabled: !isOn });
      violationLegend.classList.toggle("violation-off", isOn);
      violationToggle.setAttribute("aria-pressed", String(!isOn));
    });
  }

  // Wire upcoming signs legend toggle
  const upcomingToggle = document.getElementById("upcoming-toggle");
  upcomingToggle?.addEventListener("click", () => {
    const isOn = upcomingToggle.getAttribute("aria-pressed") === "true";
    const next = !isOn;
    setUpcomingSignsVisible(next);
    track("upcoming-signs-toggled", { enabled: next });
    upcomingToggle.setAttribute("aria-pressed", String(next));
    document.getElementById("upcoming-legend")?.classList.toggle("upcoming-off", !next);
  });
  // Upcoming signs off by default — sync legend to match
  upcomingToggle?.setAttribute("aria-pressed", "false");
  document.getElementById("upcoming-legend")?.classList.add("upcoming-off");

  // Wire garage toggle
  const garageToggle = document.getElementById("garage-toggle");
  garageToggle?.addEventListener("click", () => {
    const isOn = garageToggle.getAttribute("aria-pressed") === "true";
    const next = !isOn;
    setGarageMarkersVisible(next);
    track("garages-toggled", { enabled: next });
    garageToggle.setAttribute("aria-pressed", String(next));
    document.getElementById("garage-legend")?.classList.toggle("garage-off", !next);
  });

  // Wire snow routes toggle
  const snowToggle = document.getElementById("snow-toggle");
  snowToggle?.addEventListener("click", () => {
    const isOn = snowToggle.getAttribute("aria-pressed") === "true";
    const next = !isOn;
    setSnowRoutesVisible(next);
    track("snow-routes-toggled", { enabled: next });
    snowToggle.setAttribute("aria-pressed", String(next));
    document.getElementById("snow-legend")?.classList.toggle("snow-off", !next);
  });

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

  // ─── Wire check controls (F-47) ────────────────────────────────────────────

  const dur30Btn = document.getElementById("check-duration-30");
  const dur60Btn = document.getElementById("check-duration-60");
  const dur120Btn = document.getElementById("check-duration-120");
  const checkQueryInput = document.getElementById("check-query-input") as HTMLInputElement | null;
  const checkRunBtn = document.getElementById("check-run-button");

  dur30Btn?.addEventListener("click", () => {
    createDurationCheckQuery(30, new Date());
    track("check-duration-selected", { minutes: 30 });
  });

  dur60Btn?.addEventListener("click", () => {
    createDurationCheckQuery(60, new Date());
    track("check-duration-selected", { minutes: 60 });
  });

  dur120Btn?.addEventListener("click", () => {
    createDurationCheckQuery(120, new Date());
    track("check-duration-selected", { minutes: 120 });
  });

  checkRunBtn?.addEventListener("click", () => {
    const rawText = checkQueryInput !== null ? checkQueryInput.value : "";
    if (rawText.trim().length > 0) {
      const parsed = parseCheckQuery(rawText, new Date());
      if (parsed !== null) {
        track("check-query-parsed", { label: parsed.label });
      }
    }
  });

  // ─── Wire rules controls (F-53) ───────────────────────────────────────────

  const rulesTimeNowBtn = document.getElementById("rules-time-now");
  const rulesTimeCustomBtn = document.getElementById("rules-time-custom");
  const rulesTimeInput = document.getElementById("rules-time-input") as HTMLInputElement | null;

  /** Track local rules time selection — not yet wired to app state machine. */
  rulesState.mode = "now";
  rulesState.selectedTime = new Date();

  rulesTimeNowBtn?.addEventListener("click", () => {
    rulesState.mode = "now";
    rulesState.selectedTime = new Date();
    rulesTimeNowBtn?.setAttribute("aria-pressed", "true");
    rulesTimeCustomBtn?.setAttribute("aria-pressed", "false");
    track("rules-time-mode-selected", { mode: "now" });
  });

  rulesTimeCustomBtn?.addEventListener("click", () => {
    rulesState.mode = "custom";
    rulesTimeNowBtn?.setAttribute("aria-pressed", "false");
    rulesTimeCustomBtn?.setAttribute("aria-pressed", "true");
    track("rules-time-mode-selected", { mode: "custom" });
  });

  rulesTimeInput?.addEventListener("change", () => {
    rulesState.mode = "custom";
    const val = rulesTimeInput !== null ? rulesTimeInput.value : "";
    if (val.length > 0) {
      // Parse HH:MM time input as today's local date at that time
      const nowT = new Date();
      const [hoursStr, minutesStr] = val.split(":");
      const hours = parseInt(hoursStr ?? "0", 10);
      const minutes = parseInt(minutesStr ?? "0", 10);
      rulesState.selectedTime = new Date(nowT.getFullYear(), nowT.getMonth(), nowT.getDate(), hours, minutes, 0, 0);
      track("rules-time-custom-set", { time: val });
    }
  });

  // Wire the single map click handler — routes by activeMode.
  registerMapClickHandler((lat: number, lng: number) => {
    const state = app.getState();
    if (state.mode !== "ready") return;
    if (state.activeMode === "check") {
      handleCheckClick(lat, lng);
    } else {
      // Store selected location in app state before computing sections
      app.setRulesLocation(lat, lng);
      const sections = handleRulesClick(lat, lng, state.rulesTime.selectedTime, state.parkingSegments);
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

// Only run in browser context (not in Node test environment)
if (typeof document !== "undefined") {
  void initBrowserApp();
}
