-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "expense_id" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "budget_locked_at" TIMESTAMP(3),
ADD COLUMN     "budget_locked_by_id" TEXT;

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'standard',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "room_id" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "planned_cents" BIGINT NOT NULL DEFAULT 0,
    "original_cents" BIGINT,
    "estimate_cents" BIGINT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_adjustments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_transfers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "from_line_id" TEXT NOT NULL,
    "to_line_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "allow_over_allocation" BOOLEAN NOT NULL DEFAULT false,
    "reverses_transfer_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'store',
    "website" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "description" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "committed_on" DATE NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "commitment_id" TEXT,
    "refund_of_expense_id" TEXT,
    "description" TEXT NOT NULL,
    "expense_date" DATE NOT NULL,
    "due_date" DATE,
    "total_cents" BIGINT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_allocations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'item',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'other',
    "reference" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_id_workspace_id_key" ON "budget_categories"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_workspace_id_name_key" ON "budget_categories"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "budget_lines_workspace_id_idx" ON "budget_lines"("workspace_id");

-- CreateIndex
CREATE INDEX "budget_lines_project_id_idx" ON "budget_lines"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_id_workspace_id_key" ON "budget_lines"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "budget_adjustments_workspace_id_idx" ON "budget_adjustments"("workspace_id");

-- CreateIndex
CREATE INDEX "budget_adjustments_line_id_idx" ON "budget_adjustments"("line_id");

-- CreateIndex
CREATE INDEX "budget_transfers_workspace_id_idx" ON "budget_transfers"("workspace_id");

-- CreateIndex
CREATE INDEX "budget_transfers_from_line_id_idx" ON "budget_transfers"("from_line_id");

