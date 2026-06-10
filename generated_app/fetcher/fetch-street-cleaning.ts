import * as fs from "fs/promises";
import * as path from "path";
import { parse } from "node-html-parser";
import type { StreetCleaningEntry, StreetCleaningData } from "../shared/types";

const SOURCE_URL =
  "https://www.hobokennj.gov/resources/street-cleaning-schedule";

// Resolve data directory relative to this file at runtime
const DATA_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../data"
);

/**
 * Parses the raw HTML of the Hoboken street cleaning schedule page and returns
 * an array of StreetCleaningEntry objects. Filters out the header row
 * (where street === "Street"). Skips any div.table_wrapper with class
 * w-condition-invisible (hidden mobile duplicate).
 */
export function parseCleaningHtml(html: string): StreetCleaningEntry[] {
  const root = parse(html);
  const items = root.querySelectorAll("div.w-dyn-item");
  const entries: StreetCleaningEntry[] = [];

  for (const item of items) {
    // Find the visible table_wrapper (not the hidden mobile duplicate)
    const wrappers = item.querySelectorAll("div.table_wrapper");
    let visibleWrapper = null;

    for (const wrapper of wrappers) {
      const classes = wrapper.classNames;
      if (!classes.includes("w-condition-invisible")) {
        visibleWrapper = wrapper;
        break;
      }
    }

    if (visibleWrapper === null) {
      continue;
    }

    const cells = visibleWrapper.querySelectorAll("div.table-content");
    if (cells.length < 4) {
      continue;
    }

    const street = (cells[0]?.innerText ?? "").trim();
    const side = (cells[1]?.innerText ?? "").trim();
    const schedule = (cells[2]?.innerText ?? "").trim();
    const location = (cells[3]?.innerText ?? "").trim();

    // Filter out the header row
    if (street === "Street") {
      continue;
    }

    // Only include rows where all fields are non-empty
    if (street === "" || side === "" || schedule === "" || location === "") {
      continue;
    }

    entries.push({ street, side, schedule, location });
  }

  return entries;
}

/** Main entry point — fetches the page and writes data/street-cleaning.json. */
export async function runScraper(): Promise<void> {
  let html: string;
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      console.error(`Fatal: HTTP ${response.status} fetching ${SOURCE_URL}`);
      process.exit(1);
    }
    html = await response.text();
  } catch (err) {
    console.error(`Fatal: Network error fetching ${SOURCE_URL}: ${String(err)}`);
    process.exit(1);
  }

  const entries = parseCleaningHtml(html);

  const output: StreetCleaningData = {
    fetched_at: new Date().toISOString(),
    entries,
  };

  const json = JSON.stringify(output, null, 2);

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const outPath = path.join(DATA_DIR, "street-cleaning.json");
  await fs.writeFile(outPath, json, "utf-8");

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
