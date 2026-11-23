"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuth } from "@/server/auth/auth";
import { requireUser } from "@/server/auth/session";
import { fieldErrors, personNameSchema } from "@/server/auth/validation";
import { assertCan, PermissionError, requireWorkspace } from "@/server/auth/workspace";
import { renameWorkspace } from "@/server/data/workspaces";

export type FormResult = {
  status: "idle" | "saved" | "error";
  message?: string;
  fields?: Record<string, string>;
  /**
   * What was typed, sent back after a validation error. React resets a form
   * once its action returns, so the form shows these instead of going blank.
   */
  values?: Record<string, string>;
  /** Changes on every failed attempt, so the form can redraw with `values`. */
  attempt?: number;
};

const householdNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a household name")
  .max(100, "That household name is too long");

export async function updateNameAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  await requireUser();
  const parsed = z.object({ name: personNameSchema }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error) };
  await getAuth().api.updateUser({ headers: await headers(), body: { name: parsed.data.name } });
  refresh();
  return { status: "saved" };
}

export async function renameHouseholdAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const parsed = z.object({ name: householdNameSchema }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error) };
  try {
    assertCan(ctx, "workspace:manage");
  } catch (error) {
    if (error instanceof PermissionError) {
      return { status: "error", message: "Only household owners can rename the household." };
    }
    throw error;
  }
  await renameWorkspace(ctx, parsed.data.name);
  refresh();
  return { status: "saved" };
}

/** Deletes every session for this person, including this one. */
export async function signOutEverywhereAction(): Promise<void> {
  await requireUser();
  const requestHeaders = await headers();
  await getAuth().api.revokeSessions({ headers: requestHeaders });
  // Also clear this browser's cookie.
  await getAuth()
    .api.signOut({ headers: requestHeaders })
    .catch(() => {});
  redirect("/sign-in");
}
