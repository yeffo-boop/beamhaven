-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "order_id" TEXT;

-- AlterTable
ALTER TABLE "commitments" ADD COLUMN     "order_id" TEXT;

-- AlterTable
ALTER TABLE "expense_allocations" ADD COLUMN     "commitment_id" TEXT;

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "order_number" TEXT,
    "ordered_on" DATE NOT NULL,
    "shipping_cents" BIGINT NOT NULL DEFAULT 0,
    "tax_cents" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "bill_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "material_id" TEXT,
    "line_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity_milli" INTEGER NOT NULL,
    "unit_price_cents" BIGINT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "delivered_on" DATE NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity_milli" INTEGER NOT NULL,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_bill_id_key" ON "orders"("bill_id");

-- CreateIndex
CREATE INDEX "orders_workspace_id_idx" ON "orders"("workspace_id");

-- CreateIndex
CREATE INDEX "orders_project_id_idx" ON "orders"("project_id");

-- CreateIndex
CREATE INDEX "orders_supplier_id_idx" ON "orders"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_workspace_id_key" ON "orders"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_bill_id_workspace_id_key" ON "orders"("bill_id", "workspace_id");

-- CreateIndex
CREATE INDEX "order_items_workspace_id_idx" ON "order_items"("workspace_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_material_id_idx" ON "order_items"("material_id");

-- CreateIndex
CREATE INDEX "order_items_line_id_idx" ON "order_items"("line_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_id_workspace_id_key" ON "order_items"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "deliveries_workspace_id_idx" ON "deliveries"("workspace_id");

-- CreateIndex
CREATE INDEX "deliveries_order_id_idx" ON "deliveries"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_id_workspace_id_key" ON "deliveries"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "delivery_items_workspace_id_idx" ON "delivery_items"("workspace_id");

-- CreateIndex
CREATE INDEX "delivery_items_order_item_id_idx" ON "delivery_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_items_delivery_id_order_item_id_key" ON "delivery_items"("delivery_id", "order_item_id");

-- CreateIndex
CREATE INDEX "attachments_order_id_idx" ON "attachments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "commitments_order_id_line_id_key" ON "commitments"("order_id", "line_id");

-- CreateIndex
CREATE INDEX "expense_allocations_commitment_id_idx" ON "expense_allocations"("commitment_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_order_id_workspace_id_fkey" FOREIGN KEY ("order_id", "workspace_id") REFERENCES "orders"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_order_id_workspace_id_fkey" FOREIGN KEY ("order_id", "workspace_id") REFERENCES "orders"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_commitment_id_workspace_id_fkey" FOREIGN KEY ("commitment_id", "workspace_id") REFERENCES "commitments"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_workspace_id_fkey" FOREIGN KEY ("supplier_id", "workspace_id") REFERENCES "vendors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_bill_id_workspace_id_fkey" FOREIGN KEY ("bill_id", "workspace_id") REFERENCES "expenses"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_workspace_id_fkey" FOREIGN KEY ("order_id", "workspace_id") REFERENCES "orders"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_material_id_workspace_id_fkey" FOREIGN KEY ("material_id", "workspace_id") REFERENCES "materials"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_id_workspace_id_fkey" FOREIGN KEY ("line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_workspace_id_fkey" FOREIGN KEY ("order_id", "workspace_id") REFERENCES "orders"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_workspace_id_fkey" FOREIGN KEY ("delivery_id", "workspace_id") REFERENCES "deliveries"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_order_item_id_workspace_id_fkey" FOREIGN KEY ("order_item_id", "workspace_id") REFERENCES "order_items"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written checks (Milestone 6, part 2).
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check"
  CHECK ("shipping_cents" >= 0 AND "tax_cents" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity_milli" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_check" CHECK ("unit_price_cents" >= 0);
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_quantity_check" CHECK ("quantity_milli" > 0);
-- An order's commitments are always marked as coming from an order.
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_order_source_check"
  CHECK ("order_id" IS NULL OR "source" = 'order');

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_one_target_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target_check"
  CHECK (num_nonnulls("property_id", "project_id", "room_id", "expense_id", "contractor_id", "warranty_id", "quote_id", "contract_id", "material_id", "order_id") = 1);
