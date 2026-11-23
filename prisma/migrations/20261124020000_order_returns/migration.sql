
-- CreateTable
CREATE TABLE "order_returns" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "returned_on" DATE NOT NULL,
    "refund_cents" BIGINT NOT NULL,
    "refund_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity_milli" INTEGER NOT NULL,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_returns_refund_id_key" ON "order_returns"("refund_id");

-- CreateIndex
CREATE INDEX "order_returns_workspace_id_idx" ON "order_returns"("workspace_id");

-- CreateIndex
CREATE INDEX "order_returns_order_id_idx" ON "order_returns"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_returns_id_workspace_id_key" ON "order_returns"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_returns_refund_id_workspace_id_key" ON "order_returns"("refund_id", "workspace_id");

-- CreateIndex
CREATE INDEX "return_items_workspace_id_idx" ON "return_items"("workspace_id");

-- CreateIndex
CREATE INDEX "return_items_return_id_idx" ON "return_items"("return_id");

-- CreateIndex
CREATE INDEX "return_items_order_item_id_idx" ON "return_items"("order_item_id");

-- AddForeignKey
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_workspace_id_fkey" FOREIGN KEY ("order_id", "workspace_id") REFERENCES "orders"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_refund_id_workspace_id_fkey" FOREIGN KEY ("refund_id", "workspace_id") REFERENCES "expenses"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_workspace_id_fkey" FOREIGN KEY ("return_id", "workspace_id") REFERENCES "order_returns"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_workspace_id_fkey" FOREIGN KEY ("order_item_id", "workspace_id") REFERENCES "order_items"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_refund_check"
  CHECK ("refund_cents" >= 0 AND ("refund_id" IS NULL) = ("refund_cents" = 0));
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_quantity_check" CHECK ("quantity_milli" > 0);
-- Returns lower an order's commitments, so one whose items have all gone
-- back can reach $0 while its bill and refunds still point at it.
ALTER TABLE "commitments" DROP CONSTRAINT "commitments_amount_check";
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_amount_check"
  CHECK ("amount_cents" <> 0 OR "source" = 'order');
