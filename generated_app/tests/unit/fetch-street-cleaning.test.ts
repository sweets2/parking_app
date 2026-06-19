import { describe, it, expect } from "vitest";
import { parseCleaningHtml, applyStreetCleaningOverrides } from "../../fetcher/fetch-street-cleaning";
import type { StreetCleaningEntry, StreetCleaningEntryOverride } from "../../shared/types";

// ---------------------------------------------------------------------------
// Helpers: build minimal HTML fixture
// ---------------------------------------------------------------------------

function makeRow(
  street: string,
  side: string,
  schedule: string,
  location: string
): string {
  return `
    <div role="listitem" class="w-dyn-item">
      <div class="table_wrapper w-condition-invisible">
        <div class="table-content">HIDDEN</div>
        <div class="table-content">HIDDEN</div>
        <div class="table-content">HIDDEN</div>
        <div class="table-content">HIDDEN</div>
      </div>
      <div class="table_wrapper">
        <div class="table-content">${street}</div>
        <div class="table-content">${side}</div>
        <div class="table-content">${schedule}</div>
        <div class="table-content">${location}</div>
      </div>
    </div>
  `;
}

function makeHtml(rows: string[]): string {
  return `<html><body><div class="w-dyn-list">${rows.join("")}</div></body></html>`;
}

const HEADER_ROW = makeRow("Street", "Side", "Days &amp; Hours", "Location");
const ADAMS_ROW = makeRow(
  "Adams St.",
  "West",
  "Monday - 11 am to 12 noon",
  "Newark St. to Sixteenth St."
);
const WASH_ROW = makeRow("Washington Street", "East", "Tuesday - 8 am to 9 am", "Observer Hwy. to Seventh St.");

// ---------------------------------------------------------------------------
// Build a large fixture (>100 rows) for count tests
// ---------------------------------------------------------------------------

function makeLargeHtml(): string {
  const rows: string[] = [HEADER_ROW]; // header row that must be filtered out
  for (let i = 1; i <= 110; i++) {
    rows.push(
      makeRow(
        `Street ${i}`,
        "East",
        "Monday - 8 am to 9 am",
        `Block ${i}`
      )
    );
  }
  return makeHtml(rows);
}

const LARGE_HTML = makeLargeHtml();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseCleaningHtml", () => {
  it("every row produces an object with non-empty street, side, schedule, and location", () => {
    const html = makeHtml([HEADER_ROW, ADAMS_ROW, WASH_ROW]);
    const entries = parseCleaningHtml(html);
    // header row is filtered out, leaving 2 data rows
    expect(entries.length).toBe(2);
    for (const entry of entries) {
      expect(entry.street).toBeTruthy();
      expect(entry.side).toBeTruthy();
      expect(entry.schedule).toBeTruthy();
      expect(entry.location).toBeTruthy();
    }
  });

  it("entries contains more than 100 records when given a large page", () => {
    const entries = parseCleaningHtml(LARGE_HTML);
    expect(entries.length).toBeGreaterThan(100);
  });

  it("no entry has street === 'Street' (header row is filtered)", () => {
    const entries = parseCleaningHtml(LARGE_HTML);
    for (const entry of entries) {
      expect(entry.street).not.toBe("Street");
    }
  });

  it("parses Adams St. row with correct field values", () => {
    const html = makeHtml([HEADER_ROW, ADAMS_ROW]);
    const entries = parseCleaningHtml(html);
    const adams = entries.find((e: StreetCleaningEntry) => e.street === "Adams St.");
    expect(adams).toBeDefined();
    if (adams !== undefined) {
      expect(adams.side).toBe("West");
      expect(adams.schedule).toBe("Monday   11 am – 12 pm");
      expect(adams.location).toBe("Newark St. to Sixteenth St.");
    }
  });

  it("skips the w-condition-invisible wrapper and reads the visible one", () => {
    const html = makeHtml([ADAMS_ROW]);
    const entries = parseCleaningHtml(html);
    expect(entries.length).toBe(1);
    const entry = entries[0];
    if (entry !== undefined) {
      // if the hidden wrapper were read instead, we'd see "HIDDEN" in the fields
      expect(entry.street).not.toBe("HIDDEN");
      expect(entry.street).toBe("Adams St.");
    }
  });
});

