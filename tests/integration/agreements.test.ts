import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import {
  addChangeOrder,
  approveQuote,
  createContract,
  createQuote,
  deleteChangeOrder,
  deleteContract,
  deleteQuote,
  getCommitmentAgreement,
  getContract,
  getContracts,
  getQuote,
  getQuotes,
  rejectQuote,
  reviseQuote,
  setQuoteReview,
  updateContract,
  updateQuoteDetails,
  withdrawApproval,
} from "@/server/services/agreements";
import { getDocuments, uploadDocument } from "@/server/services/attachments";
import { createLine, getCategories, getProjectBudget } from "@/server/services/budget";
import { createContractor, deleteContractor } from "@/server/services/contractors";
import { NotFoundError, RuleError } from "@/server/services/errors";
import {
  addPayment,
  createExpense,
  deleteCommitment,
  getBillsFor,
  getCommitment,
  getExpense,
  updateCommitment,
} from "@/server/services/expenses";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

async function sql(text: string, values: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);
const forbidden = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(PermissionError);
const rule = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RuleError);
  expect((error as RuleError).code).toBe(code);
};

const PDF = new TextEncoder().encode("%PDF-1.7\n%test\n");

/** A household with a project, two budget lines on it, and a contractor. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "planning" })
  ).id;
  const categories = await getCategories(ctx);
  const category = (n: string) => categories.find((c) => c.name === n)?.id ?? "";
  const labor = (
    await createLine(ctx, { projectId: project, categoryId: category("Labor"), planned: "20000" })
  ).id;
  const electrical = (
    await createLine(ctx, {
      projectId: project,
      categoryId: category("Materials"),
      planned: "5000",
    })
  ).id;
  const contractor = (await createContractor(ctx, { name: `${name} Builders`, status: "active" }))
    .id;
  return { user, workspaceId, ctx, property, project, labor, electrical, contractor };
}

type Household = Awaited<ReturnType<typeof household>>;

async function quote(h: Household, amount = "12000") {
  return (
    await createQuote(h.ctx, {
      contractorId: h.contractor,
      projectId: h.project,
      title: "Cabinets installed",
      amount,
      receivedOn: "2026-11-01",
    })
  ).id;
}

async function committed(h: Household): Promise<bigint> {
  return (await getProjectBudget(h.ctx, h.project)).totals.commitments;
}

describe("quotes, contracts and change orders", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps every version of a quote, and only the approved price reaches the budget", async () => {
    const a = await household("Ana");
    const id = await quote(a);
    await reviseQuote(a.ctx, id, {
      amount: "11500",
      receivedOn: "2026-11-05",
      summary: "Dropped the crown molding",
    });
    await setQuoteReview(a.ctx, id, "under_review");
    let q = await getQuote(a.ctx, id);
    expect(q).toMatchObject({ status: "under_review", amountCents: 1_150_000n, revisionCount: 2 });
    expect(q.revisions.map((r) => r.amountCents)).toEqual([1_150_000n, 1_200_000n]);
    // Received quotes put the contractor on the project.
    expect((await getQuotes(a.ctx, { projectId: a.project })).map((x) => x.id)).toEqual([id]);
    // Nothing is in the budget until it's approved.
    expect(await committed(a)).toBe(0n);

    await approveQuote(a.ctx, id, { lineId: a.labor, committedOn: "2026-11-06", note: "Best bid" });
    q = await getQuote(a.ctx, id);
    expect(q).toMatchObject({ status: "approved", decisionNote: "Best bid", decidedByName: "Ana" });
    expect(q.line?.id).toBe(a.labor);
    expect(await committed(a)).toBe(1_150_000n);
    const commitment = await getCommitment(a.ctx, q.commitmentId ?? "");
    expect(commitment).toMatchObject({ source: "quote", amountCents: 1_150_000n });
    expect(commitment.vendorName).toBe("Ana Builders");

    // A decided quote can't be repriced or decided again.
    await expect(reviseQuote(a.ctx, id, { amount: "1", receivedOn: "2026-11-07" })).rejects.toThrow(
      /already been decided/,
    );
    await expect(
      approveQuote(a.ctx, id, { lineId: a.labor, committedOn: "2026-11-07" }),
    ).rejects.toThrow(/already been decided/);
    // Its money is changed on the quote, never behind its back in the budget.
    expect(await getCommitmentAgreement(a.ctx, q.commitmentId ?? "")).toEqual({
      kind: "quote",
      path: `/quotes/${id}`,
    });
    await rule(
      updateCommitment(a.ctx, q.commitmentId ?? "", {
        lineId: a.labor,
        description: "x",
        amount: "1",
        committedOn: "2026-11-07",
        source: "verbal",
      }),
      "agreement_commitment",
    );
    await rule(deleteCommitment(a.ctx, q.commitmentId ?? ""), "agreement_commitment");
    await rule(deleteQuote(a.ctx, id), "quote_approved");

    // Taking the approval back takes it out of the budget again.
    await withdrawApproval(a.ctx, id);
    q = await getQuote(a.ctx, id);
    expect(q).toMatchObject({ status: "under_review", commitmentId: null, line: null });
    expect(await committed(a)).toBe(0n);
    await rule(withdrawApproval(a.ctx, id), "quote_changed");
  });

  it("only approves onto a line of the quote's own project", async () => {
    const a = await household("Ana");
    const other = (
      await createProject(a.ctx, { propertyId: a.property, name: "Bath", status: "planning" })
    ).id;
    const labor = (await getCategories(a.ctx)).find((c) => c.name === "Labor")?.id ?? "";
    const bathLine = (await createLine(a.ctx, { projectId: other, categoryId: labor })).id;
    const id = await quote(a);
    await expect(
      approveQuote(a.ctx, id, { lineId: bathLine, committedOn: "2026-11-06" }),
    ).rejects.toThrow(/budget line from this quote/);
    expect((await getQuote(a.ctx, id)).status).toBe("received");
  });

  it("turns down a quote, and reopens it", async () => {
    const a = await household("Ana");
    const id = await quote(a);
    await rejectQuote(a.ctx, id, { note: "Too slow" });
    expect(await getQuote(a.ctx, id)).toMatchObject({
      status: "rejected",
      decisionNote: "Too slow",
    });
    expect(await committed(a)).toBe(0n);
    await setQuoteReview(a.ctx, id, "received");
    expect(await getQuote(a.ctx, id)).toMatchObject({ status: "received", decidedAt: null });
    await updateQuoteDetails(a.ctx, id, { title: "Cabinets, take two" });
    expect((await getQuote(a.ctx, id)).title).toBe("Cabinets, take two");
    // An open quote can be deleted, with its documents.
    await uploadDocument(a.ctx, { kind: "quote", id }, { name: "quote.pdf", bytes: PDF });
    await deleteQuote(a.ctx, id);
    await notFound(getQuote(a.ctx, id));
  });

  it("turns an approved quote into a contract without counting the money twice", async () => {
    const a = await household("Ana");
    const quoteId = await quote(a);
    await approveQuote(a.ctx, quoteId, { lineId: a.labor, committedOn: "2026-11-06" });
    const quoteCommitment = (await getQuote(a.ctx, quoteId)).commitmentId;

    const contractId = (
      await createContract(a.ctx, {
        quoteId,
        title: "Cabinet installation",
        value: "12500",
        signedOn: "2026-11-10",
      })
    ).id;
    let c = await getContract(a.ctx, contractId);
    // The contract takes over the quote's commitment: same row, new price.
    expect(c.commitmentId).toBe(quoteCommitment);
    expect(c).toMatchObject({
      contractorId: a.contractor,
      projectId: a.project,
      valueCents: 1_250_000n,
      totalCents: 1_250_000n,
    });
    expect(await committed(a)).toBe(1_250_000n);
    expect((await getCommitment(a.ctx, c.commitmentId)).source).toBe("contract");
    expect((await getQuote(a.ctx, quoteId)).contractId).toBe(contractId);
    await expect(createContract(a.ctx, { quoteId, title: "Again", value: "1" })).rejects.toThrow(
      /already a contract/,
    );
    await rule(withdrawApproval(a.ctx, quoteId), "quote_has_contract");

    // Change orders: extra work and a credit, each a commitment of its own.
    await addChangeOrder(a.ctx, contractId, {
      description: "Two extra outlets",
      amount: "600",
      committedOn: "2026-11-15",
      lineId: a.electrical,
    });
    await addChangeOrder(a.ctx, contractId, {
      description: "Customer supplies handles",
      amount: "-200",
      committedOn: "2026-11-16",
    });
    c = await getContract(a.ctx, contractId);
    expect(c.changeOrdersCents).toBe(40_000n);
    expect(c.totalCents).toBe(1_290_000n);
    expect(c.changeOrders.map((o) => o.line.id)).toEqual([a.electrical, a.labor]);
    expect(await committed(a)).toBe(1_290_000n);
    const budget = await getProjectBudget(a.ctx, a.project);
    const line = (id: string) => budget.lines.find((l) => l.id === id)?.numbers.commitments;
    expect(line(a.labor)).toBe(1_230_000n);
    expect(line(a.electrical)).toBe(60_000n);

    // Bills against the contract, by stage, and what's been paid.
    const deposit = (
      await createExpense(a.ctx, {
        description: "Deposit",
        vendorName: "Ana Builders",
        commitmentId: c.commitmentId,
        stage: "deposit",
        total: "4000",
        expenseDate: "2026-11-12",
        allocations: [{ lineId: a.labor, amount: "", kind: "item" }],
      })
    ).id;
    await addPayment(a.ctx, deposit, { amount: "4000", paidOn: "2026-11-12", method: "check" });
    const extra = c.changeOrders[0]?.id ?? "";
    await createExpense(a.ctx, {
      description: "Outlets",
      commitmentId: extra,
      stage: "progress",
      total: "600",
      expenseDate: "2026-11-20",
      allocations: [{ lineId: a.electrical, amount: "", kind: "item" }],
    });
    c = await getContract(a.ctx, contractId);
    expect(c).toMatchObject({ billedCents: 460_000n, paidCents: 400_000n });
    const bills = await getBillsFor(a.ctx, c.commitmentIds);
    expect(bills.map((b) => [b.description, b.stage])).toEqual([
      ["Deposit", "deposit"],
      ["Outlets", "progress"],
    ]);
    expect((await getExpense(a.ctx, deposit)).stage).toBe("deposit");

    // A billed change order or contract stays; the budget's history must hold.
    await rule(deleteChangeOrder(a.ctx, extra), "commitment_in_use");
    await rule(deleteContract(a.ctx, contractId), "contract_has_bills");

    // Repricing the contract moves its commitment, nothing else.
    await updateContract(a.ctx, contractId, { title: "Cabinet installation", value: "13000" });
    expect(await committed(a)).toBe(1_340_000n);
  });

  it("hands the budget back to the quote when its contract is deleted", async () => {
    const a = await household("Ana");
    const quoteId = await quote(a, "9000");
    await approveQuote(a.ctx, quoteId, { lineId: a.labor, committedOn: "2026-11-06" });
    const contractId = (await createContract(a.ctx, { quoteId, title: "Install", value: "9500" }))
      .id;
    await addChangeOrder(a.ctx, contractId, {
      description: "Extra",
      amount: "300",
      committedOn: "2026-11-15",
    });
    await uploadDocument(
      a.ctx,
      { kind: "contract", id: contractId },
      { name: "c.pdf", bytes: PDF },
    );
    expect(await committed(a)).toBe(980_000n);

    await deleteContract(a.ctx, contractId);
    await notFound(getContract(a.ctx, contractId));
    const q = await getQuote(a.ctx, quoteId);
    expect(q).toMatchObject({ status: "approved", contractId: null });
    // Back at the quote's own price; the change order went with the contract.
    expect(await committed(a)).toBe(900_000n);
    expect((await getCommitment(a.ctx, q.commitmentId ?? "")).source).toBe("quote");
  });

  it("makes a contract without a quote, on the line's project", async () => {
    const a = await household("Ana");
    const id = (
      await createContract(a.ctx, {
        contractorId: a.contractor,
        lineId: a.electrical,
        title: "Panel upgrade",
        value: "3200",
        startDate: "2026-12-01",
        endDate: "2026-12-03",
      })
    ).id;
    const c = await getContract(a.ctx, id);
    expect(c).toMatchObject({ projectId: a.project, quoteId: null, totalCents: 320_000n });
    expect(c.line.id).toBe(a.electrical);
    expect((await getContracts(a.ctx, { contractorId: a.contractor })).map((x) => x.id)).toEqual([
      id,
    ]);
    await expect(
      createContract(a.ctx, {
        contractorId: a.contractor,
        lineId: a.electrical,
        title: "Backwards",
        value: "1",
        startDate: "2026-12-03",
        endDate: "2026-12-01",
      }),
    ).rejects.toThrow(/end is before/);
    // With nothing billed, deleting it takes its money out of the budget.
    await deleteContract(a.ctx, id);
    expect(await committed(a)).toBe(0n);
  });

  it("keeps a contractor with quotes, and a project with an approved quote", async () => {
    const a = await household("Ana");
    const id = await quote(a);
    await rule(deleteContractor(a.ctx, a.contractor), "contractor_has_agreements");
    await approveQuote(a.ctx, id, { lineId: a.labor, committedOn: "2026-11-06" });
    await rule(deleteProject(a.ctx, a.project), "project_has_budget");
  });

  it("deletes an open quote's documents along with its project", async () => {
    const a = await household("Ana");
    const empty = (
      await createProject(a.ctx, { propertyId: a.property, name: "Deck", status: "idea" })
    ).id;
    const id = (
      await createQuote(a.ctx, {
        contractorId: a.contractor,
        projectId: empty,
        title: "Deck",
        amount: "8000",
        receivedOn: "2026-11-01",
      })
    ).id;
    const doc = await uploadDocument(a.ctx, { kind: "quote", id }, { name: "q.pdf", bytes: PDF });
    expect(await getDocuments(a.ctx, { kind: "quote", id })).toHaveLength(1);
    await deleteProject(a.ctx, empty);
    await notFound(getQuote(a.ctx, id));
    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      const rows = await client.query(`SELECT 1 FROM files WHERE id = $1`, [doc.fileId]);
      expect(rows.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });

  it("keeps every household's quotes and contracts to itself", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const bQuote = await quote(b);
    await approveQuote(b.ctx, bQuote, { lineId: b.labor, committedOn: "2026-11-06" });
    const bOpen = await quote(b);
    const bContract = (await createContract(b.ctx, { quoteId: bQuote, title: "X", value: "1" })).id;
    const bChange = (await getContract(b.ctx, bContract)).commitmentId;

    expect(await getQuotes(a.ctx, {})).toEqual([]);
    expect(await getContracts(a.ctx, {})).toEqual([]);
    await notFound(getQuote(a.ctx, bOpen));
    await notFound(updateQuoteDetails(a.ctx, bOpen, { title: "Mine" }));
    await notFound(reviseQuote(a.ctx, bOpen, { amount: "1", receivedOn: "2026-11-02" }));
    await notFound(setQuoteReview(a.ctx, bOpen, "under_review"));
    await notFound(approveQuote(a.ctx, bOpen, { lineId: a.labor, committedOn: "2026-11-06" }));
    await notFound(rejectQuote(a.ctx, bOpen, {}));
    await notFound(withdrawApproval(a.ctx, bQuote));
    await notFound(deleteQuote(a.ctx, bOpen));
    // Someone else's contractor, project or line can't be used either.
    await notFound(
      createQuote(a.ctx, {
        contractorId: b.contractor,
        projectId: a.project,
        title: "X",
        amount: "1",
        receivedOn: "2026-11-01",
      }),
    );
    await notFound(
      createQuote(a.ctx, {
        contractorId: a.contractor,
        projectId: b.project,
        title: "X",
        amount: "1",
        receivedOn: "2026-11-01",
      }),
    );
    const aQuote = await quote(a);
    await expect(
      approveQuote(a.ctx, aQuote, { lineId: b.labor, committedOn: "2026-11-06" }),
    ).rejects.toThrow(/budget line from this quote/);

    await notFound(getContract(a.ctx, bContract));
    await notFound(updateContract(a.ctx, bContract, { title: "Mine", value: "1" }));
    await notFound(deleteContract(a.ctx, bContract));
    await notFound(createContract(a.ctx, { quoteId: bQuote, title: "Mine", value: "1" }));
    await notFound(
      createContract(a.ctx, {
        contractorId: b.contractor,
        lineId: a.labor,
        title: "X",
        value: "1",
      }),
    );
    await notFound(
      createContract(a.ctx, {
        contractorId: a.contractor,
        lineId: b.labor,
        title: "X",
        value: "1",
      }),
    );
    await notFound(
      addChangeOrder(a.ctx, bContract, {
        description: "X",
        amount: "1",
        committedOn: "2026-11-15",
      }),
    );
    await notFound(deleteChangeOrder(a.ctx, bChange));
    expect(await getCommitmentAgreement(a.ctx, bChange)).toBeNull();
    expect(await getBillsFor(a.ctx, [bChange])).toEqual([]);
    await notFound(
      uploadDocument(a.ctx, { kind: "quote", id: bOpen }, { name: "x.pdf", bytes: PDF }),
    );
    await notFound(
      uploadDocument(a.ctx, { kind: "contract", id: bContract }, { name: "x.pdf", bytes: PDF }),
    );
  });

  it("refuses cross-household links and bad states in the database itself", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const aQuote = await quote(a);
    await expect(
      sql(
        `INSERT INTO quotes (id, workspace_id, contractor_id, project_id, title, updated_at) VALUES ('q1', $1, $2, $3, 'x', now())`,
        [a.workspaceId, a.contractor, b.project],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE quotes SET line_id = $2 WHERE id = $1`, [aQuote, b.labor]),
    ).rejects.toThrow(/foreign key/);
    // "Approved" always comes with its commitment, and only then.
    await expect(
      sql(`UPDATE quotes SET status = 'approved' WHERE id = $1`, [aQuote]),
    ).rejects.toThrow(/quotes_approved_check/);
    await expect(sql(`UPDATE quotes SET status = 'maybe' WHERE id = $1`, [aQuote])).rejects.toThrow(
      /quotes_status_check/,
    );
    await expect(
      sql(`UPDATE quote_revisions SET amount_cents = 0 WHERE quote_id = $1`, [aQuote]),
    ).rejects.toThrow(/check/);
  });

  it("lets viewers look, and keeps approval to people who may approve", async () => {
    const a = await household("Ana");
    const id = await quote(a);
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect(await getQuotes(viewer, { contractorId: a.contractor })).toHaveLength(1);
    expect((await getQuote(viewer, id)).title).toBe("Cabinets installed");
    await forbidden(
      createQuote(viewer, {
        contractorId: a.contractor,
        projectId: a.project,
        title: "X",
        amount: "1",
        receivedOn: "2026-11-01",
      }),
    );
    await forbidden(reviseQuote(viewer, id, { amount: "1", receivedOn: "2026-11-02" }));
    await forbidden(setQuoteReview(viewer, id, "under_review"));
    await forbidden(approveQuote(viewer, id, { lineId: a.labor, committedOn: "2026-11-06" }));
    await forbidden(rejectQuote(viewer, id, {}));
    await forbidden(deleteQuote(viewer, id));
    await forbidden(
      createContract(viewer, {
        contractorId: a.contractor,
        lineId: a.labor,
        title: "X",
        value: "1",
      }),
    );
    await forbidden(uploadDocument(viewer, { kind: "quote", id }, { name: "x.pdf", bytes: PDF }));
  });
});
