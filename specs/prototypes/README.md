# v2.2 Prototypes

Design mockups for the **Check / Rules / Alerts UX overhaul** (see the v2.2 plan
commit `7d48387`). These are visual prototypes for new features — reference only,
not implemented behavior.

## Files

Drop the mockup images here using these filenames:

| Filename | Tab | Form factor | Description |
|----------|-----|-------------|-------------|
| `01-rules-future-mobile.png` | Rules | Mobile | "Viewing future rules" — bottom sheet shows Bloomfield St — East side with Tow zone (9:00–10:00 AM) and Street cleaning (9:00–10:00 AM). "Back to now" pill, "View at: Tue 9:00 AM" header. |
| `02-check-park-2-days-desktop.png` | Check | Desktop | "Park for 2 days" stepper. Left panel: "Safe to park here" (18h 24m), valid Mon May 12 → Tue May 13, next restriction Wed May 14 street cleaning. |
| `03-rules-map-desktop.png` | Rules | Desktop | "Rules map" with Map layers toggles (Active tow zones, Upcoming tow zones, Street cleaning, Snow routes, Garages), date/time picker, tow/cleaning popup ("In effect now"), and legend. |
| `04-check-park-2-days-mobile.png` | Check | Mobile | Mobile version of "Park for 2 days" — map with green/red/blue segments, bottom sheet "Safe to park here" 18h 24m, next restriction Wed May 14 street cleaning. |

## Map legend (shared across prototypes)

- **Green solid** — Safe to park
- **Red dashed** — Street cleaning
- **Red solid** — Tow zone
- **Blue solid** — Snow route

Tow zones (solid red) override street cleaning (dashed red) on the same block side.
