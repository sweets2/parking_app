/**
 * app/map.ts — F-07 / F-07.6
 *
 * The ONLY file in this project that may touch the Leaflet `L.*` global.
 * All other modules must not import Leaflet.
 *
 * Leaflet is loaded via CDN in index.html and is available as `window.L`.
 * In Node tests the global `L` is mocked before this module is imported.
 */

import type { Sign, StreetCleaningEntry } from "../shared/types";
import type { SavedSpot } from "../shared/storage";
import { formatTime } from "../shared/parking-logic";

// ─── Leaflet type shim ───────────────────────────────────────────────────────
// We access L as a global (not an import) because it is loaded via CDN.
// Provide a minimal structural type so TypeScript can check our calls.

interface LeafletLatLng {
  lat: number;
  lng: number;
}

interface LeafletLayer {
  remove(): void;
  bindPopup(html: string): LeafletLayer;
  openPopup(): LeafletLayer;
  on(event: string, handler: (e: unknown) => void): LeafletLayer;
  addTo(map: LeafletMap): LeafletLayer;
}

interface LeafletPopup {
  setLatLng(latlng: [number, number]): LeafletPopup;
  setContent(html: string): LeafletPopup;
  openOn(map: LeafletMap): LeafletPopup;
  remove(): void;
}

interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  panTo(center: [number, number]): LeafletMap;
  getCenter(): LeafletLatLng;
  on(event: string, handler: (e: { latlng: LeafletLatLng }) => void): LeafletMap;
  off(event: string): LeafletMap;
}

interface LeafletIcon {
  _html: string;
}

interface LeafletStatic {
  map(elementId: string): LeafletMap;
  tileLayer(
    urlTemplate: string,
    options: { attribution: string; maxZoom: number }
  ): LeafletLayer;
  circleMarker(
    latlng: [number, number],
    options: Record<string, unknown>
  ): LeafletLayer;
  marker(
    latlng: [number, number],
    options: { icon: LeafletIcon }
  ): LeafletLayer;
  divIcon(options: {
    html: string;
    className: string;
    iconSize: [number, number];
    iconAnchor: [number, number];
  }): LeafletIcon;
  popup(): LeafletPopup;
}

