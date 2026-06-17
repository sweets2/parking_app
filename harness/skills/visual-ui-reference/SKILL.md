# Visual UI Reference Skill

Use this skill when touching app/index.html, app/style.css, app/main.ts, app/ui.ts, or app/map.ts.

Prototype files:
- Look for docs/prototypes/PROTOTYPE_NOTES.md.
- If available, inspect all images in docs/prototypes/.
- If image inspection is unavailable, rely on PROTOTYPE_NOTES.md and written feature specs.

Prototype priority:
- Written spec wins over prototype image.
- Prototype images guide visual hierarchy, not exact pixel values.
- Do not invent features that only appear visually if not described in the spec.

Preserve these visual ideas:
- Map-first layout.
- Check | Rules navigation is obvious but not oversized.
- Bottom sheets should not cover the entire map by default.
- Rules inspection should show explicit street segment details.
- Status colors/classes should be consistent across map highlights and bottom sheets.
- Touch targets should be usable on mobile.
- UI should remain readable at 375px width and 768px width.
- Desktop should not look like a stretched mobile-only layout.

Status class naming:
Use stable classes:
- .status-safe
- .status-unknown
- .status-limited
- .status-ticket
- .status-tow
- .status-snow

Do not use CSS hacks that depend on Leaflet pane internals unless app/map.ts owns the related layer behavior.
