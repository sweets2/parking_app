/**
 * fetcher/build-street-parity.ts
 *
 * Build-time script that produces data/street-parity.json —
 * a Record<string, 1 | -1> mapping each Hoboken street name (normalized)
 * to which perpendicular direction holds odd-numbered addresses.
 *
 * Algorithm:
 * 1. Read data/road-geometry.json for centerline geometry.
 * 2. Query Overpass API for all address nodes in Hoboken's bounding box.
 * 3. For each node, find the nearest road segment, compute the perpendicular
 *    dot product, and vote: odd house number + dot > 0 → vote +1;
 *    odd + dot < 0 → vote −1; even flips sign.
 * 4. Emit parity (1 | -1) only for streets with ≥ 3 net votes.
 * 5. Write data/street-parity.json.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { RoadGeometry } from "../shared/types";

const DATA_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../data"
);

// ─── Overpass response types ──────────────────────────────────────────────────

interface OverpassAddressNode {
  type: string;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassAddressNode[];
}

// ─── ORDINAL_TO_NUMERIC — verbatim copy from app/map.ts ──────────────────────

const ORDINAL_TO_NUMERIC: Record<string, string> = {
  FIRST: "1ST", SECOND: "2ND", THIRD: "3RD", FOURTH: "4TH",
  FIFTH: "5TH", SIXTH: "6TH", SEVENTH: "7TH", EIGHTH: "8TH",
  NINTH: "9TH", TENTH: "10TH", ELEVENTH: "11TH", TWELFTH: "12TH",
  THIRTEENTH: "13TH", FOURTEENTH: "14TH", FIFTEENTH: "15TH", SIXTEENTH: "16TH",
};

/**
 * Normalize an OSM addr:street value to the same key space used by
 * normalizeToGeometryKey in app/map.ts.
 *
 * IMPORTANT: This must be a verbatim copy of that function's transforms.
 * Do NOT add directional replacements (NORTH→N etc.) — map.ts does not have them.
 */
export function normalizeStreet(s: string): string {
  return s
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bTERRACE\b/g, "TER")
    .replace(
      /\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|THIRTEENTH|FOURTEENTH|FIFTEENTH|SIXTEENTH)\b/g,
      (m) => ORDINAL_TO_NUMERIC[m] ?? m
    )
    .trim();
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Given a set of ways for a street, find the nearest road segment to the
 * given point. Returns the perpendicular direction (dot product sign) of the
 * point relative to that segment's left-perpendicular.
 *
 * Returns 0 if no segment is found or the distance is too large (> 50 m).
 */
