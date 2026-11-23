import { z } from "zod";

import { requiredMoney, signedMoney } from "./budget-inputs";
import { optionalDate, optionalText, requiredDate, requiredText } from "./inputs";

/** Form rules for quotes, contracts and change orders. */

export const QUOTE_STATUSES = ["received", "under_review", "approved", "rejected"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  received: "Received",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Turned down",
};

export const quoteInput = z.object({
  contractorId: z.string().trim().min(1, "Choose a contractor"),
  projectId: z.string().trim().min(1, "Choose a project"),
  title: requiredText(200, "Say what the quote is for", "The title"),
  amount: requiredMoney,
  receivedOn: requiredDate,
  validUntil: optionalDate,
  summary: optionalText(5000, "The summary"),
  notes: optionalText(5000, "The notes"),
});

export const quoteDetailsInput = z.object({
  title: requiredText(200, "Say what the quote is for", "The title"),
  validUntil: optionalDate,
  notes: optionalText(5000, "The notes"),
});

export const revisionInput = z.object({
  amount: requiredMoney,
  receivedOn: requiredDate,
  summary: optionalText(5000, "What changed"),
});

export const approveInput = z.object({
  lineId: z.string().trim().min(1, "Choose the budget line it comes out of"),
  committedOn: requiredDate,
  note: optionalText(2000, "The note"),
});

export const rejectInput = z.object({ note: optionalText(2000, "The note") });

const contractFields = {
  title: requiredText(200, "Say what the contract is for", "The title"),
  signedOn: optionalDate,
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalText(5000, "The notes"),
};

function datesInOrder<T extends { startDate: Date | null; endDate: Date | null }>(c: T) {
  return !c.startDate || !c.endDate || c.startDate <= c.endDate;
}
const DATES_MESSAGE = { message: "The end is before the start", path: ["endDate"] };

/**
 * A new contract: from an approved quote (which already holds the line and
 * the contractor), or from scratch with both chosen.
 */
export const contractInput = z
  .object({
    ...contractFields,
    quoteId: optionalText(64, "The quote"),
    contractorId: optionalText(64, "The contractor"),
    projectId: optionalText(64, "The project"),
    lineId: optionalText(64, "The budget line"),
    value: requiredMoney,
  })
  .refine(datesInOrder, DATES_MESSAGE)
  .refine((c) => c.quoteId || c.contractorId, {
    message: "Choose a contractor",
    path: ["contractorId"],
  })
  .refine((c) => c.quoteId || c.lineId, {
    message: "Choose the budget line it comes out of",
    path: ["lineId"],
  });

export const contractUpdateInput = z
  .object({ ...contractFields, value: requiredMoney })
  .refine(datesInOrder, DATES_MESSAGE);

export const changeOrderInput = z.object({
  description: requiredText(200, "Describe the change", "The description"),
  amount: signedMoney,
  committedOn: requiredDate,
  lineId: optionalText(64, "The budget line"),
  notes: optionalText(2000, "The notes"),
});
