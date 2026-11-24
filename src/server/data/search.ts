import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";

/** The kinds of record search looks through (Milestone 9, part 2, ADR-038). */
export const SEARCH_KINDS = [
  "project",
  "room",
  "property",
  "task",
  "milestone",
  "expense",
  "contractor",
  "quote",
  "contract",
  "warranty",
  "material",
  "order",
  "appointment",
  "document",
  "board",
  "board_item",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  /** Where it belongs (a project, a contractor, a board), when that helps tell hits apart. */
  context: string | null;
  /** The id the link opens; for a board item, that's its board. */
  linkId: string;
  updatedAt: Date;
};

/**
 * Case-insensitive "contains" matching on each record's names and notes,
 * always inside this household. Each kind returns at most `perKind` hits,
 * newest first. Words are matched separately, so "oak floor" finds
 * "Floor, white oak": every word must appear in one of the record's fields.
 */
export async function searchHousehold(
  ctx: WorkspaceContext,
  words: string[],
  perKind: number,
): Promise<SearchHit[]> {
  const db = getPrisma();
  const ws = ctx.workspaceId;
  const take = perKind;
  const orderBy = { updatedAt: "desc" as const };
  const has = (value: string) => ({ contains: value, mode: "insensitive" as const });
  /**
   * One condition per word: the word in at least one of the fields. A field
   * can be on a related record, written as a path such as "vendor.name".
   */
  function every(fields: string[]): Record<string, unknown>[] {
    return words.map((w) => ({
      OR: fields.map((path) =>
        path
          .split(".")
          .reverse()
          .reduce<Record<string, unknown>>((inner, key) => ({ [key]: inner }), has(w)),
      ),
    }));
  }

  // Run one after another rather than with Promise.all: they share one
  // pooled client, and 16 small indexed queries are quick either way.
  const hits: SearchHit[] = [];
  const add = (kind: SearchKind, rows: Omit<SearchHit, "kind" | "linkId">[], link?: string[]) =>
    rows.forEach((r, i) => hits.push({ ...r, kind, linkId: link?.[i] ?? r.id }));

  const projects = await db.project.findMany({
    where: { workspaceId: ws, AND: every(["name", "description"]) },
    select: { id: true, name: true, updatedAt: true, property: { select: { name: true } } },
    orderBy,
    take,
  });
  add(
    "project",
    projects.map((p) => ({
      id: p.id,
      title: p.name,
      context: p.property.name,
      updatedAt: p.updatedAt,
    })),
  );

  const rooms = await db.room.findMany({
    where: { workspaceId: ws, AND: every(["name", "description", "notes"]) },
    select: { id: true, name: true, updatedAt: true, property: { select: { name: true } } },
    orderBy,
    take,
  });
  add(
    "room",
    rooms.map((r) => ({
      id: r.id,
      title: r.name,
      context: r.property.name,
      updatedAt: r.updatedAt,
    })),
  );

  const properties = await db.property.findMany({
    where: { workspaceId: ws, AND: every(["name", "city", "notes"]) },
    select: { id: true, name: true, city: true, updatedAt: true },
    orderBy,
    take,
  });
  add(
    "property",
    properties.map((p) => ({ id: p.id, title: p.name, context: p.city, updatedAt: p.updatedAt })),
  );

  const tasks = await db.task.findMany({
    where: { workspaceId: ws, AND: every(["title", "description"]) },
    select: { id: true, title: true, updatedAt: true, project: { select: { name: true } } },
    orderBy,
    take,
  });
  add(
    "task",
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      context: t.project?.name ?? null,
      updatedAt: t.updatedAt,
    })),
  );

  const milestones = await db.milestone.findMany({
    where: { workspaceId: ws, AND: every(["name", "notes"]) },
    select: { id: true, name: true, updatedAt: true, project: { select: { name: true } } },
    orderBy,
    take,
  });
  add(
    "milestone",
    milestones.map((m) => ({
      id: m.id,
      title: m.name,
      context: m.project.name,
      updatedAt: m.updatedAt,
    })),
  );

  const expenses = await db.expense.findMany({
    where: {
      workspaceId: ws,
      AND: every(["description", "notes", "vendor.name"]),
    },
    select: { id: true, description: true, updatedAt: true, vendor: { select: { name: true } } },
    orderBy,
    take,
  });
  add(
    "expense",
    expenses.map((e) => ({
      id: e.id,
      title: e.description,
      context: e.vendor?.name ?? null,
      updatedAt: e.updatedAt,
    })),
  );

  const contractors = await db.contractor.findMany({
    where: {
      workspaceId: ws,
      AND: every(["contactName", "trade", "notes", "email", "vendor.name"]),
    },
    select: { id: true, trade: true, updatedAt: true, vendor: { select: { name: true } } },
    orderBy,
    take,
  });
  add(
    "contractor",
    contractors.map((c) => ({
      id: c.id,
      title: c.vendor.name,
      context: c.trade,
      updatedAt: c.updatedAt,
    })),
  );

  const quotes = await db.quote.findMany({
    where: {
      workspaceId: ws,
      AND: every(["title", "notes", "contractor.vendor.name"]),
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      contractor: { select: { vendor: { select: { name: true } } } },
    },
    orderBy,
    take,
  });
  add(
    "quote",
    quotes.map((q) => ({
      id: q.id,
      title: q.title,
      context: q.contractor.vendor.name,
      updatedAt: q.updatedAt,
    })),
  );

  const contracts = await db.contract.findMany({
    where: { workspaceId: ws, AND: every(["title", "notes"]) },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      contractor: { select: { vendor: { select: { name: true } } } },
    },
    orderBy,
    take,
  });
  add(
    "contract",
    contracts.map((c) => ({
      id: c.id,
      title: c.title,
      context: c.contractor.vendor.name,
      updatedAt: c.updatedAt,
    })),
  );

  const warranties = await db.warranty.findMany({
    where: { workspaceId: ws, AND: every(["coverage", "provider", "notes"]) },
    select: { id: true, coverage: true, provider: true, updatedAt: true },
    orderBy,
    take,
  });
  add(
    "warranty",
    warranties.map((w) => ({
      id: w.id,
      title: w.coverage,
      context: w.provider,
      updatedAt: w.updatedAt,
    })),
  );

  const materials = await db.material.findMany({
    where: {
      workspaceId: ws,
      AND: every(["name", "category", "brand", "modelNumber", "sku", "colorFinish", "notes"]),
    },
    select: { id: true, name: true, brand: true, updatedAt: true },
    orderBy,
    take,
  });
  add(
    "material",
    materials.map((m) => ({ id: m.id, title: m.name, context: m.brand, updatedAt: m.updatedAt })),
  );

  const orders = await db.order.findMany({
    where: {
      workspaceId: ws,
      AND: every(["orderNumber", "notes", "supplier.name"]),
    },
    select: {
      id: true,
      orderNumber: true,
      updatedAt: true,
      supplier: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy,
    take,
  });
  add(
    "order",
    orders.map((o) => ({
      id: o.id,
      title: o.orderNumber ? `${o.supplier.name} #${o.orderNumber}` : o.supplier.name,
      context: o.project.name,
      updatedAt: o.updatedAt,
    })),
  );

  const appointments = await db.appointment.findMany({
    where: { workspaceId: ws, AND: every(["title", "location", "outcome", "notes"]) },
    select: { id: true, title: true, location: true, updatedAt: true },
    orderBy,
    take,
  });
  add(
    "appointment",
    appointments.map((a) => ({
      id: a.id,
      title: a.title,
      context: a.location,
      updatedAt: a.updatedAt,
    })),
  );

  const documents = await db.document.findMany({
    where: { workspaceId: ws, AND: every(["title", "notes"]) },
    select: { id: true, title: true, category: true, updatedAt: true },
    orderBy,
    take,
  });
  add(
    "document",
    documents.map((d) => ({ id: d.id, title: d.title, context: null, updatedAt: d.updatedAt })),
  );

  const boards = await db.designBoard.findMany({
    where: { workspaceId: ws, AND: every(["name", "notes"]) },
    select: { id: true, name: true, updatedAt: true },
    orderBy,
    take,
  });
  add(
    "board",
    boards.map((b) => ({ id: b.id, title: b.name, context: null, updatedAt: b.updatedAt })),
  );

  const items = await db.boardItem.findMany({
    where: { workspaceId: ws, AND: every(["title", "notes", "brand", "code"]) },
    select: {
      id: true,
      title: true,
      boardId: true,
      updatedAt: true,
      board: { select: { name: true } },
    },
    orderBy,
    take,
  });
  add(
    "board_item",
    items.map((i) => ({ id: i.id, title: i.title, context: i.board.name, updatedAt: i.updatedAt })),
    items.map((i) => i.boardId),
  );

  return hits;
}
