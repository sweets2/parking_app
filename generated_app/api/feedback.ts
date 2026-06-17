/**
 * api/feedback.ts — CF-14
 *
 * Vercel Edge serverless function: receives feedback form POSTs.
 *
 * Named exports only (CLAUDE.md: no default exports).
 *
 * POST /api/feedback
 *   Body: { message: string, email?: string }
 *   Returns 405 if method is not POST.
 *   Returns 400 { error: "message required" } if message is missing or empty.
 *   Returns 200 { ok: true } if message is non-empty.
 */

export const config: { runtime: string } = { runtime: "edge" };

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  let message = "";
  try {
    const body = (await req.json()) as { message?: unknown };
    message = typeof body.message === "string" ? body.message.trim() : "";
  } catch {
    message = "";
  }

  if (!message) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
