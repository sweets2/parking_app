import type { Sign } from "../shared/types";
import type { SpotStorage, SavedSpot } from "../shared/storage";
import {
  filterLoadTimeNoise,
  filterActive,
  filterNearby,
} from "../shared/parking-logic";

// ─── Exported types ───────────────────────────────────────────────────────────

export type AppState =
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | { mode: "browsing"; userLat: number | null; userLng: number | null; allSigns: Sign[]; activeSigns: Sign[] }
  | { mode: "parked"; spot: SavedSpot; allSigns: Sign[]; nearbySigns: Sign[] };

export type App = {
  getState(): AppState;
  /** Update the tapped position while in browsing mode. No-op in other modes. */
  setUserPosition(lat: number, lng: number): void;
  onSaveSpot(spot: SavedSpot): void;
  onClearSpot(): void;
  onHereNow(): void;
  /** Called by main.ts via setInterval every 60 s. No setInterval inside app.ts. */
  tick(now: Date): void;
};

// ─── createApp ────────────────────────────────────────────────────────────────

/**
 * Creates the app state machine. main.ts calls this after initMap(), then
 * calls setInterval(() => app.tick(new Date()), 60_000) — the interval lives
 * in main.ts, not here, so app.ts has no side effects.
 */
export function createApp(
  deps: { storage: SpotStorage; renderState: (state: AppState) => void },
  initialData: { signs: Sign[]; fetchTime: Date }
): App {
  const { storage, renderState } = deps;

  // Filter noise from the raw sign data at startup
  const allSigns = filterLoadTimeNoise(initialData.signs, initialData.fetchTime);

  // Determine initial state based on stored spot
  const savedSpot = storage.load();

  let currentState: AppState;

  if (savedSpot !== null) {
    const nearbySigns = filterNearby(allSigns, savedSpot.lat, savedSpot.lng, 150, initialData.fetchTime);
    currentState = {
      mode: "parked",
      spot: savedSpot,
      allSigns,
      nearbySigns,
    };
  } else {
    const activeSigns = filterActive(allSigns, initialData.fetchTime);
    currentState = {
      mode: "browsing",
      userLat: null,
      userLng: null,
      allSigns,
      activeSigns,
    };
  }

  // Emit initial state
  renderState(currentState);

  function setState(next: AppState): void {
    currentState = next;
    renderState(currentState);
  }

  return {
    getState(): AppState {
      return currentState;
    },

    setUserPosition(lat: number, lng: number): void {
      if (currentState.mode !== "browsing") return;
      const next: AppState = {
        mode: "browsing",
        userLat: lat,
        userLng: lng,
        allSigns: currentState.allSigns,
        activeSigns: currentState.activeSigns,
      };
      setState(next);
    },

    onSaveSpot(spot: SavedSpot): void {
      storage.save(spot);
      const signs = currentState.mode === "browsing" || currentState.mode === "parked"
        ? currentState.allSigns
        : [];
      // Use fetchTime as the reference for initial nearby computation;
      // tick() will refresh with the live clock
      const nearbySigns = filterNearby(signs, spot.lat, spot.lng, 150, initialData.fetchTime);
      setState({
        mode: "parked",
        spot,
        allSigns: signs,
        nearbySigns,
      });
    },

    onClearSpot(): void {
      storage.clear();
      const signs = currentState.mode === "parked" ? currentState.allSigns : [];
      const activeSigns = filterActive(signs, initialData.fetchTime);
      setState({
        mode: "browsing",
        userLat: null,
        userLng: null,
        allSigns: signs,
        activeSigns,
      });
    },

    onHereNow(): void {
      // Not a state change — triggers a map center operation in main.ts.
      // State remains parked; nothing to do here.
    },

    tick(now: Date): void {
      if (currentState.mode === "browsing") {
        const activeSigns = filterActive(currentState.allSigns, now);
        const next: AppState = {
          mode: "browsing",
          userLat: currentState.userLat,
          userLng: currentState.userLng,
          allSigns: currentState.allSigns,
          activeSigns,
        };
        currentState = next;
        renderState(currentState);
      } else if (currentState.mode === "parked") {
        const nearbySigns = filterNearby(
          currentState.allSigns,
          currentState.spot.lat,
          currentState.spot.lng,
          150,
          now
        );
        const next: AppState = {
          mode: "parked",
          spot: currentState.spot,
          allSigns: currentState.allSigns,
          nearbySigns,
        };
        currentState = next;
        renderState(currentState);
      }
      // In "loading" or "error" mode, tick is a no-op
    },
  };
}
