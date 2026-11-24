import Link from "next/link";
import { notFound } from "next/navigation";

import { AddBoardItemForm, BoardForm } from "@/components/boards/board-forms";
import { BoardItems } from "@/components/boards/board-items";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Panel } from "@/components/records/panel";
import { deleteBoardAction } from "@/server/actions/boards";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getBoard } from "@/server/services/boards";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";

export const metadata = { title: "Design board" };

export default async function BoardPage({ params, searchParams }: PageProps<"/inspiration/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const board = await orNotFound(getBoard(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const choices = canEdit ? await getRecordChoices(ctx) : NO_CHOICES;
  const counts = [
    board.itemCount === 1 ? "1 item" : `${board.itemCount} items`,
    board.approvedCount > 0 ? `${board.approvedCount} approved` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/inspiration" className="text-sm text-muted-foreground hover:text-foreground">
          ← Inspiration
        </Link>
        <PageHeader
          title={board.name}
          description={counts.join(" · ")}
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteBoardAction}
                label="Delete"
                srLabel={board.name}
                question="Delete this board and everything on it? This can't be undone."
                confirmLabel="Yes, delete it"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {board.roomId && board.roomName ? (
            <Link href={`/rooms/${board.roomId}`} className="text-primary hover:underline">
              {board.roomName}
            </Link>
          ) : null}
          {board.projectId && board.projectName ? (
            <Link href={`/projects/${board.projectId}`} className="text-primary hover:underline">
              {board.projectName}
            </Link>
          ) : null}
        </div>
        {board.notes ? <p className="text-sm whitespace-pre-line">{board.notes}</p> : null}
      </div>

      <ProblemNotice code={problem} />

      <BoardItems
        boardId={id}
        items={board.items}
        canEdit={canEdit}
        materials={choices.materials}
      />

      {canEdit ? (
        <>
          <Panel title="Add to the board" id="add-item">
            <AddBoardItemForm boardId={id} materials={choices.materials} />
          </Panel>
          <Panel title="Edit the board" id="edit-board">
            <BoardForm
              board={{
                id,
                name: board.name,
                roomId: board.roomId ?? "",
                projectId: board.projectId ?? "",
                notes: board.notes ?? "",
              }}
              rooms={choices.rooms}
              projects={choices.projects}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
