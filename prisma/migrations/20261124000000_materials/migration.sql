-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "material_id" TEXT;

-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "material_id" TEXT;

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT,
    "room_id" TEXT,
    "supplier_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "model_number" TEXT,
    "sku" TEXT,
    "color_finish" TEXT,
    "product_url" TEXT,
    "quantity_milli" INTEGER,
    "unit" TEXT,
    "unit_price_cents" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'considering',
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "specs" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "materials_workspace_id_idx" ON "materials"("workspace_id");

-- CreateIndex
CREATE INDEX "materials_project_id_idx" ON "materials"("project_id");

-- CreateIndex
CREATE INDEX "materials_room_id_idx" ON "materials"("room_id");

-- CreateIndex
CREATE INDEX "materials_supplier_id_idx" ON "materials"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_id_workspace_id_key" ON "materials"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "attachments_material_id_idx" ON "attachments"("material_id");

-- CreateIndex
CREATE INDEX "warranties_material_id_idx" ON "warranties"("material_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_material_id_workspace_id_fkey" FOREIGN KEY ("material_id", "workspace_id") REFERENCES "materials"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_material_id_workspace_id_fkey" FOREIGN KEY ("material_id", "workspace_id") REFERENCES "materials"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplier_id_workspace_id_fkey" FOREIGN KEY ("supplier_id", "workspace_id") REFERENCES "vendors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written checks (Milestone 6, part 1).
ALTER TABLE "materials" ADD CONSTRAINT "materials_status_check"
  CHECK ("status" IN ('considering', 'selected', 'ordered', 'delivered', 'installed', 'returned', 'canceled'));
ALTER TABLE "materials" ADD CONSTRAINT "materials_quantity_check"
  CHECK ("quantity_milli" IS NULL OR "quantity_milli" > 0);
ALTER TABLE "materials" ADD CONSTRAINT "materials_price_check"
  CHECK ("unit_price_cents" IS NULL OR "unit_price_cents" >= 0);

-- A warranty can now belong to a material alone.
ALTER TABLE "warranties" DROP CONSTRAINT "warranties_linked_check";
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_linked_check"
  CHECK (num_nonnulls("contractor_id", "project_id", "room_id", "material_id") >= 1);

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_one_target_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target_check"
  CHECK (num_nonnulls("property_id", "project_id", "room_id", "expense_id", "contractor_id", "warranty_id", "quote_id", "contract_id", "material_id") = 1);
