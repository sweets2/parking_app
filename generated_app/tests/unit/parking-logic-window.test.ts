import { describe, it, expect } from "vitest";
import {
  evaluateParkingWindow,
  getPrimaryConflict,
  getNextRestriction,
} from "../../shared/parking-logic";
import type {
  Sign,
  ParkingSegment,
  ParkingWindowConflict,
  StreetCleaningEntry,
  SnowRoute,
  CheckQuery,
} from "../../shared/types";

// Fixed reference point — 2026-06-09 noon ET (UTC-4) = 2026-06-09T16:00:00.000Z
// This is a Tuesday.
// NOTE: This file intentionally does NOT import from tests/fixtures/signs.ts
// because that module executes readFileSync("data/latest.json") at module scope,
// which crashes the test suite when data/latest.json is absent (CI / fresh checkout).
// The spec explicitly requires a local NOW_STABLE constant in this file.
const NOW_STABLE = new Date("2026-06-09T16:00:00.000Z");

// Helper: build a minimal Sign for inline tests
function makeSign(overrides: Partial<Sign>): Sign {
  return {
    id: "test",
    address: "test address",
    reason: "CONSTRUCTION",
    permit_number: "test",
    lat: 40.745,
    lng: -74.030,
    start_date: "1/1/2020",
    start_time: "00:00:00",
    stop_date: "12/31/2030",
    end_time: "07:00:00",
    start_iso: "2020-01-01T00:00:00",
    end_iso: "2030-12-31T07:00:00",
    active_at_fetch: true,
    ...overrides,
  };
}

// Helper to build a ParkingSegment
function makeSegment(overrides: Partial<ParkingSegment>): ParkingSegment {
  return {
    id: "seg-test",
    street: "Test St",
    location: "1st Ave to 2nd Ave",
    side: "East",
    cleaningEntries: [],
    towSigns: [],
    snowRoutes: [],
    ...overrides,
  };
}

function makeCleaningEntry(schedule: string): StreetCleaningEntry {
  return {
    street: "Test Street",
    side: "East",
    schedule,
    location: "1st Ave to 2nd Ave",
  };
}

function makeSnowRoute(): SnowRoute {
  return {
    street: "TEST ST",
    side: "Both",
    from: "1st Ave",
    to: "2nd Ave",
  };
}

function makeConflict(status: ParkingWindowConflict["status"]): ParkingWindowConflict {
  return { status, reason: "test", label: "test label" };
}

// Monday 2026-06-08 at 10:00 AM ET = 14:00 UTC
// NOW_STABLE is Tuesday 2026-06-09T16:00:00Z
// 26 hours before NOW_STABLE = 2026-06-08T14:00:00Z = Monday 10:00 AM ET
const PREV_MONDAY_10AM_ET_UTC = new Date(NOW_STABLE.getTime() - 26 * 60 * 60 * 1000);

// ─── evaluateParkingWindow tests ─────────────────────────────────────────────