// ---------------------------------------------------------------------------
// applyStreetCleaningOverrides tests
// ---------------------------------------------------------------------------

const MONROE_OVERRIDE_WEST: StreetCleaningEntryOverride = {
  match: {
    street: "Monroe St.",
    side: "West",
    location: "Eleventh St. to Newark St.",
  },
  replace: { location: "Twelfth St. to Newark St." },
  reason: "Posted signs show 12th St.",
};

const MONROE_OVERRIDE_EAST: StreetCleaningEntryOverride = {
  match: {
    street: "Monroe St.",
    side: "East",
    location: "Eleventh St. to Newark St.",
  },
  replace: { location: "Twelfth St. to Newark St." },
  reason: "Posted signs show 12th St.",
};

const ELEVENTH_NORTH_OVERRIDE: StreetCleaningEntryOverride = {
  match: {
    street: "Eleventh St.",
    side: "North",
    location: "Hudson St. to Willow Ave.",
  },
  replace: { location: "Sinatra Drive North to Willow Ave." },
  reason: "Road geometry shows 11th St. reaches Sinatra Drive North.",
};

const TWELFTH_NORTH_OVERRIDE: StreetCleaningEntryOverride = {
  match: {
    street: "Twelfth St.",
    side: "North",
    location: "Willow Ave. to Hudson St.",
  },
  replace: { location: "Willow Ave. to Sinatra Drive North" },
  reason: "Road geometry shows 12th St. reaches Sinatra Drive North.",
};

const FOURTEENTH_SOUTH_OVERRIDE: StreetCleaningEntryOverride = {
  match: {
    street: "Fourteenth St.",
    side: "South",
    location: "Willow Ave. to Hudson St.",
  },
  replace: { location: "Willow Ave. to Sinatra Drive North" },
  reason: "Observed ground rules show 14th St. south reaches Sinatra Drive North.",
};

