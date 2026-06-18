import { track } from "./analytics";
import type { App } from "./app";
import {
  renderRulesInspection,
  setRulesInspectionMarker,
} from "./map";
import {
  setBottomSheetContent,
  setBottomSheetMode,
  showBottomSheet,
} from "./ui";
import { inspectRulesAtLocation } from "../shared/rules-inspector";
import type { ParkingSegment, RulesInspectionSection } from "../shared/types";

export function renderRulesClickInspection(input: {
  lat: number;
  lng: number;
  selectedTime: Date;
  segments: ParkingSegment[];
}): RulesInspectionSection[] {
  const { lat, lng, selectedTime, segments } = input;
  const sections = inspectRulesAtLocation({ lat, lng, selectedTime, segments });
  setRulesInspectionMarker(lat, lng);
  renderRulesInspection(sections);

  const html = sections
    .map((section) => {
      const priorityClass = `rules-section--${section.priority}`;
      return (
        `<div class="rules-section ${priorityClass}">` +
        `<div class="rules-section-title">${section.title}</div>` +
        `<div class="rules-section-content">${section.content}</div>` +
        `</div>`
      );
    })
    .join("");

  setBottomSheetContent(html);
  setBottomSheetMode("current");
  showBottomSheet();
  return sections;
}

export function wireCurrentControls(app: App): void {
  const rulesTimeNowBtn = document.getElementById("rules-time-now");
  const rulesTimeCustomBtn = document.getElementById("rules-time-custom");
  const rulesTimeInput = document.getElementById("rules-time-input") as HTMLInputElement | null;

  rulesTimeNowBtn?.addEventListener("click", () => {
    app.setRulesTimeNow(new Date());
    rulesTimeNowBtn?.setAttribute("aria-pressed", "true");
    rulesTimeCustomBtn?.setAttribute("aria-pressed", "false");
    track("rules-time-mode-selected", { mode: "now" });
  });

  rulesTimeCustomBtn?.addEventListener("click", () => {
    rulesTimeNowBtn?.setAttribute("aria-pressed", "false");
    rulesTimeCustomBtn?.setAttribute("aria-pressed", "true");
    track("rules-time-mode-selected", { mode: "custom" });
  });

  rulesTimeInput?.addEventListener("change", () => {
    const val = rulesTimeInput !== null ? rulesTimeInput.value : "";
    if (val.length === 0) return;

    const now = new Date();
    const [hoursStr, minutesStr] = val.split(":");
    const hours = parseInt(hoursStr ?? "0", 10);
    const minutes = parseInt(minutesStr ?? "0", 10);
    app.setRulesTimeCustom(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0));
    track("rules-time-custom-set", { time: val });
  });
}
