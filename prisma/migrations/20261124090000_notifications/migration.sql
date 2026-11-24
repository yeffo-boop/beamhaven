-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_workspace_id_user_id_read_at_idx" ON "notifications"("workspace_id", "user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: only the four kinds the app writes, and links inside the app.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check"
  CHECK ("kind" IN ('task_assigned', 'task_done', 'quote_decided', 'board_item_approved'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_href_check"
  CHECK ("href" LIKE '/%' AND "href" NOT LIKE '//%');
