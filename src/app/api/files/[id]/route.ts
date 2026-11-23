import { connection } from "next/server";

import { getWorkspaceContext } from "@/server/auth/workspace";
import { NotFoundError } from "@/server/services/errors";
import { readFileForDownload } from "@/server/services/attachments";

/**
 * Serves an uploaded file, only to members of the household it belongs to
 * (ADR-012). Anyone else, signed in or not, gets the same 404, so nobody can
 * tell whether a file exists in another household.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) return notFound();
  try {
    const { file, bytes } = await readFileForDownload(ctx, id);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        // Only this person's browser may keep a copy, never a shared cache.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        // Even if a file were somehow not an image, it can't run anything.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return notFound();
    throw error;
  }
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
