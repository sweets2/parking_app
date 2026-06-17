/**
 * tests/unit/api-feedback.test.ts — CF-14
 *
 * Tests for the Vercel Edge serverless function at api/feedback.ts.
 * Runs in Node (environment: "node").
 * Constructs synthetic Request objects using the Web API (Node 18+).
 */

import { describe, it, expect } from "vitest";
import { handler } from "../../api/feedback";

describe("CF-14 api/feedback handler", () => {
  it("GIVEN a POST request with body { message: 'hello' }, WHEN handler(req) is called, THEN response status is 200 and JSON body equals { ok: true }", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toEqual({ ok: true });
  });

  it("GIVEN a POST request with body { message: '' } (empty string), WHEN handler(req) is called, THEN response status is 400 and JSON body contains { error: 'message required' }", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body).toEqual({ error: "message required" });
  });

  it("GIVEN a POST request with body {} (no message field), WHEN handler(req) is called, THEN response status is 400 and JSON body contains { error: 'message required' }", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body).toEqual({ error: "message required" });
  });

  it("GIVEN a GET request, WHEN handler(req) is called, THEN response status is 405", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "GET",
    });
    const res = await handler(req);
    expect(res.status).toBe(405);
  });
});
