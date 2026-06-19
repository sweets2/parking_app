import * as nodePath from "path";
import * as nodeFs from "fs";
import { parse } from "node-html-parser";
import type { StreetCleaningEntry, StreetCleaningData, StreetCleaningEntryOverride } from "../shared/types";
import type { FsBackend } from "./fetch";

const SOURCE_URL =
  "https://www.hobokennj.gov/resources/street-cleaning-schedule";

// Resolve data directory relative to this file at runtime
const DATA_DIR = nodePath.resolve(
  nodePath.dirname(new URL(import.meta.url).pathname),
  "../data"
);

/**
 * Normalizes raw scraped schedule text into the canonical display format:
 * "Monday through Friday   8 am – 9 am"
 *
 * Rules:
 * - Replaces dash-separated day ranges with "through" (e.g. "Monday-Friday" → "Monday through Friday")
 * - Strips trailing dash/separator between day part and time part (e.g. "Monday - 11 am" → "Monday   11 am")
 * - Inserts a triple-space separator between the day/range part and the time part
 * - Normalizes "AM"/"PM" to lowercase "am"/"pm"
 * - Replaces "X to Y" with "X – Y" (en dash) in time ranges
 * - Normalizes "12 noon" to "12 pm"
 * - Ensures space between digit and am/pm (e.g. "8am" → "8 am")
 */
export function normalizeSchedule(raw: string): string {
  // Replace dash-separated day ranges (e.g. "Monday-Friday") with "through"
  let s = raw.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*-\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, "$1 through $2");

  // Find where the time part starts (first digit)
  const timeStart = s.search(/\d/);
  if (timeStart === -1) {
    return s;
  }

  // Day part: everything before the first digit, strip trailing dashes/spaces/separators
  const daysPart = s.slice(0, timeStart).replace(/[\s\-–—]+$/, "").trimEnd();
  let timePart = s.slice(timeStart).trim();

  // Ensure space between digit and am/pm (e.g. "8am" → "8 am")
  timePart = timePart.replace(/(\d)(am|pm)\b/gi, "$1 $2");

  // Normalize "12 noon" to "12 pm"
  timePart = timePart.replace(/\b12\s*noon\b/gi, "12 pm");

  // Replace "X to Y" with "X – Y" (en dash) in time ranges
  timePart = timePart.replace(/\s+to\s+/gi, " – ");

  // Normalize AM/PM to lowercase
  timePart = timePart.replace(/\bAM\b/g, "am").replace(/\bPM\b/g, "pm");

  return `${daysPart}   ${timePart}`;
}

/**
 * Parses the raw HTML of the Hoboken street cleaning schedule page and returns
 * an array of StreetCleaningEntry objects.
 *
 * Uses div.w-dyn-item selector. Filters out the header row (street === "Street").
 * Skips any div.table_wrapper with class w-condition-invisible (hidden mobile duplicate).
 */
export function parseCleaningHtml(html: string): StreetCleaningEntry[] {
  if (html.trim() === "") {
    return [];
  }

  const root = parse(html);
  const items = root.querySelectorAll("div.w-dyn-item");
  const entries: StreetCleaningEntry[] = [];

  for (const item of items) {
    // Find the visible table_wrapper (not the hidden mobile duplicate)
    const wrappers = item.querySelectorAll("div.table_wrapper");
    let visibleWrapper = null;

    if (wrappers.length === 0) {
      // No table_wrapper — try to get cells directly from item
      const cells = item.querySelectorAll("div.table-content");
      if (cells.length >= 4) {
        const street = (cells[0]?.innerText ?? "").trim();
        if (street === "Street") continue;
        const side = (cells[1]?.innerText ?? "").trim();
        const rawSchedule = (cells[2]?.innerText ?? "").trim();
        const schedule = normalizeSchedule(rawSchedule);
        const location = (cells[3]?.innerText ?? "").trim();
        if (street === "" || side === "" || location === "") continue;
        entries.push({ street, side, schedule, location });
      }
      continue;
    }

    for (const wrapper of wrappers) {
      const classAttr = wrapper.getAttribute("class") ?? "";
      const classes = classAttr.split(/\s+/);
      if (classes.includes("w-condition-invisible")) {
        continue;
      }
      visibleWrapper = wrapper;
      break;
    }

    if (visibleWrapper === null) {
      continue;
    }

    const cells = visibleWrapper.querySelectorAll("div.table-content");
    if (cells.length < 4) {
      continue;
    }

    const street = (cells[0]?.innerText ?? "").trim();

    // Filter out the header row
    if (street === "Street") {
      continue;
    }

    const side = (cells[1]?.innerText ?? "").trim();
    const rawSchedule = (cells[2]?.innerText ?? "").trim();
    const schedule = normalizeSchedule(rawSchedule);
    const location = (cells[3]?.innerText ?? "").trim();

    // Only include rows where all fields are non-empty
    if (street === "" || side === "" || location === "") {
      continue;
    }

    entries.push({ street, side, schedule, location });
  }

  return entries;
}

