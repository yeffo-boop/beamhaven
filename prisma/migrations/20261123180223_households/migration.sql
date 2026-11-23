-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "active_workspace_id" TEXT;

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'household',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviter_id" TEXT NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "invitations_workspace_id_idx" ON "invitations"("workspace_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only the three BeamHaven roles are allowed (docs/DATA_MODEL.md, "Roles").
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_role_check" CHECK ("role" IN ('owner', 'member', 'viewer'));

-- Accounts created before households existed (the first account from
-- Milestone 2, step 1) each get their own household, with them as owner.
-- Nobody else is affected: invited people always join an existing household.
CREATE TEMP TABLE "_new_households" AS
SELECT
  u."id" AS "user_id",
  replace(gen_random_uuid()::text, '-', '') AS "workspace_id",
  u."name" || '''s household' AS "name"
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m."user_id" = u."id");

INSERT INTO "workspaces" ("id", "name", "slug", "kind", "created_at")
SELECT "workspace_id", "name", 'household-' || "workspace_id", 'household', now()
FROM "_new_households";

INSERT INTO "memberships" ("id", "workspace_id", "user_id", "role", "created_at")
SELECT replace(gen_random_uuid()::text, '-', ''), "workspace_id", "user_id", 'owner', now()
FROM "_new_households";
DROP TABLE "_new_households";
