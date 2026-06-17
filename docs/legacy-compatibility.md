# Legacy Compatibility Inventory

The current product direction is Check | Rules only. The following code remains
for compatibility with older feature tests and harness history, not because it
represents active product behavior.

## Retained Legacy Code

- `shared/storage.ts` — saved-spot storage from the old parked flow. Retained
  because `harness/features.json` still lists it as a CF-05 output and
  `tests/unit/storage.test.ts` verifies the historical contract.
- `app/main.ts init(initialMode: "browsing" | "parked")` — legacy test harness
  entry point for old map-click street-cleaning popup behavior. Production uses
  `initBrowserApp()`.
- `app/ui.ts renderClearBanner`, `renderWarningBanner`, `showSpotToast`, and
  `showStaleBanner` — old parked/saved-spot UI helpers. Retained because legacy
  unit tests still exercise them.
- `app/map.ts renderSpotMarker`, `clearSpotMarker`, `centerOnSpot`, and
  `showStreetPopup` — old saved-spot/street-cleaning popup helpers. Some current
  code still reuses `centerOnSpot` for the locate button.

## Deletion Rule

Do not delete these files or exports until both conditions are true:

1. `rg` shows no production imports or calls.
2. The associated historical tests have either been removed or moved to an
   archived compatibility test suite.

When the harness feature graph no longer lists these outputs, the preferred
cleanup is to move legacy tests and helpers together in one commit.
