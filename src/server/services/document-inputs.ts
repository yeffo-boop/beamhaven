import { z } from "zod";

import { optionalText, requiredText } from "./inputs";

/** Form rules for the document library (Milestone 8, part 1). */

export const DOCUMENT_CATEGORIES = [
  "plan",
  "rendering",
  "permit",
  "contract",
  "manual",
  "warranty",
  "inspection",
  "invoice",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  plan: "Floor plan or drawing",
  rendering: "Rendering",
  permit: "Permit",
  contract: "Contract or agreement",
  manual: "Manual or spec sheet",
  warranty: "Warranty",
  inspection: "Inspection report",
  invoice: "Invoice or statement",
  other: "Other",
};

export function categoryLabel(category: string): string {
  return DOCUMENT_CATEGORY_LABELS[category as DocumentCategory] ?? "Other";
}

export const documentInput = z.object({
  title: requiredText(200, "Give the document a name", "The name"),
  category: z.enum(DOCUMENT_CATEGORIES, { message: "Choose a category" }).default("other"),
  projectId: optionalText(64, "The project"),
  roomId: optionalText(64, "The room"),
  contractorId: optionalText(64, "The contractor"),
  notes: optionalText(5000, "The notes"),
});

export const versionNoteInput = optionalText(300, "The note");
