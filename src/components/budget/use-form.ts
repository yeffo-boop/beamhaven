"use client";

import { useActionState } from "react";

import type { FormResult } from "@/server/actions/account";

/**
 * The shared plumbing for budget forms: the action's state, the message
 * for a field, and what was typed (so a form that had an error comes back
 * filled in rather than blank).
 */
export function useForm(action: (previous: FormResult, formData: FormData) => Promise<FormResult>) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return {
    state,
    action: formAction,
    pending,
    key: state.attempt,
    error: (name: string) => state.fields?.[name],
    typed: (name: string) => state.values?.[name],
  };
}
