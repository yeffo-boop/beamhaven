import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { readFileForDownload, UploadError } from "@/server/services/attachments";
import {
  addBoardItem,
  createBoard,
  deleteBoard,
  deleteBoardItem,
  getBoard,
  getBoards,
  markBoardItem,
  moveBoardItem,
  reorderBoardItems,
  updateBoard,
  updateBoardItem,
} from "@/server/services/boards";
import { NotFoundError, RuleError } from "@/server/services/errors";
import { createMaterial, deleteMaterial } from "@/server/services/materials";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom, deleteRoom } from "@/server/services/rooms";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);
const forbidden = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(PermissionError);
const invalid = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(ZodError);

// The first bytes of a real PNG, padded: enough for the type check.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%x\n");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const item = (over: Record<string, string> = {}) => ({
  kind: "product",
  title: "Brass pendant",
  notes: "",
  colorHex: "",
  brand: "",
  code: "",
  productUrl: "",
  materialId: "",
  ...over,
});

async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const room = (await createRoom(ctx, { propertyId: property, name: "Kitchen", type: "kitchen" }))
    .id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "planning" })
  ).id;
  const material = (await createMaterial(ctx, { name: "Pendant light", status: "considering" })).id;
  const board = (
    await createBoard(ctx, { name: "Kitchen finishes", roomId: room, projectId: project })
  ).id;
  return { user, workspaceId, ctx, property, room, project, material, board };
}

const titles = async (ctx: WorkspaceContext, board: string) =>
  (await getBoard(ctx, board)).items.map((i) => i.title);

