# Map Layers Skill

Use this skill when editing app/map.ts.

Hard rule:
Only app/map.ts may touch Leaflet directly.

Do not import Leaflet from:
- app/main.ts
- app/ui.ts
- shared/*.ts
- tests, except mocks/stubs when necessary

Layer ownership:
Use explicit layer collections:
- _checkResultLayers
- _rulesInspectionLayers
- _rulesInspectionMarker

Required app/map.ts exports:
clearCheckResults(): void
renderCheckResults(results: CheckResultSegment[]): void
selectCheckSegment(id: string): void
clearRulesInspection(): void
renderRulesInspection(sections: RulesInspectionSection[]): void
setRulesInspectionMarker(lat: number, lng: number): void
showRulesControls(): void
hideRulesControls(): void

Behavior:
- clearCheckResults removes only Check result layers.
- clearRulesInspection removes only Rules inspection layers and marker.
- Mode switching must call the correct clear function.
- Selecting a Check segment changes visual selected state without destroying all segment data.
- Rules click marker should be independent from Check result highlights.

Map click:
- app/map.ts may expose registration helpers.
- app/main.ts owns routing by activeMode.
- Do not create multiple competing map click handlers.

No CSS pane hacks:
Do not solve layer order by fragile CSS selectors against Leaflet internals.
Layer order belongs in app/map.ts.
