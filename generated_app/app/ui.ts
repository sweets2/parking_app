import {
  formatCountdown,
  formatSignWindow,
  formatTime,
  signSeverity,
} from "../shared/parking-logic";
import type { Sign } from "../shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Side = "N" | "S" | "E" | "W";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Duration the spot confirmation toast is visible before auto-hiding. */
export const TOAST_DURATION_MS = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEl(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function sideLabel(side: Side): string {
  switch (side) {
    case "N": return "north";
    case "S": return "south";
    case "E": return "east";
    case "W": return "west";
  }
}

// ─── F-09.1 Loading State ─────────────────────────────────────────────────────

export function renderLoading(): void {
  let spinner = document.getElementById("loading-spinner");
  if (spinner) return; // already present
  spinner = document.createElement("div");
  spinner.id = "loading-spinner";
  spinner.textContent = "Loading…";
  spinner.setAttribute("role", "status");
  document.body.appendChild(spinner);
}

export function hideLoading(): void {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) {
    spinner.remove();
  }
}

// ─── F-09.2 Sign List Cards ───────────────────────────────────────────────────

const SEVERITY_ORDER: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function clearElement(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function renderSignCards(signs: Sign[], now: Date): void {
  const container = getEl("sign-list");
  if (!container) return;

  // Clear existing cards
  clearElement(container);

  // Sort by severity: high first
  const sorted = [...signs].sort(
    (a, b) => SEVERITY_ORDER[signSeverity(a)] - SEVERITY_ORDER[signSeverity(b)]
  );

  for (const sign of sorted) {
    const card = document.createElement("div");
    card.className = "sign-card";
    card.setAttribute("data-severity", signSeverity(sign));

    const reasonBadge = document.createElement("span");
    reasonBadge.className = "sign-reason-badge";
    reasonBadge.textContent = sign.reason;

    const address = document.createElement("div");
    address.className = "sign-address";
    address.textContent = sign.address;

    const window = document.createElement("div");
    window.className = "sign-window";
    window.textContent = formatSignWindow(sign, now);

    const dateRange = document.createElement("div");
    dateRange.className = "sign-date-range";
    dateRange.textContent =
      `${sign.start_date} ${formatTime(sign.start_time)} → ${sign.stop_date} ${formatTime(sign.end_time)}`;

    const permit = document.createElement("div");
    permit.className = "sign-permit";
    permit.textContent = sign.permit_number;

    card.appendChild(reasonBadge);
    card.appendChild(address);
    card.appendChild(window);
    card.appendChild(dateRange);
    card.appendChild(permit);

    container.appendChild(card);
  }
}

// ─── F-09.3 Browsing Mode UI ──────────────────────────────────────────────────

export function renderBrowsingMode(activeSigns: Sign[], now: Date): void {
  // Show the SAVE MY SPOT button
  const saveBtn = getEl("save-btn");
  if (saveBtn) saveBtn.style.display = "";

  // Hide parked-only buttons
  const clearBtn = getEl("clear-btn");
  if (clearBtn) clearBtn.style.display = "none";

  const hereBtn = getEl("here-btn");
  if (hereBtn) hereBtn.style.display = "none";

  // Hide the refresh button — only visible in parked mode (F-15)
  const refreshBtn = getEl("refresh-btn");
  if (refreshBtn) refreshBtn.style.display = "none";

  // Clear banner (no parked-state banner in browsing mode)
  const banner = getEl("banner");
  if (banner) {
    clearElement(banner);
    banner.style.display = "none";
  }

  // Render sign cards
  renderSignCards(activeSigns, now);
}

// ─── F-09.4 Parked Mode — Clear Banner ───────────────────────────────────────

export function renderClearBanner(): void {
  const banner = getEl("banner");
  if (banner) {
    clearElement(banner);
    banner.style.display = "";
    banner.setAttribute("data-severity", "clear");

    const msg = document.createElement("div");
    msg.className = "banner-message";
    msg.textContent = "You're clear. No active signs near your spot.";
    banner.appendChild(msg);
  }

  // Show parked-mode buttons
  const clearBtn = getEl("clear-btn");
  if (clearBtn) clearBtn.style.display = "";

  const hereBtn = getEl("here-btn");
  if (hereBtn) hereBtn.style.display = "";

  // Hide browsing-mode button
  const saveBtn = getEl("save-btn");
  if (saveBtn) saveBtn.style.display = "none";
}

// ─── F-09.5 Parked Mode — Warning Banner ─────────────────────────────────────

export function renderWarningBanner(nearbySigns: Sign[], now: Date): void {
  if (nearbySigns.length === 0) {
    renderClearBanner();
    return;
  }

  // Find the most severe sign (first by severity order, ties broken by array order)
  const sorted = [...nearbySigns].sort(
    (a, b) => SEVERITY_ORDER[signSeverity(a)] - SEVERITY_ORDER[signSeverity(b)]
  );

  const topSign = sorted[0];
  if (!topSign) {
    renderClearBanner();
    return;
  }

  const topSeverity = signSeverity(topSign);
  const countdown = formatCountdown(topSign.end_iso, now);

  const banner = getEl("banner");
  if (banner) {
    clearElement(banner);
    banner.style.display = "";
    banner.setAttribute("data-severity", topSeverity);
    banner.dataset["severity"] = topSeverity;

    const countEl = document.createElement("div");
    countEl.className = "banner-count";
    countEl.textContent = `${nearbySigns.length} active sign${nearbySigns.length !== 1 ? "s" : ""} nearby`;

    const detailEl = document.createElement("div");
    detailEl.className = "banner-detail";
    detailEl.textContent = `${topSign.reason} — ${topSign.address} — ends in ${countdown}`;

    banner.appendChild(countEl);
    banner.appendChild(detailEl);
  }

  // Show parked-mode buttons
  const clearBtn = getEl("clear-btn");
  if (clearBtn) clearBtn.style.display = "";

  const hereBtn = getEl("here-btn");
  if (hereBtn) hereBtn.style.display = "";

  // Hide browsing-mode button
  const saveBtn = getEl("save-btn");
  if (saveBtn) saveBtn.style.display = "none";
}

// ─── F-09.6 Street-Side Picker ────────────────────────────────────────────────

export function showStreetSidePicker(onSelect: (side: Side | null) => void): void {
  // Remove any existing picker
  const existing = document.getElementById("side-picker");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "side-picker";
  overlay.className = "side-picker-overlay";

  const title = document.createElement("div");
  title.className = "side-picker-title";
  title.textContent = "Which side of the street?";
  overlay.appendChild(title);

  const sides: Side[] = ["N", "S", "E", "W"];
  for (const side of sides) {
    const btn = document.createElement("button");
    btn.className = "side-picker-btn";
    btn.textContent = side;
    btn.addEventListener("click", () => {
      overlay.remove();
      onSelect(side);
    });
    overlay.appendChild(btn);
  }

  // Cancel button
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "side-picker-cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    overlay.remove();
    onSelect(null);
  });
  overlay.appendChild(cancelBtn);

  document.body.appendChild(overlay);
}

