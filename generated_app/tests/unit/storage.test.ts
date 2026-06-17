import { describe, it, expect } from "vitest";
import { createSpotStorage } from "../../shared/storage";
import type { StorageBackend, SavedSpot } from "../../shared/storage";

function makeFakeBackend(): StorageBackend {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
  };
}

const SAMPLE_SPOT: SavedSpot = {
  lat: 40.744,
  lng: -74.032,
  side: "N",
  savedAt: "2024-01-15T10:00:00.000Z",
  address: "123 Main St",
};

const ANOTHER_SPOT: SavedSpot = {
  lat: 40.745,
  lng: -74.033,
  side: "S",
  savedAt: "2024-01-15T11:00:00.000Z",
  address: "456 Oak Ave",
};

describe("CF-05 Storage Module", () => {
  it("Test 1 — factory returns correct interface", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    expect(typeof storage.save).toBe("function");
    expect(typeof storage.load).toBe("function");
    expect(typeof storage.clear).toBe("function");
  });

  it("Test 2 — load returns null on empty storage", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    expect(storage.load()).toBeNull();
  });

  it("Test 3 — save then load round-trips spot data", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    storage.save({ lat: 40.744, lng: -74.032, savedAt: "2024-01-01T10:00:00.000Z", address: "1st St" });
    const result = storage.load();
    expect(result).not.toBeNull();
    expect(result?.lat).toBe(40.744);
    expect(result?.lng).toBe(-74.032);
    expect(result?.savedAt).toBe("2024-01-01T10:00:00.000Z");
    expect(result?.address).toBe("1st St");
  });

  it("Test 4 — clear removes saved spot", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    storage.save({ lat: 40.744, lng: -74.032, savedAt: "2024-01-01T10:00:00.000Z", address: "1st St" });
    storage.clear();
    expect(storage.load()).toBeNull();
  });

  it("Test 5 — load returns null for invalid JSON", () => {
    const backend = makeFakeBackend();
    backend.setItem("hoboken_parking_spot", "not-valid-json");
    const storage = createSpotStorage(backend);
    expect(() => storage.load()).not.toThrow();
    expect(storage.load()).toBeNull();
  });

  it("Test 6 — load returns null for wrong shape", () => {
    const backend = makeFakeBackend();
    backend.setItem("hoboken_parking_spot", '{"foo":"bar"}');
    const storage = createSpotStorage(backend);
    expect(storage.load()).toBeNull();
  });
});

describe("Additional storage tests", () => {
  it("GIVEN the fake backend, WHEN save is called, THEN subsequent getItem calls return a non-empty string", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    storage.save(SAMPLE_SPOT);
    const value = backend.getItem("hoboken_parking_spot");
    expect(typeof value).toBe("string");
    expect((value as string).length).toBeGreaterThan(0);
  });

  it("GIVEN a valid SavedSpot, WHEN save is called, THEN backend holds a JSON string with same lat, lng, side, and savedAt", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    storage.save(SAMPLE_SPOT);
    const raw = backend.getItem("hoboken_parking_spot");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.lat).toBe(SAMPLE_SPOT.lat);
    expect(parsed.lng).toBe(SAMPLE_SPOT.lng);
    expect(parsed.side).toBe(SAMPLE_SPOT.side);
    expect(parsed.savedAt).toBe(SAMPLE_SPOT.savedAt);
  });

  it("GIVEN save is called twice with different spots, WHEN load is called, THEN the second spot is returned", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    storage.save(SAMPLE_SPOT);
    storage.save(ANOTHER_SPOT);
    const result = storage.load();
    expect(result).not.toBeNull();
    expect((result as SavedSpot).lat).toBe(ANOTHER_SPOT.lat);
    expect((result as SavedSpot).lng).toBe(ANOTHER_SPOT.lng);
    expect((result as SavedSpot).side).toBe(ANOTHER_SPOT.side);
  });

  it("GIVEN a valid spot was saved, WHEN load is called, THEN it returns the correct SavedSpot object", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    storage.save(SAMPLE_SPOT);
    const result = storage.load();
    expect(result).not.toBeNull();
    expect(result).toEqual(SAMPLE_SPOT);
  });

  it("GIVEN nothing was saved, WHEN clear is called, THEN it does not throw", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    expect(() => storage.clear()).not.toThrow();
  });

  it("GIVEN the backend holds null under the key, WHEN load is called, THEN it returns null", () => {
    const backend = makeFakeBackend();
    const storage = createSpotStorage(backend);
    expect(storage.load()).toBeNull();
  });
});
