import type {
  Sign,
  StreetCleaningEntry,
  SnowRoute,
  RoadGeometry,
  ParkingSegment,
  ParkingSide,
  SegmentGeometry,
} from "../shared/types";

// ─── normalizeSegmentToken ────────────────────────────────────────────────────

/**
 * Lowercases a string, trims whitespace, and replaces runs of whitespace with
 * hyphens. Used to build deterministic segment IDs from free-text fields.
 */
export function normalizeSegmentToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

// ─── makeParkingSegmentId ─────────────────────────────────────────────────────

/**
 * Produces a stable segment ID from the canonical (street, side, location)
 * triple. The ID format is:
 *   <normalized-street>__<normalized-side>__<normalized-location>
 */
export function makeParkingSegmentId(input: {
  street: string;
  side: ParkingSide;
  location: string;
}): string {
  const street   = normalizeSegmentToken(input.street);
  const side     = normalizeSegmentToken(input.side);
  const location = normalizeSegmentToken(input.location);
  return `${street}__${side}__${location}`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a street name for comparison purposes:
 * uppercase, trim, collapse internal whitespace.
 */
function normalizeStreetName(street: string): string {
  return street.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Normalize a side string for comparison / ParkingSide casting.
 * Capitalises the first letter to match ParkingSide union.
 */
function normalizeSide(side: string): ParkingSide {
  const s = side.trim();
  if (!s) return "Unknown";
  const capitalised = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const valid: ParkingSide[] = ["North", "South", "East", "West", "Both", "Unknown"];
  if (valid.includes(capitalised as ParkingSide)) {
    return capitalised as ParkingSide;
  }
  return "Unknown";
}

/**
 * Try to look up a geometry key in roadGeometry.
 * Tries the street name uppercased and with period-stripping.
 */
function lookupGeometry(street: string, roadGeometry: RoadGeometry): SegmentGeometry | undefined {
  const key = normalizeStreetName(street).replace(/\./g, "");
  const ways = roadGeometry[key];
  if (ways === undefined || ways.length === 0) return undefined;
  return { ways, clipped: false, source: "road-geometry" };
}

// ─── Map key helpers ──────────────────────────────────────────────────────────

/**
 * Build the canonical map key used to detect matching segments across sources.
 * Key is normalized (street, side, location) joined by "||".
 */
function segmentMapKey(street: string, side: ParkingSide, location: string): string {
  return `${normalizeStreetName(street)}||${side}||${normalizeSegmentToken(location)}`;
}

// ─── Parse towSign address ─────────────────────────────────────────────────────

/**
 * Extract a street name from a sign address like "257 WASHINGTON ST" or
 * "257-257 WASHINGTON ST". Returns the portion after the leading house number.
 * If no leading number is found, returns the whole address.
 */
function streetFromAddress(address: string): string {
  return address.replace(/^\d[\d-]*\s+/, "").trim();
}

// ─── buildParkingSegmentCatalog ───────────────────────────────────────────────

/**
 * Build a catalog of ParkingSegments from all available data sources.
 *
 * Identity key: normalized (street, side, location) triple.
 * Segments from different sources that share the same triple are merged.
 */
export function buildParkingSegmentCatalog(input: {
  signs: Sign[];
  cleaningEntries: StreetCleaningEntry[];
  snowRoutes: SnowRoute[];
  roadGeometry?: RoadGeometry;
}): ParkingSegment[] {
  const { signs, cleaningEntries, snowRoutes, roadGeometry } = input;

  // Map from canonical key → accumulated segment data
  const segmentMap = new Map<
    string,
    {
      street: string;
      side: ParkingSide;
      location: string;
      cleaningEntries: StreetCleaningEntry[];
      towSigns: Sign[];
      snowRoutes: SnowRoute[];
    }
  >();

  function getOrCreate(
    street: string,
    side: ParkingSide,
    location: string
  ): {
    street: string;
    side: ParkingSide;
    location: string;
    cleaningEntries: StreetCleaningEntry[];
    towSigns: Sign[];
    snowRoutes: SnowRoute[];
  } {
    const key = segmentMapKey(street, side, location);
    let entry = segmentMap.get(key);
    if (entry === undefined) {
      entry = { street, side, location, cleaningEntries: [], towSigns: [], snowRoutes: [] };
      segmentMap.set(key, entry);
    }
    return entry;
  }

  // ── cleaningEntries ──────────────────────────────────────────────────────
  for (const ce of cleaningEntries) {
    const side     = normalizeSide(ce.side);
    const location = ce.location;
    const entry    = getOrCreate(ce.street, side, location);
    entry.cleaningEntries.push(ce);
    // Prefer the canonical street name as-stored (first writer wins)
    // already set by getOrCreate
  }

  // ── snowRoutes ───────────────────────────────────────────────────────────
  // Group by (street, side) — location is "from to to", all routes in a group
  // share the SAME (street, side) key but may have different from/to.
  // We need ONE segment per unique (street, side) per spec, so we build
  // a sub-map: (street, side) → list of routes.
  const snowRouteGroups = new Map<string, { street: string; side: ParkingSide; routes: SnowRoute[] }>();
  for (const sr of snowRoutes) {
    const side = normalizeSide(sr.side);
    const groupKey = `${normalizeStreetName(sr.street)}||${side}`;
    let group = snowRouteGroups.get(groupKey);
    if (group === undefined) {
      group = { street: sr.street, side, routes: [] };
      snowRouteGroups.set(groupKey, group);
    }
    group.routes.push(sr);
  }

  for (const group of snowRouteGroups.values()) {
    // Build location string from the FIRST route for segment identity
    // (all routes in the group share the same (street, side), location is
    // "from to to" for each individual route — but the spec says:
    //   "Each SnowRoute with a distinct (street, side) pair produces one ParkingSegment.
    //    Location is constructed as '${route.from} to ${route.to}'."
    // For groups with multiple routes, we use the first route's from/to as the
    // canonical location for segment identity.
    const firstRoute = group.routes[0];
    if (firstRoute === undefined) continue;
    const location = `${firstRoute.from} to ${firstRoute.to}`;
    const entry = getOrCreate(group.street, group.side, location);
    for (const sr of group.routes) {
      entry.snowRoutes.push(sr);
    }
  }

  // ── towSigns (signs) ─────────────────────────────────────────────────────
  // Sign has no explicit street/side/location fields.
  // We extract the street name from sign.address by stripping the house number.
  // Side is "Unknown" (per spec: do not guess side).
  // Location is the full address (best available text).
  for (const sign of signs) {
    const street   = streetFromAddress(sign.address);
    const side: ParkingSide = "Unknown";
    const location = sign.address;
    const entry = getOrCreate(street, side, location);
    entry.towSigns.push(sign);
  }

  // ── Assemble ParkingSegment[] ────────────────────────────────────────────
  const result: ParkingSegment[] = [];

  for (const data of segmentMap.values()) {
    const id = makeParkingSegmentId({
      street:   data.street,
      side:     data.side,
      location: data.location,
    });

    let geometry: SegmentGeometry | undefined = undefined;
    if (roadGeometry !== undefined) {
      geometry = lookupGeometry(data.street, roadGeometry);
    }

    result.push({
      id,
      street:          data.street,
      location:        data.location,
      side:            data.side,
      geometry,
      cleaningEntries: data.cleaningEntries,
      towSigns:        data.towSigns,
      snowRoutes:      data.snowRoutes,
    });
  }

  return result;
}