function computeDotForPoint(
  ways: [number, number][][],
  pointLat: number,
  pointLng: number
): number {
  const cosLat = Math.cos(pointLat * Math.PI / 180);
  let bestDist = Infinity;
  let bestDot = 0;

  for (const way of ways) {
    for (let si = 0; si < way.length - 1; si++) {
      const A = way[si];
      const B = way[si + 1];
      if (A === undefined || B === undefined) continue;

      const ax = (A[0] - pointLat) * 111320;
      const ay = (A[1] - pointLng) * 111320 * cosLat;
      const bx = (B[0] - pointLat) * 111320;
      const by = (B[1] - pointLng) * 111320 * cosLat;
      const abx = bx - ax;
      const aby = by - ay;
      const ab2 = abx * abx + aby * aby;
      if (ab2 === 0) continue;

      const t = Math.max(0, Math.min(1, -(ax * abx + ay * aby) / ab2));
      const px = ax + t * abx;
      const py = ay + t * aby;
      const d = Math.sqrt(px * px + py * py);

      if (d < bestDist) {
        bestDist = d;
        // Road direction vector
        const dY = B[0] - A[0];
        const dX = (B[1] - A[1]) * cosLat;
        const len = Math.sqrt(dY * dY + dX * dX);
        if (len === 0) continue;
        // Right-perpendicular unit vector (90° CW from road dir)
        // Matches the convention in offsetPolylinePoints: dir=1 → right-perp
        const perpX = dY / len;
        const perpY = -dX / len;
        // Sign displacement from projected point
        const projLat = A[0] + t * (B[0] - A[0]);
        const projLng = A[1] + t * (B[1] - A[1]);
        const signDY = (pointLat - projLat) * 111320;
        const signDX = (pointLng - projLng) * 111320 * cosLat;
        bestDot = signDX * perpX + signDY * perpY;
      }
    }
  }

  // Ignore nodes more than 50 m from the nearest road segment
  if (bestDist > 50) return 0;
  return bestDot;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runBuildStreetParity(): Promise<void> {
  // Step 1: Load road geometry
  const geoPath = path.join(DATA_DIR, "road-geometry.json");
  const geoRaw = await fs.readFile(geoPath, "utf-8");
  const roadGeometry = JSON.parse(geoRaw) as RoadGeometry;

  // Step 2: Query Overpass for address nodes in Hoboken bounding box
  const overpassQuery = `[out:json][timeout:60];
node["addr:housenumber"]["addr:street"](40.728,-74.060,40.760,-74.022);
out body;`;

  const url = "https://overpass-api.de/api/interpreter";
  console.log("Fetching address nodes from Overpass API...");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "hoboken-parking-app/1.0 (build-time street-parity)",
    },
    body: `data=${encodeURIComponent(overpassQuery)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as OverpassResponse;
  console.log(`Received ${data.elements.length} address nodes.`);

  // Step 3: Vote for each street
  // netVotes[street] = sum of votes (positive = dir 1, negative = dir -1)
  const netVotes: Record<string, number> = {};

  for (const node of data.elements) {
    if (node.type !== "node") continue;
    const tags = node.tags;
    if (tags === undefined) continue;

    const rawStreet = tags["addr:street"];
    const rawHouseNum = tags["addr:housenumber"];
    if (rawStreet === undefined || rawHouseNum === undefined) continue;

    const streetKey = normalizeStreet(rawStreet);

    // Parse the house number (take just the leading integer)
    const houseNumMatch = rawHouseNum.match(/^(\d+)/);
    if (houseNumMatch === null) continue;
    const houseNum = parseInt(houseNumMatch[1], 10);
    if (isNaN(houseNum)) continue;

    // Find road geometry for this street
    const ways = roadGeometry[streetKey];
    if (ways === undefined || ways.length === 0) continue;

    const dot = computeDotForPoint(ways, node.lat, node.lon);
    if (dot === 0) continue;

    const isOdd = houseNum % 2 === 1;
    // If odd address and dot > 0 → vote +1 (odd side is left-perp = dir 1)
    // If odd address and dot < 0 → vote -1
    // Even address flips the sign
    const vote = isOdd ? (dot > 0 ? 1 : -1) : (dot > 0 ? -1 : 1);

    if (netVotes[streetKey] === undefined) {
      netVotes[streetKey] = 0;
    }
    netVotes[streetKey] += vote;
  }

  // Step 4: Emit parity only for streets with ≥ 3 net votes
  const parity: Record<string, 1 | -1> = {};
  for (const [street, votes] of Object.entries(netVotes)) {
    if (Math.abs(votes) >= 3) {
      parity[street] = votes > 0 ? 1 : -1;
    }
  }

  // Step 5: Write output
  const outPath = path.join(DATA_DIR, "street-parity.json");
  await fs.writeFile(outPath, JSON.stringify(parity, null, 2), "utf-8");

  console.log(`Wrote parity for ${Object.keys(parity).length} streets to ${outPath}`);
}

// ─── Run guard ────────────────────────────────────────────────────────────────

const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("build-street-parity.ts") ||
    process.argv[1].endsWith("build-street-parity.js"));

if (isMain) {
  runBuildStreetParity().catch((err: unknown) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
