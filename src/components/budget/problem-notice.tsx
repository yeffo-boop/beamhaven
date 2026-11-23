import { TriangleAlert } from "lucide-react";

import { ruleMessage } from "@/server/services/errors";

/**
 * Explains why a button didn't do anything (for example "this line has
 * money recorded against it"). Only known codes are shown, so a link can't
 * put made-up text on the page.
 */
export function ProblemNotice({ code }: { code: unknown }) {
  const message = ruleMessage(code);
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-[var(--radius-card)] border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      {message}
    </p>
  );
}
