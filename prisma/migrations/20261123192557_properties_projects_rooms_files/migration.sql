-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "measurement_system" TEXT NOT NULL DEFAULT 'imperial';

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "planned_start" DATE,
    "planned_end" DATE,
    "actual_start" DATE,
    "actual_end" DATE,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "floor_level" TEXT,
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "ceiling_height_mm" INTEGER,
    "entered_unit" TEXT NOT NULL DEFAULT 'imperial',
    "description" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_rooms" (
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "planned_improvements" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_rooms_pkey" PRIMARY KEY ("project_id","room_id")
);

-- CreateTable
CREATE TABLE "openings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "width_mm" INTEGER NOT NULL,
    "height_mm" INTEGER NOT NULL,
    "sill_height_mm" INTEGER,
    "entered_unit" TEXT NOT NULL DEFAULT 'imperial',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'photo',
    "caption" TEXT,
    "property_id" TEXT,
    "project_id" TEXT,
    "room_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_workspace_id_idx" ON "properties"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_id_workspace_id_key" ON "properties"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- CreateIndex
CREATE INDEX "projects_property_id_idx" ON "projects"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_workspace_id_key" ON "projects"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "rooms_workspace_id_idx" ON "rooms"("workspace_id");

-- CreateIndex
CREATE INDEX "rooms_property_id_idx" ON "rooms"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_id_workspace_id_key" ON "rooms"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "project_rooms_workspace_id_idx" ON "project_rooms"("workspace_id");

-- CreateIndex
CREATE INDEX "project_rooms_room_id_idx" ON "project_rooms"("room_id");

-- CreateIndex
CREATE INDEX "openings_workspace_id_idx" ON "openings"("workspace_id");

-- CreateIndex
CREATE INDEX "openings_room_id_idx" ON "openings"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_workspace_id_idx" ON "files"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_id_workspace_id_key" ON "files"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "attachments_workspace_id_idx" ON "attachments"("workspace_id");

-- CreateIndex
CREATE INDEX "attachments_file_id_idx" ON "attachments"("file_id");

-- CreateIndex
CREATE INDEX "attachments_property_id_idx" ON "attachments"("property_id");

-- CreateIndex
CREATE INDEX "attachments_project_id_idx" ON "attachments"("project_id");

-- CreateIndex
CREATE INDEX "attachments_room_id_idx" ON "attachments"("room_id");

-- CreateIndex
CREATE INDEX "activity_events_workspace_id_created_at_idx" ON "activity_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_events_entity_type_entity_id_idx" ON "activity_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_property_id_workspace_id_fkey" FOREIGN KEY ("property_id", "workspace_id") REFERENCES "properties"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_workspace_id_fkey" FOREIGN KEY ("property_id", "workspace_id") REFERENCES "properties"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_rooms" ADD CONSTRAINT "project_rooms_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_rooms" ADD CONSTRAINT "project_rooms_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openings" ADD CONSTRAINT "openings_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_workspace_id_fkey" FOREIGN KEY ("file_id", "workspace_id") REFERENCES "files"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Checks the database enforces on its own (written by hand; Prisma doesn't
-- model CHECK constraints). The allowed values match src/server/services/.
-- ---------------------------------------------------------------------------
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_measurement_system_check"
  CHECK ("measurement_system" IN ('imperial', 'metric'));

ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check"
  CHECK ("status" IN ('idea', 'planning', 'in_progress', 'on_hold', 'completed', 'canceled'));
ALTER TABLE "projects" ADD CONSTRAINT "projects_planned_dates_check"
  CHECK ("planned_start" IS NULL OR "planned_end" IS NULL OR "planned_start" <= "planned_end");
ALTER TABLE "projects" ADD CONSTRAINT "projects_actual_dates_check"
  CHECK ("actual_start" IS NULL OR "actual_end" IS NULL OR "actual_start" <= "actual_end");

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_entered_unit_check"
  CHECK ("entered_unit" IN ('imperial', 'metric'));
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_sizes_check"
  CHECK (("length_mm" IS NULL OR "length_mm" > 0)
     AND ("width_mm" IS NULL OR "width_mm" > 0)
     AND ("ceiling_height_mm" IS NULL OR "ceiling_height_mm" > 0));

ALTER TABLE "openings" ADD CONSTRAINT "openings_kind_check"
  CHECK ("kind" IN ('window', 'door', 'other'));
ALTER TABLE "openings" ADD CONSTRAINT "openings_entered_unit_check"
  CHECK ("entered_unit" IN ('imperial', 'metric'));
ALTER TABLE "openings" ADD CONSTRAINT "openings_sizes_check"
  CHECK ("width_mm" > 0 AND "height_mm" > 0 AND ("sill_height_mm" IS NULL OR "sill_height_mm" >= 0));

ALTER TABLE "files" ADD CONSTRAINT "files_size_check" CHECK ("size_bytes" > 0);

-- An attachment belongs to exactly one record.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target_check"
  CHECK (num_nonnulls("property_id", "project_id", "room_id") = 1);
