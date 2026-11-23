"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { FormResult } from "@/server/actions/account";

import { Field } from "./field";

type Action = (previous: FormResult, formData: FormData) => Promise<FormResult>;

/** A single text field with a Save button, for renaming things. */
export function InlineNameForm({
  id,
  label,
  defaultValue,
  action,
}: {
  id: string;
  label: string;
  defaultValue: string;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <Field
        id={id}
        name="name"
        label={label}
        defaultValue={defaultValue}
        required
        className="sm:max-w-sm sm:flex-1"
        error={state.fields?.["name"]}
      />
      <Button type="submit" variant="outline" disabled={pending} className="sm:mt-[28px]">
        {pending ? "Saving…" : "Save"}
      </Button>
      <p role="status" className="text-sm text-muted-foreground sm:mt-[38px]">
        {state.status === "saved" ? "Saved." : null}
        {state.status === "error" && state.message ? (
          <span className="text-destructive">{state.message}</span>
        ) : null}
      </p>
    </form>
  );
}
