import { BoardForm } from "@/components/boards/board-forms";
import { BoardList } from "@/components/boards/board-list";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/records/panel";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getBoards } from "@/server/services/boards";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";

export const metadata = { title: "Inspiration" };

export default async function InspirationPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const [boards, choices] = await Promise.all([
    getBoards(ctx),
    canEdit ? getRecordChoices(ctx) : NO_CHOICES,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inspiration"
        description="Design boards of pictures, products, colors and finishes. Mark favourites, then approve the final choices."
      />
      <BoardList
        boards={boards}
        empty={`No design boards yet.${canEdit ? " Start one below." : ""}`}
      />
      {canEdit ? (
        <Panel title="Start a board" id="new-board">
          <BoardForm rooms={choices.rooms} projects={choices.projects} />
        </Panel>
      ) : null}
    </div>
  );
}
