import { connection } from "next/server";
import { ZodError } from "zod";

import { getEnv } from "@/config/env";
import { PermissionError } from "@/server/auth/permissions";
import { fieldErrors } from "@/server/auth/validation";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { UploadError } from "@/server/services/attachments";
import { addDocumentVersion, createLibraryDocument } from "@/server/services/documents";
import { NotFoundError } from "@/server/services/errors";
import { createRateLimiter } from "@/server/security/rate-limit";

const uploadLimiter = createRateLimiter({ max: 300, windowMs: 60 * 60 * 1000 });

const FIELDS = ["title", "category", "projectId", "roomId", "contractorId", "notes"] as const;

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Adds a document to the library, or a new version of one (Milestone 8,
 * part 1). POST multipart/form-data with one "file" (a photo or a PDF), an
 * optional "note", and either "documentId" (a new version) or the
 * document's fields. Like /api/uploads, it checks the request came from
 * BeamHaven itself.
 */
export async function POST(request: Request) {
  await connection();
  const env = getEnv();
  if (request.headers.get("origin") !== new URL(env.APP_URL).origin) {
    return json({ error: "This upload didn't come from BeamHaven." }, 403);
  }
  const ctx = await getWorkspaceContext();
  if (!ctx) return json({ error: "Not found" }, 404);
  if (!uploadLimiter.attempt(ctx.userId)) {
    return json({ error: "Too many uploads in a short time. Please wait a while." }, 429);
  }
  if (Number(request.headers.get("content-length") ?? 0) > env.UPLOAD_MAX_MB * 1024 * 1024 * 2) {
    return json({ error: `That file is too large. The limit is ${env.UPLOAD_MAX_MB} MB.` }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "That upload couldn't be read." }, 400);
  }
  const files = form.getAll("file").filter((value): value is File => value instanceof File);
  if (files.length !== 1 || !files[0]) {
    return json({ error: "Choose a file.", fields: { file: "Choose a file" } }, 400);
  }
  const file = files[0];
  const upload = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  const note = text(form, "note");
  const documentId = text(form, "documentId").trim().slice(0, 64);

  try {
    if (documentId) {
      const { number } = await addDocumentVersion(ctx, documentId, upload, note);
      return json({ documentId, number }, 200);
    }
    const input = Object.fromEntries(FIELDS.map((name) => [name, text(form, name)]));
    const { id } = await createLibraryDocument(ctx, input, upload, note);
    return json({ documentId: id, number: 1 }, 200);
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ error: "Please fix the highlighted fields.", fields: fieldErrors(error) }, 400);
    }
    if (error instanceof UploadError) {
      return json({ error: error.message, fields: { file: error.message } }, 400);
    }
    if (error instanceof PermissionError) {
      return json({ error: "Your role in this household can't make changes." }, 403);
    }
    if (error instanceof NotFoundError) return json({ error: "Not found" }, 404);
    throw error;
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
