import {
  formatCountdown,
  formatSignWindow,
  formatTime,
  signSeverity,
} from "../shared/parking-logic";
import type { Sign, AppMode, CheckResultSegment } from "../shared/types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Duration the spot confirmation toast is visible before auto-hiding. */
export const TOAST_DURATION_MS = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEl(id: string): HTMLElement | null {
  return document.getElementById(id);
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
    card.setAttribute("data-sign-id", sign.id);

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
  // Hide parked-only buttons
  const clearBtn = getEl("clear-btn");
  if (clearBtn) {
    clearBtn.style.display = "none";
    clearBtn.hidden = true;
  }

  const hereBtn = getEl("here-btn");
  if (hereBtn) {
    hereBtn.style.display = "none";
    hereBtn.hidden = true;
  }

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
}

export function showSpotToast(address: string): void {
  // Remove any existing toast
  const existing = document.getElementById("spot-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "spot-toast";
  toast.className = "spot-toast";
  toast.textContent = `Spot saved — ${address}.`;

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

// ─── F-52 Bottom Sheet Shell ──────────────────────────────────────────────────

export function showBottomSheet(): void {
  const sheet = getEl("bottom-sheet");
  if (sheet) {
    sheet.classList.add("bottom-sheet--open");
  }
}

export function hideBottomSheet(): void {
  const sheet = getEl("bottom-sheet");
  if (sheet) {
    sheet.classList.remove("bottom-sheet--open");
  }
}

export function setBottomSheetContent(content: string): void {
  const contentEl = getEl("bottom-sheet-content");
  if (contentEl) {
    contentEl.innerHTML = content;
  }
}

export function setBottomSheetMode(mode: AppMode): void {
  const sheet = getEl("bottom-sheet");
  if (sheet) {
    if (mode === "check") {
      sheet.classList.add("bottom-sheet--check");
      sheet.classList.remove("bottom-sheet--rules");
    } else {
      sheet.classList.add("bottom-sheet--rules");
      sheet.classList.remove("bottom-sheet--check");
    }
  }
}

// ─── F-56 Check Segment Details ───────────────────────────────────────────────

/**
 * Render a Check result segment's details as an HTML string.
 * Includes street, side, location, status class, and primary conflict info.
 */
export function renderCheckSegmentDetails(
  segment: CheckResultSegment
): string {
  const statusClass = `status-${segment.status}`;

  let conflictHtml = "";
  if (segment.primaryConflict !== undefined) {
    conflictHtml =
      `<div class="check-segment-reason">${segment.primaryConflict.reason}</div>` +
      `<div class="check-segment-window">${segment.primaryConflict.label}</div>`;
  }

  return (
    `<div class="check-segment-details ${statusClass}">` +
    `<div class="check-segment-street">${segment.street}</div>` +
    `<div class="check-segment-side">${segment.side}</div>` +
    `<div class="check-segment-location">${segment.location}</div>` +
    conflictHtml +
    `</div>`
  );
}

