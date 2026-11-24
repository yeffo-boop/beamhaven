import Link from "next/link";

import { inputClass } from "@/components/forms/field";
import { ActivityFeed } from "@/components/home/activity-feed";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getWorkspaceContext } from "@/server/auth/workspace";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  getHouseholdActivity,
} from "@/server/services/activity";

export const metadata = { title: "Activity" };

const PAGE_SIZE = 50;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

type ActivityType = (typeof ACTIVITY_TYPES)[number];

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const type = (ACTIVITY_TYPES as readonly string[]).includes(one(params.type))
    ? (one(params.type) as ActivityType)
    : undefined;
  const beforeRaw = new Date(one(params.before));
  const before = Number.isNaN(beforeRaw.getTime()) ? undefined : beforeRaw;
  // One extra tells us whether there's an older page.
  const rows = await getHouseholdActivity(ctx, {
    limit: PAGE_SIZE + 1,
    ...(type ? { entityType: type } : {}),
    ...(before ? { before } : {}),
  });
  const items = rows.slice(0, PAGE_SIZE);
  const last = items[items.length - 1];
  const older =
    rows.length > PAGE_SIZE && last
      ? `/activity?${new URLSearchParams({
          ...(type ? { type } : {}),
          before: last.createdAt.toISOString(),
        }).toString()}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Everything that has changed in the household, newest first."
      />
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter activity">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Show
          <select name="type" defaultValue={type ?? ""} className={`${inputClass} min-w-48`}>
            <option value="">Everything</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Show
        </Button>
        {type || before ? (
          <Button asChild variant="ghost">
            <Link href="/activity">Back to the latest</Link>
          </Button>
        ) : null}
      </form>
      <section
        aria-label="Household activity"
        className="rounded-[var(--radius-card)] border border-border bg-surface px-5 md:px-6"
      >
        <ActivityFeed items={items} empty="Nothing here yet." />
      </section>
      {older ? (
        <div>
          <Button asChild variant="outline">
            <Link href={older}>Older</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
