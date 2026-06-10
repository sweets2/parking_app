/**
 * Unit tests for app/ui.ts — F-09 / F-13 / F-15 UI Rendering Module
 *
 * Runs in Node (environment: "node"). A minimal fake DOM is installed on
 * globalThis before the module under test is imported.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NOW_STABLE } from "../fixtures/signs";
import type { Sign } from "../../shared/types";

// ─── Minimal fake DOM ─────────────────────────────────────────────────────────

interface FakeElement {
  tagName: string;
  id: string;
  className: string;
  /** Setting clears children and stores a text node; getting aggregates children text. */
  textContent: string;
  innerHTML: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  children: FakeElement[];
  readonly firstChild: FakeElement | null;
  _ownText: string;
  _clickHandlers: Array<() => void>;
  disabled: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(event: string, handler: () => void): void;
  removeEventListener(event: string, handler: () => void): void;
  appendChild(child: FakeElement): FakeElement;
  removeChild(child: FakeElement): void;
  remove(): void;
  contains(el: FakeElement | null): boolean;
  querySelector(selector: string): FakeElement | null;
  querySelectorAll(selector: string): FakeElement[];
  closest(selector: string): FakeElement | null;
  _fireClick(): void;
  _parent: FakeElement | null;
}

function getTextContent(el: FakeElement): string {
  if (el.children.length === 0) return el._ownText;
  return el.children.map(getTextContent).join("");
}

function createElement(tag: string): FakeElement {
  const state = {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    innerHTML: "",
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    children: [] as FakeElement[],
    _ownText: "",
    _clickHandlers: [] as Array<() => void>,
    _parent: null as FakeElement | null,
    disabled: false,
  };

  const el: FakeElement = {
    ...state,
    get disabled(): boolean { return state.disabled; },
    set disabled(v: boolean) { state.disabled = v; },
    get firstChild(): FakeElement | null { return el.children[0] ?? null; },
    get textContent(): string { return getTextContent(el); },
    set textContent(v: string) {
      el.children.splice(0, el.children.length);
      el._ownText = v;
    },
    getAttribute(name: string): string | null {
      if (name === "id") return el.id || null;
      if (name === "class") return el.className || null;
      if (name.startsWith("data-")) {
        const key = name.slice(5);
        return el.dataset[key] ?? null;
      }
      return null;
    },
    setAttribute(name: string, value: string): void {
      if (name === "id") { el.id = value; return; }
      if (name === "class") { el.className = value; return; }
      if (name.startsWith("data-")) {
        const key = name.slice(5);
        el.dataset[key] = value;
        return;
      }
    },
    addEventListener(event: string, handler: () => void): void {
      if (event === "click") el._clickHandlers.push(handler);
    },
    removeEventListener(_event: string, _handler: () => void): void {
      // no-op for simplicity
    },
    appendChild(child: FakeElement): FakeElement {
      child._parent = el;
      el.children.push(child);
      return child;
    },
    removeChild(child: FakeElement): void {
      const idx = el.children.indexOf(child);
      if (idx !== -1) {
        el.children.splice(idx, 1);
        child._parent = null;
      }
    },
    remove(): void {
      if (el._parent) {
        el._parent.removeChild(el);
      }
    },
    contains(target: FakeElement | null): boolean {
      if (target === null) return false;
      if (target === el) return true;
      return el.children.some((c) => c.contains(target));
    },
    querySelector(selector: string): FakeElement | null {
      return queryAll(el, selector)[0] ?? null;
    },
    querySelectorAll(selector: string): FakeElement[] {
      return queryAll(el, selector);
    },
    closest(selector: string): FakeElement | null {
      let cur: FakeElement | null = el;
      while (cur !== null) {
        if (matchesSelector(cur, selector)) return cur;
        cur = cur._parent;
      }
      return null;
    },
    _fireClick(): void {
      for (const h of el._clickHandlers) h();
    },
  };
  return el;
}