function getL(): LeafletStatic {
  return (globalThis as Record<string, unknown>)["L"] as LeafletStatic;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _map: LeafletMap | null = null;
let _signLayers: LeafletLayer[] = [];
let _positionMarker: LeafletLayer | null = null;
let _spotMarker: LeafletLayer | null = null;
let _streetPopup: LeafletPopup | null = null;

// ─── Emoji palette ────────────────────────────────────────────────────────────

const REASON_EMOJI: Record<string, string> = {
  CONSTRUCTION: "🚧",
  MOVING:       "🚛",
  EVENT:        "🎪",
  DELIVERY:     "📦",
};

const SPOT_COLOR = "#38a169"; // green — visually distinct from sign markers

// ─── F-10.3 signEmoji ─────────────────────────────────────────────────────────

/**
 * Maps a sign reason string to an emoji character.
 * Returns "⚠️" for unknown reasons.
 */
export function signEmoji(reason: string): string {
  return REASON_EMOJI[reason] ?? "⚠️";
}

// ─── F-07.1 initMap ───────────────────────────────────────────────────────────

/**
 * Initialize a Leaflet map on the `#map` element.
 * Centers on Hoboken (40.7440, -74.0324), zoom 15.
 */
export function initMap(): LeafletMap {
  const L = getL();
  const map = L.map("map");
  map.setView([40.744, -74.0324], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  // Reset module state for this map instance
  _map = map;
  _signLayers = [];
  _positionMarker = null;
  _spotMarker = null;
  _streetPopup = null;

  return map;
}

// ─── F-07.2 renderSignPins ────────────────────────────────────────────────────

/**
 * Place one circle marker per sign, colored by reason.
 * Clears previous sign pins before rendering the new set.
 * The `now` parameter is accepted per spec signature (reserved for future
 * time-conditional filtering) but sign visibility is determined by the caller.
 */
export function renderSignPins(signs: Sign[], _now: Date): void {
  if (_map === null) return;

  // Remove existing sign layers
  for (const layer of _signLayers) {
    layer.remove();
  }
  _signLayers = [];

  const L = getL();

  for (const sign of signs) {
    const emoji = REASON_EMOJI[sign.reason] ?? "⚠️";

    const marker = L.marker([sign.lat, sign.lng], {
      icon: L.divIcon({
        html: emoji,
        className: "sign-emoji-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    });

    const popupHtml = buildSignPopup(sign);
    marker.bindPopup(popupHtml);
    marker.on("click", () => {
      marker.openPopup();
    });

    marker.addTo(_map);
    _signLayers.push(marker);
  }
}

function buildSignPopup(sign: Sign): string {
  return [
    `<strong>${sign.address}</strong>`,
    `<div>Reason: ${sign.reason}</div>`,
    `<div>Start: ${sign.start_date} ${formatTime(sign.start_time)}</div>`,
    `<div>End: ${sign.stop_date} ${formatTime(sign.end_time)}</div>`,
    `<div>Permit: ${sign.permit_number}</div>`,
  ].join("");
}

// ─── F-07.3 renderPositionMarker / clearPositionMarker ────────────────────────

/**
 * Render a small blue circle at the tapped coordinates.
 * Replaces any existing position marker.
 */
export function renderPositionMarker(lat: number, lng: number): void {
  if (_map === null) return;

  if (_positionMarker !== null) {
    _positionMarker.remove();
    _positionMarker = null;
  }

  const L = getL();
  const marker = L.circleMarker([lat, lng], {
    radius: 7,
    fillColor: "#2b6cb0",
    color: "#ffffff",
    weight: 2,
    opacity: 1,
    fillOpacity: 0.9,
  });

  marker.addTo(_map);
  _positionMarker = marker;
}

/** Remove the position marker if present. */
export function clearPositionMarker(): void {
  if (_positionMarker !== null) {
    _positionMarker.remove();
    _positionMarker = null;
  }
}

// ─── F-07.4 renderSpotMarker / clearSpotMarker ────────────────────────────────

/**
 * Render a visually distinct marker at the saved spot's coordinates.
 */
export function renderSpotMarker(spot: SavedSpot): void {
  if (_map === null) return;

  if (_spotMarker !== null) {
    _spotMarker.remove();
    _spotMarker = null;
  }

  const L = getL();
  const marker = L.circleMarker([spot.lat, spot.lng], {
    radius: 10,
    fillColor: SPOT_COLOR,
    color: "#ffffff",
    weight: 2,
    opacity: 1,
    fillOpacity: 0.95,
  });

  marker.addTo(_map);
  _spotMarker = marker;
}

/** Remove the saved spot marker if present. */
export function clearSpotMarker(): void {
  if (_spotMarker !== null) {
    _spotMarker.remove();
    _spotMarker = null;
  }
}

// ─── F-07.5 centerOnSpot / registerMapClickHandler ───────────────────────────

/**
 * Pan the map to the saved spot's coordinates without changing zoom.
 */
export function centerOnSpot(spot: SavedSpot): void {
  if (_map === null) return;
  _map.panTo([spot.lat, spot.lng]);
}

/**
 * Attach a click listener to the map.
 * Subsequent calls replace the previous listener (no double-firing).
 */
export function registerMapClickHandler(
  callback: (lat: number, lng: number) => void
): void {
  if (_map === null) return;
  _map.off("click");
  _map.on("click", (e) => {
    callback(e.latlng.lat, e.latlng.lng);
  });
}

// ─── F-07.6 showStreetPopup ───────────────────────────────────────────────────

/**
 * Format a location string like "9th St. to 10th St." into
 * "between 9th St and 10th St" for display in the popup header.
 *
 * Strips trailing periods from each part (e.g. "St." → "St").
 */
function formatLocation(location: string): string {
  const parts = location.split(" to ");
  if (parts.length !== 2) {
    return location;
  }
  const from = (parts[0] ?? "").trim().replace(/\.$/, "");
  const to = (parts[1] ?? "").trim().replace(/\.$/, "");
  return `between ${from} and ${to}`;
}

/**
 * Build the HTML content for a street cleaning popup.
 *
 * Groups entries by their `location` field. Within each location group,
 * renders each entry as a side label + schedule line.
 *
 * If `entries` is empty, renders a "no schedule found" message.
 */
function buildStreetPopupContent(
  streetName: string,
  entries: StreetCleaningEntry[]
): string {
  const parts: string[] = [];

  if (entries.length === 0) {
    parts.push(`<strong>${streetName}</strong>`);
    parts.push(`<div><em>No cleaning schedule found</em></div>`);
    return parts.join("");
  }

  // Collect unique locations in insertion order
  const locationOrder: string[] = [];
  const byLocation = new Map<string, StreetCleaningEntry[]>();
  for (const entry of entries) {
    if (!byLocation.has(entry.location)) {
      locationOrder.push(entry.location);
      byLocation.set(entry.location, []);
    }
    (byLocation.get(entry.location) as StreetCleaningEntry[]).push(entry);
  }

  for (const location of locationOrder) {
    const locationEntries = byLocation.get(location) as StreetCleaningEntry[];
    const blockContext = formatLocation(location);

    parts.push(`<strong>${streetName} ${blockContext}</strong>`);
    parts.push(`<div>Street Cleaning</div>`);
    parts.push(`<hr/>`);

    for (const entry of locationEntries) {
      parts.push(`<div><strong>${entry.side}</strong>: ${entry.schedule}</div>`);
    }
  }

  return parts.join("");
}

/**
 * Open a Leaflet popup at the clicked coordinates showing the street cleaning
 * schedule for the given entries. At most one street popup is open at a time —
 * calling this function again closes the previous popup first.
 *
 * If `entries` is empty, renders a "no schedule found" message.
 * If `initMap` has not been called, returns without throwing.
 */
export function showStreetPopup(
  lat: number,
  lng: number,
  streetName: string,
  entries: StreetCleaningEntry[]
): void {
  if (_map === null) return;

  // Close any existing street popup
  if (_streetPopup !== null) {
    _streetPopup.remove();
    _streetPopup = null;
  }

  const L = getL();
  const content = buildStreetPopupContent(streetName, entries);

  const popup = L.popup();
  popup.setLatLng([lat, lng]);
  popup.setContent(content);
  popup.openOn(_map);

  _streetPopup = popup;
}