describe("applyStreetCleaningOverrides", () => {
  it("Test 1 — Monroe West (spelled-out ordinal) override is applied", () => {
    const entry: StreetCleaningEntry = {
      street: "Monroe St.",
      side: "West",
      schedule: "Monday   1 pm - 2 pm",
      location: "Eleventh St. to Newark St.",
    };
    const { entries, applied } = applyStreetCleaningOverrides([entry], [MONROE_OVERRIDE_WEST]);
    expect(entries[0].location).toBe("Twelfth St. to Newark St.");
    expect(applied.length).toBe(1);
    expect(applied[0]).toContain("Twelfth St. to Newark St.");
  });

  it("Test 2 — Monroe East (spelled-out ordinal) override is applied", () => {
    const entry: StreetCleaningEntry = {
      street: "Monroe St.",
      side: "East",
      schedule: "Tuesday   1 pm - 2 pm",
      location: "Eleventh St. to Newark St.",
    };
    const { entries, applied } = applyStreetCleaningOverrides([entry], [MONROE_OVERRIDE_EAST]);
    expect(entries[0].location).toBe("Twelfth St. to Newark St.");
    expect(applied.length).toBe(1);
  });

  it("Test 3 — numeric variant '11th St.' triggers the same override", () => {
    const entry: StreetCleaningEntry = {
      street: "Monroe St.",
      side: "West",
      schedule: "Monday   1 pm - 2 pm",
      location: "11th St. to Newark St.",
    };
    // Override uses spelled-out "Eleventh St. to Newark St."
    const { entries } = applyStreetCleaningOverrides([entry], [MONROE_OVERRIDE_WEST]);
    expect(entries[0].location).toBe("Twelfth St. to Newark St.");
  });

  it("Test 4 — idempotent when data already has the correct location", () => {
    const entry: StreetCleaningEntry = {
      street: "Monroe St.",
      side: "West",
      schedule: "Monday   1 pm - 2 pm",
      location: "Twelfth St. to Newark St.",
    };
    // Override matches "Eleventh St.", not "Twelfth St." — should not apply
    const { entries, applied } = applyStreetCleaningOverrides([entry], [MONROE_OVERRIDE_WEST]);
    expect(applied.length).toBe(0);
    expect(entries.length).toBe(1);
    expect(entries[0].location).toBe("Twelfth St. to Newark St.");
  });

  it("Test 5 — non-Monroe entry with 'Eleventh St.' in location is untouched", () => {
    const entry: StreetCleaningEntry = {
      street: "Adams St.",
      side: "West",
      schedule: "Monday   11 am – 12 pm",
      location: "Eleventh St. to Newark St.",
    };
    // Monroe override won't match because street is "Adams St." not "Monroe St."
    const { entries, applied } = applyStreetCleaningOverrides([entry], [MONROE_OVERRIDE_WEST]);
    expect(applied.length).toBe(0);
    expect(entries[0].location).toBe("Eleventh St. to Newark St.");
  });

  it("Test 6 — duplicate overrides that both match the same entry throw", () => {
    const entry: StreetCleaningEntry = {
      street: "Monroe St.",
      side: "West",
      schedule: "Monday   1 pm - 2 pm",
      location: "Eleventh St. to Newark St.",
    };
    const dup: StreetCleaningEntryOverride = {
      ...MONROE_OVERRIDE_WEST,
      reason: "Duplicate override",
    };
    expect(() => applyStreetCleaningOverrides([entry], [MONROE_OVERRIDE_WEST, dup])).toThrow(
      /remove the duplicate/
    );
  });

  it("applies the Eleventh St north override through Sinatra Drive North", () => {
    const entry: StreetCleaningEntry = {
      street: "Eleventh St.",
      side: "North",
      schedule: "Tuesday   10 am – 11 am",
      location: "Hudson St. to Willow Ave.",
    };
    const { entries, applied } = applyStreetCleaningOverrides([entry], [ELEVENTH_NORTH_OVERRIDE]);
    expect(entries[0].location).toBe("Sinatra Drive North to Willow Ave.");
    expect(applied).toHaveLength(1);
  });

  it("applies the Twelfth St north override through Sinatra Drive North", () => {
    const entry: StreetCleaningEntry = {
      street: "Twelfth St.",
      side: "North",
      schedule: "Tuesday   10 am – 11 am",
      location: "Willow Ave. to Hudson St.",
    };
    const { entries, applied } = applyStreetCleaningOverrides([entry], [TWELFTH_NORTH_OVERRIDE]);
    expect(entries[0].location).toBe("Willow Ave. to Sinatra Drive North");
    expect(applied).toHaveLength(1);
  });

  it("applies the Fourteenth St south override through Sinatra Drive North", () => {
    const entry: StreetCleaningEntry = {
      street: "Fourteenth St.",
      side: "South",
      schedule: "Monday   8 am – 9 am",
      location: "Willow Ave. to Hudson St.",
    };
    const { entries, applied } = applyStreetCleaningOverrides([entry], [FOURTEENTH_SOUTH_OVERRIDE]);
    expect(entries[0].location).toBe("Willow Ave. to Sinatra Drive North");
    expect(applied).toHaveLength(1);
  });

  it("leaves the Fourteenth St north Hudson-to-Willow row unchanged", () => {
    const entry: StreetCleaningEntry = {
      street: "Fourteenth St.",
      side: "North",
      schedule: "Wednesday   8 am – 9 am",
      location: "Hudson St. to Willow Ave.",
    };
    const { entries, applied } = applyStreetCleaningOverrides([entry], [FOURTEENTH_SOUTH_OVERRIDE]);
    expect(entries[0].location).toBe("Hudson St. to Willow Ave.");
    expect(applied).toHaveLength(0);
  });
});
