/**
 * @deprecated Legacy saved-spot storage retained for CF-05/historical tests.
 * The current runtime product is Check | Rules and does not save parked spots.
 */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedSpot {
  lat: number;
  lng: number;
  side?: string;
  savedAt: string;
  address: string | null;
}

export interface SpotStorage {
  save(spot: SavedSpot): void;
  load(): SavedSpot | null;
  clear(): void;
}

const STORAGE_KEY = "hoboken_parking_spot";

function isValidSpot(value: unknown): value is SavedSpot {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["lat"] === "number" &&
    typeof obj["lng"] === "number" &&
    typeof obj["savedAt"] === "string" &&
    (typeof obj["address"] === "string" || obj["address"] === null)
  );
}

export function createSpotStorage(backend: StorageBackend): SpotStorage {
  return {
    save(spot: SavedSpot): void {
      backend.setItem(STORAGE_KEY, JSON.stringify(spot));
    },

    load(): SavedSpot | null {
      const raw = backend.getItem(STORAGE_KEY);
      if (raw === null) {
        return null;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isValidSpot(parsed)) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    clear(): void {
      backend.removeItem(STORAGE_KEY);
    },
  };
}
