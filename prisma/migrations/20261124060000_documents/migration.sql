-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "project_id" TEXT,
    "room_id" TEXT,
    "contractor_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "file_id" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_workspace_id_category_idx" ON "documents"("workspace_id", "category");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "documents_room_id_idx" ON "documents"("room_id");

-- CreateIndex
CREATE INDEX "documents_contractor_id_idx" ON "documents"("contractor_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_id_workspace_id_key" ON "documents"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_file_id_key" ON "document_versions"("file_id");

-- CreateIndex
CREATE INDEX "document_versions_workspace_id_idx" ON "document_versions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_number_key" ON "document_versions"("document_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_file_id_workspace_id_key" ON "document_versions"("file_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contractor_id_workspace_id_fkey" FOREIGN KEY ("contractor_id", "workspace_id") REFERENCES "contractors"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_workspace_id_fkey" FOREIGN KEY ("document_id", "workspace_id") REFERENCES "documents"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_id_workspace_id_fkey" FOREIGN KEY ("file_id", "workspace_id") REFERENCES "files"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written rules (ADR-034).
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_check"
  CHECK (category IN ('plan', 'rendering', 'permit', 'contract', 'manual', 'warranty', 'inspection', 'invoice', 'other'));
ALTER TABLE "documents" ADD CONSTRAINT "documents_title_check" CHECK (length(btrim(title)) > 0);
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_number_check" CHECK (number > 0);
