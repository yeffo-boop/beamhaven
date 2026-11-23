"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { FormResult } from "@/server/actions/account";

/** Save button, optional Cancel link, and the form's overall message. */
export function FormFooter({
  pending,
  state,
  saveLabel = "Save",
  cancelHref,
}: {
  pending: boolean;
  state: FormResult;
  saveLabel?: string;
  cancelHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : saveLabel}
      </Button>
      {cancelHref ? (
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      ) : null}
      <p role="status" className="text-sm">
        {state.status === "saved" ? <span className="text-muted-foreground">Saved.</span> : null}
        {state.status === "error" && state.message ? (
          <span className="text-destructive">{state.message}</span>
        ) : null}
      </p>
    </div>
  );
}
