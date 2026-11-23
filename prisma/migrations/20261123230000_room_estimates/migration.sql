
-- AlterTable
ALTER TABLE "budget_lines" ADD COLUMN     "estimate_source_id" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "estimate_id" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "materials_tax_bp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "price_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price_cents" BIGINT NOT NULL,
    "coverage_mm2" INTEGER,
    "coats" INTEGER NOT NULL DEFAULT 1,
    "labor_cents" BIGINT,
    "waste_percent" INTEGER NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_estimates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "price_item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "material_category_id" TEXT NOT NULL,
    "labor_category_id" TEXT,
    "line_mode" TEXT NOT NULL DEFAULT 'per_room',
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_estimate_areas" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "estimate_id" TEXT NOT NULL,
    "room_id" TEXT,
    "label" TEXT,
    "typed_amount" INTEGER,
    "entered_unit" TEXT NOT NULL DEFAULT 'imperial',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_estimate_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_items_id_workspace_id_key" ON "price_items"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_items_workspace_id_name_key" ON "price_items"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "room_estimates_workspace_id_idx" ON "room_estimates"("workspace_id");

-- CreateIndex
CREATE INDEX "room_estimates_price_item_id_idx" ON "room_estimates"("price_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_estimates_id_workspace_id_key" ON "room_estimates"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_estimates_project_id_name_key" ON "room_estimates"("project_id", "name");

-- CreateIndex
CREATE INDEX "room_estimate_areas_workspace_id_idx" ON "room_estimate_areas"("workspace_id");

-- CreateIndex
CREATE INDEX "room_estimate_areas_estimate_id_idx" ON "room_estimate_areas"("estimate_id");

-- CreateIndex
CREATE INDEX "room_estimate_areas_room_id_idx" ON "room_estimate_areas"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_estimate_areas_id_workspace_id_key" ON "room_estimate_areas"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "budget_lines_estimate_source_id_idx" ON "budget_lines"("estimate_source_id");

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_estimate_source_id_workspace_id_fkey" FOREIGN KEY ("estimate_source_id", "workspace_id") REFERENCES "room_estimates"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_estimate_id_workspace_id_fkey" FOREIGN KEY ("estimate_id", "workspace_id") REFERENCES "room_estimates"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_estimates" ADD CONSTRAINT "room_estimates_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_estimates" ADD CONSTRAINT "room_estimates_price_item_id_workspace_id_fkey" FOREIGN KEY ("price_item_id", "workspace_id") REFERENCES "price_items"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_estimates" ADD CONSTRAINT "room_estimates_material_category_id_workspace_id_fkey" FOREIGN KEY ("material_category_id", "workspace_id") REFERENCES "budget_categories"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_estimates" ADD CONSTRAINT "room_estimates_labor_category_id_workspace_id_fkey" FOREIGN KEY ("labor_category_id", "workspace_id") REFERENCES "budget_categories"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_estimate_areas" ADD CONSTRAINT "room_estimate_areas_estimate_id_workspace_id_fkey" FOREIGN KEY ("estimate_id", "workspace_id") REFERENCES "room_estimates"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_estimate_areas" ADD CONSTRAINT "room_estimate_areas_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written checks (Prisma can't express these). See docs/DATA_MODEL.md.

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_materials_tax_check"
  CHECK ("materials_tax_bp" BETWEEN 0 AND 5000);

ALTER TABLE "price_items" ADD CONSTRAINT "price_items_measure_check"
  CHECK ("measure" IN ('floor', 'walls', 'ceiling', 'perimeter'));
-- Lengths are priced per foot or metre; areas per square foot, square metre, or by the can.
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_unit_check"
  CHECK (
    ("measure" = 'perimeter' AND "unit" IN ('lin_ft', 'lin_m'))
    OR ("measure" <> 'perimeter' AND "unit" IN ('sq_ft', 'sq_m', 'gallon', 'litre'))
  );
-- A can's price needs to know how much it covers, and only a can has a coverage.
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_coverage_check"
  CHECK (
    ("unit" IN ('gallon', 'litre') AND "coverage_mm2" > 0)
    OR ("unit" NOT IN ('gallon', 'litre') AND "coverage_mm2" IS NULL)
  );
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_amounts_check"
  CHECK (
    "price_cents" >= 0
    AND ("labor_cents" IS NULL OR "labor_cents" >= 0)
    AND "waste_percent" BETWEEN 0 AND 100
    AND "coats" BETWEEN 1 AND 10
  );

ALTER TABLE "room_estimates" ADD CONSTRAINT "room_estimates_line_mode_check"
  CHECK ("line_mode" IN ('per_room', 'one_line'));

-- Either a room (measured from its size, unless an amount is typed) or a
-- labelled area typed by hand.
ALTER TABLE "room_estimate_areas" ADD CONSTRAINT "room_estimate_areas_target_check"
  CHECK ("room_id" IS NOT NULL OR ("label" IS NOT NULL AND "typed_amount" IS NOT NULL));
ALTER TABLE "room_estimate_areas" ADD CONSTRAINT "room_estimate_areas_amount_check"
  CHECK ("typed_amount" IS NULL OR "typed_amount" > 0);
-- A room is in an estimate at most once.
CREATE UNIQUE INDEX "room_estimate_areas_one_per_room"
  ON "room_estimate_areas" ("estimate_id", "room_id") WHERE "room_id" IS NOT NULL;
