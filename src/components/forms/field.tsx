import type { ComponentProps, ReactNode } from "react";

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

const labelClass = "text-sm font-medium";

function FieldShell({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

/** A text input with a label, optional hint, and error message. */
export function TextField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: ComponentProps<"input"> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  id: string;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: ComponentProps<"textarea"> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  id: string;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        rows={3}
        className={cn(inputClass, "h-auto min-h-24 py-2")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  options,
  ...props
}: ComponentProps<"select"> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  id: string;
  options: { value: string; label: string }[];
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        className={cn(inputClass, "pr-8")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