// ─── F-09.7 Spot Confirmation Toast ──────────────────────────────────────────

export function showSpotToast(address: string, side: Side): void {
  // Remove any existing toast
  const existing = document.getElementById("spot-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "spot-toast";
  toast.className = "spot-toast";
  toast.textContent = `Spot saved — ${address}, ${sideLabel(side)} side.`;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, TOAST_DURATION_MS);
}

// ─── F-13.2 Stale Data Banner ─────────────────────────────────────────────────

export function showStaleBanner(hoursAgo: number): void {
  const existing = document.getElementById("stale-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "stale-banner";
  banner.className = "stale-banner";
  banner.textContent = `Sign data may be outdated — last updated ${Math.round(hoursAgo)} hours ago`;

  document.body.appendChild(banner);
}

// ─── F-15.1 Refresh Button ────────────────────────────────────────────────────

/**
 * Build a freshness label from the ISO fetchedAt string and the current now
 * date.  If both dates share the same UTC calendar day the label is
 * "today at H:MM" (UTC time).  Otherwise the label is the 3-letter weekday
 * abbreviation followed by the UTC time.
 */
function buildFreshnessLabel(fetchedAt: string, now: Date): string {
  const fetched = new Date(fetchedAt);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Compare by UTC calendar day
  const sameDay =
    fetched.getUTCFullYear() === now.getUTCFullYear() &&
    fetched.getUTCMonth() === now.getUTCMonth() &&
    fetched.getUTCDate() === now.getUTCDate();

  const h = fetched.getUTCHours();
  const m = fetched.getUTCMinutes().toString().padStart(2, "0");
  const timeStr = `${h}:${m}`;

  if (sameDay) {
    return `today at ${timeStr}`;
  }
  const dayStr = DAYS[fetched.getUTCDay()] ?? "";
  return `${dayStr} at ${timeStr}`;
}

/**
 * Inserts (or updates) a #refresh-btn button into the document body with a
 * freshness label derived from fetchedAt and now.  The button is visible
 * (display not "none") — it should only be rendered in parked mode.
 */
export function renderRefreshButton(fetchedAt: string, now: Date): void {
  let btn = document.getElementById("refresh-btn") as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement("button") as HTMLButtonElement;
    btn.id = "refresh-btn";
    btn.className = "refresh-btn";
    document.body.appendChild(btn);
  }
  btn.style.display = "";
  btn.textContent = `Refresh signs — ${buildFreshnessLabel(fetchedAt, now)}`;
}

/**
 * Sets the refresh button to a disabled/loading state, or re-enables it.
 */
export function setRefreshLoading(loading: boolean): void {
  const btn = document.getElementById("refresh-btn") as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = loading;
  }
}

/**
 * Shows a brief error message indicating the refresh failed and cached data
 * is being used.
 */
export function showRefreshError(): void {
  const existing = document.getElementById("refresh-error");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "refresh-error";
  el.className = "refresh-error";
  el.textContent = "Could not refresh — using cached data.";

  document.body.appendChild(el);
}
