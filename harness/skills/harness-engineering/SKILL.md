# Harness Engineering Skill

Use this skill when editing harness/ files.

Hard rules:
- workflow.js runs in the harness environment. Do not import fs, path, child_process, or require modules inside workflow.js unless the existing harness already supports it.
- Prefer deterministic JavaScript inside workflow.js and shell commands through the agent where the workflow already does that.
- Do not make the harness depend on generated_app/app/app.js or generated_app/app/sw.js.
- Do not run npm run build inside Creator or Reviser.
- The verifier may run npm run build. It is skipped only when required data files are absent.
- If adding a feature field, update FRONT_MATTER_SCHEMA.
- If adding a generated output prefix, update GENERATED_PREFIXES and path validators.
- Any feature writing harness/ files must have harness_task: true.
- No output_files or context_files may contain .. or absolute paths.
- For app files, use unprefixed paths in features.json, such as app/main.ts, not generated_app/app/main.ts.
- Use toOutputPath to map app/, shared/, tests/, data/, api/, fetcher/, package.json, tsconfig.json, vitest.config.ts, and vercel.json to generated_app/.
- Repo-root files such as harness/, specs/, docs/ remain repo-root paths.

Fail early:
- Bad feature graph should fail before Creator runs.
- Missing spec file should fail before Creator runs.
- Drift terms in F-46+ specs should fail before Creator runs unless explicitly deprecated.
- Missing required spec sections should fail before Creator runs.
