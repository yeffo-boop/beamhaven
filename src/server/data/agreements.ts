import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { type LineLabel, lineSelect, toLabel, userNames } from "./budget";
import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/**
 * Quotes, contracts and change orders (Milestone 5). The money in them is
 * always a Commitment, so the budget reads it the same way as any other
 * agreement (docs/BUDGET_DEFINITIONS.md); these tables add the story
 * around it.
 */

type Tx = Prisma.TransactionClient;

const OPEN = ["received", "under_review"];

/** Lets another person's change to the same quote or contract wait for ours. */
async function lockRow(tx: Tx, table: "quotes" | "contracts", id: string, ws: string) {
  const rows =
    table === "quotes"
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "quotes" WHERE "id" = ${id} AND "workspace_id" = ${ws} FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "contracts" WHERE "id" = ${id} AND "workspace_id" = ${ws} FOR UPDATE`;
  return rows.length === 1;
}

async function contractorVendor(tx: Tx, ws: string, contractorId: string) {
  const row = await tx.contractor.findFirst({
    where: { id: contractorId, workspaceId: ws },
    select: { vendorId: true },
  });
  return row?.vendorId ?? null;
}

async function lineInProject(tx: Tx, ws: string, lineId: string, projectId: string) {
  return (await tx.budgetLine.count({ where: { id: lineId, workspaceId: ws, projectId } })) === 1;
}

/** Puts the contractor on the project (keeping any role already given). */
async function ensureOnProject(tx: Tx, ws: string, contractorId: string, projectId: string) {
  await tx.contractorProject.upsert({
    where: { contractorId_projectId: { contractorId, projectId } },
    create: { workspaceId: ws, contractorId, projectId },
    update: {},
  });
}

// --- Quotes ----------------------------------------------------------------

export type QuoteSummary = {
  id: string;
  title: string;
  status: string;
  contractorId: string;
  contractorName: string;
  projectId: string;
  projectName: string;
  validUntil: Date | null;
  amountCents: bigint;
  receivedOn: Date;
  revisionCount: number;
  commitmentId: string | null;
  contractId: string | null;
};

export type QuoteRevisionRecord = {
  id: string;
  revisionNumber: number;
  amountCents: bigint;
  receivedOn: Date;
  summary: string | null;
  createdByName: string | null;
};

export type QuoteDetail = QuoteSummary & {
  notes: string | null;
  /** A room estimate to compare its price with (Milestone 5, part 3). */
  estimateId: string | null;
  line: LineLabel | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
  revisions: QuoteRevisionRecord[];
};

const quoteSelect = {
  id: true,
  title: true,
  status: true,
  contractorId: true,
  projectId: true,
  validUntil: true,
  commitmentId: true,
  notes: true,
  estimateId: true,
  decidedAt: true,
  decidedById: true,
  decisionNote: true,
  contractor: { select: { vendor: { select: { name: true } } } },
  project: { select: { name: true } },
  line: { select: lineSelect },
  contract: { select: { id: true } },
  revisions: {
    orderBy: { revisionNumber: "desc" },
    select: {
      id: true,
      revisionNumber: true,
      amountCents: true,
      receivedOn: true,
      summary: true,
      createdById: true,
    },
  },
} as const;

type QuoteRow = Prisma.QuoteGetPayload<{ select: typeof quoteSelect }>;

function toQuoteSummary(row: QuoteRow): QuoteSummary {
  const latest = row.revisions[0];
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    contractorId: row.contractorId,
    contractorName: row.contractor.vendor.name,
    projectId: row.projectId,
    projectName: row.project.name,
    validUntil: row.validUntil,
    amountCents: latest?.amountCents ?? 0n,
    receivedOn: latest?.receivedOn ?? new Date(0),
    revisionCount: row.revisions.length,
    commitmentId: row.commitmentId,
    contractId: row.contract?.id ?? null,
  };
}

export async function listQuotes(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string },
): Promise<QuoteSummary[]> {
  const rows = await getPrisma().quote.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    orderBy: { createdAt: "desc" },
    select: quoteSelect,
  });
  return rows.map(toQuoteSummary);
}

export async function findQuote(ctx: WorkspaceContext, id: string): Promise<QuoteDetail | null> {
  const row = await getPrisma().quote.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: quoteSelect,
  });
  if (!row) return null;
  const names = await userNames([row.decidedById, ...row.revisions.map((r) => r.createdById)]);
  return {
    ...toQuoteSummary(row),
    notes: row.notes,
    estimateId: row.estimateId,
    line: row.line ? toLabel(row.line) : null,
    decidedAt: row.decidedAt,
    decidedByName: row.decidedById ? (names.get(row.decidedById) ?? null) : null,
    decisionNote: row.decisionNote,
    revisions: row.revisions.map(({ createdById, ...r }) => ({
      ...r,
      createdByName: createdById ? (names.get(createdById) ?? null) : null,
    })),
  };
}

export type NewQuote = {
  contractorId: string;
  projectId: string;
  title: string;
  validUntil: Date | null;
  notes: string | null;
};

export type RevisionFields = { amountCents: bigint; receivedOn: Date; summary: string | null };

/** The quote with its first price. Null if the contractor or project isn't in this household. */
export async function insertQuote(
  ctx: WorkspaceContext,
  quote: NewQuote,
  first: RevisionFields,
): Promise<{ id: string } | null> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const [contractor, project] = await Promise.all([
      tx.contractor.count({ where: { id: quote.contractorId, workspaceId: ws } }),
      tx.project.count({ where: { id: quote.projectId, workspaceId: ws } }),
    ]);
    if (contractor !== 1 || project !== 1) return null;
    const id = newId();
    await tx.quote.create({ data: { id, workspaceId: ws, createdById: ctx.userId, ...quote } });
    await tx.quoteRevision.create({
      data: {
        id: newId(),
        workspaceId: ws,
        quoteId: id,
        revisionNumber: 1,
        createdById: ctx.userId,
        ...first,
      },
    });
    await ensureOnProject(tx, ws, quote.contractorId, quote.projectId);
    return { id };
  });
}

export async function updateQuoteDetailsRow(
  ctx: WorkspaceContext,
  id: string,
  fields: { title: string; validUntil: Date | null; notes: string | null },
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { commitmentId: true, contract: { select: { id: true } } },
    });
    if (!quote) return false;
    await tx.quote.update({ where: { id }, data: fields });
    // An approved quote's title is its commitment's description, until a contract takes over.
    if (quote.commitmentId && !quote.contract) {
      await tx.commitment.update({
        where: { id: quote.commitmentId },
        data: { description: fields.title },
      });
    }
    return true;
  });
}

export type QuoteChange = "done" | "not_found" | "closed";

/** A new price. Only while the quote is still open (received or under review). */
export async function insertRevision(
  ctx: WorkspaceContext,
  quoteId: string,
  fields: RevisionFields,
): Promise<QuoteChange> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if (!(await lockRow(tx, "quotes", quoteId, ws))) return "not_found";
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { status: true, revisions: { select: { revisionNumber: true } } },
    });
    if (!OPEN.includes(quote.status)) return "closed";
    const next = Math.max(0, ...quote.revisions.map((r) => r.revisionNumber)) + 1;
    await tx.quoteRevision.create({
      data: {
        id: newId(),
        workspaceId: ws,
        quoteId,
        revisionNumber: next,
        createdById: ctx.userId,
        ...fields,
      },
    });
    return "done";
  });
}

/** Moves an open quote between "received" and "under review", or reopens a turned-down one. */
export async function setQuoteOpenStatus(
  ctx: WorkspaceContext,
  id: string,
  status: "received" | "under_review",
): Promise<QuoteChange> {
  const ws = ctx.workspaceId;
  const result = await getPrisma().quote.updateMany({
    where: { id, workspaceId: ws, status: { in: [...OPEN, "rejected"] } },
    data: { status, decidedAt: null, decidedById: null, decisionNote: null },
  });
  if (result.count === 1) return "done";
  const exists = await getPrisma().quote.count({ where: { id, workspaceId: ws } });
  return exists ? "closed" : "not_found";
}

export type ApproveResult =
  | { status: "approved"; amountCents: bigint; projectId: string; contractorId: string }
  | { status: "not_found" }
  | { status: "closed" }
  | { status: "wrong_line" };

/**
 * Approves the quote's latest price: it becomes a commitment on the chosen
 * line (which must be in the quote's project), naming the contractor.
 */
export async function approveQuoteRow(
  ctx: WorkspaceContext,
  id: string,
  decision: { lineId: string; committedOn: Date; note: string | null },
): Promise<ApproveResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if (!(await lockRow(tx, "quotes", id, ws))) return { status: "not_found" };
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        title: true,
        projectId: true,
        contractorId: true,
        revisions: { orderBy: { revisionNumber: "desc" }, take: 1, select: { amountCents: true } },
      },
    });
    if (!OPEN.includes(quote.status)) return { status: "closed" };
    if (!(await lineInProject(tx, ws, decision.lineId, quote.projectId))) {
      return { status: "wrong_line" };
    }
    const amountCents = quote.revisions[0]?.amountCents ?? 0n;
    const commitmentId = newId();
    await tx.commitment.create({
      data: {
        id: commitmentId,
        workspaceId: ws,
        lineId: decision.lineId,
        vendorId: await contractorVendor(tx, ws, quote.contractorId),
        source: "quote",
        description: quote.title,
        amountCents,
        committedOn: decision.committedOn,
        notes: decision.note,
        createdById: ctx.userId,
      },
    });
    await tx.quote.update({
      where: { id },
      data: {
        status: "approved",
        lineId: decision.lineId,
        commitmentId,
        decidedAt: new Date(),
        decidedById: ctx.userId,
        decisionNote: decision.note,
      },
    });
    return {
      status: "approved",
      amountCents,
      projectId: quote.projectId,
      contractorId: quote.contractorId,
    };
  });
}

export async function rejectQuoteRow(
  ctx: WorkspaceContext,
  id: string,
  note: string | null,
): Promise<QuoteChange> {
  const ws = ctx.workspaceId;
  const result = await getPrisma().quote.updateMany({
    where: { id, workspaceId: ws, status: { in: OPEN } },
    data: {
      status: "rejected",
      decidedAt: new Date(),
      decidedById: ctx.userId,
      decisionNote: note,
    },
  });
  if (result.count === 1) return "done";
  return (await getPrisma().quote.count({ where: { id, workspaceId: ws } }))
    ? "closed"
    : "not_found";
}

/**
 * Takes an approval back (a mistake, or the deal fell through): the
 * commitment goes and the quote is under review again. Not once a contract
 * or a bill depends on it.
 */
export async function withdrawApprovalRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<"done" | "not_found" | "closed" | "has_contract" | "has_bills"> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if (!(await lockRow(tx, "quotes", id, ws))) return "not_found";
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        commitmentId: true,
        contract: { select: { id: true } },
        commitment: { select: { _count: { select: { expenses: true } } } },
      },
    });
    if (quote.status !== "approved" || !quote.commitmentId) return "closed";
    if (quote.contract) return "has_contract";
    if ((quote.commitment?._count.expenses ?? 0) > 0) return "has_bills";
    await tx.quote.update({
      where: { id },
      data: {
        status: "under_review",
        commitmentId: null,
        lineId: null,
        decidedAt: null,
        decidedById: null,
        decisionNote: null,
      },
    });
    await tx.commitment.delete({ where: { id: quote.commitmentId } });
    return "done";
  });
}

/** Deletes a quote that isn't approved, with its revisions and documents. */
export async function deleteQuoteRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<
  { status: "deleted"; fileIds: string[] } | { status: "not_found" } | { status: "approved" }
> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if (!(await lockRow(tx, "quotes", id, ws))) return { status: "not_found" };
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id },
      select: { status: true, attachments: { select: { fileId: true } } },
    });
    if (quote.status === "approved") return { status: "approved" };
    await tx.quote.delete({ where: { id } });
    return { status: "deleted", fileIds: quote.attachments.map((a) => a.fileId) };
  });
}

// --- Contracts -------------------------------------------------------------

export type ContractFields = {
  title: string;
  signedOn: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
};

export type ChangeOrderRecord = {
  id: string;
  description: string;
  amountCents: bigint;
  committedOn: Date;
  notes: string | null;
  line: LineLabel;
};

export type ContractSummary = ContractFields & {
  id: string;
  contractorId: string;
  contractorName: string;
  projectId: string;
  projectName: string;
  quoteId: string | null;
  commitmentId: string;
  valueCents: bigint;
  changeOrdersCents: bigint;
  totalCents: bigint;
  billedCents: bigint;
  paidCents: bigint;
};

export type ContractDetail = ContractSummary & {
  quoteTitle: string | null;
  line: LineLabel;
  changeOrders: ChangeOrderRecord[];
  /** The contract's commitment and its change orders: what its bills can be linked to. */
  commitmentIds: string[];
};

const contractSelect = {
  id: true,
  contractorId: true,
  projectId: true,
  quoteId: true,
  commitmentId: true,
  title: true,
  signedOn: true,
  startDate: true,
  endDate: true,
  notes: true,
  contractor: { select: { vendor: { select: { name: true } } } },
  project: { select: { name: true } },
  quote: { select: { title: true } },
  commitment: { select: { amountCents: true, line: { select: lineSelect } } },
  changeOrders: {
    orderBy: { committedOn: "asc" },
    select: {
      id: true,
      description: true,
      amountCents: true,
      committedOn: true,
      notes: true,
      line: { select: lineSelect },
    },
  },
} as const;

type ContractRow = Prisma.ContractGetPayload<{ select: typeof contractSelect }>;

/** Billed and paid across a set of commitments, per commitment set. */
async function billedAndPaid(ws: string, commitmentIds: string[]) {
  const prisma = getPrisma();
  const expenses = await prisma.expense.findMany({
    where: { workspaceId: ws, commitmentId: { in: commitmentIds } },
    select: { id: true, commitmentId: true, totalCents: true },
  });
  const paid = await prisma.payment.groupBy({
    by: ["expenseId"],
    where: { workspaceId: ws, expenseId: { in: expenses.map((e) => e.id) } },
    _sum: { amountCents: true },
  });
  const paidBy = new Map(paid.map((p) => [p.expenseId, p._sum.amountCents ?? 0n]));
  return expenses.map((e) => ({
    commitmentId: e.commitmentId ?? "",
    totalCents: e.totalCents,
    paidCents: paidBy.get(e.id) ?? 0n,
  }));
}

function toContract(
  row: ContractRow,
  money: { commitmentId: string; totalCents: bigint; paidCents: bigint }[],
): ContractDetail {
  const commitmentIds = [row.commitmentId, ...row.changeOrders.map((c) => c.id)];
  const mine = money.filter((m) => commitmentIds.includes(m.commitmentId));
  const valueCents = row.commitment.amountCents;
  const changeOrdersCents = row.changeOrders.reduce((sum, c) => sum + c.amountCents, 0n);
  return {
    id: row.id,
    contractorId: row.contractorId,
    contractorName: row.contractor.vendor.name,
    projectId: row.projectId,
    projectName: row.project.name,
    quoteId: row.quoteId,
    quoteTitle: row.quote?.title ?? null,
    commitmentId: row.commitmentId,
    title: row.title,
    signedOn: row.signedOn,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    line: toLabel(row.commitment.line),
    valueCents,
    changeOrdersCents,
    totalCents: valueCents + changeOrdersCents,
    billedCents: mine.reduce((sum, m) => sum + m.totalCents, 0n),
    paidCents: mine.reduce((sum, m) => sum + m.paidCents, 0n),
    changeOrders: row.changeOrders.map(({ line, ...c }) => ({ ...c, line: toLabel(line) })),
    commitmentIds,
  };
}

export async function listContracts(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string; id?: string },
): Promise<ContractDetail[]> {
  const rows = await getPrisma().contract.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    orderBy: { createdAt: "desc" },
    select: contractSelect,
  });
  const ids = rows.flatMap((r) => [r.commitmentId, ...r.changeOrders.map((c) => c.id)]);
  const money = await billedAndPaid(ctx.workspaceId, ids);
  return rows.map((row) => toContract(row, money));
}

export async function findContract(
  ctx: WorkspaceContext,
  id: string,
): Promise<ContractDetail | null> {
  const [contract] = await listContracts(ctx, { id });
  return contract ?? null;
}

export type NewContract = ContractFields & {
  quoteId: string | null;
  contractorId: string | null;
  projectId: string | null;
  lineId: string | null;
  valueCents: bigint;
};

export type NewContractResult =
  | { status: "saved"; id: string; projectId: string; contractorId: string }
  | { status: "not_found" }
  | { status: "quote_not_approved" }
  | { status: "quote_has_contract" }
  | { status: "wrong_line" };

/**
 * Records a contract. From an approved quote it takes over the quote's
 * commitment (now a contract, at the contract's value), so the agreement
 * is counted once. Otherwise it adds a commitment on the chosen line.
 */
export async function insertContract(
  ctx: WorkspaceContext,
  input: NewContract,
): Promise<NewContractResult> {
  const ws = ctx.workspaceId;
  const { quoteId, contractorId, projectId, lineId, valueCents, ...fields } = input;
  return getPrisma().$transaction(async (tx) => {
    let commitmentId: string;
    let owner: { contractorId: string; projectId: string };
    if (quoteId) {
      if (!(await lockRow(tx, "quotes", quoteId, ws))) return { status: "not_found" };
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: quoteId },
        select: {
          status: true,
          commitmentId: true,
          contractorId: true,
          projectId: true,
          contract: { select: { id: true } },
        },
      });
      if (quote.status !== "approved" || !quote.commitmentId) {
        return { status: "quote_not_approved" };
      }
      if (quote.contract) return { status: "quote_has_contract" };
      commitmentId = quote.commitmentId;
      owner = { contractorId: quote.contractorId, projectId: quote.projectId };
      await tx.commitment.update({
        where: { id: commitmentId },
        data: {
          source: "contract",
          amountCents: valueCents,
          description: fields.title,
          ...(fields.signedOn ? { committedOn: fields.signedOn } : {}),
        },
      });
    } else {
      if (!contractorId || !lineId) return { status: "not_found" };
      const vendorId = await contractorVendor(tx, ws, contractorId);
      if (!vendorId) return { status: "not_found" };
      // The line says which project; a project given as well must match it.
      const line = await tx.budgetLine.findFirst({
        where: { id: lineId, workspaceId: ws },
        select: { projectId: true },
      });
      if (!line) return { status: "not_found" };
      if (projectId && projectId !== line.projectId) return { status: "wrong_line" };
      commitmentId = newId();
      owner = { contractorId, projectId: line.projectId };
      await tx.commitment.create({
        data: {
          id: commitmentId,
          workspaceId: ws,
          lineId,
          vendorId,
          source: "contract",
          description: fields.title,
          amountCents: valueCents,
          committedOn: fields.signedOn ?? new Date(),
          createdById: ctx.userId,
        },
      });
    }
    const id = newId();
    await tx.contract.create({
      data: {
        id,
        workspaceId: ws,
        ...owner,
        quoteId,
        commitmentId,
        createdById: ctx.userId,
        ...fields,
      },
    });
    await ensureOnProject(tx, ws, owner.contractorId, owner.projectId);
    return { status: "saved", id, ...owner };
  });
}

export async function updateContractRow(
  ctx: WorkspaceContext,
  id: string,
  fields: ContractFields & { valueCents: bigint },
): Promise<boolean> {
  const ws = ctx.workspaceId;
  const { valueCents, ...rest } = fields;
  return getPrisma().$transaction(async (tx) => {
    if (!(await lockRow(tx, "contracts", id, ws))) return false;
    const contract = await tx.contract.update({
      where: { id },
      data: rest,
      select: { commitmentId: true },
    });
    await tx.commitment.update({
      where: { id: contract.commitmentId },
      data: { amountCents: valueCents, description: rest.title },
    });
    return true;
  });
}

/**
 * Deletes a contract that has no bills yet, with its change orders. One
 * made from a quote hands the commitment back to the quote (at the quote's
 * price); otherwise the commitment goes too.
 */
export async function deleteContractRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<
  { status: "deleted"; fileIds: string[] } | { status: "not_found" } | { status: "has_bills" }
> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if (!(await lockRow(tx, "contracts", id, ws))) return { status: "not_found" };
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id },
      select: {
        commitmentId: true,
        quote: {
          select: {
            title: true,
            revisions: {
              orderBy: { revisionNumber: "desc" },
              take: 1,
              select: { amountCents: true },
            },
          },
        },
        changeOrders: { select: { id: true } },
        attachments: { select: { fileId: true } },
      },
    });
    const ids = [contract.commitmentId, ...contract.changeOrders.map((c) => c.id)];
    const bills = await tx.expense.count({ where: { workspaceId: ws, commitmentId: { in: ids } } });
    if (bills > 0) return { status: "has_bills" };
    await tx.commitment.deleteMany({
      where: { workspaceId: ws, id: { in: contract.changeOrders.map((c) => c.id) } },
    });
    await tx.contract.delete({ where: { id } });
    if (contract.quote) {
      await tx.commitment.update({
        where: { id: contract.commitmentId },
        data: {
          source: "quote",
          description: contract.quote.title,
          amountCents: contract.quote.revisions[0]?.amountCents ?? 0n,
        },
      });
    } else {
      await tx.commitment.delete({ where: { id: contract.commitmentId } });
    }
    return { status: "deleted", fileIds: contract.attachments.map((a) => a.fileId) };
  });
}

export type ChangeOrderFields = {
  description: string;
  amountCents: bigint;
  committedOn: Date;
  lineId: string | null;
  notes: string | null;
};

/** A change order on the contract, on its line unless another line of the project is chosen. */
export async function insertChangeOrder(
  ctx: WorkspaceContext,
  contractId: string,
  fields: ChangeOrderFields,
): Promise<{ status: "saved"; id: string } | { status: "not_found" } | { status: "wrong_line" }> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if (!(await lockRow(tx, "contracts", contractId, ws))) return { status: "not_found" };
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: contractId },
      select: {
        projectId: true,
        contractorId: true,
        commitment: { select: { lineId: true, vendorId: true } },
      },
    });
    const lineId = fields.lineId ?? contract.commitment.lineId;
    if (!(await lineInProject(tx, ws, lineId, contract.projectId))) return { status: "wrong_line" };
    const id = newId();
    await tx.commitment.create({
      data: {
        id,
        workspaceId: ws,
        lineId,
        vendorId: contract.commitment.vendorId,
        contractId,
        source: "change_order",
        description: fields.description,
        amountCents: fields.amountCents,
        committedOn: fields.committedOn,
        notes: fields.notes,
        createdById: ctx.userId,
      },
    });
    return { status: "saved", id };
  });
}

/** Returns the contract it was on; refuses ("in_use") while bills are linked to it. */
export async function deleteChangeOrderRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<
  { status: "deleted"; contractId: string } | { status: "not_found" } | { status: "in_use" }
> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.commitment.findFirst({
      where: { id, workspaceId: ctx.workspaceId, contractId: { not: null } },
      select: { contractId: true, _count: { select: { expenses: true } } },
    });
    if (!row?.contractId) return { status: "not_found" };
    if (row._count.expenses > 0) return { status: "in_use" };
    await tx.commitment.delete({ where: { id } });
    return { status: "deleted", contractId: row.contractId };
  });
}

export type AgreementLink = { kind: "quote" | "contract" | "change_order"; path: string };

/** The quote, contract or change order a commitment belongs to, if any. */
export async function commitmentAgreement(
  ctx: WorkspaceContext,
  commitmentId: string,
): Promise<AgreementLink | null> {
  const row = await getPrisma().commitment.findFirst({
    where: { id: commitmentId, workspaceId: ctx.workspaceId },
    select: {
      contractId: true,
      quote: { select: { id: true } },
      contractFor: { select: { id: true } },
    },
  });
  if (!row) return null;
  if (row.contractFor) return { kind: "contract", path: `/contracts/${row.contractFor.id}` };
  if (row.contractId) return { kind: "change_order", path: `/contracts/${row.contractId}` };
  if (row.quote) return { kind: "quote", path: `/quotes/${row.quote.id}` };
  return null;
}
