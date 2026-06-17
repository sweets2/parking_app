/**
 * Unit tests for shared/query-parser.ts — F-47
 *
 * Tests createDurationCheckQuery and parseCheckQuery.
 * Uses NOW_STABLE from tests/fixtures/signs.ts for all time-sensitive assertions.
 * Never uses new Date() or inline date literals.
 */

import { describe, it, expect } from "vitest";
import { NOW_STABLE } from "../fixtures/signs";
import { parseCheckQuery, createDurationCheckQuery } from "../../shared/query-parser";

describe("createDurationCheckQuery", () => {
  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(30, now) is called, THEN startTime equals now", () => {
    const result = createDurationCheckQuery(30, NOW_STABLE);
    expect(result.startTime.getTime()).toBe(NOW_STABLE.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(30, now) is called, THEN endTime equals now + 30 minutes", () => {
    const result = createDurationCheckQuery(30, NOW_STABLE);
    const expected = new Date(NOW_STABLE.getTime() + 30 * 60 * 1000);
    expect(result.endTime.getTime()).toBe(expected.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(30, now) is called, THEN label is '30 min'", () => {
    const result = createDurationCheckQuery(30, NOW_STABLE);
    expect(result.label).toBe("30 min");
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(30, now) is called, THEN source is 'duration'", () => {
    const result = createDurationCheckQuery(30, NOW_STABLE);
    expect(result.source).toBe("duration");
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(60, now) is called, THEN startTime equals now", () => {
    const result = createDurationCheckQuery(60, NOW_STABLE);
    expect(result.startTime.getTime()).toBe(NOW_STABLE.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(60, now) is called, THEN endTime equals now + 60 minutes", () => {
    const result = createDurationCheckQuery(60, NOW_STABLE);
    const expected = new Date(NOW_STABLE.getTime() + 60 * 60 * 1000);
    expect(result.endTime.getTime()).toBe(expected.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(60, now) is called, THEN label is '1 hour'", () => {
    const result = createDurationCheckQuery(60, NOW_STABLE);
    expect(result.label).toBe("1 hour");
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(60, now) is called, THEN source is 'duration'", () => {
    const result = createDurationCheckQuery(60, NOW_STABLE);
    expect(result.source).toBe("duration");
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(120, now) is called, THEN startTime equals now", () => {
    const result = createDurationCheckQuery(120, NOW_STABLE);
    expect(result.startTime.getTime()).toBe(NOW_STABLE.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(120, now) is called, THEN endTime equals now + 120 minutes", () => {
    const result = createDurationCheckQuery(120, NOW_STABLE);
    const expected = new Date(NOW_STABLE.getTime() + 120 * 60 * 1000);
    expect(result.endTime.getTime()).toBe(expected.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(120, now) is called, THEN label is '2 hours'", () => {
    const result = createDurationCheckQuery(120, NOW_STABLE);
    expect(result.label).toBe("2 hours");
  });

  it("GIVEN now is NOW_STABLE, WHEN createDurationCheckQuery(120, now) is called, THEN source is 'duration'", () => {
    const result = createDurationCheckQuery(120, NOW_STABLE);
    expect(result.source).toBe("duration");
  });
});

describe("parseCheckQuery", () => {
  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('30 min', now) is called, THEN startTime equals now", () => {
    const result = parseCheckQuery("30 min", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.startTime.getTime()).toBe(NOW_STABLE.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('30 min', now) is called, THEN endTime equals now + 30 minutes", () => {
    const result = parseCheckQuery("30 min", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    const expected = new Date(NOW_STABLE.getTime() + 30 * 60 * 1000);
    expect(result.endTime.getTime()).toBe(expected.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('30 min', now) is called, THEN source is 'parser'", () => {
    const result = parseCheckQuery("30 min", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.source).toBe("parser");
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('1 hour', now) is called, THEN startTime equals now", () => {
    const result = parseCheckQuery("1 hour", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.startTime.getTime()).toBe(NOW_STABLE.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('1 hour', now) is called, THEN endTime equals now + 60 minutes", () => {
    const result = parseCheckQuery("1 hour", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    const expected = new Date(NOW_STABLE.getTime() + 60 * 60 * 1000);
    expect(result.endTime.getTime()).toBe(expected.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('1 hour', now) is called, THEN source is 'parser'", () => {
    const result = parseCheckQuery("1 hour", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.source).toBe("parser");
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('2 hours', now) is called, THEN startTime equals now", () => {
    const result = parseCheckQuery("2 hours", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.startTime.getTime()).toBe(NOW_STABLE.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('2 hours', now) is called, THEN endTime equals now + 120 minutes", () => {
    const result = parseCheckQuery("2 hours", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    const expected = new Date(NOW_STABLE.getTime() + 120 * 60 * 1000);
    expect(result.endTime.getTime()).toBe(expected.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('2 hours', now) is called, THEN source is 'parser'", () => {
    const result = parseCheckQuery("2 hours", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.source).toBe("parser");
  });

  it("GIVEN now is NOW_STABLE (12:00 PM ET = 16:00 UTC), WHEN parseCheckQuery('until 6pm', now) is called, THEN startTime equals now", () => {
    // NOW_STABLE = 2026-06-09T16:00:00Z = 12:00 PM ET
    // 6 PM ET = 22:00 UTC = 6 hours from 16:00 UTC
    const result = parseCheckQuery("until 6pm", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.startTime.getTime()).toBe(NOW_STABLE.getTime());
  });

  it("GIVEN now is NOW_STABLE (12:00 PM ET = 16:00 UTC), WHEN parseCheckQuery('until 6pm', now) is called, THEN endTime equals now + 360 minutes (6 PM Eastern Time)", () => {
    // NOW_STABLE = 2026-06-09T16:00:00Z = 12:00 PM ET
    // 6 PM ET = 22:00 UTC = 6 hours from 16:00 UTC
    const result = parseCheckQuery("until 6pm", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    const expected = new Date(NOW_STABLE.getTime() + 360 * 60 * 1000);
    expect(result.endTime.getTime()).toBe(expected.getTime());
  });

  it("GIVEN now is NOW_STABLE, WHEN parseCheckQuery('until 6pm', now) is called, THEN source is 'parser'", () => {
    const result = parseCheckQuery("until 6pm", NOW_STABLE);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.source).toBe("parser");
  });

  it("GIVEN text is unsupported, WHEN parseCheckQuery('banana', now) is called, THEN it returns null", () => {
    const result = parseCheckQuery("banana", NOW_STABLE);
    expect(result).toBeNull();
  });

  it("GIVEN empty text, WHEN parseCheckQuery('', now) is called, THEN it returns null", () => {
    const result = parseCheckQuery("", NOW_STABLE);
    expect(result).toBeNull();
  });

  it("GIVEN unrecognized time text, WHEN parseCheckQuery('tomorrow', now) is called, THEN it returns null", () => {
    const result = parseCheckQuery("tomorrow", NOW_STABLE);
    expect(result).toBeNull();
  });
});
