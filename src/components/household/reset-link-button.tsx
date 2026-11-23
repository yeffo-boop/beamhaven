"use client";

import { useActionState } from "react";

import { CopyLink } from "@/components/forms/copy-link";
import { Button } from "@/components/ui/button";
import { resetLinkAction, type LinkResult } from "@/server/actions/household";

const initial: LinkResult = { status: "idle" };

/** Lets an owner make a password-reset link for someone who forgot theirs. */
export function ResetLinkButton({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(resetLinkAction, initial);

  if (state.status === "done") {
    return (
      <div className="flex w-full flex-col gap-1 pt-2">
        <CopyLink link={state.link} label={`Password reset link for ${name}`} />
        <p className="text-xs text-muted-foreground">
          Works once, for 24 hours. Resetting signs them out everywhere.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        Reset password
        <span className="sr-only"> for {name}</span>
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="max-w-xs text-right text-xs text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
