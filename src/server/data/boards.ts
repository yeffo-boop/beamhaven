import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import type { NewFile } from "./files";
import { newId } from "./ids";

/** Design boards and their items (Milestone 8, part 2, ADR-035). */

type Tx = Prisma.TransactionClient;

export type BoardFields = {
  name: string;
  roomId: string | null;
  projectId: string | null;
  notes: string | null;
};

/** What can change on an item after it's added. Its kind and picture stay. */
export type BoardItemFields = {
  title: string;
  notes: string | null;
  colorHex: string | null;
  brand: string | null;
  code: string | null;
  productUrl: string | null;
  materialId: string | null;
};

export type BoardItemRecord = BoardItemFields & {
  id: string;
  kind: string;
  position: number;
  fileId: string | null;
  materialName: string | null;
  isPreferred: boolean;
  approvedAt: Date | null;
  approvedByName: string | null;
};

/** Enough of an item to draw a thumbnail. */
export type BoardPreview = {
  id: string;
  kind: string;
  fileId: string | null;
  colorHex: string | null;
};

export type BoardSummary = BoardFields & {
  id: string;
  roomName: string | null;
  projectName: string | null;
  updatedAt: Date;
  itemCount: number;
  approvedCount: number;
  preview: BoardPreview[];
};

export type BoardDetail = BoardSummary & { items: BoardItemRecord[] };

async function linksInHousehold(
  tx: Tx,
  ws: string,
  links: { roomId?: string | null; projectId?: string | null; materialId?: string | null },
): Promise<boolean> {
  const counts = await Promise.all([
    links.roomId ? tx.room.count({ where: { id: links.roomId, workspaceId: ws } }) : 1,
    links.projectId ? tx.project.count({ where: { id: links.projectId, workspaceId: ws } }) : 1,
    links.materialId ? tx.material.count({ where: { id: links.materialId, workspaceId: ws } }) : 1,
  ]);
  return counts.every((n) => n === 1);
}

/** Locks the board's row, so items added or moved at once don't clash. */
async function lockBoard(tx: Tx, ws: string, boardId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ name: string }[]>`
    SELECT name FROM design_boards WHERE id = ${boardId} AND workspace_id = ${ws} FOR UPDATE`;
  return rows[0]?.name ?? null;
}

export async function insertBoard(
  ctx: WorkspaceContext,
  fields: BoardFields,
): Promise<{ id: string } | null> {
  return getPrisma().$transaction(async (tx) => {
    if (!(await linksInHousehold(tx, ctx.workspaceId, fields))) return null;
    const id = newId();
    await tx.designBoard.create({
      data: { id, workspaceId: ctx.workspaceId, createdById: ctx.userId, ...fields },
    });
    return { id };
  });
}

export async function updateBoardRow(
  ctx: WorkspaceContext,
  id: string,
  fields: BoardFields,
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    if (!(await linksInHousehold(tx, ctx.workspaceId, fields))) return false;
    const result = await tx.designBoard.updateMany({
      where: { id, workspaceId: ctx.workspaceId },
      data: fields,
    });
    return result.count === 1;
  });
}

/** Deletes a board and its items. Returns their pictures, for the caller to remove. */
export async function deleteBoardRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ name: string; fileIds: string[] } | null> {
  return getPrisma().$transaction(async (tx) => {
    const board = await tx.designBoard.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { name: true, items: { select: { fileId: true } } },
    });
    if (!board) return null;
    await tx.designBoard.delete({ where: { id } });
    return {
      name: board.name,
      fileIds: board.items.flatMap((i) => (i.fileId ? [i.fileId] : [])),
    };
  });
}

/**
 * Adds an item at the end of the board, with its picture if it has one.
 * Null if the board, or the material it points to, isn't in this household.
 */
export async function insertBoardItem(
  ctx: WorkspaceContext,
  boardId: string,
  kind: string,
  fields: BoardItemFields,
  file: NewFile | null,
): Promise<{ id: string; boardName: string } | null> {
  return getPrisma().$transaction(async (tx) => {
    const boardName = await lockBoard(tx, ctx.workspaceId, boardId);
    if (boardName === null) return null;
    if (!(await linksInHousehold(tx, ctx.workspaceId, fields))) return null;
    const last = await tx.boardItem.aggregate({
      where: { boardId, workspaceId: ctx.workspaceId },
      _max: { position: true },
    });
    let fileId: string | null = null;
    if (file) {
      fileId = newId();
      await tx.fileObject.create({
        data: { id: fileId, workspaceId: ctx.workspaceId, uploadedById: ctx.userId, ...file },
      });
    }
    const id = newId();
    await tx.boardItem.create({
      data: {
        id,
        workspaceId: ctx.workspaceId,
        boardId,
        kind,
        position: (last._max.position ?? -1) + 1,
        fileId,
        createdById: ctx.userId,
        ...fields,
      },
    });
    await tx.designBoard.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
    return { id, boardName };
  });
}

/** The item's kind, or null if it isn't on that board in this household. */
export async function findBoardItemKind(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
): Promise<string | null> {
  const item = await getPrisma().boardItem.findFirst({
    where: { id: itemId, boardId, workspaceId: ctx.workspaceId },
    select: { kind: true },
  });
  return item?.kind ?? null;
}

export async function updateBoardItemRow(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
  fields: BoardItemFields,
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    if (!(await linksInHousehold(tx, ctx.workspaceId, fields))) return false;
    const result = await tx.boardItem.updateMany({
      where: { id: itemId, boardId, workspaceId: ctx.workspaceId },
      data: fields,
    });
    return result.count === 1;
  });
}

