import { track } from "./analytics";
import {
  setGarageMarkersVisible,
  setSnowRoutesVisible,
  setTowSignsVisible,
  setUpcomingSignsVisible,
  setViolationHighlightsVisible,
} from "./map";

export function wireLayerToggles(): void {
  const towLegend = document.getElementById("tow-legend");
  const towToggle = document.getElementById("tow-toggle");
  if (towLegend !== null && towToggle !== null) {
    towToggle.addEventListener("click", () => {
      const isOn = !towLegend.classList.contains("tow-off");
      setTowSignsVisible(!isOn);
      track("tow-zones-toggled", { enabled: !isOn });
      towLegend.classList.toggle("tow-off", isOn);
      towToggle.setAttribute("aria-pressed", String(!isOn));
    });
  }

  const violationLegend = document.getElementById("violation-legend");
  const violationToggle = document.getElementById("violation-toggle");
  if (violationLegend !== null && violationToggle !== null) {
    violationToggle.addEventListener("click", () => {
      const isOn = !violationLegend.classList.contains("violation-off");
      setViolationHighlightsVisible(!isOn);
      track("violation-highlights-toggled", { enabled: !isOn });
      violationLegend.classList.toggle("violation-off", isOn);
      violationToggle.setAttribute("aria-pressed", String(!isOn));
    });
  }

  const upcomingToggle = document.getElementById("upcoming-toggle");
  upcomingToggle?.addEventListener("click", () => {
    const isOn = upcomingToggle.getAttribute("aria-pressed") === "true";
    const next = !isOn;
    setUpcomingSignsVisible(next);
    track("upcoming-signs-toggled", { enabled: next });
    upcomingToggle.setAttribute("aria-pressed", String(next));
    document.getElementById("upcoming-legend")?.classList.toggle("upcoming-off", !next);
  });
  upcomingToggle?.setAttribute("aria-pressed", "false");
  document.getElementById("upcoming-legend")?.classList.add("upcoming-off");

  const garageToggle = document.getElementById("garage-toggle");
  garageToggle?.addEventListener("click", () => {
    const isOn = garageToggle.getAttribute("aria-pressed") === "true";
    const next = !isOn;
    setGarageMarkersVisible(next);
    track("garages-toggled", { enabled: next });
    garageToggle.setAttribute("aria-pressed", String(next));
    document.getElementById("garage-legend")?.classList.toggle("garage-off", !next);
  });

  const snowToggle = document.getElementById("snow-toggle");
  snowToggle?.addEventListener("click", () => {
    const isOn = snowToggle.getAttribute("aria-pressed") === "true";
    const next = !isOn;
    setSnowRoutesVisible(next);
    track("snow-routes-toggled", { enabled: next });
    snowToggle.setAttribute("aria-pressed", String(next));
    document.getElementById("snow-legend")?.classList.toggle("snow-off", !next);
  });
  snowToggle?.setAttribute("aria-pressed", "false");
  document.getElementById("snow-legend")?.classList.add("snow-off");
}
