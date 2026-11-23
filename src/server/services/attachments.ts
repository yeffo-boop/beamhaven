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
import { detectImageType, detectReceiptType } from "@/server/storage/detect";
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
  if (purposeFor(target.kind) !== "photo") throw new NotFoundError("photo target");
  return saveUpload(ctx, target, upload, "photo");
}

/** A document for a contractor or warranty (a license, certificate or contract): a photo or a PDF. */
export async function uploadDocument(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  upload: Upload,
): Promise<{ attachmentId: string; fileId: string }> {
  if (purposeFor(target.kind) !== "document") throw new NotFoundError("document target");
  return saveUpload(ctx, target, upload, "document");
}

export async function getDocuments(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
): Promise<AttachmentSummary[]> {
  assertCan(ctx, "records:view");
  if (purposeFor(target.kind) !== "document") return [];
  return listAttachments(ctx, target, "document");
}

/** Which kind of file each kind of record takes. */
export function purposeFor(kind: AttachmentTarget["kind"]): Purpose {
  switch (kind) {
    case "property":
    case "project":
    case "room":
      return "photo";
    case "expense":
      return "receipt";
    case "contractor":
    case "warranty":
      return "document";
  }
}

/** A receipt or bill for an expense: a photo of it, or a PDF. */
export async function uploadReceipt(
  ctx: WorkspaceContext,
  expenseId: string,
  upload: Upload,
): Promise<{ attachmentId: string; fileId: string }> {
  return saveUpload(ctx, { kind: "expense", id: expenseId }, upload, "receipt");
}

export async function getReceipts(
  ctx: WorkspaceContext,
  expenseId: string,
): Promise<AttachmentSummary[]> {
  assertCan(ctx, "records:view");
  return listAttachments(ctx, { kind: "expense", id: expenseId }, "receipt");
}

const PURPOSES = {
  photo: {
    detect: detectImageType,
    refusal: "That isn't a photo we can use. Upload a JPEG, PNG, WebP or HEIC file.",
    added: "Added a photo",
    removed: "Removed a photo",
  },
  receipt: {
    detect: detectReceiptType,
    refusal: "That isn't a file we can use for a receipt. Upload a photo or a PDF.",
    added: "Added a receipt",
    removed: "Removed a receipt",
  },
  document: {
    detect: detectReceiptType,
    refusal: "That isn't a file we can use. Upload a photo or a PDF.",
    added: "Added a document",
    removed: "Removed a document",
  },
} as const;

export type Purpose = keyof typeof PURPOSES;

async function saveUpload(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  upload: Upload,
  purpose: Purpose,
): Promise<{ attachmentId: string; fileId: string }> {
  assertCan(ctx, "records:edit");
  const { bytes } = upload;
  const maxBytes = getEnv().UPLOAD_MAX_MB * 1024 * 1024;
  if (bytes.length === 0) throw new UploadError("That file is empty.");
  if (bytes.length > maxBytes) {
    throw new UploadError(`That file is too large. The limit is ${getEnv().UPLOAD_MAX_MB} MB.`);
  }
  const rules = PURPOSES[purpose];
  const mimeType = rules.detect(bytes);
  if (!mimeType) throw new UploadError(rules.refusal);

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
        originalName: cleanFileName(upload.name, purpose),
        mimeType,
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      purpose,
      caption,
    );
    if (!created) throw new NotFoundError(target.kind);
    await recordActivity(ctx, {
      action: `${target.kind}.${purpose}_added`,
      entityType: target.kind,
      entityId: target.id,
      summary: rules.added,
    });
    return created;
  } catch (error) {
    // Don't leave bytes behind that no record points to.
    await storage.delete(storageKey);
    throw error;
  }
}

/** Removes a photo, receipt or document (the attachment, the file record and the stored bytes). */
export async function deletePhoto(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  attachmentId: string,
): Promise<void> {
  return deleteAttachment(ctx, target, attachmentId, purposeFor(target.kind));
}

async function deleteAttachment(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  attachmentId: string,
  purpose: Purpose,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const photos = await listAttachments(ctx, target, purpose);
  const photo = photos.find((p) => p.id === attachmentId);
  const fileId = photo ? await findAttachmentFileId(ctx, attachmentId) : null;
  if (!fileId) throw new NotFoundError("photo");
  await removeFiles(ctx, [fileId]);
  await recordActivity(ctx, {
    action: `${target.kind}.${purpose}_removed`,
    entityType: target.kind,
    entityId: target.id,
    summary: PURPOSES[purpose].removed,
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
function cleanFileName(name: string, purpose: Purpose): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 200) || purpose;
}
