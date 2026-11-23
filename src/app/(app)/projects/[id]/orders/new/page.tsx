import Link from "next/link";
import { notFound } from "next/navigation";

import { orderFormChoices } from "@/components/orders/choices";
import { OrderForm } from "@/components/orders/forms";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { EmptyState } from "@/components/records/panel";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getProject } from "@/server/services/projects";

export const metadata = { title: "New order" };

export default async function NewOrderPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]/orders/new">) {
  const { id } = await params;
  const { materialId } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const project = await orNotFound(getProject(ctx, id));
  const choices = await orderFormChoices(ctx, id);
  const material = choices.materials.find((m) => m.value === materialId);
  const back = material ? `/materials/${material.value}` : `/projects/${id}`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← {material ? material.label : project.name}
        </Link>
        <PageHeader
          title="New order"
          description={`For ${project.name}. Record the price you actually paid for each item; it's kept with the order even if the store's price changes.`}
        />
      </div>
      {choices.lines.length === 0 ? (
        <EmptyState>
          Each item is paid for from a budget line, and this project has none yet.{" "}
          <Link href={`/projects/${id}/budget`} className="text-primary underline">
            Add a budget line
          </Link>{" "}
          first, like Materials or Fixtures.
        </EmptyState>
      ) : (
        <OrderForm
          projectId={id}
          {...(material
            ? {
                start: {
                  materialId: material.value,
                  quantity: material.quantity,
                  unitPrice: material.unitPrice,
                },
              }
            : {})}
          lines={choices.lines}
          materials={choices.materials}
          suppliers={choices.suppliers}
          cancelHref={back}
        />
      )}
    </div>
  );
}
