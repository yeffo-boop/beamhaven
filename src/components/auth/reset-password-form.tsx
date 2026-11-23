"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";

import { authClient } from "./auth-client";

const MIN_LENGTH = 12;

/**
 * Sets a new password with a one-time reset link. The request goes to Better
 * Auth's own endpoint, which checks and uses up the token, rate-limits
 * attempts, and signs the person out everywhere (ADR-018).
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    // Quick checks here for a friendly message; the server checks again.
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== form.get("confirmPassword")) return setError("The two passwords don't match.");

    setPending(true);
    setError(null);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    if (resetError) {
      setPending(false);
      setError(
        resetError.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : "This reset link doesn't work. It may have been used or expired; ask for a new one.",
      );
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="password"
        name="password"
        type="password"
        label="New password (at least 12 characters)"
        autoComplete="new-password"
        required
      />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Same password again"
        autoComplete="new-password"
        required
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
