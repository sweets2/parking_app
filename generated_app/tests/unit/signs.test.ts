import { describe, it, expect } from "vitest";
import {
  ALL_DATA,
  ALL_SIGNS,
  ACTIVE_SIGNS,
  EXPIRED_SIGNS,
  PERMANENT_SIGNS,
  SIGN_BAD_COORD,
  SIGN_PERMANENT,
  SIGN_ACTIVE,
  SIGN_EXPIRED,
  SIGN_SAME_COORD_A,
  SIGN_SAME_COORD_B,
  FETCH_TIME,
  NOW_STABLE,
  NOW_AFTER_EXPIRED,
  HOBOKEN_BOUNDS,
} from "../fixtures/signs";

// ---------------------------------------------------------------------------
// Basic import and count sanity
// ---------------------------------------------------------------------------

describe("signs fixture — import and count", () => {
  it("imports without throwing", () => {
    // If we reached this point the module loaded successfully.
    expect(ALL_SIGNS).toBeDefined();
  });

  it("ALL_DATA.count equals ALL_SIGNS.length", () => {
    expect(ALL_DATA.count).toBe(ALL_SIGNS.length);
  });
});

// ---------------------------------------------------------------------------
// Timestamp constants
// ---------------------------------------------------------------------------

describe("signs fixture — timestamp constants", () => {
  it("FETCH_TIME is a Date instance", () => {
    expect(FETCH_TIME).toBeInstanceOf(Date);
  });

  it("NOW_STABLE is a Date instance", () => {
    expect(NOW_STABLE).toBeInstanceOf(Date);
  });

  it("NOW_AFTER_EXPIRED is a Date instance", () => {
    expect(NOW_AFTER_EXPIRED).toBeInstanceOf(Date);
  });

  it("NOW_STABLE is after FETCH_TIME", () => {
    expect(NOW_STABLE.getTime()).toBeGreaterThan(FETCH_TIME.getTime());
  });

  it("NOW_AFTER_EXPIRED is after NOW_STABLE", () => {
    expect(NOW_AFTER_EXPIRED.getTime()).toBeGreaterThan(NOW_STABLE.getTime());
  });
});

// ---------------------------------------------------------------------------
// SIGN_BAD_COORD
// ---------------------------------------------------------------------------

describe("signs fixture — SIGN_BAD_COORD", () => {
  it("SIGN_BAD_COORD is defined", () => {
    expect(SIGN_BAD_COORD).toBeDefined();
  });

  it("SIGN_BAD_COORD has coordinates outside Hoboken bounding area", () => {
    if (SIGN_BAD_COORD === undefined) {
      throw new Error("SIGN_BAD_COORD must not be undefined");
    }
    const outsideLat =
      SIGN_BAD_COORD.lat < HOBOKEN_BOUNDS.latMin ||
      SIGN_BAD_COORD.lat > HOBOKEN_BOUNDS.latMax;
    const outsideLng =
      SIGN_BAD_COORD.lng < HOBOKEN_BOUNDS.lngMin ||
      SIGN_BAD_COORD.lng > HOBOKEN_BOUNDS.lngMax;
    expect(outsideLat || outsideLng).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ACTIVE_SIGNS / EXPIRED_SIGNS partitioning
// ---------------------------------------------------------------------------

describe("signs fixture — ACTIVE_SIGNS and EXPIRED_SIGNS", () => {
  it("ACTIVE_SIGNS.length + EXPIRED_SIGNS.length equals ALL_SIGNS.length", () => {
    expect(ACTIVE_SIGNS.length + EXPIRED_SIGNS.length).toBe(ALL_SIGNS.length);
  });

  it("every sign in ACTIVE_SIGNS has active_at_fetch: true", () => {
    for (const sign of ACTIVE_SIGNS) {
      expect(sign.active_at_fetch).toBe(true);
    }
  });

  it("every sign in EXPIRED_SIGNS has active_at_fetch: false", () => {
    for (const sign of EXPIRED_SIGNS) {
      expect(sign.active_at_fetch).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// PERMANENT_SIGNS
// ---------------------------------------------------------------------------

describe("signs fixture — PERMANENT_SIGNS", () => {
  it("every sign in PERMANENT_SIGNS has stop_date 12/31/2030", () => {
    for (const sign of PERMANENT_SIGNS) {
      expect(sign.stop_date).toBe("12/31/2030");
    }
  });
});

// ---------------------------------------------------------------------------
// Individual representative signs
// ---------------------------------------------------------------------------

describe("signs fixture — SIGN_PERMANENT", () => {
  it("SIGN_PERMANENT is defined", () => {
    expect(SIGN_PERMANENT).toBeDefined();
  });

  it("SIGN_PERMANENT has stop_date 12/31/2030", () => {
    expect(SIGN_PERMANENT?.stop_date).toBe("12/31/2030");
  });
});

describe("signs fixture — SIGN_ACTIVE", () => {
  it("SIGN_ACTIVE is defined", () => {
    expect(SIGN_ACTIVE).toBeDefined();
  });

  it("SIGN_ACTIVE has active_at_fetch true", () => {
    expect(SIGN_ACTIVE?.active_at_fetch).toBe(true);
  });
});

describe("signs fixture — SIGN_EXPIRED", () => {
  it("SIGN_EXPIRED is either undefined (no expired signs in real data) or has active_at_fetch false", () => {
    if (SIGN_EXPIRED !== undefined) {
      expect(SIGN_EXPIRED.active_at_fetch).toBe(false);
    } else {
      // No expired signs in the live dataset — this is acceptable.
      expect(EXPIRED_SIGNS.length).toBe(0);
    }
  });
});

describe("signs fixture — same-coordinate pair", () => {
  it("SIGN_SAME_COORD_A and SIGN_SAME_COORD_B are defined", () => {
    expect(SIGN_SAME_COORD_A).toBeDefined();
    expect(SIGN_SAME_COORD_B).toBeDefined();
  });

  it("SIGN_SAME_COORD_A and SIGN_SAME_COORD_B share identical lat/lng", () => {
    if (SIGN_SAME_COORD_A === undefined || SIGN_SAME_COORD_B === undefined) {
      throw new Error("same-coord signs must not be undefined");
    }
    expect(SIGN_SAME_COORD_A.lat).toBe(SIGN_SAME_COORD_B.lat);
    expect(SIGN_SAME_COORD_A.lng).toBe(SIGN_SAME_COORD_B.lng);
  });

  it("SIGN_SAME_COORD_A and SIGN_SAME_COORD_B have different ids", () => {
    if (SIGN_SAME_COORD_A === undefined || SIGN_SAME_COORD_B === undefined) {
      throw new Error("same-coord signs must not be undefined");
    }
    expect(SIGN_SAME_COORD_A.id).not.toBe(SIGN_SAME_COORD_B.id);
  });
});
