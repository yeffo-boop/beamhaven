-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "contractor_id" TEXT,
ADD COLUMN     "warranty_id" TEXT;

-- CreateTable
CREATE TABLE "contractors" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "contact_name" TEXT,
    "trade" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "license_number" TEXT,
    "license_state" TEXT,
    "license_expires_on" DATE,
    "insurance_provider" TEXT,
    "insurance_expires_on" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_projects" (
    "workspace_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_projects_pkey" PRIMARY KEY ("contractor_id","project_id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "project_id" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'note',
    "occurred_on" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contractor_id" TEXT,
    "project_id" TEXT,
    "room_id" TEXT,
    "coverage" TEXT NOT NULL,
    "provider" TEXT,
    "starts_on" DATE,
    "expires_on" DATE,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT,
    "room_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assignee_user_id" TEXT,
    "assignee_contractor_id" TEXT,
    "due_date" DATE,
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractors_workspace_id_idx" ON "contractors"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractors_id_workspace_id_key" ON "contractors"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractors_vendor_id_workspace_id_key" ON "contractors"("vendor_id", "workspace_id");

-- CreateIndex
CREATE INDEX "contractor_projects_workspace_id_idx" ON "contractor_projects"("workspace_id");

-- CreateIndex
CREATE INDEX "contractor_projects_project_id_idx" ON "contractor_projects"("project_id");

-- CreateIndex
CREATE INDEX "communications_workspace_id_idx" ON "communications"("workspace_id");

-- CreateIndex
CREATE INDEX "communications_contractor_id_occurred_on_idx" ON "communications"("contractor_id", "occurred_on");

-- CreateIndex
CREATE INDEX "communications_project_id_idx" ON "communications"("project_id");

-- CreateIndex
CREATE INDEX "warranties_workspace_id_idx" ON "warranties"("workspace_id");

-- CreateIndex
CREATE INDEX "warranties_contractor_id_idx" ON "warranties"("contractor_id");

-- CreateIndex
CREATE INDEX "warranties_project_id_idx" ON "warranties"("project_id");

-- CreateIndex
CREATE INDEX "warranties_room_id_idx" ON "warranties"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_id_workspace_id_key" ON "warranties"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "tasks_workspace_id_idx" ON "tasks"("workspace_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "tasks"("project_id");

-- CreateIndex
CREATE INDEX "tasks_room_id_idx" ON "tasks"("room_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_contractor_id_idx" ON "tasks"("assignee_contractor_id");

-- CreateIndex
CREATE INDEX "attachments_contractor_id_idx" ON "attachments"("contractor_id");

-- CreateIndex
CREATE INDEX "attachments_warranty_id_idx" ON "attachments"("warranty_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_warranty_id_workspace_id_fkey" FOREIGN KEY ("warranty_id", "workspace_id") REFERENCES "warranties"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_vendor_id_workspace_id_fkey" FOREIGN KEY ("vendor_id", "workspace_id") REFERENCES "vendors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_projects" ADD CONSTRAINT "contractor_projects_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_projects" ADD CONSTRAINT "contractor_projects_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_contractor_id_workspace_id_fkey" FOREIGN KEY ("assignee_contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Written by hand: rules the database enforces itself.
-- ---------------------------------------------------------------------------

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_one_target_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target_check"
  CHECK (num_nonnulls("property_id", "project_id", "room_id", "expense_id", "contractor_id", "warranty_id") = 1);

ALTER TABLE "contractors" ADD CONSTRAINT "contractors_status_check"
  CHECK ("status" IN ('prospect', 'active', 'past', 'do_not_use'));

ALTER TABLE "communications" ADD CONSTRAINT "communications_channel_check"
  CHECK ("channel" IN ('call', 'email', 'text', 'meeting', 'note'));

ALTER TABLE "warranties" ADD CONSTRAINT "warranties_linked_check"
  CHECK (num_nonnulls("contractor_id", "project_id", "room_id") >= 1);
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_dates_check"
  CHECK ("starts_on" IS NULL OR "expires_on" IS NULL OR "starts_on" <= "expires_on");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linked_check"
  CHECK (num_nonnulls("project_id", "room_id") >= 1);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check"
  CHECK ("status" IN ('todo', 'doing', 'done'));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check"
  CHECK ("priority" IN ('low', 'normal', 'high'));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_one_assignee_check"
  CHECK (num_nonnulls("assignee_user_id", "assignee_contractor_id") <= 1);
