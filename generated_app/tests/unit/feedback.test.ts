/**
 * tests/unit/feedback.test.ts — CF-14
 *
 * Unit tests for initFeedback().
 * Runs in Node (environment: "node") — no real DOM available.
 * Installs a fake document on globalThis in beforeEach and removes it in afterEach.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initFeedback } from "../../app/feedback";

// ─── Fake DOM element ─────────────────────────────────────────────────────────

interface FakeEl {
  id: string;
  hidden: boolean;
  _attrs: Record<string, string | undefined>;
  _listeners: Record<string, Array<(e: FakeEvent) => void>>;
  addEventListener(event: string, handler: (e: FakeEvent) => void): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
  value: string;
  textContent: string;
  disabled: boolean;
  className: string;
  classList: { _set: Set<string>; add(c: string): void; remove(c: string): void; contains(c: string): boolean };
  focus(): void;
}

interface FakeEvent {
  target: FakeEl | null;
  preventDefault(): void;
}

function makeEl(id: string, initialHidden = false): FakeEl {
  const el: FakeEl = {
    id,
    hidden: initialHidden,
    _attrs: initialHidden ? { hidden: "" } : {},
    _listeners: {},
    addEventListener(event: string, handler: (e: FakeEvent) => void) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
    },
    getAttribute(name: string): string | null {
      if (name === "hidden") return this.hidden ? "" : null;
      return this._attrs[name] ?? null;
    },
    setAttribute(name: string, value: string): void {
      this._attrs[name] = value;
      if (name === "hidden") this.hidden = true;
    },
    removeAttribute(name: string): void {
      delete this._attrs[name];
      if (name === "hidden") this.hidden = false;
    },
    hasAttribute(name: string): boolean {
      if (name === "hidden") return this.hidden;
      return name in this._attrs;
    },
    value: "",
    textContent: "",
    disabled: false,
    className: "",
    classList: {
      _set: new Set<string>(),
      add(c: string) { this._set.add(c); },
      remove(c: string) { this._set.delete(c); },
      contains(c: string) { return this._set.has(c); },
    },
    focus() {},
  };
  return el;
}

function fire(el: FakeEl, event: string, extraProps: Partial<FakeEvent> = {}): void {
  const handlers = el._listeners[event] ?? [];
  const evt: FakeEvent = { target: el, preventDefault() {}, ...extraProps };
  handlers.forEach((h) => h(evt));
}

// ─── Test state ────────────────────────────────────────────────────────────────

let elBtn: FakeEl;
let elOverlay: FakeEl;
let elCloseBtn: FakeEl;
let elConfirm: FakeEl;
let elForm: FakeEl;
let elTextarea: FakeEl;
let elSubmit: FakeEl;

function installDocument(elMap: Record<string, FakeEl>): void {
  (globalThis as Record<string, unknown>).document = {
    getElementById(id: string): FakeEl | null {
      return elMap[id] ?? null;
    },
  };
}

beforeEach(() => {
  elBtn = makeEl("feedback-btn");
  elOverlay = makeEl("feedback-overlay", true);
  elCloseBtn = makeEl("feedback-close-btn");
  elConfirm = makeEl("feedback-confirm", true);
  elTextarea = makeEl("feedback-text");
  elSubmit = makeEl("feedback-submit");
  elForm = makeEl("feedback-form");
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).fetch;
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CF-14 initFeedback", () => {
  it("GIVEN a DOM with no #feedback-btn or #feedback-overlay elements, WHEN initFeedback() is called, THEN it does not throw", () => {
    installDocument({});
    expect(() => initFeedback()).not.toThrow();
  });

  it("GIVEN a DOM with #feedback-btn and #feedback-overlay (hidden by default), WHEN click is dispatched on #feedback-btn, THEN #feedback-overlay is no longer hidden", () => {
    installDocument({ "feedback-btn": elBtn, "feedback-overlay": elOverlay });
    initFeedback();
    expect(elOverlay.hidden).toBe(true);
    fire(elBtn, "click");
    expect(elOverlay.hidden).toBe(false);
  });

  it("GIVEN a DOM with a visible #feedback-overlay, WHEN a click is dispatched directly on #feedback-overlay, THEN #feedback-overlay is hidden", () => {
    installDocument({ "feedback-btn": elBtn, "feedback-overlay": elOverlay });
    initFeedback();
    elOverlay.hidden = false;
    fire(elOverlay, "click", { target: elOverlay });
    expect(elOverlay.hidden).toBe(true);
  });

  it("GIVEN a DOM with #feedback-btn, #feedback-overlay, and a close button inside the modal, WHEN initFeedback() is called and the close button is clicked, THEN #feedback-overlay is hidden", () => {
    installDocument({
      "feedback-btn": elBtn,
      "feedback-overlay": elOverlay,
      "feedback-close-btn": elCloseBtn,
    });
    initFeedback();
    elOverlay.hidden = false;
    fire(elCloseBtn, "click");
    expect(elOverlay.hidden).toBe(true);
  });

  it("GIVEN a DOM with all elements, WHEN the form submit event is fired and submit succeeds, THEN #feedback-overlay is hidden and #feedback-confirm has hidden removed", async () => {
    elTextarea.value = "great app";
    installDocument({
      "feedback-btn": elBtn,
      "feedback-overlay": elOverlay,
      "feedback-close-btn": elCloseBtn,
      "feedback-confirm": elConfirm,
      "feedback-text": elTextarea,
      "feedback-submit": elSubmit,
      "feedback-form": elForm,
    });

    (globalThis as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    initFeedback();
    elOverlay.hidden = false;

    // Simulate form submission via the form's submit event (with preventDefault)
    fire(elForm, "submit");

    // Flush microtasks so fetch .then() runs
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(elOverlay.hidden).toBe(true);
    expect(elConfirm.hidden).toBe(false);
  });
});
