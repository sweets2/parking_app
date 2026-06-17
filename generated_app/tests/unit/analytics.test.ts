/**
 * tests/unit/analytics.test.ts — CF-14
 *
 * Tests for the analytics track() wrapper.
 * Runs in Node (environment: "node"). Tests simulate window presence/absence
 * via globalThis["window"] assignment.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { track } from "../../app/analytics";

describe("analytics track()", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)["window"];
  });

  it("GIVEN a Node environment where window is not defined, WHEN track('pageview') is called, THEN it does not throw", () => {
    // Default Node environment — no window on globalThis
    delete (globalThis as Record<string, unknown>)["window"];
    expect(() => track("pageview")).not.toThrow();
  });

  it("GIVEN a global window.umami.track spy is installed, WHEN track('click', { button: 'locate' }) is called, THEN window.umami.track is called with 'click' and { button: 'locate' }", () => {
    const spy = vi.fn();
    (globalThis as Record<string, unknown>)["window"] = { umami: { track: spy } };
    track("click", { button: "locate" });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("click", { button: "locate" });
  });

  it("GIVEN window exists but window.umami is undefined, WHEN track('pageview') is called, THEN it does not throw", () => {
    (globalThis as Record<string, unknown>)["window"] = {};
    expect(() => track("pageview")).not.toThrow();
  });
});
