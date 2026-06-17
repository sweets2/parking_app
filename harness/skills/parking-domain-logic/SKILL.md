# Parking Domain Logic Skill

Use this skill when editing shared/*.ts other than shared/types.ts.

Pure logic rules:
- No browser globals.
- No DOM.
- No localStorage.
- No fetch.
- No Leaflet.
- No direct new Date() inside evaluation functions.
- Time must be injected through parameters.

ParkingStatus priority:
Use this ordering from worst to best:
1. tow
2. snow
3. ticket
4. limited
5. unknown
6. safe

When multiple restrictions overlap the same interval, choose the highest-priority status.

Time-window evaluation:
- Do not use fixed 30-minute sampling.
- Expand schedule intervals exactly.
- A restriction conflicts if its expanded interval overlaps the requested parking window.
- Default interval policy:
  - start is inclusive
  - end is exclusive
- Explicitly test boundary cases.

Segment catalog:
- Do not collapse a street into one segment.
- Segment identity must include:
  - normalized street
  - side
  - location/range when available
- Washington St must not collapse east/west/north/south or block-specific rules into one generic street result.
- If location or side is unknown, preserve that uncertainty in the segment instead of guessing.

Recommended segment ID shape:
normalized-street__side__normalized-location-range

Example:
washington-st__east__observer-hwy-to-4th-st
