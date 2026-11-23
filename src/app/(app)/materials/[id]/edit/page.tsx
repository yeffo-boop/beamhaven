import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialForm } from "@/components/materials/forms";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { moneyInputValue } from "@/lib/money";
import { quantityInputValue } from "@/lib/quantity";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getMaterial, getMaterialFormChoices } from "@/server/services/materials";

export const metadata = { title: "Edit material" };

export default async function EditMaterialPage({ params }: PageProps<"/materials/[id]/edit">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const m = await orNotFound(getMaterial(ctx, id));
  const choices = await getMaterialFormChoices(ctx);
  const back = `/materials/${id}`;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← {m.name}
        </Link>
        <PageHeader title="Edit material" />
      </div>
      <MaterialForm
        material={{
          id,
          name: m.name,
          category: m.category ?? "",
          projectId: m.projectId ?? "",
          roomId: m.roomId ?? "",
          supplier: m.supplierName ?? "",
          brand: m.brand ?? "",
          modelNumber: m.modelNumber ?? "",
          sku: m.sku ?? "",
          colorFinish: m.colorFinish ?? "",
          productUrl: m.productUrl ?? "",
          quantity: quantityInputValue(m.quantityMilli),
          unit: m.unit ?? "",
          unitPrice: moneyInputValue(m.unitPriceCents),
          status: m.status,
          specs: m.specs ?? "",
          notes: m.notes ?? "",
        }}
        {...choices}
        cancelHref={back}
      />
    </div>
  );
}
