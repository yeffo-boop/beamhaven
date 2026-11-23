import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <section
        aria-labelledby="appearance-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6"
      >
        <div>
          <h2 id="appearance-heading" className="font-semibold">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose light or dark, or match your device. Saved on this browser.
          </p>
        </div>
        <div className="self-start">
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface p-5 text-sm text-muted-foreground md:p-6">
        Your profile, password, household members and preferences arrive with sign-in in Milestone
        2.
      </section>
    </div>
  );
}