/**
 * Canonicalizes text for fuzzy matching. Handles spelled-out ordinals vs. numerics,
 * missing periods, and "Street" vs. "St.".
 */
function normalizeOverrideText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bstreet\b/g, "st")
    .replace(/\beleventh\b/g, "11th")
    .replace(/\btwelfth\b/g, "12th")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pure function — no logging, no I/O. Returns patched entries and log lines for the caller.
 */
export function applyStreetCleaningOverrides(
  entries: StreetCleaningEntry[],
  overrides: readonly StreetCleaningEntryOverride[]
): { entries: StreetCleaningEntry[]; applied: string[] } {
  const applied: string[] = [];
  const patched: StreetCleaningEntry[] = [];

  for (const entry of entries) {
    const normStreet = normalizeOverrideText(entry.street);
    const normSide = normalizeOverrideText(entry.side);
    const normLocation = normalizeOverrideText(entry.location);

    const matches = overrides.filter(
      (ov) =>
        normalizeOverrideText(ov.match.street) === normStreet &&
        normalizeOverrideText(ov.match.side) === normSide &&
        normalizeOverrideText(ov.match.location) === normLocation
    );

    if (matches.length === 0) {
      patched.push(entry);
    } else if (matches.length >= 2) {
      throw new Error(
        `Multiple overrides match ${entry.street} ${entry.side} "${entry.location}" - please remove the duplicate`
      );
    } else {
      const ov = matches[0];
      const oldLocation = entry.location;
      const updated: StreetCleaningEntry = { ...entry, ...ov.replace };
      patched.push(updated);
      const newLocation = updated.location;
      applied.push(
        `[street-cleaning override] ${entry.street} ${entry.side}: "${oldLocation}" -> "${newLocation}"`
      );
    }
  }

  return { entries: patched, applied };
}

/**
 * Reads and validates data/street-cleaning-overrides.json.
 * Returns [] if the file does not exist.
 * Throws if the file contains invalid JSON or if the parsed value is not an array.
 */
function loadStreetCleaningOverrides(
  fs: FsBackend,
  dataDir: string
): StreetCleaningEntryOverride[] {
  const p = nodePath.join(dataDir, "street-cleaning-overrides.json");
  if (!fs.existsSync(p)) return [];
  const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("street-cleaning-overrides.json must contain an array");
  }
  return parsed as StreetCleaningEntryOverride[];
}

const realFs: FsBackend = {
  writeFileSync: (p, data) => nodeFs.writeFileSync(p, data, "utf8"),
  existsSync: (p) => nodeFs.existsSync(p),
  readFileSync: (p, encoding) => nodeFs.readFileSync(p, encoding),
  mkdirSync: (p, options) => { nodeFs.mkdirSync(p, options); },
};

/**
 * Fetches https://www.hobokennj.gov/resources/street-cleaning-schedule,
 * calls parseCleaningHtml on the response text,
 * and writes the resulting array to data/street-cleaning.json as JSON.
 *
 * Accepts an optional FsBackend for testability (defaults to real fs).
 */
export async function runScraper(fs: FsBackend = realFs): Promise<void> {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${SOURCE_URL}`);
  }
  const html = await response.text();

  const entries = parseCleaningHtml(html);
  const overrides = loadStreetCleaningOverrides(fs, DATA_DIR);
  const { entries: patched, applied } = applyStreetCleaningOverrides(entries, overrides);
  for (const line of applied) console.log(line);

  const output: StreetCleaningData = {
    fetched_at: new Date().toISOString(),
    entries: patched,
  };

  const json = JSON.stringify(output, null, 2);

  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const outPath = nodePath.join(DATA_DIR, "street-cleaning.json");
  fs.writeFileSync(outPath, json);

  console.log(`Wrote ${entries.length} entries to ${outPath}`);
}

// Run if this is the entry point (when executed directly via tsx)
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("fetch-street-cleaning.ts") ||
    process.argv[1].endsWith("fetch-street-cleaning.js"));

if (isMain) {
  runScraper().catch((err: unknown) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
