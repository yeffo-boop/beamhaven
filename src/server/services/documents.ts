import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  deleteDocumentRow,
  deleteVersionRow,
  type DocumentDetail,
  type DocumentFilter,
  type DocumentSummary,
  findDocument,
  insertDocument,
  insertDocumentVersion,
  listDocuments,
  listOtherFiles,
  type OtherFile,
  updateDocumentRow,
} from "@/server/data/documents";

import { removeFiles, storeUploadedFile, type Upload } from "./attachments";
import { documentInput, versionNoteInput } from "./document-inputs";
import { NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";

/** The document library (Milestone 8, part 1, ADR-034). */

export type DocumentInput = FormInput<typeof documentInput>;

export async function getDocumentLibrary(
  ctx: WorkspaceContext,
  filter: DocumentFilter = {},
): Promise<DocumentSummary[]> {
  assertCan(ctx, "records:view");
  return listDocuments(ctx, filter);
}

/** Receipts and documents on other records whose name or caption matches. */
export async function searchOtherFiles(ctx: WorkspaceContext, q: string): Promise<OtherFile[]> {
  assertCan(ctx, "records:view");
  return q.trim() ? listOtherFiles(ctx, q) : [];
}

export async function getLibraryDocument(
  ctx: WorkspaceContext,
  id: string,
): Promise<DocumentDetail> {
  assertCan(ctx, "records:view");
  const doc = await findDocument(ctx, id);
  if (!doc) throw new NotFoundError("document");
  return doc;
}

/** Adds a document with its file as version 1. The file is a photo or a PDF. */
export async function createLibraryDocument(
  ctx: WorkspaceContext,
  input: DocumentInput,
  upload: Upload,
  note?: string,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = documentInput.parse(input);
  const versionNote = versionNoteInput.parse(note ?? "");
  const { file, discard } = await storeUploadedFile(ctx, upload, "document");
  try {
    const created = await insertDocument(ctx, fields, file, versionNote);
    if (!created) throw new NotFoundError("project, room or contractor");
    await recordActivity(ctx, {
      action: "document.created",
      entityType: "document",
      entityId: created.id,
      summary: `Added “${fields.title}” to the library`,
    });
    return created;
  } catch (error) {
    await discard();
    throw error;
  }
}

/** Uploads a new version; it becomes the current one. Earlier ones are kept. */
export async function addDocumentVersion(
  ctx: WorkspaceContext,
  documentId: string,
  upload: Upload,
  note?: string,
): Promise<{ number: number }> {
  assertCan(ctx, "records:edit");
  const versionNote = versionNoteInput.parse(note ?? "");
  const { file, discard } = await storeUploadedFile(ctx, upload, "document");
  try {
    const added = await insertDocumentVersion(ctx, documentId, file, versionNote);
    if (!added) throw new NotFoundError("document");
    await recordActivity(ctx, {
      action: "document.version_added",
      entityType: "document",
      entityId: documentId,
      summary: `Added version ${added.number} of “${added.title}”`,
    });
    return { number: added.number };
  } catch (error) {
    await discard();
    throw error;
  }
}

export async function updateLibraryDocument(
  ctx: WorkspaceContext,
  id: string,
  input: DocumentInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await updateDocumentRow(ctx, id, documentInput.parse(input)))) {
    throw new NotFoundError("document");
  }
}

/** Deletes the document and every version's file. */
export async function deleteLibraryDocument(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const deleted = await deleteDocumentRow(ctx, id);
  if (!deleted) throw new NotFoundError("document");
  await removeFiles(ctx, deleted.fileIds);
  await recordActivity(ctx, {
    action: "document.deleted",
    entityType: "document",
    entityId: id,
    summary: `Deleted “${deleted.title}” from the library`,
  });
}

/** Removes one version (say, uploaded by mistake). The last one can't go: delete the document instead. */
export async function deleteDocumentVersion(
  ctx: WorkspaceContext,
  documentId: string,
  versionId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await deleteVersionRow(ctx, documentId, versionId);
  if (result.status === "not_found") throw new NotFoundError("version");
  if (result.status === "last") {
    throw new RuleError("document_last_version");
  }
  await removeFiles(ctx, [result.fileId]);
  await recordActivity(ctx, {
    action: "document.version_deleted",
    entityType: "document",
    entityId: documentId,
    summary: `Removed version ${result.number}`,
  });
}