/** Marks an item preferred, or approved (recording who and when), or undoes either. */
export async function setBoardItemFlag(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
  flag: "preferred" | "approved",
  on: boolean,
): Promise<{ title: string } | null> {
  return getPrisma().$transaction(async (tx) => {
    const item = await tx.boardItem.findFirst({
      where: { id: itemId, boardId, workspaceId: ctx.workspaceId },
      select: { title: true },
    });
    if (!item) return null;
    await tx.boardItem.update({
      where: { id: itemId },
      data:
        flag === "preferred"
          ? { isPreferred: on }
          : on
            ? { approvedAt: new Date(), approvedById: ctx.userId }
            : { approvedAt: null, approvedById: null },
    });
    return item;
  });
}

/** Removes an item and closes the gap. Returns its picture, for the caller to remove. */
export async function deleteBoardItemRow(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
): Promise<{ title: string; fileId: string | null } | null> {
  return getPrisma().$transaction(async (tx) => {
    if ((await lockBoard(tx, ctx.workspaceId, boardId)) === null) return null;
    const item = await tx.boardItem.findFirst({
      where: { id: itemId, boardId, workspaceId: ctx.workspaceId },
      select: { title: true, fileId: true, position: true },
    });
    if (!item) return null;
    await tx.boardItem.delete({ where: { id: itemId } });
    await tx.boardItem.updateMany({
      where: { boardId, workspaceId: ctx.workspaceId, position: { gt: item.position } },
      data: { position: { decrement: 1 } },
    });
    return { title: item.title, fileId: item.fileId };
  });
}

/** The board's item ids in their current order, or null if it isn't in this household. */
export async function listBoardItemIds(
  ctx: WorkspaceContext,
  boardId: string,
): Promise<string[] | null> {
  const board = await getPrisma().designBoard.findFirst({
    where: { id: boardId, workspaceId: ctx.workspaceId },
    select: {
      items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } },
    },
  });
  return board ? board.items.map((i) => i.id) : null;
}

export type ReorderResult = "ok" | "not_found" | "mismatch";

/**
 * Puts the board's items in the given order. The list must hold exactly the
 * board's items (so a stale page can't drop or invent one).
 */
export async function reorderBoardItemRows(
  ctx: WorkspaceContext,
  boardId: string,
  ids: string[],
): Promise<ReorderResult> {
  return getPrisma().$transaction(async (tx) => {
    if ((await lockBoard(tx, ctx.workspaceId, boardId)) === null) return "not_found";
    const current = await tx.boardItem.findMany({
      where: { boardId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const known = new Set(current.map((i) => i.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length) return "mismatch";
    if (!ids.every((id) => known.has(id))) return "mismatch";
    for (const [position, id] of ids.entries()) {
      await tx.boardItem.update({ where: { id }, data: { position } });
    }
    await tx.designBoard.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
    return "ok";
  });
}

const boardSelect = {
  id: true,
  name: true,
  roomId: true,
  projectId: true,
  notes: true,
  updatedAt: true,
  room: { select: { name: true } },
  project: { select: { name: true } },
} as const;

const itemSelect = {
  id: true,
  kind: true,
  title: true,
  notes: true,
  position: true,
  fileId: true,
  colorHex: true,
  brand: true,
  code: true,
  productUrl: true,
  materialId: true,
  material: { select: { name: true } },
  isPreferred: true,
  approvedAt: true,
  approvedById: true,
} as const;

export type BoardFilter = { roomId?: string; projectId?: string };

export async function listBoards(
  ctx: WorkspaceContext,
  filter: BoardFilter = {},
): Promise<BoardSummary[]> {
  const rows = await getPrisma().designBoard.findMany({
    where: { workspaceId: ctx.workspaceId, ...filter },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: 200,
    select: {
      ...boardSelect,
      items: {
        orderBy: [{ position: "asc" }],
        take: 4,
        select: { id: true, kind: true, fileId: true, colorHex: true },
      },
      _count: { select: { items: true } },
    },
  });
  const approved = await getPrisma().boardItem.groupBy({
    by: ["boardId"],
    where: {
      workspaceId: ctx.workspaceId,
      boardId: { in: rows.map((r) => r.id) },
      approvedAt: { not: null },
    },
    _count: { _all: true },
  });
  const approvedBy = new Map(approved.map((a) => [a.boardId, a._count._all]));
  return rows.map(({ room, project, items, _count, ...row }) => ({
    ...row,
    roomName: room?.name ?? null,
    projectName: project?.name ?? null,
    itemCount: _count.items,
    approvedCount: approvedBy.get(row.id) ?? 0,
    preview: items,
  }));
}

export async function findBoard(ctx: WorkspaceContext, id: string): Promise<BoardDetail | null> {
  const row = await getPrisma().designBoard.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: {
      ...boardSelect,
      items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: itemSelect },
    },
  });
  if (!row) return null;
  const approverIds = [
    ...new Set(row.items.flatMap((i) => (i.approvedById ? [i.approvedById] : []))),
  ];
  const approvers = approverIds.length
    ? await getPrisma().user.findMany({
        where: { id: { in: approverIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(approvers.map((u) => [u.id, u.name]));
  const { room, project, items, ...rest } = row;
  const list: BoardItemRecord[] = items.map(({ material, approvedById, ...item }) => ({
    ...item,
    materialName: material?.name ?? null,
    approvedByName: approvedById ? (names.get(approvedById) ?? null) : null,
  }));
  return {
    ...rest,
    roomName: room?.name ?? null,
    projectName: project?.name ?? null,
    itemCount: list.length,
    approvedCount: list.filter((i) => i.approvedAt).length,
    preview: list.slice(0, 4).map(({ id: itemId, kind, fileId, colorHex }) => ({
      id: itemId,
      kind,
      fileId,
      colorHex,
    })),
    items: list,
  };
}
