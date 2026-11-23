import "server-only";

import { notFound, redirect } from "next/navigation";
import { z, ZodError } from "zod";

import { PermissionError } from "@/server/auth/permissions";
import { fieldErrors } from "@/server/auth/validation";
import { NotFoundError, RuleError } from "@/server/services/errors";

import type { FormResult } from "./account";

/**
 * Shared by the Server Action files. (A "use server" file may only export
 * async actions, so these plain helpers live here.)
 */

export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The text fields of a submitted form (not files or Next.js's own fields). */
export function typedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData) {
    if (typeof value === "string" && !name.startsWith("$")) values[name] = value;
  }
  return values;
}

export function asFormResult(error: unknown, formData?: FormData): FormResult {
  if (error instanceof ZodError) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fields: fieldErrors(error),
      ...(formData ? { values: typedValues(formData), attempt: Date.now() } : {}),
    };
  }
  if (error instanceof PermissionError) {
    return { status: "error", message: "Your role in this household can't make changes." };
  }
  if (error instanceof RuleError) return { status: "error", message: error.message };
  // Another household's record, or one that was just deleted: a plain 404.
  if (error instanceof NotFoundError) notFound();
  throw error;
}

/**
 * For buttons that aren't full forms (delete, remove): when a rule stops
 * them, go back to the page with the reason's code, which the page shows.
 */
export function problemRedirect(path: string, error: unknown): void {
  if (error instanceof RuleError) redirect(`${path}?problem=${error.code}`);
}

const idSchema = z.string().trim().min(1).max(64);

export function idFrom(formData: FormData, name = "id"): string {
  const parsed = idSchema.safeParse(formData.get(name));
  if (!parsed.success) notFound();
  return parsed.data;
}
