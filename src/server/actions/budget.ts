"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  addCategory,
  adjustLine,
  createLine,
  deleteLine,
  lockBudget,
  reverseTransfer,
  transferBudget,
  updateLine,
} from "@/server/services/budget";
import {
  addPayment,
  createCommitment,
  createExpense,
  deleteCommitment,
  deleteExpense,
  deletePayment,
  type ExpenseInput,
  refundExpense,
  updateCommitment,
  updateExpense,
} from "@/server/services/expenses";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/**
 * Server Actions for the budget. Like the others, they only read the form
 * and call a service, which checks the role, validates and does the work.
 */

const saved = (): FormResult => {
  refresh();
  return { status: "saved" };
};

// --- Categories and lines --------------------------------------------------

export async function addCategoryAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await addCategory(ctx, { name: text(formData, "name"), kind: text(formData, "kind") });
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function saveLineAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  const fields = {
    name: text(formData, "name"),
    planned: text(formData, "planned"),
    estimate: text(formData, "estimate"),
    notes: text(formData, "notes"),
  };
  try {
    if (id) {
      await updateLine(ctx, id, fields);
    } else {
      await createLine(ctx, {
        ...fields,
        projectId: text(formData, "projectId"),
        categoryId: text(formData, "categoryId"),
        roomId: text(formData, "roomId"),
      });
    }
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function deleteLineAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let projectId: string;
  try {
    ({ projectId } = await deleteLine(ctx, id));
  } catch (error) {
    problemRedirect(`/budget/lines/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect(`/projects/${projectId}/budget`);
}

export async function lockBudgetAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await lockBudget(ctx, idFrom(formData, "projectId"));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

// --- Adjustments and transfers ---------------------------------------------

export async function adjustLineAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await adjustLine(ctx, {
      lineId: text(formData, "lineId"),
      direction: text(formData, "direction"),
      amount: text(formData, "amount"),
      reason: text(formData, "reason"),
      effectiveDate: text(formData, "effectiveDate"),
    });
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function transferAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await transferBudget(ctx, {
      fromLineId: text(formData, "fromLineId"),
      toLineId: text(formData, "toLineId"),
      amount: text(formData, "amount"),
      reason: text(formData, "reason"),
      effectiveDate: text(formData, "effectiveDate"),
      allowOverAllocation: text(formData, "allowOverAllocation"),
    });
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function reverseTransferAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await reverseTransfer(ctx, {
      transferId: text(formData, "transferId"),
      reason: text(formData, "reason"),
    });
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

// --- Commitments -----------------------------------------------------------

export async function saveCommitmentAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  const fields = {
    lineId: text(formData, "lineId"),
    vendorName: text(formData, "vendorName"),
    source: text(formData, "source"),
    description: text(formData, "description"),
    amount: text(formData, "amount"),
    committedOn: text(formData, "committedOn"),
    notes: text(formData, "notes"),
  };
  try {
    if (id) await updateCommitment(ctx, id, fields);
    else await createCommitment(ctx, fields);
  } catch (error) {
    return asFormResult(error, formData);
  }
  if (id) redirect(`/budget/lines/${fields.lineId}`);
  return saved();
}

export async function deleteCommitmentAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let lineId: string;
  try {
    ({ lineId } = await deleteCommitment(ctx, id));
  } catch (error) {
    problemRedirect(`/budget/commitments/${id}/edit`, error);
    asFormResult(error);
    return;
  }
  redirect(`/budget/lines/${lineId}`);
}

// --- Expenses and payments -------------------------------------------------

/** The split rows arrive as parallel lists, one entry per row. */
function expenseFields(formData: FormData): ExpenseInput {
  const strings = (name: string) =>
    formData.getAll(name).map((value) => (typeof value === "string" ? value : ""));
  const lines = strings("allocLine");
  const amounts = strings("allocAmount");
  const kinds = strings("allocKind");
  return {
    vendorName: text(formData, "vendorName"),
    commitmentId: text(formData, "commitmentId"),
    description: text(formData, "description"),
    expenseDate: text(formData, "expenseDate"),
    dueDate: text(formData, "dueDate"),
    total: text(formData, "total"),
    notes: text(formData, "notes"),
    stage: text(formData, "stage"),
    allocations: lines
      .map((lineId, index) => ({
        lineId,
        amount: amounts[index] ?? "",
        kind: kinds[index] ?? "item",
      }))
      // A row with no line chosen and no amount is an unused spare row.
      .filter((row) => row.lineId !== "" || row.amount.trim() !== ""),
  };
}

export async function saveExpenseAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  let id = text(formData, "id");
  try {
    if (id) await updateExpense(ctx, id, expenseFields(formData));
    else id = (await createExpense(ctx, expenseFields(formData))).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/budget/expenses/${id}`);
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  try {
    await deleteExpense(ctx, id);
  } catch (error) {
    problemRedirect(`/budget/expenses/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect("/budget");
}

export async function refundAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireWorkspace();
  let refundId: string;
  try {
    refundId = (
      await refundExpense(ctx, idFrom(formData, "expenseId"), {
        amount: text(formData, "amount"),
        description: text(formData, "description"),
        expenseDate: text(formData, "expenseDate"),
      })
    ).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/budget/expenses/${refundId}`);
}

export async function addPaymentAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await addPayment(ctx, idFrom(formData, "expenseId"), {
      amount: text(formData, "amount"),
      paidOn: text(formData, "paidOn"),
      method: text(formData, "method"),
      reference: text(formData, "reference"),
      notes: text(formData, "notes"),
    });
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await deletePayment(ctx, idFrom(formData, "expenseId"), idFrom(formData, "paymentId"));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}
