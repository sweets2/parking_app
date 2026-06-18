# App State UI Skill

Use this skill when editing app/, shared/types.ts, app/main.ts, app/ui.ts, app/index.html, or app/style.css.

Product modes:
- Only two user-facing modes exist:
  - check
  - current

Allowed type:
export type AppMode = "check" | "current";

Do not introduce:
- parked mode
- browsing mode as a user-facing mode
- alert mode
- saved spot mode
- reminder mode
- notification mode

Ready-state shape must preserve required loaded data:
- allSigns
- activeSigns
- parkingSegments, once segment catalog exists
- checkQuery
- checkResults
- selectedCheckSegment
- rulesTime
- selectedRulesLocation
- rulesInspectionSections

Mode switching:
- setActiveMode("check") clears Current inspection layers and shows Check controls.
- setActiveMode("current") clears Check result layers and shows Current controls.
- Switching modes must not save a spot.
- Switching modes must not trigger notifications, reminders, alerts, or background work.

Map click:
- There must be exactly one map click handler.
- It routes by activeMode:
  - check → handleCheckClick
  - current → handleRulesClick
- Do not register separate independent map click handlers per mode.

UI:
- The map is the primary visual surface.
- Bottom sheets are preferred for details on mobile.
- Desktop may use a side panel or wider bottom panel only if it preserves map visibility.
- Check and Current nav labels must be exactly "Check" and "Current".
- Avoid copy that implies alerting or background monitoring.
