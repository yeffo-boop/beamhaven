"use client";

import { useActionState } from "react";

import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  joinAsExistingUserAction,
  joinAsNewUserAction,
  type JoinResult,
} from "@/server/actions/invitation";

const initial: JoinResult = {};

/** For someone new: choose a name and password, then join. */
export function NewMemberForm({ invitationId, email }: { invitationId: string; email: string }) {
  const [state, action, pending] = useActionState(
    joinAsNewUserAction.bind(null, invitationId),
    initial,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field id="email" label="Email" value={email} readOnly disabled autoComplete="username" />
      <Field
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        required
        error={state.fields?.["name"]}
      />
      <Field
        id="password"
        name="password"
        type="password"
        label="Choose a password (at least 12 characters)"
        autoComplete="new-password"
        required
        error={state.fields?.["password"]}
      />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Same password again"
        autoComplete="new-password"
        required
        error={state.fields?.["confirmPassword"]}
      />
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Joining…" : "Create account and join"}
      </Button>
    </form>
  );
}

/** For someone already signed in with the invited email. */
export function ExistingMemberForm({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(
    joinAsExistingUserAction.bind(null, invitationId),
    initial,
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Joining…" : "Join household"}
      </Button>
    </form>
  );
}
