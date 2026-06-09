export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedSpot {
  lat: number;
  lng: number;
  side: "N" | "S" | "E" | "W";
  savedAt: string;
  address: string | null;
}

export interface SpotStorage {
  save(spot: SavedSpot): void;
  load(): SavedSpot | null;
  clear(): void;
}

const STORAGE_KEY = "hoboken_parking_spot";

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
        return JSON.parse(raw) as SavedSpot;
      } catch {
        return null;
      }
    },

    clear(): void {
      backend.removeItem(STORAGE_KEY);
    },
  };
}
