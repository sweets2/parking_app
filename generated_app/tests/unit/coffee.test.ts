// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { initCoffee } from "../../app/main";

const HTML = `
  <button id="coffee-btn" title="Buy me a coffee" aria-label="Support the developer">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
      <line x1="6" x2="6" y1="2" y2="4"/>
      <line x1="10" x2="10" y1="2" y2="4"/>
      <line x1="14" x2="14" y1="2" y2="4"/>
    </svg>
  </button>
  <div id="coffee-popover" aria-hidden="true" role="tooltip">
    <p class="coffee-msg">Enjoying the app? Help keep the lights on.</p>
    <a id="coffee-link"
       href="https://ko-fi.com/neighborhooddev"
       target="_blank"
       rel="noopener noreferrer">&#x2615; Buy me a coffee</a>
  </div>
`;

describe("coffee button", () => {
  beforeEach(() => {
    document.body.innerHTML = HTML;
    initCoffee();
  });

  // Test 1: clicking coffee-btn opens the popover
  it("GIVEN #coffee-btn and #coffee-popover, WHEN #coffee-btn is clicked, THEN #coffee-popover has class open", () => {
    const btn = document.getElementById("coffee-btn") as HTMLButtonElement;
    const popover = document.getElementById("coffee-popover") as HTMLDivElement;

    btn.click();

    expect(popover.classList.contains("open")).toBe(true);
  });

  // Test 2: clicking coffee-btn again closes the popover (toggle off)
  it("GIVEN #coffee-popover has class open, WHEN #coffee-btn is clicked again, THEN #coffee-popover does not have class open", () => {
    const btn = document.getElementById("coffee-btn") as HTMLButtonElement;
    const popover = document.getElementById("coffee-popover") as HTMLDivElement;

    // Open it first
    btn.click();
    expect(popover.classList.contains("open")).toBe(true);

    // Now toggle off
    btn.click();
    expect(popover.classList.contains("open")).toBe(false);
  });

  // Test 3: outside click closes the popover
  it("GIVEN #coffee-popover has class open, WHEN a click event is dispatched on document.body (outside), THEN #coffee-popover does not have class open", () => {
    const btn = document.getElementById("coffee-btn") as HTMLButtonElement;
    const popover = document.getElementById("coffee-popover") as HTMLDivElement;

    // Open it first via button click (which stopPropagation prevents bubbling)
    btn.click();
    expect(popover.classList.contains("open")).toBe(true);

    // Click outside
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(popover.classList.contains("open")).toBe(false);
  });

  // Test 4: Escape key closes the popover
  it("GIVEN #coffee-popover has class open, WHEN a keydown event with key Escape is dispatched, THEN #coffee-popover does not have class open", () => {
    const btn = document.getElementById("coffee-btn") as HTMLButtonElement;
    const popover = document.getElementById("coffee-popover") as HTMLDivElement;

    // Open first
    btn.click();
    expect(popover.classList.contains("open")).toBe(true);

    // Press Escape
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(popover.classList.contains("open")).toBe(false);
  });

  // Test 5: index.html contains id="coffee-btn"
  it("GIVEN app/index.html source, THEN it contains id=\"coffee-btn\"", () => {
    const htmlPath = path.resolve(__dirname, "../../app/index.html");
    const source = fs.readFileSync(htmlPath, "utf-8");
    expect(source).toContain('id="coffee-btn"');
  });

  // Test 6: index.html contains id="coffee-popover"
  it("GIVEN app/index.html source, THEN it contains id=\"coffee-popover\"", () => {
    const htmlPath = path.resolve(__dirname, "../../app/index.html");
    const source = fs.readFileSync(htmlPath, "utf-8");
    expect(source).toContain('id="coffee-popover"');
  });

  // Test 7: #coffee-link has href="https://ko-fi.com/neighborhooddev"
  it("GIVEN app/index.html source, THEN #coffee-link has href=\"https://ko-fi.com/neighborhooddev\"", () => {
    const htmlPath = path.resolve(__dirname, "../../app/index.html");
    const source = fs.readFileSync(htmlPath, "utf-8");
    expect(source).toContain('href="https://ko-fi.com/neighborhooddev"');
  });

  // Test 8: #coffee-link has rel="noopener noreferrer"
  it("GIVEN app/index.html source, THEN #coffee-link has rel=\"noopener noreferrer\"", () => {
    const htmlPath = path.resolve(__dirname, "../../app/index.html");
    const source = fs.readFileSync(htmlPath, "utf-8");
    expect(source).toContain('rel="noopener noreferrer"');
  });
});
