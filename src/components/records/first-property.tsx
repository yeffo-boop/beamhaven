import { House } from "lucide-react";

import { PropertyForm } from "./property-form";

/** Shown on Projects and Rooms before any property exists. */
export function FirstProperty({ canEdit, returnTo }: { canEdit: boolean; returnTo: string }) {
  return (
    <section
      aria-labelledby="first-property-heading"
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <House className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="first-property-heading" className="font-semibold">
            Start with your home
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Projects and rooms belong to a property. Add yours first; you can add more later in
            Settings.
          </p>
        </div>
      </div>
      {canEdit ? (
        <PropertyForm returnTo={returnTo} saveLabel="Add property" />
      ) : (
        <p className="text-sm text-muted-foreground">
          Ask an owner or member of your household to add the property.
        </p>
      )}
    </section>
  );
}
