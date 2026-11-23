import { getNavItem } from "@/config/navigation";

import { PageHeader } from "./page-header";

/**
 * Temporary page for a section that hasn't been built yet. It says plainly
 * what will live here and which milestone builds it, so nothing pretends to
 * work before it does.
 */
export function SectionPlaceholder({ id }: { id: string }) {
  const item = getNavItem(id);
  const Icon = item.icon;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={item.label} />
      <section className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-14 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold">Coming in Milestone {item.milestone}</h2>
        <p className="max-w-md text-muted-foreground">{item.description}</p>
      </section>
    </div>
  );
}
