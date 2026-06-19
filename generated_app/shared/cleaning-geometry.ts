/**
 * shared/cleaning-geometry.ts — CF-20
 *
 * Pure geometry utilities extracted from app/map.ts.
 * No Leaflet, no DOM globals, no Node.js built-ins, no I/O.
 * Safe to import from build-time scripts running in Node.
 */

// ─── Ordinal → numeric mapping ──────────────────────────────────────────────

const ORDINAL_TO_NUMERIC: Record<string, string> = {
  FIRST: "1ST", SECOND: "2ND", THIRD: "3RD", FOURTH: "4TH",
  FIFTH: "5TH", SIXTH: "6TH", SEVENTH: "7TH", EIGHTH: "8TH",
  NINTH: "9TH", TENTH: "10TH", ELEVENTH: "11TH", TWELFTH: "12TH",
  THIRTEENTH: "13TH", FOURTEENTH: "14TH", FIFTEENTH: "15TH", SIXTEENTH: "16TH",
};

// ─── normalizeToGeometryKey ──────────────────────────────────────────────────

export function normalizeToGeometryKey(name: string): string {
  return name
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
    .replace(/^SINATRA DR NORTH$/, "SINATRA DR N")
    .replace(/\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|THIRTEENTH|FOURTEENTH|FIFTEENTH|SIXTEENTH)\b/g, m => ORDINAL_TO_NUMERIC[m] ?? m)
    .trim();
}

// ─── Hoboken numbered-street centroid latitudes ──────────────────────────────

// Hoboken's E-W numbered streets each run at a known latitude.
// The OSM bounding box used to build road-geometry.json is slightly larger than
// Hoboken, so streets like "3RD ST" pick up Jersey City Heights ways at
// lat ~40.753 — about 0.013° north of Hoboken's actual 3rd St (~40.740).
// A ±0.008° tolerance (~890 m) accepts all legitimate Hoboken ways while
// rejecting every JC bleed-through observed in the data.
// Expected centroid latitudes for Hoboken numbered streets, used to reject
// OSM ways that share the street name but belong to Jersey City.
// Calibrated from road-geometry.json centroid audit (CF-19).
// 9TH ST uses 40.748 (not 40.750) to exclude a JC Heights stub at centLat 40.757.
// 13TH ST uses 40.753 (not 40.756) to exclude a JC segment at centLat 40.761.
// 11TH and 12TH ST require per-street tolerances (see HOBOKEN_STREET_LAT_PER_STREET_TOL).
export const HOBOKEN_STREET_LAT: Record<string, number> = {
  "1ST ST": 40.738, "2ND ST": 40.739, "3RD ST": 40.740,
  "4TH ST": 40.741, "5TH ST": 40.742, "6TH ST": 40.744,
  "7TH ST": 40.746, "8TH ST": 40.747, "9TH ST": 40.748,
  "10TH ST": 40.749, "11TH ST": 40.750, "12TH ST": 40.752,
  "13TH ST": 40.753, "14TH ST": 40.754, "15TH ST": 40.755,
  "16TH ST": 40.757,
};

export const HOBOKEN_STREET_LAT_TOLERANCE = 0.008;

// Per-street tighter tolerances for streets where the JC centroid gap is ≤ 0.008°.
// 11TH ST: JC Heights way at centLat 40.758 → gap 0.008 from expected 40.750.
// 12TH ST: JC Heights ways at centLat 40.759 → gap 0.007 from expected 40.752.
// 13TH ST: north JC way at centLat 40.761 → gap 0.008 from expected 40.753.
export const HOBOKEN_STREET_LAT_PER_STREET_TOL: Partial<Record<string, number>> = {
  "11TH ST": 0.007,
  "12TH ST": 0.006,
  "13TH ST": 0.007,
};

// ─── filterWaysByStreetLat ───────────────────────────────────────────────────

// Drops ways whose average centroid latitude deviates from the expected Hoboken
// latitude by more than the per-street or global tolerance.
// Non-numbered streets (no entry in HOBOKEN_STREET_LAT) are returned unchanged.
export function filterWaysByStreetLat(
  ways: [number, number][][],
  streetKey: string,
): [number, number][][] {
  const expected = HOBOKEN_STREET_LAT[streetKey];
  if (expected === undefined) return ways;
  const tol = HOBOKEN_STREET_LAT_PER_STREET_TOL[streetKey] ?? HOBOKEN_STREET_LAT_TOLERANCE;
  return ways.filter(way => {
    if (way.length === 0) return false;
    const centLat = way.reduce((sum, pt) => sum + pt[0], 0) / way.length;
    return Math.abs(centLat - expected) <= tol;
  });
}

// ─── flattenWaysToArcPath ────────────────────────────────────────────────────

