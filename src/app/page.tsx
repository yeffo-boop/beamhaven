import { brand } from "@/config/brand";

/**
 * Temporary landing page for Milestone 1. It is replaced by the app shell
 * (sidebar and dashboard) later in this milestone.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-accent text-lg font-semibold text-accent-foreground"
        >
          B
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{brand.name}</h1>
      </div>
      <p className="text-lg text-text-muted">{brand.tagline}</p>
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
        <p className="font-medium">The development foundation is running.</p>
        <p className="mt-1 text-sm text-text-muted">
          Next up in Milestone 1: the local database, then the app shell.
        </p>
      </div>
    </main>
  );
}
