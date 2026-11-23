-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "milestone_id" TEXT;

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_date" DATE,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "depends_on_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("task_id","depends_on_id")
);

-- CreateIndex
CREATE INDEX "milestones_workspace_id_idx" ON "milestones"("workspace_id");

-- CreateIndex
CREATE INDEX "milestones_project_id_idx" ON "milestones"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_id_workspace_id_key" ON "milestones"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_id_project_id_workspace_id_key" ON "milestones"("id", "project_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_project_id_name_key" ON "milestones"("project_id", "name");

-- CreateIndex
CREATE INDEX "task_dependencies_workspace_id_idx" ON "task_dependencies"("workspace_id");

-- CreateIndex
CREATE INDEX "task_dependencies_depends_on_id_idx" ON "task_dependencies"("depends_on_id");

-- CreateIndex
CREATE INDEX "tasks_milestone_id_idx" ON "tasks"("milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_workspace_id_key" ON "tasks"("id", "workspace_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_project_id_workspace_id_fkey" FOREIGN KEY ("milestone_id", "project_id", "workspace_id") REFERENCES "milestones"("id", "project_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_workspace_id_fkey" FOREIGN KEY ("task_id", "workspace_id") REFERENCES "tasks"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_id_workspace_id_fkey" FOREIGN KEY ("depends_on_id", "workspace_id") REFERENCES "tasks"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A milestone belongs to the task's project; MATCH SIMPLE wouldn't check a
-- task with no project, so that case is refused here.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_project_check"
  CHECK ("milestone_id" IS NULL OR "project_id" IS NOT NULL);
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_self_check"
  CHECK ("task_id" <> "depends_on_id");
