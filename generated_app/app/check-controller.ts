import { track } from "./analytics";
import type { App } from "./app";
import {
  clearCheckResults,
  renderCheckResults,
} from "./map";
import { createDurationCheckQuery, parseCheckQuery } from "../shared/query-parser";
import { evaluateParkingWindow } from "../shared/parking-logic";
import type { CheckQuery, CheckResultSegment } from "../shared/types";

let checkResults: CheckResultSegment[] = [];

export function getCheckResults(): CheckResultSegment[] {
  return checkResults;
}

export function wireCheckControls(app: App): void {
  const dur30Btn = document.getElementById("check-duration-30");
  const dur60Btn = document.getElementById("check-duration-60");
  const dur120Btn = document.getElementById("check-duration-120");
  const checkQueryInput = document.getElementById("check-query-input") as HTMLInputElement | null;
  const checkRunBtn = document.getElementById("check-run-button");

  let activeCheckQuery: CheckQuery | null = null;

  function setDurationPressedState(activeBtn: HTMLElement | null): void {
    [dur30Btn, dur60Btn, dur120Btn].forEach((btn) => {
      btn?.setAttribute("aria-pressed", String(btn === activeBtn));
    });
  }

  function selectDuration(btn: HTMLElement | null, minutes: number): void {
    activeCheckQuery = createDurationCheckQuery(minutes, new Date());
    setDurationPressedState(btn);
    if (checkQueryInput !== null) checkQueryInput.value = "";
  }

  dur30Btn?.addEventListener("click", () => {
    selectDuration(dur30Btn, 30);
    track("check-duration-selected", { minutes: 30 });
  });

  dur60Btn?.addEventListener("click", () => {
    selectDuration(dur60Btn, 60);
    track("check-duration-selected", { minutes: 60 });
  });

  dur120Btn?.addEventListener("click", () => {
    selectDuration(dur120Btn, 120);
    track("check-duration-selected", { minutes: 120 });
  });

  checkQueryInput?.addEventListener("input", () => {
    activeCheckQuery = null;
    setDurationPressedState(null);
  });

  checkRunBtn?.addEventListener("click", () => {
    const state = app.getState();
    if (state.mode !== "ready") return;

    let query: CheckQuery | null = activeCheckQuery;

    if (query === null) {
      const rawText = checkQueryInput?.value.trim() ?? "";
      if (rawText.length > 0) {
        query = parseCheckQuery(rawText, new Date());
      }
    }

    const resolvedQuery: CheckQuery = query ?? createDurationCheckQuery(120, new Date());

    track("check-query-run", { label: resolvedQuery.label });

    checkResults = state.parkingSegments.map((seg) =>
      evaluateParkingWindow(seg, resolvedQuery)
    );

    clearCheckResults();
    renderCheckResults(checkResults, state.allSigns);
  });

  const queryInput = document.getElementById("query-input") as HTMLInputElement | null;
  const querySubmitBtn = document.getElementById("query-submit-btn");

  function runQueryBarCheck(text: string): void {
    const state = app.getState();
    if (state.mode !== "ready") return;
    const parsed = parseCheckQuery(text, new Date()) ?? createDurationCheckQuery(120, new Date());
    track("check-query-run", { label: parsed.label });
    checkResults = state.parkingSegments.map((seg) => evaluateParkingWindow(seg, parsed));
    clearCheckResults();
    renderCheckResults(checkResults, state.allSigns);
  }

  querySubmitBtn?.addEventListener("click", () => {
    runQueryBarCheck(queryInput?.value.trim() ?? "");
  });

  queryInput?.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") runQueryBarCheck(queryInput.value.trim());
  });
}
