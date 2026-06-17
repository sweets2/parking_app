/**
 * Unit tests for CF-13 PWA Shell
 *
 * Tests verify static file contents (string/JSON checks via fs.readFileSync).
 * The service worker is not imported or executed in Node.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const APP_DIR = resolve(__dirname, "../../app");

// ─── manifest.json contents ───────────────────────────────────────────────────

describe("manifest.json contents", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(APP_DIR, "manifest.json"), "utf-8")
  ) as Record<string, unknown>;

  it("GIVEN manifest.json is read as JSON, WHEN the name field is accessed, THEN it equals Hoboken Parking", () => {
    expect(manifest["name"]).toBe("Hoboken Parking");
  });

  it("GIVEN manifest.json is read as JSON, WHEN the short_name field is accessed, THEN it equals HP Parking", () => {
    expect(manifest["short_name"]).toBe("HP Parking");
  });

  it("GIVEN manifest.json is read as JSON, WHEN the display field is accessed, THEN it equals standalone", () => {
    expect(manifest["display"]).toBe("standalone");
  });

  it("GIVEN manifest.json is read as JSON, WHEN the icons array is accessed, THEN it contains an entry with src icon-192.png and sizes 192x192", () => {
    const icons = manifest["icons"] as Array<{ src: string; sizes: string; type: string }>;
    const icon192 = icons.find(
      (i) => i.src === "icon-192.png" && i.sizes === "192x192"
    );
    expect(icon192).toBeDefined();
  });

  it("GIVEN manifest.json is read as JSON, WHEN the icons array is accessed, THEN it contains an entry with src icon-512.png and sizes 512x512", () => {
    const icons = manifest["icons"] as Array<{ src: string; sizes: string; type: string }>;
    const icon512 = icons.find(
      (i) => i.src === "icon-512.png" && i.sizes === "512x512"
    );
    expect(icon512).toBeDefined();
  });

  it("GIVEN manifest.json is read as JSON, WHEN the start_url field is accessed, THEN it equals /", () => {
    expect(manifest["start_url"]).toBe("/");
  });
});

// ─── sw.ts static content ─────────────────────────────────────────────────────

describe("sw.ts static content", () => {
  const swSource = readFileSync(resolve(APP_DIR, "sw.ts"), "utf-8");

  it("GIVEN app/sw.ts is read as a string, WHEN searched for the cache name constant, THEN it contains the literal string hoboken-parking-v2", () => {
    expect(swSource).toContain('"hoboken-parking-v2"');
  });

  it("GIVEN app/sw.ts is read as a string, WHEN searched for skipWaiting, THEN it contains skipWaiting()", () => {
    expect(swSource).toContain("skipWaiting()");
  });

  it("GIVEN app/sw.ts is read as a string, WHEN searched for the network-first data URL, THEN it contains data/latest.json", () => {
    expect(swSource).toContain('"data/latest.json"');
  });

  it("GIVEN app/sw.ts is read as a string, WHEN the APP_SHELL_URLS list is examined, THEN it contains /index.html and /app.js and /style.css", () => {
    expect(swSource).toContain('"/index.html"');
    expect(swSource).toContain('"/app.js"');
    expect(swSource).toContain('"/style.css"');
  });
});
