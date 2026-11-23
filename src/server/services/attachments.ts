import "server-only";

import { createHash } from "node:crypto";

import { getEnv } from "@/config/env";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  type AttachmentSummary,
  type AttachmentTarget,
  deleteFileRows,
  findAttachmentFileId,
  findFile,
  insertAttachedFile,
  listAttachments,
  type StoredFile,
} from "@/server/data/files";
import { detectImageType } from "@/server/storage/detect";
import { getStorage, newStorageKey } from "@/server/storage/storage";

import { NotFoundError } from "./errors";

/** Something wrong with the uploaded file itself; the message is shown to the person. */
export class UploadError extends Error {}

export type Upload = { name: string; bytes: Uint8Array; caption?: string | null };

export async function getPhotos(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
): Promise<AttachmentSummary[]> {
  assertCan(ctx, "records:view");
  return listAttachments(ctx, target, "photo");
}

/**
 * Saves a photo and attaches it to a property, project or room in this
 * household. The type comes from the file's contents (JPEG, PNG, WebP, HEIC
 * or AVIF); anything else, including SVG and HTML, is refused.
 */
export async function uploadPhoto(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  upload: Upload,
): Promise<{ attachmentId: string; fileId: string }> {
  assertCan(ctx, "records:edit");
  const { bytes } = upload;
  const maxBytes = getEnv().UPLOAD_MAX_MB * 1024 * 1024;
  if (bytes.length === 0) throw new UploadError("That file is empty.");
  if (bytes.length > maxBytes) {
    throw new UploadError(`That file is too large. The limit is ${getEnv().UPLOAD_MAX_MB} MB.`);
  }
  const mimeType = detectImageType(bytes);
  if (!mimeType) {
    throw new UploadError("That isn't a photo we can use. Upload a JPEG, PNG, WebP or HEIC file.");
  }

  const storageKey = newStorageKey(ctx.workspaceId);
  const storage = getStorage();
  await storage.put(storageKey, bytes);
  const caption = upload.caption?.trim().slice(0, 300) || null;
  try {
    const created = await insertAttachedFile(
      ctx,
      target,
      {
        storageKey,
        originalName: cleanFileName(upload.name),
        mimeType,
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      "photo",
      caption,
    );
    if (!created) throw new NotFoundError(target.kind);
    await recordActivity(ctx, {
      action: `${target.kind}.photo_added`,
      entityType: target.kind,
      entityId: target.id,
      summary: "Added a photo",
    });
    return created;
  } catch (error) {
    // Don't leave bytes behind that no record points to.
    await storage.delete(storageKey);
    throw error;
  }
}

/** Removes a photo (the attachment, the file record and the stored bytes). */
export async function deletePhoto(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  attachmentId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const photos = await listAttachments(ctx, target, "photo");
  const photo = photos.find((p) => p.id === attachmentId);
  const fileId = photo ? await findAttachmentFileId(ctx, attachmentId) : null;
  if (!fileId) throw new NotFoundError("photo");
  await removeFiles(ctx, [fileId]);
  await recordActivity(ctx, {
    action: `${target.kind}.photo_removed`,
    entityType: target.kind,
    entityId: target.id,
    summary: "Removed a photo",
  });
}

/** Deletes file records and their stored bytes. Used when records are deleted. */
export async function removeFiles(ctx: WorkspaceContext, fileIds: string[]): Promise<void> {
  const keys = await deleteFileRows(ctx, fileIds);
  const storage = getStorage();
  await Promise.all(keys.map((key) => storage.delete(key)));
}

/** For the download route: the file and its bytes, only within this household. */
export async function readFileForDownload(
  ctx: WorkspaceContext,
  fileId: string,
): Promise<{ file: StoredFile; bytes: Uint8Array }> {
  assertCan(ctx, "records:view");
  const file = await findFile(ctx, fileId);
  if (!file) throw new NotFoundError("file");
  return { file, bytes: await getStorage().get(file.storageKey) };
}

/** Keeps the name for display only: no folders, no control characters, not too long. */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 200) || "photo";
}
