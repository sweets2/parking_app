/**
 * fetcher/build-street-parity.ts
 *
 * Build-time script that produces data/street-parity.json —
 * a Record<string, 1 | -1> mapping each Hoboken street name (normalized)
 * to which perpendicular direction holds odd-numbered addresses.
 *
 * Also produces data/address-arc.json —
 * a Record<string, [number, number][]> mapping each street key to a
 * sorted array of [houseNum, arcM] entries, where arcM is cumulative
 * arc distance from the start of the flattened way path.
 *
 * Algorithm:
 * 1. Read data/road-geometry.json for centerline geometry.
 * 2. Query Overpass API for all address nodes in Hoboken's bounding box.
 * 3. For each node, find the nearest road segment, compute the perpendicular
 *    dot product, and vote: odd house number + dot > 0 → vote +1;
 *    odd + dot < 0 → vote −1; even flips sign.
 * 4. Emit parity (1 | -1) only for streets with ≥ 3 net votes.
 * 5. Write data/street-parity.json.
 * 6. Write data/address-arc.json.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { RoadGeometry, AddressArcIndex } from "../shared/types";

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
 * Concatenates all ways in order into one flat points array.
 * cumArc[i] = cumulative arc-length in metres from points[0] to points[i].
 * wayEnds[w] = index of the last point of way w in the flat array.
 * Uses flat-earth distance: 111320 m/degree lat, 111320 * cos(lat) m/degree lng.
 *
 * CRITICAL: This function must be IDENTICAL to flattenWaysToArcPath in app/map.ts.
 * Both copies must produce the same arcM for the same input — this is the contract
 * that makes build-time arcM values usable at runtime.
 */
function flattenWaysToArcPath(
  ways: [number, number][][]
): { points: [number, number][]; cumArc: number[]; wayEnds: number[] } {
  const points: [number, number][] = [];
  const cumArc: number[] = [];
  const wayEnds: number[] = [];

  let arc = 0;
  for (const way of ways) {
    for (let i = 0; i < way.length; i++) {
      const pt = way[i];
      if (pt === undefined) continue;
      points.push(pt);
      if (points.length === 1) {
        cumArc.push(0);
      } else {
        const prev = points[points.length - 2];
        if (prev === undefined) {
          cumArc.push(arc);
        } else {
          const cosLat = Math.cos(prev[0] * Math.PI / 180);
          const dy = (pt[0] - prev[0]) * 111320;
          const dx = (pt[1] - prev[1]) * 111320 * cosLat;
          arc += Math.sqrt(dy * dy + dx * dx);
          cumArc.push(arc);
        }
      }
    }
    wayEnds.push(points.length - 1);
  }

  return { points, cumArc, wayEnds };
}

/**
 * Given a set of ways for a street, snap the address node to the road centerline.
 * Returns the dot product (for parity voting), distance from road, and arc position.
 *
 * Returns null if no segment is found or the distance is too large (> 50 m).
 */