-- CreateIndex
CREATE INDEX "budget_transfers_to_line_id_idx" ON "budget_transfers"("to_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_transfers_id_workspace_id_key" ON "budget_transfers"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_transfers_reverses_transfer_id_workspace_id_key" ON "budget_transfers"("reverses_transfer_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_id_workspace_id_key" ON "vendors"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_workspace_id_name_key" ON "vendors"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "commitments_workspace_id_idx" ON "commitments"("workspace_id");

-- CreateIndex
CREATE INDEX "commitments_line_id_idx" ON "commitments"("line_id");

-- CreateIndex
CREATE UNIQUE INDEX "commitments_id_workspace_id_key" ON "commitments"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "expenses_workspace_id_expense_date_idx" ON "expenses"("workspace_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_commitment_id_idx" ON "expenses"("commitment_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_id_workspace_id_key" ON "expenses"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "expense_allocations_workspace_id_idx" ON "expense_allocations"("workspace_id");

-- CreateIndex
CREATE INDEX "expense_allocations_expense_id_idx" ON "expense_allocations"("expense_id");

-- CreateIndex
CREATE INDEX "expense_allocations_line_id_idx" ON "expense_allocations"("line_id");

-- CreateIndex
CREATE INDEX "payments_workspace_id_idx" ON "payments"("workspace_id");

-- CreateIndex
CREATE INDEX "payments_expense_id_idx" ON "payments"("expense_id");

-- CreateIndex
CREATE INDEX "attachments_expense_id_idx" ON "attachments"("expense_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_workspace_id_fkey" FOREIGN KEY ("category_id", "workspace_id") REFERENCES "budget_categories"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_line_id_workspace_id_fkey" FOREIGN KEY ("line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transfers" ADD CONSTRAINT "budget_transfers_from_line_id_workspace_id_fkey" FOREIGN KEY ("from_line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transfers" ADD CONSTRAINT "budget_transfers_to_line_id_workspace_id_fkey" FOREIGN KEY ("to_line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transfers" ADD CONSTRAINT "budget_transfers_reverses_transfer_id_workspace_id_fkey" FOREIGN KEY ("reverses_transfer_id", "workspace_id") REFERENCES "budget_transfers"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_line_id_workspace_id_fkey" FOREIGN KEY ("line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_vendor_id_workspace_id_fkey" FOREIGN KEY ("vendor_id", "workspace_id") REFERENCES "vendors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_workspace_id_fkey" FOREIGN KEY ("vendor_id", "workspace_id") REFERENCES "vendors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_commitment_id_workspace_id_fkey" FOREIGN KEY ("commitment_id", "workspace_id") REFERENCES "commitments"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_refund_of_expense_id_workspace_id_fkey" FOREIGN KEY ("refund_of_expense_id", "workspace_id") REFERENCES "expenses"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_expense_id_workspace_id_fkey" FOREIGN KEY ("expense_id", "workspace_id") REFERENCES "expenses"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_line_id_workspace_id_fkey" FOREIGN KEY ("line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_expense_id_workspace_id_fkey" FOREIGN KEY ("expense_id", "workspace_id") REFERENCES "expenses"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Added by hand: rules the database enforces even if the code forgets.
-- ---------------------------------------------------------------------------

-- Receipts can be attached to expenses: still exactly one target.
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_one_target_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target_check"
  CHECK (num_nonnulls("property_id", "project_id", "room_id", "expense_id") = 1);

ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_kind_check"
  CHECK ("kind" IN ('standard', 'contingency'));

-- One line per project, category, room and name; "no room" counts as one value.
CREATE UNIQUE INDEX "budget_lines_unique_bucket"
  ON "budget_lines" ("project_id", "category_id", "room_id", "name") NULLS NOT DISTINCT;

ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_planned_check" CHECK ("planned_cents" >= 0);
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_original_check" CHECK ("original_cents" >= 0);
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_estimate_check" CHECK ("estimate_cents" >= 0);

ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_amount_check" CHECK ("amount_cents" <> 0);

ALTER TABLE "budget_transfers" ADD CONSTRAINT "budget_transfers_amount_check" CHECK ("amount_cents" > 0);
ALTER TABLE "budget_transfers" ADD CONSTRAINT "budget_transfers_lines_check" CHECK ("from_line_id" <> "to_line_id");

ALTER TABLE "vendors" ADD CONSTRAINT "vendors_kind_check"
  CHECK ("kind" IN ('store', 'online', 'contractor', 'other'));

ALTER TABLE "commitments" ADD CONSTRAINT "commitments_source_check"
  CHECK ("source" IN ('quote', 'contract', 'change_order', 'order', 'manual'));
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_amount_check" CHECK ("amount_cents" <> 0);

-- A refund is negative and points at the original; anything else is positive.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_sign_check" CHECK (
  ("refund_of_expense_id" IS NULL AND "total_cents" > 0)
  OR ("refund_of_expense_id" IS NOT NULL AND "total_cents" < 0)
);

ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_kind_check"
  CHECK ("kind" IN ('item', 'tax', 'shipping'));

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount_cents" <> 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_check"
  CHECK ("method" IN ('card', 'check', 'transfer', 'cash', 'other'));

-- Transfers and adjustments are the budget's permanent history (rule 7):
-- refuse any change or deletion, from any code.
CREATE FUNCTION "refuse_history_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are permanent; record a reversing entry instead', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER "budget_transfers_permanent" BEFORE UPDATE OR DELETE ON "budget_transfers"
  FOR EACH ROW EXECUTE FUNCTION "refuse_history_change"();
CREATE TRIGGER "budget_adjustments_permanent" BEFORE UPDATE OR DELETE ON "budget_adjustments"
  FOR EACH ROW EXECUTE FUNCTION "refuse_history_change"();

-- An expense's allocations must add up to its total, to the cent (rule 5).
-- Checked when the transaction commits, so an expense and its allocations
-- can be written in any order within one transaction.
CREATE FUNCTION "check_expense_balance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target text;
  total bigint;
  allocated bigint;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    target := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."expense_id";
  ELSE
    target := NEW."expense_id";
  END IF;
  SELECT "total_cents" INTO total FROM "expenses" WHERE "id" = target;
  IF NOT FOUND THEN
    RETURN NULL; -- the expense itself was deleted
  END IF;
  SELECT COALESCE(SUM("amount_cents"), 0) INTO allocated
    FROM "expense_allocations" WHERE "expense_id" = target;
  IF allocated <> total THEN
    RAISE EXCEPTION 'expense % is allocated % cents but totals % cents', target, allocated, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "expenses_balanced" AFTER INSERT OR UPDATE OF "total_cents" ON "expenses"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_expense_balance"();
CREATE CONSTRAINT TRIGGER "expense_allocations_balanced"
  AFTER INSERT OR UPDATE OR DELETE ON "expense_allocations"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_expense_balance"();
