"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  addTypedArea,
  createEstimate,
  createPriceItem,
  deleteEstimate,
  deletePriceItem,
  removeTypedArea,
  setMaterialsTax,
  setQuoteEstimate,
  updateEstimate,
  updatePriceItem,
} from "@/server/services/estimates";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/** Server Actions for the price list and room estimates (Milestone 5, part 3). */

const saved = (): FormResult => {
  refresh();
  return { status: "saved" };
};

function fields(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

const PRICE_FIELDS = [
  "name",
  "measure",
  "unit",
  "price",
  "coverage",
  "coats",
  "labor",
  "wastePercent",
  "taxable",
  "notes",
] as const;

export async function savePriceItemAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  try {
    if (id) await updatePriceItem(ctx, idFrom(formData), fields(formData, PRICE_FIELDS));
    else await createPriceItem(ctx, fields(formData, PRICE_FIELDS));
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function deletePriceItemAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await deletePriceItem(ctx, idFrom(formData));
  } catch (error) {
    problemRedirect("/budget/prices", error);
    asFormResult(error);
    return;
  }
  refresh();
}

export async function saveTaxAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await setMaterialsTax(ctx, fields(formData, ["rate"]));
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

const ESTIMATE_FIELDS = [
  "name",
  "priceItemId",
  "materialCategoryId",
  "laborCategoryId",
  "lineMode",
  "notes",
] as const;

function estimateFields(formData: FormData) {
  const roomIds = formData
    .getAll("roomIds")
    .filter((value): value is string => typeof value === "string");
  return { ...fields(formData, ESTIMATE_FIELDS), roomIds };
}

export async function saveEstimateAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  let created: string | null = null;
  try {
    if (id) await updateEstimate(ctx, idFrom(formData), estimateFields(formData));
    else {
      created = (await createEstimate(ctx, idFrom(formData, "projectId"), estimateFields(formData)))
        .id;
    }
  } catch (error) {
    return asFormResult(error, formData);
  }
  if (created) redirect(`/estimates/${created}`);
  return saved();
}

export async function addTypedAreaAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await addTypedArea(
      ctx,
      idFrom(formData, "estimateId"),
      fields(formData, ["roomId", "label", "amount"]),
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function removeTypedAreaAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await removeTypedArea(ctx, idFrom(formData));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

export async function deleteEstimateAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  let projectId: string;
  try {
    ({ projectId } = await deleteEstimate(ctx, idFrom(formData)));
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect(`/projects/${projectId}/budget`);
}

export async function setQuoteEstimateAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await setQuoteEstimate(ctx, idFrom(formData), text(formData, "estimateId"));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}
