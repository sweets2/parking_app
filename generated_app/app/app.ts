import type {
  Sign,
  AppMode,
  CheckQuery,
  CheckResultSegment,
  RulesTimeSelection,
  RulesInspectionSection,
  ParkingSegment,
} from "../shared/types";
import {
  filterLoadTimeNoise,
  filterActive,
} from "../shared/parking-logic";
import {
  clearCheckResults,
  clearRulesInspection,
} from "./map";

// ─── Exported types ───────────────────────────────────────────────────────────

export type AppState =
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | {
      mode: "ready";
      activeMode: AppMode;
      checkQuery: CheckQuery;
      checkResults: CheckResultSegment[];
      selectedCheckSegment: CheckResultSegment | null;
      rulesTime: RulesTimeSelection;
      selectedRulesLocation: { lat: number; lng: number; street?: string } | null;
      rulesInspectionSections: RulesInspectionSection[];
      allSigns: Sign[];
      activeSigns: Sign[];
      parkingSegments: ParkingSegment[];
    };

export type App = {
  getState(): AppState;
  setActiveMode(mode: AppMode): void;
  setRulesLocation(lat: number, lng: number): void;
  setRulesInspectionSections(sections: RulesInspectionSection[]): void;
  tick(now: Date): void;
};

// ─── createApp ────────────────────────────────────────────────────────────────

/**
 * Creates the app state machine. main.ts calls this after initMap(), then
 * calls setInterval(() => app.tick(new Date()), 60_000) — the interval lives
 * in main.ts, not here, so app.ts has no side effects.
 *
 * @param deps       - renderState callback only (storage removed)
 * @param initialData - signs, the time they were fetched, and pre-built parkingSegments
 * @param now        - current time, used to set initial rulesTime.selectedTime
 */
export function createApp(
  deps: { renderState: (state: AppState) => void },
  initialData: { signs: Sign[]; fetchTime: Date; parkingSegments: ParkingSegment[] },
  now: Date
): App {
  const { renderState } = deps;

  // Filter noise from the raw sign data at startup
  const allSigns = filterLoadTimeNoise(initialData.signs, initialData.fetchTime);
  const activeSigns = filterActive(allSigns, initialData.fetchTime);

  // Default checkQuery — a "now" query using the provided time
  const defaultCheckQuery: CheckQuery = {
    startTime: now,
    endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours ahead
    label: "Now",
    source: "duration",
  };

  let currentState: AppState = {
    mode: "ready",
    activeMode: "check",
    checkQuery: defaultCheckQuery,
    checkResults: [],
    selectedCheckSegment: null,
    rulesTime: { mode: "now", selectedTime: now },
    selectedRulesLocation: null,
    rulesInspectionSections: [],
    allSigns,
    activeSigns,
    parkingSegments: initialData.parkingSegments,
  };

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

    setActiveMode(mode: AppMode): void {
      if (currentState.mode !== "ready") return;
      if (currentState.activeMode === mode) return;

      if (mode === "rules") {
        // Switching to rules: clear check result layers
        clearCheckResults();
      } else {
        // Switching to check: clear rules inspection layers
        clearRulesInspection();
      }

      setState({
        ...currentState,
        activeMode: mode,
      });
    },

    setRulesLocation(lat: number, lng: number): void {
      if (currentState.mode !== "ready") return;
      setState({
        ...currentState,
        selectedRulesLocation: { lat, lng },
      });
    },

    setRulesInspectionSections(sections: RulesInspectionSection[]): void {
      if (currentState.mode !== "ready") return;
      setState({
        ...currentState,
        rulesInspectionSections: sections,
      });
    },

    tick(tickNow: Date): void {
      if (currentState.mode !== "ready") return;

      const updatedActiveSigns = filterActive(currentState.allSigns, tickNow);
      currentState = {
        ...currentState,
        activeSigns: updatedActiveSigns,
      };
      renderState(currentState);
    },
  };
}
