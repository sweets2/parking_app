import { describe, it, expect } from "vitest";
import { parseCleaningHtml } from "../../fetcher/fetch-street-cleaning";
import type { StreetCleaningEntry } from "../../shared/types";

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
      expect(adams.schedule).toBe("Monday  11 am – 12 pm");
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
