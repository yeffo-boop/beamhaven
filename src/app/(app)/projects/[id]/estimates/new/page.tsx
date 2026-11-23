import Link from "next/link";
import { notFound } from "next/navigation";

import { EstimateForm } from "@/components/estimates/forms";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { EmptyState } from "@/components/records/panel";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getCategories } from "@/server/services/budget";
import { getPriceItems } from "@/server/services/estimates";
import { getProject } from "@/server/services/projects";

export const metadata = { title: "New room estimate" };

export default async function NewEstimatePage({
  params,
}: PageProps<"/projects/[id]/estimates/new">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const project = await orNotFound(getProject(ctx, id));
  const [items, categories] = await Promise.all([getPriceItems(ctx), getCategories(ctx)]);
  const byName = (name: string) => categories.find((c) => c.name === name)?.id ?? "";
  const back = `/projects/${id}/budget`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← {project.name} budget
        </Link>
        <PageHeader
          title="New room estimate"
          description="Pick an item from the price list and the rooms that get it. The cost is worked out from each room's size and goes into the budget as an estimate."
        />
      </div>
      {items.length === 0 ? (
        <EmptyState>
          First{" "}
          <Link href="/budget/prices" className="text-primary underline">
            add something to the price list
          </Link>
          , like flooring per sq ft or paint per gallon.
        </EmptyState>
      ) : (
        <EstimateForm
          projectId={id}
          items={items.map((i) => ({ value: i.id, label: i.name }))}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          rooms={project.rooms.map((r) => ({ value: r.roomId, label: r.roomName }))}
          defaults={{
            materialCategoryId: byName("Materials") || (categories[0]?.id ?? ""),
            laborCategoryId: byName("Labor"),
          }}
          cancelHref={back}
        />
      )}
    </div>
  );
}