describe("F-48 evaluateParkingWindow (window test file)", () => {
  // Test 1: safe — query [09:00 AM, 10:00 AM) does not overlap [10:00 AM, 12:00 PM)
  // End-exclusive: query ends exactly at restriction start → safe
  it("GIVEN cleaning interval 10am–12pm on Monday, WHEN query is 09:00–10:00 on that Monday, THEN status=safe and conflicts=[]", () => {
    // 09:00 ET = 13:00 UTC (1 hour before PREV_MONDAY_10AM_ET_UTC = 14:00 UTC)
    const queryStart = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() - 60 * 60 * 1000); // 13:00 UTC
    const queryEnd   = new Date(PREV_MONDAY_10AM_ET_UTC.getTime());                   // 14:00 UTC

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
    });
    const query: CheckQuery = {
      startTime: queryStart,
      endTime: queryEnd,
      label: "1h",
      source: "duration",
    };
    const result = evaluateParkingWindow(seg, query);
    expect(result.status).toBe("safe");
    expect(result.conflicts.length).toBe(0);
  });

  // Test 2: ticket — query [09:59, 10:01) overlaps [10:00, 12:00)
  it("GIVEN cleaning interval 10am–12pm on Monday, WHEN query is 09:59–10:01 on that Monday, THEN status=ticket and conflicts.length=1 and conflicts[0].status=ticket", () => {
    // 09:59 ET = 13:59 UTC, 10:01 ET = 14:01 UTC
    const queryStart = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() - 1 * 60 * 1000);  // 13:59 UTC
    const queryEnd   = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 1 * 60 * 1000);  // 14:01 UTC

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
    });
    const query: CheckQuery = {
      startTime: queryStart,
      endTime: queryEnd,
      label: "2m",
      source: "duration",
    };
    const result = evaluateParkingWindow(seg, query);
    expect(result.status).toBe("ticket");
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0]?.status).toBe("ticket");
  });

  // Test 3: safe — query [12:00, 13:00) does not overlap [10:00, 12:00) (end exclusive)
  it("GIVEN cleaning interval 10am–12pm on Monday, WHEN query is 12:00–13:00 on that Monday, THEN status=safe and conflicts=[] (end exclusive)", () => {
    // 12:00 ET = 16:00 UTC, 13:00 ET = 17:00 UTC
    const queryStart = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 2 * 60 * 60 * 1000); // 16:00 UTC
    const queryEnd   = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 3 * 60 * 60 * 1000); // 17:00 UTC

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
    });
    const query: CheckQuery = {
      startTime: queryStart,
      endTime: queryEnd,
      label: "1h",
      source: "duration",
    };
    const result = evaluateParkingWindow(seg, query);
    expect(result.status).toBe("safe");
    expect(result.conflicts.length).toBe(0);
  });

  // Test 4: tow wins over cleaning when both overlap the query
  it("GIVEN segment has tow sign active during query AND cleaning interval overlapping query, THEN status=tow and primaryConflict is defined and primaryConflict.status=tow", () => {
    const queryStart = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() - 1 * 60 * 1000);  // 13:59 UTC
    const queryEnd   = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 1 * 60 * 1000);  // 14:01 UTC

    // Tow sign covering the query window entirely
    const towSign = makeSign({
      id: "tow-window-test",
      start_iso: new Date(PREV_MONDAY_10AM_ET_UTC.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      end_iso:   new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    });

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
      towSigns: [towSign],
    });
    const query: CheckQuery = {
      startTime: queryStart,
      endTime: queryEnd,
      label: "2m",
      source: "duration",
    };
    const result = evaluateParkingWindow(seg, query);
    expect(result.status).toBe("tow");
    expect(result.primaryConflict).not.toBeUndefined();
    expect(result.primaryConflict?.status).toBe("tow");
  });

  // Test 5: cleaning conflict when segment has snow route AND cleaning interval both overlapping query (no tow sign)
  // Snow routes are not treated as active conflicts (no real-time declaration data); only cleaning is evaluated.
  it("GIVEN segment has snow route AND cleaning interval both overlapping query (no tow sign), THEN status=ticket and primaryConflict.status=ticket", () => {
    const queryStart = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() - 1 * 60 * 1000);
    const queryEnd   = new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 1 * 60 * 1000);

    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("Monday   10 am – 12 pm")],
      snowRoutes: [makeSnowRoute()],
    });
    const query: CheckQuery = {
      startTime: queryStart,
      endTime: queryEnd,
      label: "2m",
      source: "duration",
    };
    const result = evaluateParkingWindow(seg, query);
    expect(result.status).toBe("ticket");
    expect(result.primaryConflict).not.toBeUndefined();
    expect(result.primaryConflict?.status).toBe("ticket");
  });

  // Test 6: safe — segment with no restrictions
  it("GIVEN segment with no cleaningEntries, no towSigns, no snowRoutes, THEN status=safe and conflicts=[] and primaryConflict=undefined", () => {
    const seg = makeSegment({});
    const query: CheckQuery = {
      startTime: PREV_MONDAY_10AM_ET_UTC,
      endTime: new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 60 * 60 * 1000),
      label: "1h",
      source: "duration",
    };
    const result = evaluateParkingWindow(seg, query);
    expect(result.status).toBe("safe");
    expect(result.conflicts.length).toBe(0);
    expect(result.primaryConflict).toBeUndefined();
  });

  // Test 7: unknown — unparseable schedule string
  it("GIVEN segment with cleaningEntries with an unparseable schedule string, THEN status=unknown and conflicts.length=1 and conflicts[0].status=unknown", () => {
    const seg = makeSegment({
      cleaningEntries: [makeCleaningEntry("INVALID SCHEDULE STRING!!!")],
    });
    const query: CheckQuery = {
      startTime: PREV_MONDAY_10AM_ET_UTC,
      endTime: new Date(PREV_MONDAY_10AM_ET_UTC.getTime() + 60 * 60 * 1000),
      label: "1h",
      source: "duration",
    };
    const result = evaluateParkingWindow(seg, query);
    expect(result.status).toBe("unknown");
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0]?.status).toBe("unknown");
  });
});

