"use client";

import { useActionState } from "react";

import { CopyLink } from "@/components/forms/copy-link";
import { Field, inputClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { inviteAction, type LinkResult } from "@/server/actions/household";

const initial: LinkResult = { status: "idle" };

/** Owners invite someone by email, then copy the link and send it themselves. */
export function InviteForm() {
  const [state, action, pending] = useActionState(inviteAction, initial);
  const fields = state.status === "error" ? state.fields : undefined;

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3 md:flex-row md:items-start">
        <Field
          id="invite-email"
          name="email"
          type="email"
          label="Email"
          autoComplete="off"
          required
          className="md:flex-1"
          error={fields?.["email"]}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            Role
          </label>
          <select id="invite-role" name="role" defaultValue="member" className={inputClass}>
            <option value="owner">Owner: everything, including people</option>
            <option value="member">Member: add and edit records</option>
            <option value="viewer">Viewer: look only</option>
          </select>
        </div>
        <Button type="submit" size="lg" disabled={pending} className="md:mt-[26px]">
          {pending ? "Creating…" : "Create invitation link"}
        </Button>
      </form>
      {state.status === "error" && !fields ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-primary/5 p-4">
          <CopyLink link={state.link} label="Invitation link" />
          <p className="text-sm text-muted-foreground">
            Send this link to them yourself (by text or email). It works once and expires in 7 days.
          </p>
        </div>
      ) : null}
    </div>
  );
}