/**
 * Concatenates all ways in order into one flat points array.
 * cumArc[i] = cumulative arc-length in metres from points[0] to points[i].
 * wayEnds[w] = index of the last point of way w in the flat array.
 * Uses flat-earth distance: 111320 m/degree lat, 111320 * cos(lat) m/degree lng.
 *
 * CRITICAL: This function must be IDENTICAL to flattenWaysToArcPath in
 * shared/cleaning-geometry.ts and build-time usage. Both copies must produce
 * the same arcM for the same input — this is the contract that makes build-time
 * arcM values usable at runtime.
 */
export function flattenWaysToArcPath(
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

// ─── clipWaysToArcRange ──────────────────────────────────────────────────────

/**
 * Clip a set of ways to the arc range [fromArcM, toArcM] (metres).
 * Internally applies Math.min/max so argument order does not matter.
 * Never emits a segment that spans two disconnected ways (way-boundary-safe).
 * Only returns segments with ≥2 points.
 */
export function clipWaysToArcRange(
  ways: [number, number][][],
  fromArcM: number,
  toArcM: number
): [number, number][][] {
  const lo = Math.min(fromArcM, toArcM);
  const hi = Math.max(fromArcM, toArcM);

  const { points, cumArc, wayEnds } = flattenWaysToArcPath(ways);
  const result: [number, number][][] = [];

  if (points.length === 0) return result;

  // Build a Set of way-end indices for O(1) lookup
  const wayEndSet = new Set(wayEnds);

  let current: [number, number][] = [];
  let wayIdx = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt === undefined) continue;
    const ptArc = cumArc[i] ?? 0;

    // Check if previous point index was a way-end → close current segment and start new one
    if (i > 0 && wayEndSet.has(i - 1)) {
      // We've crossed a way boundary — flush current segment
      if (current.length >= 2) {
        result.push(current);
      }
      current = [];
      wayIdx++;
    }

    const inside = ptArc >= lo && ptArc <= hi;
    const prevPt = i > 0 ? points[i - 1] : undefined;
    const prevArc = i > 0 ? (cumArc[i - 1] ?? 0) : undefined;

    // Check if previous point was in a different way (already handled above by wayEndSet)
    // but still need to check for inside/outside transitions
    if (inside) {
      // Interpolate entry point if previous point was outside (and in same way)
      if (
        prevPt !== undefined &&
        prevArc !== undefined &&
        prevArc < lo &&
        !wayEndSet.has(i - 1) // not crossing a way boundary
      ) {
        const segArcLen = ptArc - prevArc;
        if (segArcLen > 0) {
          const t = (lo - prevArc) / segArcLen;
          current.push([
            prevPt[0] + t * (pt[0] - prevPt[0]),
            prevPt[1] + t * (pt[1] - prevPt[1]),
          ]);
        }
      } else if (
        prevPt !== undefined &&
        prevArc !== undefined &&
        prevArc > hi &&
        !wayEndSet.has(i - 1)
      ) {
        // Entry from above (should not happen when iterating forward, but handle)
        const segArcLen = ptArc - prevArc;
        if (segArcLen !== 0) {
          const t = (hi - prevArc) / segArcLen;
          current.push([
            prevPt[0] + t * (pt[0] - prevPt[0]),
            prevPt[1] + t * (pt[1] - prevPt[1]),
          ]);
        }
      }
      current.push(pt);
    } else {
      // Point is outside range — but check two sub-cases
      const crossingBoundary = i > 0 && wayEndSet.has(i - 1);
      if (
        prevPt !== undefined &&
        prevArc !== undefined &&
        !crossingBoundary
      ) {
        if (prevArc >= lo && prevArc <= hi) {
          // Exiting the range — interpolate exit point
          const segArcLen = ptArc - prevArc;
          if (segArcLen !== 0) {
            const t = (hi - prevArc) / segArcLen;
            current.push([
              prevPt[0] + t * (pt[0] - prevPt[0]),
              prevPt[1] + t * (pt[1] - prevPt[1]),
            ]);
          }
          if (current.length >= 2) {
            result.push(current);
          }
          current = [];
        } else if (prevArc < lo && ptArc > hi) {
          // Segment spans entire range — emit interpolated entry and exit
          const segArcLen = ptArc - prevArc;
          const tEntry = (lo - prevArc) / segArcLen;
          const tExit  = (hi - prevArc) / segArcLen;
          result.push([
            [prevPt[0] + tEntry * (pt[0] - prevPt[0]), prevPt[1] + tEntry * (pt[1] - prevPt[1])],
            [prevPt[0] + tExit  * (pt[0] - prevPt[0]), prevPt[1] + tExit  * (pt[1] - prevPt[1])],
          ]);
        }
      }
    }
  }

  // Flush any remaining segment
  if (current.length >= 2) {
    result.push(current);
  }

  // Suppress unused variable warning
  void wayIdx;

  return result;
}
