import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full rounded-[var(--radius-control)] border border-input bg-surface px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";

/** A labelled text input with an optional error message under it. */
export function Field({
  label,
  error,
  className,
  id,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string | undefined; id: string }) {
  const errorId = `${id}-error`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
