import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { orderFormChoices } from "@/components/orders/choices";
import { OrderForm } from "@/components/orders/forms";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { dayInputValue } from "@/lib/dates";
import { moneyInputValue } from "@/lib/money";
import { quantityInputValue } from "@/lib/quantity";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getOrder } from "@/server/services/orders";

export const metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const order = await orNotFound(getOrder(ctx, id));
  // Once the bill is in, the order stays as it was paid.
  if (order.bill) redirect(`/orders/${id}?problem=order_billed`);
  const choices = await orderFormChoices(ctx, order.projectId);
  const back = `/orders/${id}`;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← {order.title}
        </Link>
        <PageHeader title="Edit order" description={`For ${order.projectName}`} />
      </div>
      <OrderForm
        projectId={order.projectId}
        order={{
          id,
          supplier: order.supplierName,
          orderNumber: order.orderNumber ?? "",
          orderedOn: dayInputValue(order.orderedOn),
          shipping: order.shippingCents === 0n ? "" : moneyInputValue(order.shippingCents),
          tax: order.taxCents === 0n ? "" : moneyInputValue(order.taxCents),
          notes: order.notes ?? "",
          items: order.items.map((i) => ({
            id: i.id,
            materialId: i.materialId ?? "",
            // An item named after its material shows a blank box, so it follows the material.
            description: i.description === i.materialName ? "" : i.description,
            quantity: quantityInputValue(i.quantityMilli),
            unitPrice: moneyInputValue(i.unitPriceCents),
            lineId: i.line.id,
          })),
        }}
        lines={choices.lines}
        materials={choices.materials}
        suppliers={choices.suppliers}
        cancelHref={back}
      />
    </div>
  );
}
