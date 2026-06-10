/**
 * Unit tests for F-12 PWA Shell
 *
 * F-12.1 — manifest.json validity and required fields
 * F-12.2 — main.ts contains SW registration
 * F-12.3 — sw.ts app shell cache
 * F-12.4 — sw.ts network-first strategy for latest.json
 *
 * All tests are file-content assertions (read source as text or parse JSON).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../app");

// ─── F-12.1 manifest.json ─────────────────────────────────────────────────────

describe("F-12.1 manifest.json", () => {
  it("GIVEN the manifest is fetched, THEN it is valid JSON", () => {
    const raw = readFileSync(resolve(ROOT, "manifest.json"), "utf-8");
    expect(() => {
      JSON.parse(raw);
    }).not.toThrow();
  });

  it("GIVEN the manifest, THEN display is 'standalone'", () => {
    const raw = readFileSync(resolve(ROOT, "manifest.json"), "utf-8");
    const m = JSON.parse(raw) as Record<string, unknown>;
    expect(m["display"]).toBe("standalone");
  });

  it("GIVEN the manifest, THEN one icon entry has sizes containing '192x192'", () => {
    const raw = readFileSync(resolve(ROOT, "manifest.json"), "utf-8");
    const m = JSON.parse(raw) as Record<string, unknown>;
    const icons = m["icons"] as Array<{ sizes: string }>;
    const has192 = icons.some((icon) => icon.sizes.includes("192x192"));
    expect(has192).toBe(true);
  });

  it("GIVEN the manifest, THEN one icon entry has sizes containing '512x512'", () => {
    const raw = readFileSync(resolve(ROOT, "manifest.json"), "utf-8");
    const m = JSON.parse(raw) as Record<string, unknown>;
    const icons = m["icons"] as Array<{ sizes: string }>;
    const has512 = icons.some((icon) => icon.sizes.includes("512x512"));
    expect(has512).toBe(true);
  });
});

// ─── F-12.2 main.ts SW registration ──────────────────────────────────────────

describe("F-12.2 main.ts service worker registration", () => {
  let mainSource: string;

  beforeAll(() => {
    mainSource = readFileSync(resolve(ROOT, "main.ts"), "utf-8");
  });

  it("GIVEN app/main.ts source, THEN it contains serviceWorker.register and sw.js", () => {
    expect(mainSource).toContain("serviceWorker.register");
    expect(mainSource).toContain("sw.js");
  });

  it("GIVEN app/main.ts source, THEN the registration call is wrapped in a try/catch or .catch( error handler", () => {
    const hasTryCatch = /try\s*\{[\s\S]*?serviceWorker\.register[\s\S]*?\}\s*catch/.test(mainSource);
    const hasDotCatch = /serviceWorker\.register[\s\S]{0,200}\.catch\(/.test(mainSource);
    expect(hasTryCatch || hasDotCatch).toBe(true);
  });
});

// ─── F-12.3 sw.ts app shell cache ────────────────────────────────────────────

describe("F-12.3 sw.ts app shell offline cache", () => {
  let swSource: string;

  beforeAll(() => {
    swSource = readFileSync(resolve(ROOT, "sw.ts"), "utf-8");
  });

  it("GIVEN app/sw.ts source, THEN it contains all of: 'index.html', 'app.js', 'style.css', 'manifest.json'", () => {
    expect(swSource).toContain("'index.html'");
    expect(swSource).toContain("'app.js'");
    expect(swSource).toContain("'style.css'");
    expect(swSource).toContain("'manifest.json'");
  });

  it("GIVEN app/sw.ts source, THEN it defines a CACHE_NAME constant whose value includes a version identifier (matches /v\\d/)", () => {
    expect(/CACHE_NAME\s*=\s*['"`][^'"`]*v\d[^'"`]*['"`]/.test(swSource)).toBe(true);
  });

  it("GIVEN app/sw.ts source, THEN it contains an activate handler that deletes caches not matching CACHE_NAME", () => {
    expect(swSource).toContain("activate");
    expect(swSource).toMatch(/caches\.delete/);
  });
});

// ─── F-12.4 latest.json network-first strategy ───────────────────────────────

describe("F-12.4 sw.ts latest.json network-first strategy", () => {
  let swSource: string;

  beforeAll(() => {
    swSource = readFileSync(resolve(ROOT, "sw.ts"), "utf-8");
  });

  it("GIVEN app/sw.ts source, THEN it contains 'latest.json' inside a fetch handler (network-first logic for that path)", () => {
    expect(swSource).toContain("latest.json");
    expect(swSource).toContain("fetch");
  });

  it("GIVEN app/sw.ts source, THEN it contains the exact string 'No data available — go online to load parking signs' as the offline fallback message", () => {
    expect(swSource).toContain(
      "No data available — go online to load parking signs"
    );
  });
});
