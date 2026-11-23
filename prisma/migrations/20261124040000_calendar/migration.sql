-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "expected_on" DATE;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "time_zone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'appointment',
    "day" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "project_id" TEXT,
    "room_id" TEXT,
    "contractor_id" TEXT,
    "outcome" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_workspace_id_day_idx" ON "appointments"("workspace_id", "day");

-- CreateIndex
CREATE INDEX "appointments_project_id_idx" ON "appointments"("project_id");

-- CreateIndex
CREATE INDEX "appointments_room_id_idx" ON "appointments"("room_id");

-- CreateIndex
CREATE INDEX "appointments_contractor_id_idx" ON "appointments"("contractor_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_id_workspace_id_key" ON "appointments"("id", "workspace_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "appointments" ADD CONSTRAINT "appointments_kind_check"
  CHECK ("kind" IN ('appointment', 'inspection', 'delivery', 'other'));
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_outcome_check"
  CHECK ("outcome" IS NULL OR ("kind" = 'inspection' AND "outcome" IN ('passed', 'failed')));
-- Wall-clock times, "HH:MM"; an end needs a start and comes after it.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_times_check"
  CHECK (
    ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    AND ("end_time" IS NULL OR ("start_time" IS NOT NULL AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end_time" > "start_time"))
  );
