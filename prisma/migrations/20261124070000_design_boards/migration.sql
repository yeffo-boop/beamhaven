-- CreateTable
CREATE TABLE "design_boards" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_id" TEXT,
    "project_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "position" INTEGER NOT NULL,
    "file_id" TEXT,
    "color_hex" TEXT,
    "brand" TEXT,
    "code" TEXT,
    "product_url" TEXT,
    "material_id" TEXT,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_boards_workspace_id_idx" ON "design_boards"("workspace_id");

-- CreateIndex
CREATE INDEX "design_boards_room_id_idx" ON "design_boards"("room_id");

-- CreateIndex
CREATE INDEX "design_boards_project_id_idx" ON "design_boards"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_boards_id_workspace_id_key" ON "design_boards"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_items_file_id_key" ON "board_items"("file_id");

-- CreateIndex
CREATE INDEX "board_items_workspace_id_idx" ON "board_items"("workspace_id");

-- CreateIndex
CREATE INDEX "board_items_board_id_position_idx" ON "board_items"("board_id", "position");

-- CreateIndex
CREATE INDEX "board_items_material_id_idx" ON "board_items"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_items_file_id_workspace_id_key" ON "board_items"("file_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "design_boards" ADD CONSTRAINT "design_boards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_boards" ADD CONSTRAINT "design_boards_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_boards" ADD CONSTRAINT "design_boards_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_board_id_workspace_id_fkey" FOREIGN KEY ("board_id", "workspace_id") REFERENCES "design_boards"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_file_id_workspace_id_fkey" FOREIGN KEY ("file_id", "workspace_id") REFERENCES "files"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_material_id_workspace_id_fkey" FOREIGN KEY ("material_id", "workspace_id") REFERENCES "materials"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written rules (ADR-035).
ALTER TABLE "design_boards" ADD CONSTRAINT "design_boards_name_check" CHECK (length(btrim(name)) > 0);
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_kind_check"
  CHECK (kind IN ('image', 'product', 'color', 'finish'));
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_title_check" CHECK (length(btrim(title)) > 0);
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_position_check" CHECK (position >= 0);
-- An image is a picture; a color is a color.
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_image_check" CHECK (kind <> 'image' OR file_id IS NOT NULL);
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_color_check" CHECK (kind <> 'color' OR color_hex IS NOT NULL);
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_color_hex_check" CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9a-f]{6}$');
-- Only web links, so a link on the board can't run anything.
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_product_url_check"
  CHECK (product_url IS NULL OR product_url ~* '^https?://');
-- Approval records who and when together.
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_approved_check"
  CHECK (approved_at IS NOT NULL OR approved_by_id IS NULL);
