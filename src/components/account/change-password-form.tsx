"use client";

import { useState, type FormEvent } from "react";

import { authClient } from "@/components/auth/auth-client";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";

const MIN_LENGTH = 12;

/**
 * Changes the password through Better Auth's own endpoint, which checks the
 * current password, rate-limits attempts, and signs out every other device.
 */
export function ChangePasswordForm() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword.length < MIN_LENGTH) {
      return setMessage({ ok: false, text: `Use at least ${MIN_LENGTH} characters.` });
    }
    if (newPassword !== form.get("confirmPassword")) {
      return setMessage({ ok: false, text: "The two new passwords don't match." });
    }
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setMessage({
        ok: false,
        text:
          error.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : "Your current password isn't right. Please try again.",
      });
      return;
    }
    formElement.reset();
    setMessage({ ok: true, text: "Password changed. Your other devices have been signed out." });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3" noValidate>
      <Field
        id="currentPassword"
        name="currentPassword"
        type="password"
        label="Current password"
        autoComplete="current-password"
        required
      />
      <Field
        id="newPassword"
        name="newPassword"
        type="password"
        label="New password (at least 12 characters)"
        autoComplete="new-password"
        required
      />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Same new password again"
        autoComplete="new-password"
        required
      />
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm" : "text-sm text-destructive"}
        >
          {message.text}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
