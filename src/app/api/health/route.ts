import { connection } from "next/server";

import { checkDatabase } from "@/server/data/health";

/**
 * Health check used by Docker, monitoring and humans: GET /api/health
 *
 * Returns 200 when the app and database are fine, 503 when the database is
 * unreachable. It deliberately reveals nothing sensitive (no hostnames,
 * versions or settings).
 */
export async function GET() {
  // Run on every request instead of being prerendered at build time.
  await connection();

  const database = await checkDatabase();

  return Response.json(
    {
      status: database.ok ? "ok" : "degraded",
      checks: { app: "ok", database: database.ok ? "ok" : database.error },
      time: new Date().toISOString(),
    },
    { status: database.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
