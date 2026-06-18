/**
 * Unit tests for app/ui.ts — F-09 / F-13 / F-15 UI Rendering Module
 *
 * Runs in Node (environment: "node"). A minimal fake DOM is installed on
 * globalThis before the module under test is imported.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Sign } from "../../shared/types";

// Inline stable date — avoids importing from tests/fixtures/signs.ts which
// reads data/latest.json via readFileSync at module-load time (ENOENT when
// the file is absent). Same approach used by tests/unit/main.test.ts.
// Value matches NOW_STABLE in tests/fixtures/signs.ts (2026-06-09T16:00:00Z = noon ET).
const NOW_STABLE: Date = new Date("2026-06-09T16:00:00.000Z"); // 12:00 ET

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
      // Fixed ISO string 2h after NOW_STABLE (2026-06-09T16:00:00.000Z + 2h = 2026-06-09T18:00:00.000Z)
      const endIso = "2026-06-09T18:00:00.000Z";
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

  // F-09.6 (Street-Side Picker) removed — showStreetSidePicker was deleted when
  // the feature changed to auto-save on map click.

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
    it("GIVEN address is provided, WHEN toast renders, THEN it contains the address", async () => {
      const { showSpotToast } = await import("../../app/ui");
      showSpotToast("259 11th St");
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const toast = doc.body.querySelector("#spot-toast");
      expect(toast).not.toBeNull();
      const text = toast?.textContent ?? "";
      expect(text).toContain("259 11th St");
    });

    it("GIVEN address is provided, WHEN toast renders, THEN it shows a saved message containing the address", async () => {
      const { showSpotToast } = await import("../../app/ui");
      showSpotToast("100 SPEC ST");
      const doc = (globalThis as Record<string, unknown>)["document"] as {
        body: FakeElement;
      };
      const toast = doc.body.querySelector("#spot-toast");
      expect(toast).not.toBeNull();
      const text = toast?.textContent ?? "";
      expect(text.toLowerCase()).toContain("saved");
      expect(text).toContain("100 SPEC ST");
    });

    it("GIVEN the toast appears, THEN it is removed from the DOM after exactly TOAST_DURATION_MS milliseconds", async () => {
      const { showSpotToast, TOAST_DURATION_MS } = await import("../../app/ui");
      showSpotToast("259 11th St");
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

});

// ─── CF-09 Spec Tests (exact behavioral contracts from spec) ──────────────────

describe("CF-09 spec behavioral tests", () => {
  // Simple fake DOM used by these tests (per spec)
  type SimpleFakeEl = {
    tagName: string;
    children: SimpleFakeEl[];
    style: Record<string, string>;
    classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean };
    textContent: string;
    innerHTML: string;
    hidden: boolean;
    dataset: Record<string, string>;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    appendChild(child: SimpleFakeEl): SimpleFakeEl;
    removeChild(child: SimpleFakeEl): void;
    remove(): void;
    querySelector(sel: string): SimpleFakeEl | null;
    querySelectorAll(sel: string): SimpleFakeEl[];
    id: string;
    _parent: SimpleFakeEl | null;
    firstChild: SimpleFakeEl | null;
    _ownText: string;
    _clickHandlers: Array<() => void>;
    addEventListener(ev: string, h: () => void): void;
    removeEventListener(ev: string, h: () => void): void;
    contains(el: SimpleFakeEl | null): boolean;
    closest(sel: string): SimpleFakeEl | null;
    className: string;
    _fireClick(): void;
    disabled: boolean;
  };

  function makeEl(tag: string): SimpleFakeEl {
    const state = {
      tagName: tag.toUpperCase(),
      id: "",
      className: "",
      innerHTML: "",
      hidden: false,
      style: {} as Record<string, string>,
      dataset: {} as Record<string, string>,
      classList: {
        add(_c: string): void {},
        remove(_c: string): void {},
        contains(_c: string): boolean { return false; },
      },
      children: [] as SimpleFakeEl[],
      _ownText: "",
      _clickHandlers: [] as Array<() => void>,
      _parent: null as SimpleFakeEl | null,
      disabled: false,
    };

    function getText(el: SimpleFakeEl): string {
      if (el.children.length === 0) return el._ownText;
      return el.children.map(getText).join("");
    }

    function matchSel(el: SimpleFakeEl, sel: string): boolean {
      if (sel.startsWith("#")) return el.id === sel.slice(1);
      if (sel.startsWith(".")) {
        const cls = sel.slice(1);
        return el.className.split(/\s+/).includes(cls);
      }
      const da = sel.match(/^\[data-([a-z-]+)="([^"]+)"\]$/);
      if (da) {
        const [, key, val] = da;
        return el.dataset[key ?? ""] === val;
      }
      return el.tagName.toLowerCase() === sel.toLowerCase();
    }

    function queryAllEl(root: SimpleFakeEl, sel: string): SimpleFakeEl[] {
      const res: SimpleFakeEl[] = [];
      function walk(e: SimpleFakeEl): void {
        if (matchSel(e, sel)) res.push(e);
        for (const c of e.children) walk(c);
      }
      for (const c of root.children) walk(c);
      return res;
    }

    const el: SimpleFakeEl = {
      ...state,
      get firstChild(): SimpleFakeEl | null { return el.children[0] ?? null; },
      get textContent(): string { return getText(el); },
      set textContent(v: string) {
        el.children.splice(0, el.children.length);
        el._ownText = v;
      },
      getAttribute(name: string): string | null {
        if (name === "id") return el.id || null;
        if (name === "class") return el.className || null;
        if (name.startsWith("data-")) return el.dataset[name.slice(5)] ?? null;
        return null;
      },
      setAttribute(name: string, value: string): void {
        if (name === "id") { el.id = value; return; }
        if (name === "class") { el.className = value; return; }
        if (name.startsWith("data-")) { el.dataset[name.slice(5)] = value; }
      },
      addEventListener(ev: string, h: () => void): void {
        if (ev === "click") el._clickHandlers.push(h);
      },
      removeEventListener(): void {},
      appendChild(child: SimpleFakeEl): SimpleFakeEl {
        child._parent = el;
        el.children.push(child);
        return child;
      },
      removeChild(child: SimpleFakeEl): void {
        const idx = el.children.indexOf(child);
        if (idx !== -1) { el.children.splice(idx, 1); child._parent = null; }
      },
      remove(): void {
        if (el._parent) el._parent.removeChild(el);
      },
      contains(target: SimpleFakeEl | null): boolean {
        if (target === null) return false;
        if (target === el) return true;
        return el.children.some((c) => c.contains(target));
      },
      querySelector(sel: string): SimpleFakeEl | null { return queryAllEl(el, sel)[0] ?? null; },
      querySelectorAll(sel: string): SimpleFakeEl[] { return queryAllEl(el, sel); },
      closest(sel: string): SimpleFakeEl | null {
        let cur: SimpleFakeEl | null = el;
        while (cur !== null) {
          if (matchSel(cur, sel)) return cur;
          cur = cur._parent;
        }
        return null;
      },
      _fireClick(): void { for (const h of el._clickHandlers) h(); },
    };
    return el;
  }

  // Serialize element tree to a string containing data-sign-id attributes for ordering checks
  function serializeIds(el: SimpleFakeEl): string {
    let result = "";
    const signId = el.dataset["sign-id"];
    if (signId !== undefined) result += `[sign-id:${signId}]`;
    for (const child of el.children) result += serializeIds(child);
    return result;
  }

  function installSpecDom(elementIds: string[]): Record<string, SimpleFakeEl> {
    const elMap: Record<string, SimpleFakeEl> = {};
    const body = makeEl("body");

    for (const id of elementIds) {
      const el = makeEl("div");
      el.id = id;
      body.appendChild(el);
      elMap[id] = el;
    }

    (globalThis as Record<string, unknown>)["document"] = {
      body,
      getElementById: (id: string) => elMap[id] ?? body.querySelector(`#${id}`),
      createElement: (tag: string) => makeEl(tag),
      querySelector: (sel: string) => body.querySelector(sel),
      querySelectorAll: (sel: string) => body.querySelectorAll(sel),
    };

    return elMap;
  }

  function makeSpecSign(overrides: Partial<Sign>): Sign {
    return {
      id: "spec-id",
      address: "100 SPEC ST",
      reason: "DELIVERY",
      permit_number: "P-SPEC",
      lat: 40.745,
      lng: -74.030,
      start_date: "6/9/2026",
      start_time: "08:00:00",
      stop_date: "6/9/2026",
      end_time: "18:00:00",
      start_iso: "2026-06-09T08:00:00",
      end_iso: "2026-06-09T18:00:00",
      active_at_fetch: true,
      ...overrides,
    };
  }

  // Test 1 — renderLoading is safe when element absent
  it("Test 1: renderLoading does not throw when #loading is absent", async () => {
    installSpecDom([]);
    const { renderLoading } = await import("../../app/ui");
    expect(() => renderLoading()).not.toThrow();
  });

  // Test 2 — hideLoading is safe when element absent
  it("Test 2: hideLoading does not throw when #loading is absent", async () => {
    installSpecDom([]);
    const { hideLoading } = await import("../../app/ui");
    expect(() => hideLoading()).not.toThrow();
  });

  // Test 3 — renderBrowsingMode hides action buttons via .hidden when no active signs
  it("Test 3: renderBrowsingMode sets hidden=true on #here-btn and #clear-btn when signs empty", async () => {
    const els = installSpecDom(["here-btn", "clear-btn"]);
    const hereBtn = els["here-btn"];
    const clearBtn = els["clear-btn"];
    if (hereBtn) hereBtn.hidden = false;
    if (clearBtn) clearBtn.hidden = false;

    const { renderBrowsingMode } = await import("../../app/ui");
    renderBrowsingMode([], NOW_STABLE);

    expect(hereBtn?.hidden).toBe(true);
    expect(clearBtn?.hidden).toBe(true);
  });

  // Test 4 — renderClearBanner is safe when #clear-banner absent
  it("Test 4: renderClearBanner does not throw when #clear-banner is absent", async () => {
    installSpecDom([]);
    const { renderClearBanner } = await import("../../app/ui");
    expect(() => renderClearBanner()).not.toThrow();
  });

  // Test 5 — showSpotToast is safe when #toast absent
  it("Test 5: showSpotToast does not throw when #toast is absent", async () => {
    installSpecDom([]);
    const { showSpotToast } = await import("../../app/ui");
    expect(() => showSpotToast("123 Main St")).not.toThrow();
  });

  // Test 6 — renderSignCards sorts by severity: high first, then medium, then low
  it("Test 6: renderSignCards renders CONSTRUCTION before MOVING before DELIVERY by data-sign-id order", async () => {
    const els = installSpecDom(["sign-list"]);
    const signList = els["sign-list"];

    const signA = makeSpecSign({ id: "sign-A", reason: "DELIVERY" });   // low
    const signB = makeSpecSign({ id: "sign-B", reason: "CONSTRUCTION" }); // high
    const signC = makeSpecSign({ id: "sign-C", reason: "MOVING" });     // medium

    const { renderSignCards } = await import("../../app/ui");
    renderSignCards([signA, signB, signC], NOW_STABLE);

    // Serialize children order by data-sign-id
    const serialized = serializeIds(signList);
    const posB = serialized.indexOf("sign-B");
    const posC = serialized.indexOf("sign-C");
    const posA = serialized.indexOf("sign-A");

    expect(posB).toBeGreaterThan(-1);
    expect(posC).toBeGreaterThan(-1);
    expect(posA).toBeGreaterThan(-1);
    expect(posB).toBeLessThan(posC);
    expect(posC).toBeLessThan(posA);
  });

  // Test 7 — showStaleBanner is safe when #stale-banner absent
  it("Test 7: showStaleBanner does not throw when #stale-banner is absent", async () => {
    installSpecDom([]);
    const { showStaleBanner } = await import("../../app/ui");
    expect(() => showStaleBanner(3)).not.toThrow();
  });

  // Test 8 — renderWarningBanner is safe when #warning-banner absent
  it("Test 8: renderWarningBanner does not throw when #warning-banner is absent", async () => {
    installSpecDom([]);
    const { renderWarningBanner } = await import("../../app/ui");
    expect(() => renderWarningBanner([], NOW_STABLE)).not.toThrow();
  });
});

// ─── F-52 Bottom Sheet Shell ──────────────────────────────────────────────────

describe("F-52 Bottom Sheet Shell", () => {
  // Minimal element with real classList state tracking.
  // Avoids complex recursive self-referential types by keeping child/parent as any.
  function makeSheetEl(id: string): {
    id: string;
    innerHTML: string;
    _classes: Set<string>;
    classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean };
    children: unknown[];
    style: Record<string, string>;
    dataset: Record<string, string>;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    appendChild(child: unknown): unknown;
    removeChild(child: unknown): void;
    remove(): void;
    querySelector(sel: string): unknown;
    querySelectorAll(sel: string): unknown[];
    contains(el: unknown): boolean;
    closest(sel: string): unknown;
    addEventListener(ev: string, h: () => void): void;
    removeEventListener(ev: string, h: () => void): void;
    textContent: string;
    hidden: boolean;
    disabled: boolean;
    className: string;
  } {
    const classes = new Set<string>();
    return {
      id,
      innerHTML: "",
      _classes: classes,
      classList: {
        add(c: string): void { classes.add(c); },
        remove(c: string): void { classes.delete(c); },
        contains(c: string): boolean { return classes.has(c); },
      },
      children: [],
      style: {},
      dataset: {},
      get className(): string { return [...classes].join(" "); },
      set className(_v: string) { /* ignore */ },
      textContent: "",
      hidden: false,
      disabled: false,
      getAttribute(_name: string): string | null { return null; },
      setAttribute(_name: string, _value: string): void {},
      appendChild(child: unknown): unknown { return child; },
      removeChild(_child: unknown): void {},
      remove(): void {},
      querySelector(_sel: string): unknown { return null; },
      querySelectorAll(_sel: string): unknown[] { return []; },
      contains(_el: unknown): boolean { return false; },
      closest(_sel: string): unknown { return null; },
      addEventListener(_ev: string, _h: () => void): void {},
      removeEventListener(_ev: string, _h: () => void): void {},
    };
  }

  type SheetEl = ReturnType<typeof makeSheetEl>;

  function installBottomSheetDom(): { sheetEl: SheetEl; contentEl: SheetEl; closeEl: SheetEl } {
    const sheetEl = makeSheetEl("bottom-sheet");
    sheetEl._classes.add("bottom-sheet");

    const contentEl = makeSheetEl("bottom-sheet-content");
    const closeEl = makeSheetEl("bottom-sheet-close");

    const bodyEl = makeSheetEl("body");

    const elMap: Record<string, SheetEl> = {
      "bottom-sheet": sheetEl,
      "bottom-sheet-content": contentEl,
      "bottom-sheet-close": closeEl,
      "sign-list": makeSheetEl("sign-list"),
      "banner": makeSheetEl("banner"),
      "here-btn": makeSheetEl("here-btn"),
      "clear-btn": makeSheetEl("clear-btn"),
    };

    (globalThis as Record<string, unknown>)["document"] = {
      body: bodyEl,
      getElementById: (id: string): SheetEl | null => elMap[id] ?? null,
      createElement: (tag: string): SheetEl => makeSheetEl(tag),
      querySelector: (): null => null,
      querySelectorAll: (): unknown[] => [],
    };

    return { sheetEl, contentEl, closeEl };
  }

  function installNullDom(): void {
    const bodyEl = makeSheetEl("body");
    (globalThis as Record<string, unknown>)["document"] = {
      body: bodyEl,
      getElementById: (_id: string): null => null,
      createElement: (tag: string): SheetEl => makeSheetEl(tag),
      querySelector: (): null => null,
      querySelectorAll: (): unknown[] => [],
    };
  }

  beforeEach(() => {
    vi.resetModules();
  });

  // Given the page has loaded and no function has been called
  // When the DOM is inspected
  // Then #bottom-sheet does NOT have the class .bottom-sheet--open.
  it("F-52: #bottom-sheet does NOT have .bottom-sheet--open by default", () => {
    const { sheetEl } = installBottomSheetDom();
    expect(sheetEl.classList.contains("bottom-sheet--open")).toBe(false);
  });

  // Given showBottomSheet is called
  // When the DOM exists
  // Then #bottom-sheet receives .bottom-sheet--open.
  it("F-52: showBottomSheet adds .bottom-sheet--open to #bottom-sheet", async () => {
    const { sheetEl } = installBottomSheetDom();
    const { showBottomSheet } = await import("../../app/ui");
    showBottomSheet();
    expect(sheetEl.classList.contains("bottom-sheet--open")).toBe(true);
  });

  // Given hideBottomSheet is called
  // When the DOM exists
  // Then #bottom-sheet does not have .bottom-sheet--open.
  it("F-52: hideBottomSheet removes .bottom-sheet--open from #bottom-sheet", async () => {
    const { sheetEl } = installBottomSheetDom();
    const { showBottomSheet, hideBottomSheet } = await import("../../app/ui");
    showBottomSheet();
    expect(sheetEl.classList.contains("bottom-sheet--open")).toBe(true);
    hideBottomSheet();
    expect(sheetEl.classList.contains("bottom-sheet--open")).toBe(false);
  });

  // Given setBottomSheetContent is called with "<p>hello</p>"
  // When the DOM exists
  // Then #bottom-sheet-content innerHTML equals "<p>hello</p>".
  it("F-52: setBottomSheetContent sets innerHTML of #bottom-sheet-content", async () => {
    const { contentEl } = installBottomSheetDom();
    const { setBottomSheetContent } = await import("../../app/ui");
    setBottomSheetContent("<p>hello</p>");
    expect(contentEl.innerHTML).toBe("<p>hello</p>");
  });

  // Given setBottomSheetMode("check") is called
  // Then #bottom-sheet has class .bottom-sheet--check and does not have .bottom-sheet--rules.
  it("F-52: setBottomSheetMode('check') adds .bottom-sheet--check and removes .bottom-sheet--rules", async () => {
    const { sheetEl } = installBottomSheetDom();
    const { setBottomSheetMode } = await import("../../app/ui");
    setBottomSheetMode("check");
    expect(sheetEl.classList.contains("bottom-sheet--check")).toBe(true);
    expect(sheetEl.classList.contains("bottom-sheet--rules")).toBe(false);
  });

  // Given setBottomSheetMode("current") is called
  // Then #bottom-sheet has class .bottom-sheet--rules and does not have .bottom-sheet--check.
  // Note: the function uses an else branch (not else-if), so "current" still applies the --rules CSS class.
  it("F-52: setBottomSheetMode('current') adds .bottom-sheet--rules and removes .bottom-sheet--check", async () => {
    const { sheetEl } = installBottomSheetDom();
    const { setBottomSheetMode } = await import("../../app/ui");
    setBottomSheetMode("check");
    setBottomSheetMode("current");
    expect(sheetEl.classList.contains("bottom-sheet--rules")).toBe(true);
    expect(sheetEl.classList.contains("bottom-sheet--check")).toBe(false);
  });

  // Additional: toggling between modes leaves no residue
  it("F-52: setBottomSheetMode toggles between check and current without residue", async () => {
    const { sheetEl } = installBottomSheetDom();
    const { setBottomSheetMode } = await import("../../app/ui");
    setBottomSheetMode("current");
    setBottomSheetMode("check");
    expect(sheetEl.classList.contains("bottom-sheet--check")).toBe(true);
    expect(sheetEl.classList.contains("bottom-sheet--rules")).toBe(false);
  });

  // Safety tests — functions must not throw when elements are absent
  it("F-52: showBottomSheet does not throw when #bottom-sheet is absent", async () => {
    installNullDom();
    const { showBottomSheet } = await import("../../app/ui");
    expect(() => showBottomSheet()).not.toThrow();
  });

  it("F-52: hideBottomSheet does not throw when #bottom-sheet is absent", async () => {
    installNullDom();
    const { hideBottomSheet } = await import("../../app/ui");
    expect(() => hideBottomSheet()).not.toThrow();
  });

  it("F-52: setBottomSheetContent does not throw when #bottom-sheet-content is absent", async () => {
    installNullDom();
    const { setBottomSheetContent } = await import("../../app/ui");
    expect(() => setBottomSheetContent("<p>hello</p>")).not.toThrow();
  });

  it("F-52: setBottomSheetMode does not throw when #bottom-sheet is absent", async () => {
    installNullDom();
    const { setBottomSheetMode } = await import("../../app/ui");
    expect(() => setBottomSheetMode("check")).not.toThrow();
    expect(() => setBottomSheetMode("current")).not.toThrow();
  });
});
