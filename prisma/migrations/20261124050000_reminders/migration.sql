-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entry_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminders_workspace_id_user_id_read_at_idx" ON "reminders"("workspace_id", "user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_user_id_entry_key_day_key" ON "reminders"("user_id", "entry_key", "day");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reminders only ever link inside the app.
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_href_check" CHECK (href LIKE '/%' AND href NOT LIKE '//%');
