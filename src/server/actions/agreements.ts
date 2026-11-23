"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  addChangeOrder,
  approveQuote,
  createContract,
  createQuote,
  deleteChangeOrder,
  deleteContract,
  deleteQuote,
  rejectQuote,
  reviseQuote,
  setQuoteReview,
  updateContract,
  updateQuoteDetails,
  withdrawApproval,
} from "@/server/services/agreements";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/** Server Actions for quotes, contracts and change orders. */

const saved = (): FormResult => {
  refresh();
  return { status: "saved" };
};

function fields(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

// --- Quotes ----------------------------------------------------------------

export async function createQuoteAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  let id: string;
  try {
    id = (
      await createQuote(
        ctx,
        fields(formData, [
          "contractorId",
          "projectId",
          "title",
          "amount",
          "receivedOn",
          "validUntil",
          "summary",
          "notes",
        ]),
      )
    ).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/quotes/${id}`);
}

export async function saveQuoteDetailsAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await updateQuoteDetails(
      ctx,
      idFrom(formData),
      fields(formData, ["title", "validUntil", "notes"]),
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function reviseQuoteAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await reviseQuote(ctx, idFrom(formData), fields(formData, ["amount", "receivedOn", "summary"]));
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function setQuoteReviewAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  try {
    await setQuoteReview(ctx, id, text(formData, "status"));
  } catch (error) {
    problemRedirect(`/quotes/${id}`, error);
    asFormResult(error);
    return;
  }
  refresh();
}

export async function approveQuoteAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await approveQuote(ctx, idFrom(formData), fields(formData, ["lineId", "committedOn", "note"]));
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function rejectQuoteAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await rejectQuote(ctx, idFrom(formData), fields(formData, ["note"]));
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function withdrawApprovalAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  try {
    await withdrawApproval(ctx, id);
  } catch (error) {
    problemRedirect(`/quotes/${id}`, error);
    asFormResult(error);
    return;
  }
  refresh();
}

export async function deleteQuoteAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let contractorId: string;
  try {
    ({ contractorId } = await deleteQuote(ctx, id));
  } catch (error) {
    problemRedirect(`/quotes/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect(`/contractors/${contractorId}`);
}

// --- Contracts -------------------------------------------------------------

const CONTRACT_FIELDS = ["title", "value", "signedOn", "startDate", "endDate", "notes"] as const;

export async function createContractAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  let id: string;
  try {
    id = (
      await createContract(
        ctx,
        fields(formData, [...CONTRACT_FIELDS, "quoteId", "contractorId", "projectId", "lineId"]),
      )
    ).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/contracts/${id}`);
}

export async function saveContractAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  try {
    await updateContract(ctx, id, fields(formData, CONTRACT_FIELDS));
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/contracts/${id}`);
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let contractorId: string;
  try {
    ({ contractorId } = await deleteContract(ctx, id));
  } catch (error) {
    problemRedirect(`/contracts/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect(`/contractors/${contractorId}`);
}

export async function addChangeOrderAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await addChangeOrder(
      ctx,
      idFrom(formData, "contractId"),
      fields(formData, ["description", "amount", "committedOn", "lineId", "notes"]),
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function deleteChangeOrderAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let contractId: string;
  try {
    ({ contractId } = await deleteChangeOrder(ctx, id));
  } catch (error) {
    problemRedirect(`/contracts/${text(formData, "contractId")}`, error);
    asFormResult(error);
    return;
  }
  redirect(`/contracts/${contractId}`);
}
