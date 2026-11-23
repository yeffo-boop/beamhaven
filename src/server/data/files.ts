import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

export type AttachmentTarget = {
  kind:
    "property" | "project" | "room" | "expense" | "contractor" | "warranty" | "quote" | "contract";
  id: string;
};

function targetColumn(target: AttachmentTarget) {
  switch (target.kind) {
    case "property":
      return { propertyId: target.id };
    case "project":
      return { projectId: target.id };
    case "room":
      return { roomId: target.id };
    case "expense":
      return { expenseId: target.id };
    case "contractor":
      return { contractorId: target.id };
    case "warranty":
      return { warrantyId: target.id };
    case "quote":
      return { quoteId: target.id };
    case "contract":
      return { contractId: target.id };
  }
}

/** Whether the record exists in this household. */
export async function targetExists(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
): Promise<boolean> {
  const where = { id: target.id, workspaceId: ctx.workspaceId };
  const prisma = getPrisma();
  switch (target.kind) {
    case "property":
      return (await prisma.property.count({ where })) === 1;
    case "project":
      return (await prisma.project.count({ where })) === 1;
    case "room":
      return (await prisma.room.count({ where })) === 1;
    case "expense":
      return (await prisma.expense.count({ where })) === 1;
    case "contractor":
      return (await prisma.contractor.count({ where })) === 1;
    case "warranty":
      return (await prisma.warranty.count({ where })) === 1;
    case "quote":
      return (await prisma.quote.count({ where })) === 1;
    case "contract":
      return (await prisma.contract.count({ where })) === 1;
  }
}

export type NewFile = {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

/**
 * Records an uploaded file and attaches it to a record, in one step.
 * Returns null if the record isn't in this household.
 */
export async function insertAttachedFile(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  file: NewFile,
  purpose: string,
  caption: string | null,
): Promise<{ attachmentId: string; fileId: string } | null> {
  if (!(await targetExists(ctx, target))) return null;
  const fileId = newId();
  const attachmentId = newId();
  await getPrisma().$transaction([
    getPrisma().fileObject.create({
      data: { id: fileId, workspaceId: ctx.workspaceId, uploadedById: ctx.userId, ...file },
    }),
    getPrisma().attachment.create({
      data: {
        id: attachmentId,
        workspaceId: ctx.workspaceId,
        fileId,
        purpose,
        caption,
        createdById: ctx.userId,
        ...targetColumn(target),
      },
    }),
  ]);
  return { attachmentId, fileId };
}

export type AttachmentSummary = {
  id: string;
  fileId: string;
  caption: string | null;
  originalName: string;
  mimeType: string;
  createdAt: Date;
};

export async function listAttachments(
  ctx: WorkspaceContext,
  target: AttachmentTarget,
  purpose = "photo",
): Promise<AttachmentSummary[]> {
  const rows = await getPrisma().attachment.findMany({
    where: { workspaceId: ctx.workspaceId, purpose, ...targetColumn(target) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fileId: true,
      caption: true,
      createdAt: true,
      file: { select: { originalName: true, mimeType: true } },
    },
  });
  return rows.map(({ file, ...row }) => ({ ...row, ...file }));
}

export type StoredFile = {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

/** For downloads: the file, only if it belongs to this household. */
export async function findFile(ctx: WorkspaceContext, fileId: string): Promise<StoredFile | null> {
  return getPrisma().fileObject.findFirst({
    where: { id: fileId, workspaceId: ctx.workspaceId },
    select: { id: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true },
  });
}

/**
 * Deletes file records in this household and returns their storage keys,
 * so the caller can remove the stored bytes afterwards.
 */
export async function deleteFileRows(ctx: WorkspaceContext, fileIds: string[]): Promise<string[]> {
  if (fileIds.length === 0) return [];
  return getPrisma().$transaction(async (tx) => {
    const files = await tx.fileObject.findMany({
      where: { id: { in: fileIds }, workspaceId: ctx.workspaceId },
      select: { storageKey: true },
    });
    await tx.fileObject.deleteMany({
      where: { id: { in: fileIds }, workspaceId: ctx.workspaceId },
    });
    return files.map((f) => f.storageKey);
  });
}

/** The file behind an attachment in this household, or null. */
export async function findAttachmentFileId(
  ctx: WorkspaceContext,
  attachmentId: string,
): Promise<string | null> {
  const row = await getPrisma().attachment.findFirst({
    where: { id: attachmentId, workspaceId: ctx.workspaceId },
    select: { fileId: true },
  });
  return row?.fileId ?? null;
}
