import Link from "next/link";

import { OrderList } from "@/components/orders/list";
import { PageHeader } from "@/components/page-header";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getOrders } from "@/server/services/orders";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const orders = await getOrders(ctx);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/materials" className="text-sm text-muted-foreground hover:text-foreground">
          ← Materials
        </Link>
        <PageHeader
          title="Orders"
          description="Everything ordered for your projects, newest first. Add an order from its project's page."
        />
      </div>
      <section className="rounded-[var(--radius-card)] border border-border bg-surface px-5 md:px-6">
        <OrderList orders={orders} showProject empty="No orders yet." />
      </section>
    </div>
  );
}
