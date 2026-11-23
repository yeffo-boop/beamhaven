import { connection } from "next/server";
import { z } from "zod";

import { getEnv } from "@/config/env";
import { PermissionError } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import {
  purposeFor,
  uploadDocument,
  UploadError,
  uploadPhoto,
  uploadReceipt,
} from "@/server/services/attachments";
import { NotFoundError } from "@/server/services/errors";
import { createRateLimiter } from "@/server/security/rate-limit";

// Plenty for a renovation (photos come in batches), but not unlimited.
const uploadLimiter = createRateLimiter({ max: 300, windowMs: 60 * 60 * 1000 });

const targetSchema = z.object({
  targetKind: z.enum([
    "property",
    "project",
    "room",
    "expense",
    "contractor",
    "warranty",
    "quote",
    "contract",
    "material",
    "order",
  ]),
  targetId: z.string().min(1).max(64),
  caption: z.string().max(300).optional(),
});

/**
 * Uploads photos to a property, project or room, receipts (photos or
 * PDFs) to an expense, or documents (photos or PDFs) to a contractor or
 * warranty: POST multipart/form-data with targetKind, targetId
 * and one or more "file" fields.
 *
 * Server Actions check the request's origin for us; this route does it
 * itself, so another website can't make your browser upload here.
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

  // Refuse obviously oversized requests before reading them. Several files
  // can come in one request, so allow up to 10 at the limit.
  const maxRequestBytes = env.UPLOAD_MAX_MB * 1024 * 1024 * 10;
  if (Number(request.headers.get("content-length") ?? 0) > maxRequestBytes) {
    return json(
      { error: `Upload fewer files at a time (up to ${env.UPLOAD_MAX_MB} MB each).` },
      413,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "That upload couldn't be read." }, 400);
  }
  const parsed = targetSchema.safeParse({
    targetKind: form.get("targetKind"),
    targetId: form.get("targetId"),
    caption: form.get("caption") ?? undefined,
  });
  const files = form.getAll("file").filter((value): value is File => value instanceof File);
  if (!parsed.success || files.length === 0 || files.length > 10) {
    return json({ error: "Choose between 1 and 10 files to upload." }, 400);
  }

  const target = { kind: parsed.data.targetKind, id: parsed.data.targetId };
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const upload = { name: file.name, bytes, caption: parsed.data.caption ?? null };
      const purpose = purposeFor(target.kind);
      const { attachmentId } =
        purpose === "receipt"
          ? await uploadReceipt(ctx, target.id, upload)
          : purpose === "document"
            ? await uploadDocument(ctx, target, upload)
            : await uploadPhoto(ctx, target, upload);
      uploaded.push(attachmentId);
    }
  } catch (error) {
    if (error instanceof UploadError) return json({ error: error.message, uploaded }, 400);
    if (error instanceof PermissionError) {
      return json({ error: "Viewers can't add files.", uploaded }, 403);
    }
    if (error instanceof NotFoundError) return json({ error: "Not found" }, 404);
    throw error;
  }
  return json({ uploaded }, 200);
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
