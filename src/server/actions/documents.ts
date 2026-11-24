"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  deleteDocumentVersion,
  deleteLibraryDocument,
  updateLibraryDocument,
} from "@/server/services/documents";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/** Server Actions for the document library (Milestone 8, part 1). Uploads go through /api/documents. */

const FIELDS = ["title", "category", "projectId", "roomId", "contractorId", "notes"] as const;

export async function saveDocumentAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await updateLibraryDocument(
      ctx,
      idFrom(formData),
      Object.fromEntries(FIELDS.map((name) => [name, text(formData, name)])),
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await deleteLibraryDocument(ctx, idFrom(formData));
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect("/files");
}

export async function deleteVersionAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const documentId = idFrom(formData, "documentId");
  try {
    await deleteDocumentVersion(ctx, documentId, idFrom(formData));
  } catch (error) {
    problemRedirect(`/files/${documentId}`, error);
    asFormResult(error);
    return;
  }
  refresh();
}