function snapAddressNodeToRoad(
  ways: [number, number][][],
  lat: number,
  lng: number
): { dot: number; distanceM: number; arcM: number } | null {
  const { points, cumArc } = flattenWaysToArcPath(ways);

  const cosLat = Math.cos(lat * Math.PI / 180);
  let bestDist = Infinity;
  let bestDot = 0;
  let bestArcM = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i];
    const B = points[i + 1];
    if (A === undefined || B === undefined) continue;

    const ax = (A[0] - lat) * 111320;
    const ay = (A[1] - lng) * 111320 * cosLat;
    const bx = (B[0] - lat) * 111320;
    const by = (B[1] - lng) * 111320 * cosLat;
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
      const perpX = dY / len;
      const perpY = -dX / len;
      // Sign displacement from projected point
      const projLat = A[0] + t * (B[0] - A[0]);
      const projLng = A[1] + t * (B[1] - A[1]);
      const signDY = (lat - projLat) * 111320;
      const signDX = (lng - projLng) * 111320 * cosLat;
      bestDot = signDX * perpX + signDY * perpY;

      // Arc position = arc at A + t * (arc at B - arc at A)
      const arcA = cumArc[i] ?? 0;
      const arcB = cumArc[i + 1] ?? 0;
      bestArcM = arcA + t * (arcB - arcA);
    }
  }

  // Ignore nodes more than 50 m from the nearest road segment
  if (bestDist > 50) return null;
  return { dot: bestDot, distanceM: bestDist, arcM: bestArcM };
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

  // Step 3: Vote for each street and accumulate arc entries
  // netVotes[street] = sum of votes (positive = dir 1, negative = dir -1)
  const netVotes: Record<string, number> = {};
  // arcEntries[street] = [[houseNum, arcM], ...] (raw, may have duplicates)
  const arcEntriesRaw = new Map<string, [number, number][]>();

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

    const snapResult = snapAddressNodeToRoad(ways, node.lat, node.lon);
    if (snapResult === null) continue;

    const { dot, arcM } = snapResult;
    if (dot === 0) continue;

    const isOdd = houseNum % 2 === 1;
    // If odd address and dot > 0 → vote +1 (odd side is right-perp = dir 1)
    // If odd address and dot < 0 → vote -1
    // Even address flips the sign
    const vote = isOdd ? (dot > 0 ? 1 : -1) : (dot > 0 ? -1 : 1);

    if (netVotes[streetKey] === undefined) {
      netVotes[streetKey] = 0;
    }
    netVotes[streetKey] += vote;

    // Accumulate arc entry
    const existing = arcEntriesRaw.get(streetKey);
    if (existing !== undefined) {
      existing.push([houseNum, arcM]);
    } else {
      arcEntriesRaw.set(streetKey, [[houseNum, arcM]]);
    }
  }

  // Step 4: Emit parity only for streets with ≥ 3 net votes
  const parity: Record<string, 1 | -1> = {};
  for (const [street, votes] of Object.entries(netVotes)) {
    if (Math.abs(votes) >= 3) {
      parity[street] = votes > 0 ? 1 : -1;
    }
  }

  // Step 5: Collapse duplicate house numbers by median arcM, sort, build AddressArcIndex
  const addressArcResult: AddressArcIndex = {};

  for (const [streetKey, entries] of arcEntriesRaw) {
    // Group by houseNum
    const byHouseNum = new Map<number, number[]>();
    for (const [houseNum, arcM] of entries) {
      const existing = byHouseNum.get(houseNum);
      if (existing !== undefined) {
        existing.push(arcM);
      } else {
        byHouseNum.set(houseNum, [arcM]);
      }
    }

    // Collapse by median arcM
    const collapsed: [number, number][] = [];
    for (const [houseNum, arcMs] of byHouseNum) {
      const sorted = [...arcMs].sort((a, b) => a - b);
      const medianArcM = sorted[Math.floor(sorted.length / 2)] ?? 0;
      collapsed.push([houseNum, medianArcM]);
    }

    // Sort by houseNum ascending
    collapsed.sort((a, b) => a[0] - b[0]);
    addressArcResult[streetKey] = collapsed;
  }

  // Step 6: Write output files
  const parityPath = path.join(DATA_DIR, "street-parity.json");
  await fs.writeFile(parityPath, JSON.stringify(parity, null, 2), "utf-8");
  console.log(`Wrote parity for ${Object.keys(parity).length} streets to ${parityPath}`);

  // address-arc.json is computed against the current road-geometry.json.
  // If road-geometry.json is regenerated, re-run build-street-parity to keep arcM values valid.
  const arcPath = path.join(DATA_DIR, "address-arc.json");
  await fs.writeFile(arcPath, JSON.stringify(addressArcResult, null, 2), "utf-8");
  console.log(`Wrote arc index for ${Object.keys(addressArcResult).length} streets to ${arcPath}`);
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
