import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { Garage, SnowRoute } from "../../shared/types";

const GARAGES_PATH = join(__dirname, "../../data/garages.json");
const SNOW_PATH = join(__dirname, "../../data/snow-emergency-routes.json");

describe("data/garages.json", () => {
  const garages: unknown = JSON.parse(readFileSync(GARAGES_PATH, "utf-8"));

  it("is an array with at least 3 entries", () => {
    expect(Array.isArray(garages)).toBe(true);
    expect((garages as Garage[]).length).toBeGreaterThanOrEqual(3);
  });

  it("each entry has valid fields", () => {
    const arr = garages as Garage[];
    for (const g of arr) {
      expect(typeof g.name).toBe("string");
      expect(g.name.length).toBeGreaterThan(0);

      expect(typeof g.address).toBe("string");
      expect(g.address.length).toBeGreaterThan(0);

      expect(typeof g.capacity).toBe("number");
      expect(Number.isInteger(g.capacity)).toBe(true);
      expect(g.capacity).toBeGreaterThan(0);

      expect(g.lat).toBeGreaterThanOrEqual(40.72);
      expect(g.lat).toBeLessThanOrEqual(40.77);

      expect(g.lng).toBeGreaterThanOrEqual(-74.06);
      expect(g.lng).toBeLessThanOrEqual(-74.01);

      expect(typeof g.phone).toBe("string");
      expect(g.phone.length).toBeGreaterThan(0);
    }
  });

  it("at least one entry has a name matching /garage/i or /midtown/i or /southwest/i", () => {
    const arr = garages as Garage[];
    const match = arr.some(
      (g) => /garage/i.test(g.name) || /midtown/i.test(g.name) || /southwest/i.test(g.name)
    );
    expect(match).toBe(true);
  });
});

describe("data/snow-emergency-routes.json", () => {
  const parsed: unknown = JSON.parse(readFileSync(SNOW_PATH, "utf-8"));
  const data = parsed as { routes: SnowRoute[] };

  it("is an object with a routes array with at least 4 entries", () => {
    expect(typeof data).toBe("object");
    expect(data).not.toBeNull();
    expect(Array.isArray(data.routes)).toBe(true);
    expect(data.routes.length).toBeGreaterThanOrEqual(4);
  });

  it("each route entry has valid fields", () => {
    const VALID_SIDES = new Set(["North", "South", "Both", "West", "East"]);
    for (const r of data.routes) {
      expect(typeof r.street).toBe("string");
      expect(r.street.length).toBeGreaterThan(0);
      expect(r.street).toBe(r.street.toUpperCase());
      expect(r.street).not.toMatch(/\./);

      expect(VALID_SIDES.has(r.side)).toBe(true);

      expect(typeof r.from).toBe("string");
      expect(r.from.length).toBeGreaterThan(0);

      expect(typeof r.to).toBe("string");
      expect(r.to.length).toBeGreaterThan(0);
    }
  });

  it("at least one entry has street equal to OBSERVER HWY, WASHINGTON ST, or WILLOW AVE", () => {
    const known = new Set(["OBSERVER HWY", "WASHINGTON ST", "WILLOW AVE"]);
    const match = data.routes.some((r) => known.has(r.street));
    expect(match).toBe(true);
  });

  it("optional clip fields are valid Hoboken coordinates when present", () => {
    for (const r of data.routes) {
      if (r.minLon !== undefined) {
        expect(r.minLon).toBeGreaterThanOrEqual(-74.06);
        expect(r.minLon).toBeLessThanOrEqual(-74.01);
      }
      if (r.maxLon !== undefined) {
        expect(r.maxLon).toBeGreaterThanOrEqual(-74.06);
        expect(r.maxLon).toBeLessThanOrEqual(-74.01);
      }
      if (r.minLat !== undefined) {
        expect(r.minLat).toBeGreaterThanOrEqual(40.72);
        expect(r.minLat).toBeLessThanOrEqual(40.77);
      }
      if (r.maxLat !== undefined) {
        expect(r.maxLat).toBeGreaterThanOrEqual(40.72);
        expect(r.maxLat).toBeLessThanOrEqual(40.77);
      }
    }
  });
});
