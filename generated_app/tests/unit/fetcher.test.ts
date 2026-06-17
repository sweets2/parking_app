import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toIsoDatetime,
  computeActiveAtFetch,
  validateResponseShape,
  validateSign,
  checkCountDrop,
  runFetcher,
  runFutureFetcherWithFs,
  runFetcherWithFs,
} from "../../fetcher/fetch";
import {
  normalizeSchedule,
  parseCleaningHtml,
  runScraper,
} from "../../fetcher/fetch-street-cleaning";
import { FETCH_TIME } from "../fixtures/signs";

// ---------------------------------------------------------------------------
// Test 1 — toIsoDatetime
// ---------------------------------------------------------------------------

describe("toIsoDatetime", () => {
  it("converts 6/9/2026 + 08:00:00 to 2026-06-09T08:00:00", () => {
    expect(toIsoDatetime("6/9/2026", "08:00:00")).toBe("2026-06-09T08:00:00");
  });
});

// ---------------------------------------------------------------------------
// Test 2 — validateResponseShape
// ---------------------------------------------------------------------------

describe("validateResponseShape", () => {
  it("returns false for null (non-object)", () => {
    expect(validateResponseShape(null)).toBe(false);
  });

  it("returns true for valid shape { data: [] }", () => {
    expect(validateResponseShape({ data: [] })).toBe(true);
  });

  it("returns false for non-object (number)", () => {
    expect(validateResponseShape(42)).toBe(false);
  });

  it("returns false for object without data property", () => {
    expect(validateResponseShape({ status: "ok" })).toBe(false);
  });

  it("returns false when data is not an array", () => {
    expect(validateResponseShape({ data: "not-array" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — validateSign
// ---------------------------------------------------------------------------

describe("validateSign", () => {
  const validSign = {
    id: "216439",
    address: "361-365 1ST ST",
    reason: "CONSTRUCTION",
    permit_number: "640946",
    lat: 40.738214,
    lng: -74.0360203,
    start_date: "6/12/2026",
    start_time: "08:00:00",
    stop_date: "6/12/2026",
    end_time: "16:00:00",
  };

  it("returns false for missing required fields ({})", () => {
    expect(validateSign({})).toBe(false);
  });

  it("returns true for a valid sign object with all required string fields", () => {
    expect(validateSign(validSign)).toBe(true);
  });

  it("returns false for null", () => {
    expect(validateSign(null)).toBe(false);
  });

  it("returns false when id is missing", () => {
    const { id: _id, ...rest } = validSign;
    expect(validateSign(rest)).toBe(false);
  });

  it("returns false when address is missing", () => {
    const { address: _address, ...rest } = validSign;
    expect(validateSign(rest)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — checkCountDrop
// ---------------------------------------------------------------------------

describe("checkCountDrop", () => {
  it("does not throw when counts are similar (100 vs 100), returns undefined", () => {
    expect(checkCountDrop(100, 100)).toBeUndefined();
  });

  it("does not throw when new count is lower but not below 50%", () => {
    expect(checkCountDrop(60, 100)).toBeUndefined();
  });

  it("does not throw when new count is below 50% (just logs warning)", () => {
    expect(checkCountDrop(10, 100)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — normalizeSchedule: dash-separated day ranges replaced with "through"
// ---------------------------------------------------------------------------

describe("normalizeSchedule - dash replacement", () => {
  it("replaces Monday-Friday with Monday through Friday", () => {
    const result = normalizeSchedule("Monday-Friday 8 AM – 9 AM");
    expect(result).toContain("Monday through Friday");
  });
});

// ---------------------------------------------------------------------------
// Test 6 — normalizeSchedule: triple-space separator inserted
// ---------------------------------------------------------------------------

describe("normalizeSchedule - triple-space separator", () => {
  it("inserts triple-space between day part and time part", () => {
    const result = normalizeSchedule("Monday through Friday 8 AM – 9 AM");
    expect(result).toContain("   ");
  });
});

// ---------------------------------------------------------------------------
// Test 7 — normalizeSchedule: AM/PM lowercased
// ---------------------------------------------------------------------------

describe("normalizeSchedule - AM/PM lowercasing", () => {
  it("lowercases AM to am", () => {
    const result = normalizeSchedule("Monday-Friday 8 AM – 9 AM");
    expect(result).toContain("am");
    expect(result).not.toContain("AM");
  });
});

// ---------------------------------------------------------------------------
// Test 8 — parseCleaningHtml: empty HTML returns []
// ---------------------------------------------------------------------------

describe("parseCleaningHtml - empty HTML", () => {
  it("returns [] for empty HTML", () => {
    const result = parseCleaningHtml("");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 9 — parseCleaningHtml: skips header row where street === "Street"
// ---------------------------------------------------------------------------

describe("parseCleaningHtml - header row filtering", () => {
  it("skips a w-dyn-item where the first table-content text is 'Street'", () => {
    const html = `
      <div class="w-dyn-item">
        <div class="table_wrapper">
          <div class="table-content">Street</div>
          <div class="table-content">Side</div>
          <div class="table-content">Monday-Friday 8 AM – 9 AM</div>
          <div class="table-content">Location</div>
        </div>
      </div>
    `;
    const result = parseCleaningHtml(html);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 10 — parseCleaningHtml: correctly parses a well-formed Webflow item div
// ---------------------------------------------------------------------------

describe("parseCleaningHtml - valid item", () => {
  it("parses a well-formed div.w-dyn-item with four div.table-content children", () => {
    const html = `
      <div class="w-dyn-item">
        <div class="table_wrapper">
          <div class="table-content">Adams St</div>
          <div class="table-content">North</div>
          <div class="table-content">Monday-Friday 8 AM – 9 AM</div>
          <div class="table-content">Full Block</div>
        </div>
      </div>
    `;
    const result = parseCleaningHtml(html);
    expect(result).toHaveLength(1);
    const entry = result[0];
    if (entry !== undefined) {
      expect(entry.street).toBe("Adams St");
      expect(entry.side).toBe("North");
      expect(entry.location).toBe("Full Block");
    }
  });
});

// ---------------------------------------------------------------------------
// Test 11 — computeActiveAtFetch: returns true when fetchedAt is within interval
// ---------------------------------------------------------------------------

describe("computeActiveAtFetch - within interval", () => {
  it("returns true when fetchedAt is within sign interval", () => {
    const sign = {
      id: "1",
      address: "test",
      reason: "CONSTRUCTION",
      permit_number: "1",
      lat: 40.75,
      lng: -74.03,
      start_date: "6/9/2026",
      start_time: "13:52:50",
      stop_date: "11/30/2026",
      end_time: "23:59:59",
      start_iso: "2026-06-09T13:52:50",
      end_iso: "2026-11-30T23:59:59",
    };
    const result = computeActiveAtFetch(sign, FETCH_TIME.toISOString());
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 12 — computeActiveAtFetch: returns false when fetchedAt is outside interval
// ---------------------------------------------------------------------------

describe("computeActiveAtFetch - outside interval", () => {
  it("returns false when fetchedAt is after end_iso", () => {
    const sign = {
      id: "2",
      address: "test",
      reason: "CONSTRUCTION",
      permit_number: "2",
      lat: 40.75,
      lng: -74.03,
      start_date: "6/1/2026",
      start_time: "00:00:00",
      stop_date: "6/8/2026",
      end_time: "23:59:59",
      start_iso: "2026-06-01T00:00:00",
      end_iso: "2026-06-08T23:59:59",
    };
    // FETCH_TIME is "2026-06-09T13:52:50.509Z" which is after end_iso
    const result = computeActiveAtFetch(sign, FETCH_TIME.toISOString());
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 13 — runFetcher writes data/latest.json via FsBackend
// ---------------------------------------------------------------------------

describe("runFetcher - writes latest.json", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls writeFileSync with path containing latest.json and JSON with fetched_at", async () => {
    const validRawSign = {
      id: "1",
      address: "123 Main St",
      reason: "CONSTRUCTION",
      permit_number: "999",
      lat: 40.75,
      lng: -74.03,
      start_date: "1/1/2020",
      start_time: "08:00:00",
      stop_date: "12/31/2030",
      end_time: "17:00:00",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [validRawSign] }),
    } as unknown as Response));

    const writes: Array<[string, string]> = [];
    const mockFs = {
      writeFileSync: (path: string, data: string) => { writes.push([path, data]); },
      existsSync: (_path: string) => false,
      readFileSync: (_path: string, _encoding: "utf8") => { throw new Error("ENOENT"); },
      mkdirSync: (_path: string, _options?: { recursive?: boolean }) => { /* no-op */ },
    };

    await runFetcher(mockFs);

    const latestWrite = writes.find(([p]) => p.includes("latest.json"));
    expect(latestWrite).toBeDefined();
    if (latestWrite !== undefined) {
      const parsed = JSON.parse(latestWrite[1]) as { fetched_at: string };
      expect(parsed).toHaveProperty("fetched_at");
    }
  });
});

// ---------------------------------------------------------------------------
// Test 14 — runFutureFetcherWithFs writes data/future.json via FsBackend
// ---------------------------------------------------------------------------

describe("runFutureFetcherWithFs - writes future.json", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls writeFileSync with path containing future.json", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as unknown as Response));

    const writes: Array<[string, string]> = [];
    const mockFs = {
      writeFileSync: (path: string, data: string) => { writes.push([path, data]); },
      existsSync: (_path: string) => false,
      readFileSync: (_path: string, _encoding: "utf8") => { throw new Error("ENOENT"); },
      mkdirSync: (_path: string, _options?: { recursive?: boolean }) => { /* no-op */ },
    };

    await runFutureFetcherWithFs(mockFs);

    const futureWrite = writes.find(([p]) => p.includes("future.json"));
    expect(futureWrite).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 15 — runFetcherWithFs calls runFetcher before runFutureFetcherWithFs
// ---------------------------------------------------------------------------

describe("runFetcherWithFs - call order", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("writes latest.json before future.json (main endpoint called before future endpoint)", async () => {
    const validRawSign = {
      id: "1",
      address: "123 Main St",
      reason: "CONSTRUCTION",
      permit_number: "999",
      lat: 40.75,
      lng: -74.03,
      start_date: "1/1/2020",
      start_time: "08:00:00",
      stop_date: "12/31/2030",
      end_time: "17:00:00",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [validRawSign] }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as unknown as Response)
    );

    const writeOrder: string[] = [];
    const mockFs = {
      writeFileSync: (path: string, _data: string) => { writeOrder.push(path); },
      existsSync: (_path: string) => false,
      readFileSync: (_path: string, _encoding: "utf8") => { throw new Error("ENOENT"); },
      mkdirSync: (_path: string, _options?: { recursive?: boolean }) => { /* no-op */ },
    };

    await runFetcherWithFs(mockFs);

    const latestIdx = writeOrder.findIndex((p) => p.includes("latest.json"));
    const futureIdx = writeOrder.findIndex((p) => p.includes("future.json"));
    expect(latestIdx).toBeGreaterThanOrEqual(0);
    expect(futureIdx).toBeGreaterThanOrEqual(0);
    expect(latestIdx).toBeLessThan(futureIdx);
  });
});

// ---------------------------------------------------------------------------
// Test 16 — runScraper writes data/street-cleaning.json
// ---------------------------------------------------------------------------

describe("runScraper - writes street-cleaning.json", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls writeFileSync with path containing street-cleaning.json given mock fetch returning valid HTML", async () => {
    const mockHtml = `
      <div class="w-dyn-item">
        <div class="table_wrapper">
          <div class="table-content">Adams St</div>
          <div class="table-content">North</div>
          <div class="table-content">Monday-Friday 8 AM – 9 AM</div>
          <div class="table-content">Full Block</div>
        </div>
      </div>
    `;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    } as unknown as Response));

    const writes: Array<[string, string]> = [];
    const mockFs = {
      writeFileSync: (path: string, data: string) => { writes.push([path, data]); },
      existsSync: (_path: string) => false,
      readFileSync: (_path: string, _encoding: "utf8") => { throw new Error("ENOENT"); },
      mkdirSync: (_path: string, _options?: { recursive?: boolean }) => { /* no-op */ },
    };

    await runScraper(mockFs);

    const cleaningWrite = writes.find(([p]) => p.includes("street-cleaning.json"));
    expect(cleaningWrite).toBeDefined();
  });
});
