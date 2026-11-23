-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "contract_id" TEXT,
ADD COLUMN     "quote_id" TEXT;

-- AlterTable
ALTER TABLE "commitments" ADD COLUMN     "contract_id" TEXT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "stage" TEXT;

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "line_id" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "valid_until" DATE,
    "notes" TEXT,
    "commitment_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "decision_note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_revisions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "received_on" DATE NOT NULL,
    "summary" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "quote_id" TEXT,
    "commitment_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "signed_on" DATE,
    "start_date" DATE,
    "end_date" DATE,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_commitment_id_key" ON "quotes"("commitment_id");

-- CreateIndex
CREATE INDEX "quotes_workspace_id_idx" ON "quotes"("workspace_id");

-- CreateIndex
CREATE INDEX "quotes_contractor_id_idx" ON "quotes"("contractor_id");

-- CreateIndex
CREATE INDEX "quotes_project_id_idx" ON "quotes"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_id_workspace_id_key" ON "quotes"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_commitment_id_workspace_id_key" ON "quotes"("commitment_id", "workspace_id");

-- CreateIndex
CREATE INDEX "quote_revisions_workspace_id_idx" ON "quote_revisions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_revisions_quote_id_revision_number_key" ON "quote_revisions"("quote_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_quote_id_key" ON "contracts"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_commitment_id_key" ON "contracts"("commitment_id");

-- CreateIndex
CREATE INDEX "contracts_workspace_id_idx" ON "contracts"("workspace_id");

-- CreateIndex
CREATE INDEX "contracts_contractor_id_idx" ON "contracts"("contractor_id");

-- CreateIndex
CREATE INDEX "contracts_project_id_idx" ON "contracts"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_id_workspace_id_key" ON "contracts"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_quote_id_workspace_id_key" ON "contracts"("quote_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_commitment_id_workspace_id_key" ON "contracts"("commitment_id", "workspace_id");

-- CreateIndex
CREATE INDEX "attachments_quote_id_idx" ON "attachments"("quote_id");

-- CreateIndex
CREATE INDEX "attachments_contract_id_idx" ON "attachments"("contract_id");

-- CreateIndex
CREATE INDEX "commitments_contract_id_idx" ON "commitments"("contract_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_quote_id_workspace_id_fkey" FOREIGN KEY ("quote_id", "workspace_id") REFERENCES "quotes"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_contract_id_workspace_id_fkey" FOREIGN KEY ("contract_id", "workspace_id") REFERENCES "contracts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_contract_id_workspace_id_fkey" FOREIGN KEY ("contract_id", "workspace_id") REFERENCES "contracts"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_line_id_workspace_id_fkey" FOREIGN KEY ("line_id", "workspace_id") REFERENCES "budget_lines"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_commitment_id_workspace_id_fkey" FOREIGN KEY ("commitment_id", "workspace_id") REFERENCES "commitments"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_quote_id_workspace_id_fkey" FOREIGN KEY ("quote_id", "workspace_id") REFERENCES "quotes"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quote_id_workspace_id_fkey" FOREIGN KEY ("quote_id", "workspace_id") REFERENCES "quotes"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_commitment_id_workspace_id_fkey" FOREIGN KEY ("commitment_id", "workspace_id") REFERENCES "commitments"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Written by hand: rules the database enforces itself.
-- ---------------------------------------------------------------------------

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_one_target_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target_check"
  CHECK (num_nonnulls("property_id", "project_id", "room_id", "expense_id", "contractor_id", "warranty_id", "quote_id", "contract_id") = 1);

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_status_check"
  CHECK ("status" IN ('received', 'under_review', 'approved', 'rejected'));
-- An approved quote is in the budget; nothing else is.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_check"
  CHECK (("status" = 'approved') = ("commitment_id" IS NOT NULL));

ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_amount_check" CHECK ("amount_cents" > 0);
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_number_check" CHECK ("revision_number" >= 1);

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_dates_check"
  CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date");

-- Only a change order points at a contract.
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_change_order_check"
  CHECK ("contract_id" IS NULL OR "source" = 'change_order');

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_stage_check"
  CHECK ("stage" IS NULL OR "stage" IN ('deposit', 'progress', 'final'));
