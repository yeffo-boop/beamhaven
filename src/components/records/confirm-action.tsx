import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * A destructive button that needs a second click, so nothing is deleted by
 * accident. Works without JavaScript (a <details> element).
 */
export function ConfirmAction({
  action,
  label,
  srLabel,
  question,
  confirmLabel,
  children,
  size = "sm",
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  srLabel?: string;
  question: string;
  confirmLabel: string;
  /** Hidden inputs that say what to act on. */
  children: ReactNode;
  size?: "sm" | "xs";
}) {
  return (
    <details className="group relative">
      <summary
        className={
          size === "xs"
            ? "cursor-pointer list-none text-xs text-destructive underline-offset-2 hover:underline"
            : "flex h-9 cursor-pointer list-none items-center rounded-[var(--radius-control)] px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
        }
      >
        {label}
        {srLabel ? <span className="sr-only"> {srLabel}</span> : null}
      </summary>
      <form
        action={action}
        className="absolute left-0 z-10 mt-1 w-60 rounded-[var(--radius-control)] border border-border bg-surface p-3 shadow-md"
      >
        {children}
        <p className="mb-2 text-sm">{question}</p>
        <Button type="submit" variant="destructive" size="sm">
          {confirmLabel}
        </Button>
      </form>
    </details>
  );
}