describe("design boards", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("adds images, products, colors and finishes in order", async () => {
    const a = await household("Ana");
    await addBoardItem(a.ctx, a.board, item({ kind: "image", title: "Open shelving" }), {
      name: "shelves.png",
      bytes: PNG,
    });
    await addBoardItem(
      a.ctx,
      a.board,
      item({
        title: "Brass pendant",
        brand: "Schoolhouse",
        code: "PL-22",
        productUrl: "schoolhouse.com/pendant",
        materialId: a.material,
      }),
      null,
    );
    await addBoardItem(
      a.ctx,
      a.board,
      item({ kind: "color", title: "Sage", colorHex: "#9CAF88", brand: "Benjamin Moore" }),
      null,
    );
    await addBoardItem(a.ctx, a.board, item({ kind: "finish", title: "Oak", colorHex: "c96" }), {
      name: "oak.png",
      bytes: PNG,
    });

    const board = await getBoard(a.ctx, a.board);
    expect(board).toMatchObject({ roomName: "Kitchen", projectName: "Kitchen", itemCount: 4 });
    expect(board.items.map((i) => [i.position, i.kind, i.title])).toEqual([
      [0, "image", "Open shelving"],
      [1, "product", "Brass pendant"],
      [2, "color", "Sage"],
      [3, "finish", "Oak"],
    ]);
    expect(board.items[1]).toMatchObject({
      productUrl: "https://schoolhouse.com/pendant",
      materialName: "Pendant light",
      fileId: null,
    });
    expect(board.items[2]?.colorHex).toBe("#9caf88");
    expect(board.items[3]?.colorHex).toBe("#cc9966");
    const picture = board.items[0]?.fileId ?? "";
    expect(new Uint8Array((await readFileForDownload(a.ctx, picture)).bytes)).toEqual(PNG);

    const [listed] = await getBoards(a.ctx);
    expect(listed).toMatchObject({ itemCount: 4, approvedCount: 0 });
    expect(listed?.preview).toHaveLength(4);
    expect((await getBoards(a.ctx, { roomId: a.room })).map((b) => b.id)).toEqual([a.board]);
  });

  it("checks each kind: an image needs a photo, a color needs a color, links are web links", async () => {
    const a = await household("Ana");
    await expect(
      addBoardItem(a.ctx, a.board, item({ kind: "image", title: "Idea" }), null),
    ).rejects.toBeInstanceOf(UploadError);
    // Pictures are photos only: no PDFs and no SVG.
    for (const bytes of [PDF, SVG]) {
      await expect(
        addBoardItem(a.ctx, a.board, item({ kind: "image", title: "Idea" }), { name: "x", bytes }),
      ).rejects.toBeInstanceOf(UploadError);
    }
    await invalid(addBoardItem(a.ctx, a.board, item({ kind: "color", title: "Sage" }), null));
    await invalid(
      addBoardItem(a.ctx, a.board, item({ kind: "color", title: "Red", colorHex: "red" }), null),
    );
    await invalid(addBoardItem(a.ctx, a.board, item({ productUrl: "javascript:alert(1)" }), null));
    await invalid(addBoardItem(a.ctx, a.board, item({ kind: "poster" }), null));
    await invalid(addBoardItem(a.ctx, a.board, item({ title: "  " }), null));
    // A color doesn't keep a picture, even if one is sent.
    const { id } = await addBoardItem(
      a.ctx,
      a.board,
      item({ kind: "color", title: "Sage", colorHex: "#9caf88" }),
      { name: "x.png", bytes: PNG },
    );
    expect((await getBoard(a.ctx, a.board)).items).toMatchObject([{ id, fileId: null }]);
  });

  it("edits an item but keeps its kind, and a color keeps its color", async () => {
    const a = await household("Ana");
    const { id } = await addBoardItem(
      a.ctx,
      a.board,
      item({ kind: "color", title: "Sage", colorHex: "#9caf88" }),
      null,
    );
    // The kind sent (product) is ignored: it stays a color.
    await updateBoardItem(
      a.ctx,
      a.board,
      id,
      item({ title: "Sage green", colorHex: "#8a9f78", code: "HC-114" }),
    );
    expect((await getBoard(a.ctx, a.board)).items[0]).toMatchObject({
      kind: "color",
      title: "Sage green",
      colorHex: "#8a9f78",
      code: "HC-114",
    });
    await invalid(updateBoardItem(a.ctx, a.board, id, item({ title: "Sage", colorHex: "" })));
  });

  it("marks preferred and approved, with who and when", async () => {
    const a = await household("Ana");
    const { id } = await addBoardItem(a.ctx, a.board, item(), null);
    await markBoardItem(a.ctx, a.board, id, "preferred", true);
    await markBoardItem(a.ctx, a.board, id, "approved", true);
    const marked = (await getBoard(a.ctx, a.board)).items[0];
    expect(marked).toMatchObject({ isPreferred: true, approvedByName: "Ana" });
    expect(marked?.approvedAt).toBeInstanceOf(Date);
    expect((await getBoards(a.ctx))[0]?.approvedCount).toBe(1);

    await markBoardItem(a.ctx, a.board, id, "approved", false);
    await markBoardItem(a.ctx, a.board, id, "preferred", false);
    expect((await getBoard(a.ctx, a.board)).items[0]).toMatchObject({
      isPreferred: false,
      approvedAt: null,
      approvedByName: null,
    });
  });

  it("reorders by dragging and by the buttons, and closes gaps on removal", async () => {
    const a = await household("Ana");
    const ids: string[] = [];
    for (const title of ["One", "Two", "Three", "Four"]) {
      ids.push((await addBoardItem(a.ctx, a.board, item({ title }), null)).id);
    }
    const [one, two, three, four] = ids as [string, string, string, string];

    await reorderBoardItems(a.ctx, a.board, [four, one, two, three]);
    expect(await titles(a.ctx, a.board)).toEqual(["Four", "One", "Two", "Three"]);

    await moveBoardItem(a.ctx, a.board, three, "up");
    expect(await titles(a.ctx, a.board)).toEqual(["Four", "One", "Three", "Two"]);
    await moveBoardItem(a.ctx, a.board, four, "up"); // already first: nothing happens
    await moveBoardItem(a.ctx, a.board, four, "down");
    expect(await titles(a.ctx, a.board)).toEqual(["One", "Four", "Three", "Two"]);

    // A stale or made-up order is refused, and nothing changes.
    for (const order of [
      [one, two, three],
      [one, one, two, three],
      [one, two, three, "x"],
    ]) {
      const attempt = reorderBoardItems(a.ctx, a.board, order);
      await expect(attempt).rejects.toBeInstanceOf(RuleError);
      await expect(attempt).rejects.toMatchObject({ code: "board_order_changed" });
    }
    await invalid(reorderBoardItems(a.ctx, a.board, "not a list"));
    expect(await titles(a.ctx, a.board)).toEqual(["One", "Four", "Three", "Two"]);

    await deleteBoardItem(a.ctx, a.board, four);
    const board = await getBoard(a.ctx, a.board);
    expect(board.items.map((i) => [i.position, i.title])).toEqual([
      [0, "One"],
      [1, "Three"],
      [2, "Two"],
    ]);
  });

  it("deletes a board with its items and their pictures", async () => {
    const a = await household("Ana");
    await addBoardItem(a.ctx, a.board, item({ kind: "image", title: "Idea" }), {
      name: "idea.png",
      bytes: PNG,
    });
    const { id: lone } = await addBoardItem(a.ctx, a.board, item({ kind: "image", title: "B" }), {
      name: "b.png",
      bytes: PNG,
    });
    const files = (await getBoard(a.ctx, a.board)).items.map((i) => i.fileId ?? "");
    const loneFile = files[1] ?? "";

    await deleteBoardItem(a.ctx, a.board, lone);
    await notFound(readFileForDownload(a.ctx, loneFile));

    await deleteBoard(a.ctx, a.board);
    await notFound(getBoard(a.ctx, a.board));
    await notFound(readFileForDownload(a.ctx, files[0] ?? ""));
  });

  it("keeps boards and items when their room, project or material is deleted", async () => {
    const a = await household("Ana");
    await addBoardItem(a.ctx, a.board, item({ materialId: a.material }), null);
    await deleteMaterial(a.ctx, a.material);
    await deleteProject(a.ctx, a.project);
    await deleteRoom(a.ctx, a.room);
    const board = await getBoard(a.ctx, a.board);
    expect(board).toMatchObject({ roomId: null, projectId: null, itemCount: 1 });
    expect(board.items[0]?.materialId).toBeNull();
  });

  it("lets viewers look but not change anything", async () => {
    const a = await household("Ana");
    const { id } = await addBoardItem(a.ctx, a.board, item(), null);
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);

    expect((await getBoards(viewer)).map((b) => b.id)).toEqual([a.board]);
    expect((await getBoard(viewer, a.board)).itemCount).toBe(1);
    await forbidden(createBoard(viewer, { name: "Mine" }));
    await forbidden(updateBoard(viewer, a.board, { name: "Mine" }));
    await forbidden(deleteBoard(viewer, a.board));
    await forbidden(addBoardItem(viewer, a.board, item(), null));
    await forbidden(updateBoardItem(viewer, a.board, id, item()));
    await forbidden(markBoardItem(viewer, a.board, id, "approved", true));
    await forbidden(reorderBoardItems(viewer, a.board, [id]));
    await forbidden(moveBoardItem(viewer, a.board, id, "up"));
    await forbidden(deleteBoardItem(viewer, a.board, id));
  });
});