function matchesSelector(el: FakeElement, selector: string): boolean {
  // Support simple selectors: #id, .class, tag
  if (selector.startsWith("#")) return el.id === selector.slice(1);
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    return el.className.split(/\s+/).includes(cls);
  }
  // data attribute selector e.g. [data-severity="high"]
  const dataAttrMatch = selector.match(/^\[data-([a-z-]+)="([^"]+)"\]$/);
  if (dataAttrMatch) {
    const [, key, val] = dataAttrMatch;
    return el.dataset[key ?? ""] === val;
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function queryAll(root: FakeElement, selector: string): FakeElement[] {
  const results: FakeElement[] = [];
  function walk(el: FakeElement): void {
    if (matchesSelector(el, selector)) results.push(el);
    for (const child of el.children) walk(child);
  }
  for (const child of root.children) walk(child);
  return results;
}

// Global element registry
const elementRegistry = new Map<string, FakeElement>();

function installFakeDom(): void {
  elementRegistry.clear();

  const body = createElement("body");
  body.id = "body";

  // Pre-create the elements that index.html defines
  const ids = ["map", "banner", "sign-list", "controls", "save-btn", "here-btn", "clear-btn"];
  const elMap = new Map<string, FakeElement>();
  for (const id of ids) {
    const tag = id.endsWith("-btn") ? "button" : "div";
    const el = createElement(tag);
    el.id = id;
    elMap.set(id, el);
  }

  // Wire buttons inside controls
  const controls = elMap.get("controls");
  if (controls) {
    body.appendChild(controls);
    const saveBtn = elMap.get("save-btn");
    const hereBtn = elMap.get("here-btn");
    const clearBtn = elMap.get("clear-btn");
    if (saveBtn) controls.appendChild(saveBtn);
    if (hereBtn) controls.appendChild(hereBtn);
    if (clearBtn) controls.appendChild(clearBtn);
  }

  // Wire other elements to body
  const banner = elMap.get("banner");
  const signList = elMap.get("sign-list");
  if (banner) body.appendChild(banner);
  if (signList) body.appendChild(signList);

  const fakeDocument = {
    body,
    _allElements: elMap,
    createElement(tag: string): FakeElement {
      return createElement(tag);
    },
    getElementById(id: string): FakeElement | null {
      return elMap.get(id) ?? body.querySelector(`#${id}`);
    },
    querySelector(selector: string): FakeElement | null {
      // Check body children
      if (selector.startsWith("#")) {
        const id = selector.slice(1);
        return elMap.get(id) ?? body.querySelector(selector);
      }
      return body.querySelector(selector);
    },
    querySelectorAll(selector: string): FakeElement[] {
      return body.querySelectorAll(selector);
    },
  };

  (globalThis as Record<string, unknown>)["document"] = fakeDocument;
}

// ─── Sign helpers ─────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("F-09 ui.ts", () => {
  beforeEach(() => {
    installFakeDom();
    vi.resetModules();
    vi.useFakeTimers();
  });

  // ─── F-09.1 Loading State ──────────────────────────────────────────────────

  describe("F-09.1 Loading State", () => {
    it("GIVEN renderLoading is called, THEN a visible spinner element exists in the document body", async () => {
      const { renderLoading } = await import("../../app/ui");
      renderLoading();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const spinner = doc.body.querySelector("#loading-spinner");
      expect(spinner).not.toBeNull();
    });

    it("GIVEN hideLoading is called after renderLoading, THEN the spinner is not in the DOM", async () => {
      const { renderLoading, hideLoading } = await import("../../app/ui");
      renderLoading();
      hideLoading();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const spinner = doc.body.querySelector("#loading-spinner");
      expect(spinner).toBeNull();
    });
  });

  // ─── F-09.2 Sign List Cards ────────────────────────────────────────────────

  describe("F-09.2 Sign List Cards", () => {
    it("GIVEN two active signs, WHEN renderSignCards is called, THEN two card elements exist in the sign list container", async () => {
      const { renderSignCards } = await import("../../app/ui");
      const signs: Sign[] = [
        makeSign({ id: "1", reason: "CONSTRUCTION" }),
        makeSign({ id: "2", reason: "DELIVERY" }),
      ];
      renderSignCards(signs, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const list = doc.getElementById("sign-list");
      expect(list).not.toBeNull();
      const cards = list?.querySelectorAll(".sign-card") ?? [];
      expect(cards.length).toBe(2);
    });

    it("GIVEN a CONSTRUCTION and a DELIVERY sign, WHEN rendered, THEN the CONSTRUCTION card appears before the DELIVERY card in the DOM", async () => {
      const { renderSignCards } = await import("../../app/ui");
      const signs: Sign[] = [
        makeSign({ id: "delivery", reason: "DELIVERY" }),
        makeSign({ id: "construction", reason: "CONSTRUCTION" }),
      ];
      renderSignCards(signs, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const list = doc.getElementById("sign-list");
      const cards = list?.querySelectorAll(".sign-card") ?? [];
      expect(cards.length).toBe(2);
      // CONSTRUCTION is high severity — should appear first
      expect(cards[0]?.textContent ?? "").toContain("CONSTRUCTION");
      expect(cards[1]?.textContent ?? "").toContain("DELIVERY");
    });

    it("GIVEN a sign with reason CONSTRUCTION, address, and permit number, WHEN rendered, THEN the card contains all three strings", async () => {
      const { renderSignCards } = await import("../../app/ui");
      const signs: Sign[] = [
        makeSign({
          id: "1",
          reason: "CONSTRUCTION",
          address: "259-265 11TH ST",
          permit_number: "637138",
        }),
      ];
      renderSignCards(signs, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const list = doc.getElementById("sign-list");
      const card = list?.querySelectorAll(".sign-card")[0];
      expect(card).not.toBeUndefined();
      const text = card?.textContent ?? "";
      expect(text).toContain("CONSTRUCTION");
      expect(text).toContain("259-265 11TH ST");
      expect(text).toContain("637138");
    });

    it("GIVEN an empty array, WHEN renderSignCards is called, THEN the sign list container is empty", async () => {
      const { renderSignCards } = await import("../../app/ui");
      renderSignCards([], NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const list = doc.getElementById("sign-list");
      expect(list?.children.length ?? 0).toBe(0);
    });

    it("GIVEN renderSignCards is called twice, THEN the second call replaces the first list (no duplicates)", async () => {
      const { renderSignCards } = await import("../../app/ui");
      const signs1: Sign[] = [makeSign({ id: "1", reason: "CONSTRUCTION" })];
      const signs2: Sign[] = [
        makeSign({ id: "2", reason: "DELIVERY" }),
        makeSign({ id: "3", reason: "MOVING" }),
      ];
      renderSignCards(signs1, NOW_STABLE);
      renderSignCards(signs2, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const list = doc.getElementById("sign-list");
      const cards = list?.querySelectorAll(".sign-card") ?? [];
      expect(cards.length).toBe(2);
    });
  });

  // ─── F-09.3 Browsing Mode UI ───────────────────────────────────────────────

  describe("F-09.3 Browsing Mode UI", () => {
    it("GIVEN state is browsing, WHEN renderBrowsingMode is called, THEN the SAVE MY SPOT button is visible", async () => {
      const { renderBrowsingMode } = await import("../../app/ui");
      renderBrowsingMode([], NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const saveBtn = doc.getElementById("save-btn");
      expect(saveBtn).not.toBeNull();
      expect(saveBtn?.style["display"]).not.toBe("none");
    });

    it("GIVEN state is browsing, WHEN renderBrowsingMode is called, THEN no parked-state banner is in the DOM", async () => {
      const { renderBrowsingMode } = await import("../../app/ui");
      renderBrowsingMode([], NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      // Banner should be empty or hidden
      const hasParkedBanner =
        (banner?.children.length ?? 0) > 0 &&
        banner?.style["display"] !== "none";
      expect(hasParkedBanner).toBe(false);
    });
  });

  // ─── F-09.4 Parked Mode — Clear Banner ────────────────────────────────────

  describe("F-09.4 Parked Mode — Clear Banner", () => {
    it("GIVEN nearbySigns is empty, WHEN renderClearBanner is called, THEN a green banner containing 'clear' is visible", async () => {
      const { renderClearBanner } = await import("../../app/ui");
      renderClearBanner();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      expect(banner).not.toBeNull();
      const text = banner?.textContent ?? "";
      expect(text.toLowerCase()).toContain("clear");
      expect(banner?.style["display"]).not.toBe("none");
    });

    it("GIVEN the banner is shown, THEN the CLEAR MY SPOT and I'M HERE NOW buttons are visible", async () => {
      const { renderClearBanner } = await import("../../app/ui");
      renderClearBanner();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const clearBtn = doc.getElementById("clear-btn");
      const hereBtn = doc.getElementById("here-btn");
      expect(clearBtn?.style["display"]).not.toBe("none");
      expect(hereBtn?.style["display"]).not.toBe("none");
    });
  });

  // ─── F-09.5 Parked Mode — Warning Banner ──────────────────────────────────

  describe("F-09.5 Parked Mode — Warning Banner", () => {
    it("GIVEN one nearby CONSTRUCTION sign 2h from NOW_STABLE, WHEN renderWarningBanner called with now=NOW_STABLE, THEN banner contains CONSTRUCTION, address, and '2h 0m'", async () => {
      const { renderWarningBanner } = await import("../../app/ui");
      // Use a UTC-based end_iso so formatCountdown works regardless of system timezone
      const endIso = new Date(NOW_STABLE.getTime() + 2 * 60 * 60 * 1000).toISOString();
      const sign = makeSign({
        id: "1",
        reason: "CONSTRUCTION",
        address: "123 Construction Ave",
        end_iso: endIso,
      });
      renderWarningBanner([sign], NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      const text = banner?.textContent ?? "";
      expect(text).toContain("CONSTRUCTION");
      expect(text).toContain("123 Construction Ave");
      expect(text).toContain("2h 0m");
    });

    it("GIVEN two nearby signs, WHEN rendered, THEN the banner element contains the string '2'", async () => {
      const { renderWarningBanner } = await import("../../app/ui");
      const signs: Sign[] = [
        makeSign({ id: "1", reason: "CONSTRUCTION" }),
        makeSign({ id: "2", reason: "DELIVERY" }),
      ];
      renderWarningBanner(signs, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      const text = banner?.textContent ?? "";
      expect(text).toContain("2");
    });

    it("GIVEN the most severe sign has severity 'high', THEN the banner element has data-severity='high'", async () => {
      const { renderWarningBanner } = await import("../../app/ui");
      const signs: Sign[] = [
        makeSign({ id: "1", reason: "CONSTRUCTION" }), // high
        makeSign({ id: "2", reason: "DELIVERY" }),     // low
      ];
      renderWarningBanner(signs, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      expect(banner?.dataset["severity"]).toBe("high");
    });

    it("GIVEN all nearby signs have severity 'medium' or lower, THEN the banner element has data-severity='medium'", async () => {
      const { renderWarningBanner } = await import("../../app/ui");
      const signs: Sign[] = [
        makeSign({ id: "1", reason: "MOVING" }),   // medium
        makeSign({ id: "2", reason: "EVENT" }),    // medium
      ];
      renderWarningBanner(signs, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      expect(banner?.dataset["severity"]).toBe("medium");
    });

    it("GIVEN renderWarningBanner is called with an empty array, THEN it does not throw and calls renderClearBanner instead", async () => {
      const { renderWarningBanner } = await import("../../app/ui");
      expect(() => renderWarningBanner([], NOW_STABLE)).not.toThrow();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      const text = banner?.textContent ?? "";
      // Should show the clear banner text
      expect(text.toLowerCase()).toContain("clear");
    });
  });

  // ─── F-09.6 Street-Side Picker ────────────────────────────────────────────

  describe("F-09.6 Street-Side Picker", () => {
    it("GIVEN showStreetSidePicker is called, THEN the picker is visible with four side buttons", async () => {
      const { showStreetSidePicker } = await import("../../app/ui");
      showStreetSidePicker(() => {});
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const picker = doc.body.querySelector("#side-picker");
      expect(picker).not.toBeNull();
      // Check for N, S, E, W buttons
      const buttons = picker?.querySelectorAll("button") ?? [];
      const labels = buttons.map((b) => b.textContent.trim());
      expect(labels).toContain("N");
      expect(labels).toContain("S");
      expect(labels).toContain("E");
      expect(labels).toContain("W");
    });

    it("GIVEN the user taps N, THEN onSelect is called with 'N'", async () => {
      const { showStreetSidePicker } = await import("../../app/ui");
      const onSelect = vi.fn();
      showStreetSidePicker(onSelect);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const picker = doc.body.querySelector("#side-picker");
      const buttons = picker?.querySelectorAll("button") ?? [];
      const nBtn = buttons.find((b) => b.textContent.trim() === "N");
      expect(nBtn).not.toBeUndefined();
      nBtn?._fireClick();
      expect(onSelect).toHaveBeenCalledWith("N");
    });

    it("GIVEN the user dismisses the picker without selecting, THEN onSelect is called with null", async () => {
      const { showStreetSidePicker } = await import("../../app/ui");
      const onSelect = vi.fn();
      showStreetSidePicker(onSelect);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const picker = doc.body.querySelector("#side-picker");
      // Find a cancel/dismiss button
      const buttons = picker?.querySelectorAll("button") ?? [];
      const cancelBtn = buttons.find(
        (b) => !["N", "S", "E", "W"].includes(b.textContent.trim())
      );
      expect(cancelBtn).not.toBeUndefined();
      cancelBtn?._fireClick();
      expect(onSelect).toHaveBeenCalledWith(null);
    });
  });

  // ─── F-13.2 Stale Data UI Warning ─────────────────────────────────────────

  describe("F-13.2 Stale Data UI Warning", () => {
    it("GIVEN showStaleBanner(30) is called, THEN a banner element is in the DOM containing '30'", async () => {
      const { showStaleBanner } = await import("../../app/ui");
      showStaleBanner(30);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const banner = doc.body.querySelector("#stale-banner");
      expect(banner).not.toBeNull();
      const text = banner?.textContent ?? "";
      expect(text).toContain("30");
    });

    it("GIVEN showStaleBanner has been called, THEN renderLoading still produces its expected DOM output without error", async () => {
      const { showStaleBanner, renderLoading } = await import("../../app/ui");
      showStaleBanner(30);
      expect(() => renderLoading()).not.toThrow();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const spinner = doc.body.querySelector("#loading-spinner");
      expect(spinner).not.toBeNull();
    });

    it("GIVEN showStaleBanner has been called, THEN renderBrowsingMode still produces its expected DOM output without error", async () => {
      const { showStaleBanner, renderBrowsingMode } = await import("../../app/ui");
      showStaleBanner(30);
      expect(() => renderBrowsingMode([], NOW_STABLE)).not.toThrow();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const saveBtn = doc.getElementById("save-btn");
      expect(saveBtn).not.toBeNull();
    });

    it("GIVEN showStaleBanner has been called, THEN renderClearBanner still produces its expected DOM output without error", async () => {
      const { showStaleBanner, renderClearBanner } = await import("../../app/ui");
      showStaleBanner(30);
      expect(() => renderClearBanner()).not.toThrow();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const banner = doc.getElementById("banner");
      const text = banner?.textContent ?? "";
      expect(text.toLowerCase()).toContain("clear");
    });
  });

  // ─── F-09.7 Spot Confirmation Toast ───────────────────────────────────────

  describe("F-09.7 Spot Confirmation Toast", () => {
    it("GIVEN address falls back to coordinate string and side is N, WHEN toast renders, THEN it contains 'north' and the coordinate string", async () => {
      const { showSpotToast } = await import("../../app/ui");
      showSpotToast("40.7503, -74.0303", "N");
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const toast = doc.body.querySelector("#spot-toast");
      expect(toast).not.toBeNull();
      const text = toast?.textContent ?? "";
      expect(text.toLowerCase()).toContain("north");
      expect(text).toContain("40.7503, -74.0303");
    });

    it("GIVEN reverse geocoding returned '259 11th St', WHEN the toast renders, THEN it contains '259 11th St'", async () => {
      const { showSpotToast } = await import("../../app/ui");
      showSpotToast("259 11th St", "N");
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const toast = doc.body.querySelector("#spot-toast");
      const text = toast?.textContent ?? "";
      expect(text).toContain("259 11th St");
    });

    it("GIVEN the toast appears, THEN it is removed from the DOM after exactly TOAST_DURATION_MS milliseconds", async () => {
      const { showSpotToast, TOAST_DURATION_MS } = await import("../../app/ui");
      showSpotToast("259 11th St", "N");
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      // Toast should be present immediately
      expect(doc.body.querySelector("#spot-toast")).not.toBeNull();
      // Advance timers by TOAST_DURATION_MS
      vi.advanceTimersByTime(TOAST_DURATION_MS);
      // Toast should be gone
      expect(doc.body.querySelector("#spot-toast")).toBeNull();
    });
  });

  // ─── F-15.1 Button Visibility and Freshness Label ─────────────────────────

  describe("F-15.1 renderRefreshButton", () => {
    it("GIVEN renderRefreshButton is called with any ISO string and a now date, THEN #refresh-btn is non-null", async () => {
      const { renderRefreshButton } = await import("../../app/ui");
      renderRefreshButton(NOW_STABLE.toISOString(), NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      expect(doc.getElementById("refresh-btn")).not.toBeNull();
    });

    it("GIVEN renderRefreshButton is called, THEN the button's style.display is not 'none'", async () => {
      const { renderRefreshButton } = await import("../../app/ui");
      renderRefreshButton(NOW_STABLE.toISOString(), NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
      };
      const btn = doc.getElementById("refresh-btn");
      expect(btn).not.toBeNull();
      expect(btn?.style["display"]).not.toBe("none");
    });

    it("GIVEN renderBrowsingMode is called, THEN #refresh-btn is either null or has display='none'", async () => {
      const { renderRefreshButton, renderBrowsingMode } = await import("../../app/ui");
      // First create the button
      renderRefreshButton(NOW_STABLE.toISOString(), NOW_STABLE);
      // Then render browsing mode
      renderBrowsingMode([], NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
        body: FakeElement;
      };
      const btn = doc.getElementById("refresh-btn") ?? doc.body.querySelector("#refresh-btn");
      if (btn) {
        expect(btn.style["display"]).toBe("none");
      } else {
        expect(btn).toBeNull();
      }
    });

    it("GIVEN fetchedAt is today (same day as now), THEN button text contains 'today' and the time", async () => {
      const { renderRefreshButton } = await import("../../app/ui");
      // NOW_STABLE is 2026-06-09T16:00:00Z. Derive fetchedAt at 06:02 UTC on the same day
      // by snapping NOW_STABLE to midnight UTC then adding 6h 2m.
      const nowDate = NOW_STABLE;
      const midnightUtc = new Date(
        Date.UTC(
          NOW_STABLE.getUTCFullYear(),
          NOW_STABLE.getUTCMonth(),
          NOW_STABLE.getUTCDate(),
        )
      );
      const fetchedAt = new Date(midnightUtc.getTime() + (6 * 60 + 2) * 60 * 1000).toISOString();
      renderRefreshButton(fetchedAt, nowDate);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
        body: FakeElement;
      };
      const btn = doc.getElementById("refresh-btn") ?? doc.body.querySelector("#refresh-btn");
      const text = btn?.textContent ?? "";
      expect(text).toContain("today");
      expect(text).toMatch(/6:02/);
    });

    it("GIVEN fetchedAt is the previous day, THEN button text contains a weekday abbreviation and not 'today'", async () => {
      const { renderRefreshButton } = await import("../../app/ui");
      const oneDayMs = 24 * 60 * 60 * 1000;
      const prevDay = new Date(NOW_STABLE.getTime() - oneDayMs);
      const fetchedAt = prevDay.toISOString();
      renderRefreshButton(fetchedAt, NOW_STABLE);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
        body: FakeElement;
      };
      const btn = doc.getElementById("refresh-btn") ?? doc.body.querySelector("#refresh-btn");
      const text = btn?.textContent ?? "";
      const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const hasWeekday = weekdays.some((day) => text.includes(day));
      expect(hasWeekday).toBe(true);
      expect(text).not.toContain("today");
    });
  });

  // ─── F-15.2 setRefreshLoading and showRefreshError ────────────────────────

  describe("F-15.2 setRefreshLoading and showRefreshError", () => {
    it("GIVEN setRefreshLoading(true) is called, THEN #refresh-btn has disabled === true", async () => {
      const { renderRefreshButton, setRefreshLoading } = await import("../../app/ui");
      renderRefreshButton(NOW_STABLE.toISOString(), NOW_STABLE);
      setRefreshLoading(true);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
        body: FakeElement;
      };
      const btn = doc.getElementById("refresh-btn") ?? doc.body.querySelector("#refresh-btn");
      expect((btn as unknown as { disabled: boolean } | null)?.disabled).toBe(true);
    });

    it("GIVEN setRefreshLoading(false) is called, THEN #refresh-btn has disabled === false", async () => {
      const { renderRefreshButton, setRefreshLoading } = await import("../../app/ui");
      renderRefreshButton(NOW_STABLE.toISOString(), NOW_STABLE);
      setRefreshLoading(true);
      setRefreshLoading(false);
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        getElementById(id: string): FakeElement | null;
        body: FakeElement;
      };
      const btn = doc.getElementById("refresh-btn") ?? doc.body.querySelector("#refresh-btn");
      expect((btn as unknown as { disabled: boolean } | null)?.disabled).toBe(false);
    });

    it("GIVEN showRefreshError is called, THEN a DOM element containing the exact error text is visible", async () => {
      const { showRefreshError } = await import("../../app/ui");
      showRefreshError();
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const bodyText = doc.body.textContent ?? "";
      expect(bodyText).toContain("Could not refresh — using cached data.");
    });
  });
});
