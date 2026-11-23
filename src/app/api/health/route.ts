import { connection } from "next/server";

/**
 * Health check used by Docker, monitoring and humans: GET /api/health
 *
 * Milestone 1 reports that the web server is running. The database check is
 * added together with PostgreSQL in the next step. It deliberately reveals
 * nothing sensitive (no versions of dependencies, hostnames or settings).
 */
export async function GET() {
  // Run on every request instead of being prerendered at build time.
  await connection();

  return Response.json(
    { status: "ok", checks: { app: "ok" }, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
