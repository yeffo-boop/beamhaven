-- Milestone 12, part 1 (ADR-044 to ADR-047): calendar links, punch lists and
-- allowances. Only adds tables and empty columns; no existing data changes.

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "punch_item_id" TEXT;

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "budget_line_id" TEXT;

-- CreateTable
CREATE TABLE "calendar_feeds" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "calendar_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "room_id" TEXT,
    "contractor_id" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fixed_at" TIMESTAMP(3),
    "signed_off_at" TIMESTAMP(3),
    "signed_off_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feeds_token_hash_key" ON "calendar_feeds"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feeds_workspace_id_user_id_key" ON "calendar_feeds"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "punch_items_workspace_id_idx" ON "punch_items"("workspace_id");

-- CreateIndex
CREATE INDEX "punch_items_project_id_idx" ON "punch_items"("project_id");

-- CreateIndex
CREATE INDEX "punch_items_room_id_idx" ON "punch_items"("room_id");

-- CreateIndex
CREATE INDEX "punch_items_contractor_id_idx" ON "punch_items"("contractor_id");

-- CreateIndex
CREATE UNIQUE INDEX "punch_items_id_workspace_id_key" ON "punch_items"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "attachments_punch_item_id_idx" ON "attachments"("punch_item_id");

-- CreateIndex
CREATE INDEX "materials_budget_line_id_idx" ON "materials"("budget_line_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_punch_item_id_workspace_id_fkey" FOREIGN KEY ("punch_item_id", "workspace_id") REFERENCES "punch_items"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_budget_line_id_workspace_id_fkey" FOREIGN KEY ("budget_line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Checks Prisma cannot express. The allowed values match src/server/services/punch-list.ts.
ALTER TABLE "punch_items"
  ADD CONSTRAINT "punch_items_status_check" CHECK ("status" IN ('open', 'fixed', 'signed_off'));
ALTER TABLE "punch_items"
  ADD CONSTRAINT "punch_items_title_check" CHECK (length("title") BETWEEN 1 AND 200);

-- An attachment still belongs to exactly one record, now including punch list items.
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_one_target_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target_check"
  CHECK (num_nonnulls("property_id", "project_id", "room_id", "expense_id", "contractor_id", "warranty_id", "quote_id", "contract_id", "material_id", "order_id", "punch_item_id") = 1);
