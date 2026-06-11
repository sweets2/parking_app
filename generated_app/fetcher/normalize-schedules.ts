import * as fs from "fs/promises";
import * as path from "path";
import type { StreetCleaningData } from "../shared/types";
import { normalizeSchedule } from "./fetch-street-cleaning";

const DATA_FILE = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../data/street-cleaning.json"
);

const raw = await fs.readFile(DATA_FILE, "utf-8");
const data = JSON.parse(raw) as StreetCleaningData;

let changed = 0;
for (const entry of data.entries) {
  const normalized = normalizeSchedule(entry.schedule);
  if (normalized !== entry.schedule) {
    entry.schedule = normalized;
    changed++;
  }
}

await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
console.log(`normalize-schedules: updated ${changed} of ${data.entries.length} entries`);
