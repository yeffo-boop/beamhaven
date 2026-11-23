import { ZodError } from "zod";

/**
 * The record doesn't exist, or belongs to another household. Both look the
 * same on purpose, so nobody learns what exists elsewhere (pages answer 404).
 */
export class NotFoundError extends Error {
  constructor(what = "record") {
    super(`Not found: ${what}`);
  }
}

/**
 * A business rule that failed for one form field (for example "not enough
 * left on that line"). It's a ZodError so forms show it next to the field
 * exactly like a validation message.
 */
export function fieldError(field: string, message: string): ZodError {
  return new ZodError([{ code: "custom", path: [field], message, input: undefined }]);
}

/**
 * Why something can't be done right now, as a fixed code. The message is
 * shown to the person; the code is what travels in a page address (so a
 * link can't put made-up text on the page).
 */
export const RULE_MESSAGES = {
  line_in_use:
    "This budget line has money or order items recorded against it (or a locked-in original budget), so it stays as part of the history.",
  commitment_in_use: "Expenses are linked to this commitment. Delete or unlink them first.",
  expense_has_refunds: "This expense has refunds recorded against it. Delete those first.",
  refund_not_editable: "A refund can't be edited. Delete it and record it again.",
  already_refund: "This is already a refund.",
  project_has_budget:
    "This project has money recorded in its budget, so it can't be deleted. Its budget history has to stay complete.",
  agreement_commitment:
    "This comes from a contractor's quote or contract. Change it on the quote or contract's page.",
  contractor_has_agreements:
    "This contractor has quotes or contracts. Delete those first, or mark the contractor as “Worked with before”.",
  quote_approved: "An approved quote stays as part of the history. Take the approval back first.",
  quote_has_contract: "A contract was made from this quote. Delete the contract first.",
  quote_has_bills: "Bills are linked to this quote. Delete or unlink them first.",
  quote_changed: "Someone else just decided this quote. Here's how it stands now.",
  contract_has_bills:
    "Bills are linked to this contract or its change orders. Delete or unlink them first.",
  price_item_in_use:
    "Room estimates use this item. Delete them, or switch them to another item, first.",
  order_bill: "This is an order's bill. Change it, or record a return, from the order's page.",
  order_billed:
    "This order's bill has been recorded, so its items and prices stay as they were paid. Remove the bill first.",
  order_has_bill: "This order's bill has been recorded. Remove the bill first.",
  order_has_returns:
    "Something from this order has been returned. Remove the returns first, then the bill.",
  delivery_returned:
    "Some of what this delivery brought has been returned. Remove that return first.",
  return_needs_bill:
    "Record the order's bill first. Before that, just change the order to what you're keeping.",
  material_on_order: "This material is on an order. Take it off the order first.",
  room_has_budget:
    "This room is used by budget lines. Remove those lines (or charge them to the whole project) first.",
} as const;

export type RuleCode = keyof typeof RULE_MESSAGES;

export class RuleError extends Error {
  constructor(readonly code: RuleCode) {
    super(RULE_MESSAGES[code]);
  }
}

export function ruleMessage(code: unknown): string | null {
  return typeof code === "string" && code in RULE_MESSAGES ? RULE_MESSAGES[code as RuleCode] : null;
}
