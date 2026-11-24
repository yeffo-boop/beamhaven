import { connection } from "next/server";
import { ZodError } from "zod";

import { toCsv } from "@/lib/csv";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { NotFoundError } from "@/server/services/errors";
import { buildCsvReport } from "@/server/services/reports";

/**
 * Downloads a CSV export (ADR-039): /api/reports/budget, /expenses or /tasks,
 * optionally with ?project=<id>. Only members of the household get a file;
 * anyone else, and any other household's project, gets the same 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  await connection();
  const { report } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) return notFound();
  const projectId = new URL(request.url).searchParams.get("project");
  try {
    const table = await buildCsvReport(ctx, report, projectId);
    return new Response(toCsv(table.header, table.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${table.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ZodError) return notFound();
    throw error;
  }
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
