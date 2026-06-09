import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStreetName } from "../../app/geo";

describe("getStreetName", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns road name when Nominatim returns address with road field", async () => {
    const mockResponse = {
      address: { road: "Washington Street" },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await getStreetName(40.744, -74.032);
    expect(result).toBe("Washington Street");
  });

  it("returns null when Nominatim returns address without road field", async () => {
    const mockResponse = {
      address: {},
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await getStreetName(40.744, -74.032);
    expect(result).toBeNull();
  });

  it("returns null on network error without throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await getStreetName(40.744, -74.032);
    expect(result).toBeNull();
  });

  it("returns null when request exceeds 8 seconds without throwing", async () => {
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }
      });
    });

    const promise = getStreetName(40.744, -74.032);
    await vi.advanceTimersByTimeAsync(8001);
    const result = await promise;
    expect(result).toBeNull();
  });
});