describe("design board isolation", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps each household's boards and items to itself", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    const { id } = await addBoardItem(b.ctx, b.board, item({ kind: "image", title: "Ben's" }), {
      name: "b.png",
      bytes: PNG,
    });
    const file = (await getBoard(b.ctx, b.board)).items[0]?.fileId ?? "";

    expect(await getBoards(a.ctx)).toHaveLength(1);
    await notFound(getBoard(a.ctx, b.board));
    await notFound(readFileForDownload(a.ctx, file));
    await notFound(updateBoard(a.ctx, b.board, { name: "Taken" }));
    await notFound(deleteBoard(a.ctx, b.board));
    await notFound(addBoardItem(a.ctx, b.board, item(), null));
    await notFound(updateBoardItem(a.ctx, b.board, id, item()));
    await notFound(markBoardItem(a.ctx, b.board, id, "approved", true));
    await notFound(reorderBoardItems(a.ctx, b.board, [id]));
    await notFound(moveBoardItem(a.ctx, b.board, id, "up"));
    await notFound(deleteBoardItem(a.ctx, b.board, id));
    // Ben's item through Ana's own board id doesn't work either.
    await notFound(updateBoardItem(a.ctx, a.board, id, item()));
    await notFound(deleteBoardItem(a.ctx, a.board, id));

    expect(await getBoard(b.ctx, b.board)).toMatchObject({
      name: "Kitchen finishes",
      itemCount: 1,
    });
    expect((await getBoard(b.ctx, b.board)).items[0]).toMatchObject({
      title: "Ben's",
      approvedAt: null,
    });
  });

  it("won't link a board or item to another household's room, project or material", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    await notFound(createBoard(a.ctx, { name: "X", roomId: b.room }));
    await notFound(createBoard(a.ctx, { name: "X", projectId: b.project }));
    await notFound(updateBoard(a.ctx, a.board, { name: "X", projectId: b.project }));
    await notFound(addBoardItem(a.ctx, a.board, item({ materialId: b.material }), null));
    const { id } = await addBoardItem(a.ctx, a.board, item(), null);
    await notFound(updateBoardItem(a.ctx, a.board, id, item({ materialId: b.material })));
    expect((await getBoard(a.ctx, a.board)).items[0]?.materialId).toBeNull();
  });
});
