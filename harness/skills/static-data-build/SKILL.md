# Static Data Build Skill

Use this skill when editing data/, fetcher/, package.json, vercel.json, or api/.

Architecture:
- Prefer static-first behavior.
- Do not add a backend unless the feature explicitly requires it.
- Static data required before first render must be awaited before createApp().
- If adding files under data/, ensure npm run build copies them into the deployable app when needed.
- If adding fetcher scripts that call external services, include required User-Agent behavior.
- Nominatim/OpenStreetMap requests must include a meaningful User-Agent.

Runtime:
- Browser app should read local static JSON where possible.
- Avoid paid APIs.
- Avoid secrets.
- Do not require hosted infrastructure for portfolio/demo use.