// ─── getPrimaryConflict tests ─────────────────────────────────────────────────

describe("F-48 getPrimaryConflict (window test file)", () => {
  // Test 8: empty array → undefined
  it("GIVEN empty array, THEN returns undefined", () => {
    expect(getPrimaryConflict([])).toBeUndefined();
  });

  // Test 9: ["ticket", "tow", "limited"] → tow (highest priority)
  it("GIVEN conflicts of status ['ticket', 'tow', 'limited'], THEN returns the tow conflict", () => {
    const conflicts = [
      makeConflict("ticket"),
      makeConflict("tow"),
      makeConflict("limited"),
    ];
    const result = getPrimaryConflict(conflicts);
    expect(result).not.toBeUndefined();
    expect(result?.status).toBe("tow");
  });

  // Test 10: ["snow", "limited"] → snow
  it("GIVEN conflicts of status ['snow', 'limited'], THEN returns the snow conflict", () => {
    const conflicts = [
      makeConflict("snow"),
      makeConflict("limited"),
    ];
    const result = getPrimaryConflict(conflicts);
    expect(result).not.toBeUndefined();
    expect(result?.status).toBe("snow");
  });
});

// ─── getNextRestriction tests ─────────────────────────────────────────────────

describe("F-48 getNextRestriction (window test file)", () => {
  // Test 11: tow sign starting strictly after NOW_STABLE
  it("GIVEN segment with tow sign whose start_iso is strictly after NOW_STABLE, WHEN getNextRestriction(after=NOW_STABLE), THEN result is not undefined and result.startsAt equals tow sign start and result.status=tow", () => {
    const startMs = NOW_STABLE.getTime() + 60 * 60 * 1000; // 1 hour after NOW_STABLE
    const endMs   = startMs + 2 * 60 * 60 * 1000;

    const towSign = makeSign({
      id: "future-tow-window",
      start_iso: new Date(startMs).toISOString(),
      end_iso:   new Date(endMs).toISOString(),
    });
    const seg = makeSegment({ towSigns: [towSign] });
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).not.toBeUndefined();
    expect(result?.startsAt.getTime()).toBe(startMs);
    expect(result?.status).toBe("tow");
  });

  // Test 12: tow sign start_iso equals NOW_STABLE — after is exclusive, so returns undefined
  it("GIVEN tow sign start_iso equals NOW_STABLE (not strictly after), WHEN getNextRestriction(after=NOW_STABLE), THEN returns undefined (after is exclusive)", () => {
    const startMs = NOW_STABLE.getTime(); // exactly equals after
    const endMs   = startMs + 2 * 60 * 60 * 1000;

    const towSign = makeSign({
      id: "same-time-tow-window",
      start_iso: new Date(startMs).toISOString(),
      end_iso:   new Date(endMs).toISOString(),
    });
    const seg = makeSegment({ towSigns: [towSign] });
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).toBeUndefined();
  });

  // Test 13: no tow signs, no cleaning entries, no snow routes → undefined
  it("GIVEN segment with no tow signs, no cleaning entries, no snow routes, THEN getNextRestriction returns undefined", () => {
    const seg = makeSegment({});
    const result = getNextRestriction(seg, NOW_STABLE);
    expect(result).toBeUndefined();
  });
});
