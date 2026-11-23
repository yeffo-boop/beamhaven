import { readFileSync } from "node:fs";

import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { readFileForDownload, UploadError, uploadReceipt } from "@/server/services/attachments";
import {
  adjustLine,
  createLine,
  deleteLine,
  getCategories,
  getHouseholdBudget,
  getLine,
  getProjectBudget,
  lockBudget,
  reverseTransfer,
  transferBudget,
  updateLine,
} from "@/server/services/budget";
import { NotFoundError, RuleError } from "@/server/services/errors";
import { parseMoney } from "@/lib/money";
import {
  addPayment,
  createCommitment,
  createExpense,
  deleteCommitment,
  deleteExpense,
  getExpense,
  refundExpense,
  updateExpense,
} from "@/server/services/expenses";
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
const today = "2026-11-23";

/** A household with a property, a kitchen and a bathroom project, and their Labor lines. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const kitchenRoom = (
    await createRoom(ctx, { propertyId: property, name: "Kitchen", type: "kitchen" })
  ).id;
  const kitchen = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "planning" })
  ).id;
  const bath = (
    await createProject(ctx, { propertyId: property, name: "Bath", status: "planning" })
  ).id;
  const categories = await getCategories(ctx);
  const labor = categories.find((c) => c.name === "Labor")?.id ?? "";
  const contingency = categories.find((c) => c.kind === "contingency")?.id ?? "";
  const kitchenLabor = (
    await createLine(ctx, {
      projectId: kitchen,
      categoryId: labor,
      roomId: kitchenRoom,
      planned: "20,000",
    })
  ).id;
  const bathLabor = (await createLine(ctx, { projectId: bath, categoryId: labor, planned: "8000" }))
    .id;
  return {
    user,
    workspaceId,
    ctx,
    property,
    kitchenRoom,
    kitchen,
    bath,
    labor,
    contingency,
    kitchenLabor,
    bathLabor,
  };
}

type Household = Awaited<ReturnType<typeof household>>;

describe("the worked example, through the real services and database", () => {
  let h: Household;
  beforeEach(async () => {
    await resetDatabase();
    h = await household("Alice");
  });

  it("gives the numbers in docs/BUDGET_DEFINITIONS.md at every step", async () => {
    const { ctx } = h;
    const numbers = async () => (await getLine(ctx, h.kitchenLabor)).line.numbers;

    await lockBudget(ctx, h.kitchen);
    await lockBudget(ctx, h.bath);
    expect((await numbers()).original).toBe(2_000_000n);

    // 1. A quote that isn't approved: an estimate.
    await updateLine(ctx, h.kitchenLabor, { planned: "20000", estimate: "18,500" });
    expect(await numbers()).toMatchObject({ forecast: 1_850_000n, available: 150_000n });

    // 2. Approved: a commitment.
    const contract = await createCommitment(ctx, {
      lineId: h.kitchenLabor,
      vendorName: "Ace Builders",
      source: "contract",
      description: "Cabinet install",
      amount: "18500",
      committedOn: today,
    });

    // 3. A $5,000 deposit invoice, linked to it.
    const deposit = await createExpense(ctx, {
      vendorName: "ace builders", // same vendor, different capitals
      commitmentId: contract.id,
      description: "Deposit",
      expenseDate: today,
      total: "5000",
      allocations: [{ lineId: h.kitchenLabor, amount: "" }],
    });
    expect(await numbers()).toMatchObject({
      expenses: 500_000n,
      committed: 1_850_000n,
      notYetInvoiced: 1_350_000n,
      unpaid: 500_000n,
    });

    // 4. Paid.
    await addPayment(ctx, deposit.id, { amount: "5000", paidOn: today, method: "check" });
    expect(await numbers()).toMatchObject({ unpaid: 0n, forecast: 1_850_000n });
    expect((await getExpense(ctx, deposit.id)).state).toBe("paid");

    // 5. A $2,000 change order.
    await createCommitment(ctx, {
      lineId: h.kitchenLabor,
      source: "change_order",
      description: "Extra wall",
      amount: "2000",
      committedOn: today,
    });
    expect(await numbers()).toMatchObject({
      committed: 2_050_000n,
      forecast: 2_050_000n,
      available: -50_000n,
      variance: 50_000n,
    });

    // 6. $1,000 moved in from the bathroom's Labor line.
    const before = (await getHouseholdBudget(ctx)).totals;
    await transferBudget(ctx, {
      fromLineId: h.bathLabor,
      toLineId: h.kitchenLabor,
      amount: "1000",
      reason: "Bath came in under",
      effectiveDate: today,
    });
    expect(await numbers()).toMatchObject({
      current: 2_100_000n,
      available: 50_000n,
      variance: 50_000n,
      original: 2_000_000n,
    });
    const after = (await getHouseholdBudget(ctx)).totals;
    expect(after.current).toBe(before.current);
    expect(after.original).toBe(before.original);

    // Only one vendor was created.
    const budget = await getProjectBudget(ctx, h.kitchen);
    expect(new Set(budget.commitments.map((c) => c.vendorName)).size).toBe(2); // "Ace Builders" and none
    expect(budget.transfers).toHaveLength(1);
  });
});

/**
 * The hand-worked spreadsheet (docs/budget-worked-example.csv, which opens
 * in Numbers or Excel) against what BeamHaven actually calculates, after
 * each step of the worked example.
 */
describe("the hand-worked spreadsheet", () => {
  beforeEach(resetDatabase);

  it("matches BeamHaven's numbers at every step", async () => {
    const [header, ...rows] = readFileSync("docs/budget-worked-example.csv", "utf8")
      .trim()
      .split("\n")
      .map((row) => row.split(","));
    const column = (name: string) => header?.indexOf(name) ?? -1;
    const h = await household("Alice");
    const { ctx } = h;
    let deposit = "";
    const steps: (() => Promise<unknown>)[] = [
      () => Promise.all([lockBudget(ctx, h.kitchen), lockBudget(ctx, h.bath)]),
      () => updateLine(ctx, h.kitchenLabor, { planned: "20000", estimate: "18500" }),
      async () => {
        await createCommitment(ctx, {
          lineId: h.kitchenLabor,
          source: "contract",
          description: "Cabinets",
          amount: "18500",
          committedOn: today,
        });
      },
      async () => {
        const [contract] = (await getLine(ctx, h.kitchenLabor)).commitments;
        deposit = (
          await createExpense(ctx, {
            commitmentId: contract?.id ?? "",
            description: "Deposit",
            expenseDate: today,
            total: "5000",
            allocations: [{ lineId: h.kitchenLabor }],
          })
        ).id;
      },
      () => addPayment(ctx, deposit, { amount: "5000", paidOn: today }),
      () =>
        createCommitment(ctx, {
          lineId: h.kitchenLabor,
          source: "change_order",
          description: "Extra wall",
          amount: "2000",
          committedOn: today,
        }),
      () =>
        transferBudget(ctx, {
          fromLineId: h.bathLabor,
          toLineId: h.kitchenLabor,
          amount: "1000",
          reason: "Bath came in under",
          effectiveDate: today,
        }),
    ];
    expect(rows).toHaveLength(steps.length);
    const cents = (row: string[], name: string) => {
      const cell = row[column(name)] ?? "";
      return cell === "" ? null : parseMoney(cell);
    };
    for (const [index, step] of steps.entries()) {
      await step();
      const row = rows[index] ?? [];
      const n = (await getLine(ctx, h.kitchenLabor)).line.numbers;
      const actual = {
        step: row[0],
        current: n.current,
        estimate: n.estimate,
        committed: n.committed,
        expenses: n.expenses,
        notYetInvoiced: n.notYetInvoiced,
        unpaid: n.unpaid,
        forecast: n.forecast,
        available: n.available,
        variance: n.variance,
      };
      expect(actual).toEqual({
        step: row[0],
        current: cents(row, "Current budget"),
        estimate: cents(row, "Estimate"),
        committed: cents(row, "Committed"),
        expenses: cents(row, "Spent (expenses)"),
        notYetInvoiced: cents(row, "Not yet billed"),
        unpaid: cents(row, "Unpaid"),
        forecast: cents(row, "Forecast"),
        available: cents(row, "Available"),
        variance: cents(row, "Variance"),
      });
    }
  });
});

describe("budget rules", () => {
  let h: Household;
  beforeEach(async () => {
    await resetDatabase();
    h = await household("Alice");
  });

  it("locks in the plan once, after which the planned amount can't change", async () => {
    await lockBudget(h.ctx, h.kitchen);
    await lockBudget(h.ctx, h.kitchen); // a second press does nothing
    await updateLine(h.ctx, h.kitchenLabor, { planned: "99999", estimate: "" });
    const { line } = await getLine(h.ctx, h.kitchenLabor);
    expect(line.numbers.original).toBe(2_000_000n);
    expect(line.numbers.current).toBe(2_000_000n);
    // A line added afterwards starts at zero, so the locked-in total is unchanged.
    await createLine(h.ctx, {
      projectId: h.kitchen,
      categoryId: h.contingency,
      planned: "5000",
    });
    expect((await getProjectBudget(h.ctx, h.kitchen)).totals.original).toBe(2_000_000n);
  });

  it("only adjusts and transfers once budgets are locked in", async () => {
    await expect(
      adjustLine(h.ctx, {
        lineId: h.kitchenLabor,
        direction: "increase",
        amount: "100",
        reason: "x",
        effectiveDate: today,
      }),
    ).rejects.toThrow(/Lock in/);
    await lockBudget(h.ctx, h.kitchen);
    await expect(
      transferBudget(h.ctx, {
        fromLineId: h.kitchenLabor,
        toLineId: h.bathLabor,
        amount: "1",
        reason: "x",
        effectiveDate: today,
      }),
    ).rejects.toThrow(/locked in/);
    await adjustLine(h.ctx, {
      lineId: h.kitchenLabor,
      direction: "decrease",
      amount: "500",
      reason: "Scaled back",
      effectiveDate: today,
    });
    expect((await getLine(h.ctx, h.kitchenLabor)).line.numbers.current).toBe(1_950_000n);
  });

  it("refuses a transfer that would overdraw the source, unless allowed (rule 7)", async () => {
    await lockBudget(h.ctx, h.kitchen);
    await lockBudget(h.ctx, h.bath);
    const move = (amount: string, allow = "") =>
      transferBudget(h.ctx, {
        fromLineId: h.bathLabor,
        toLineId: h.kitchenLabor,
        amount,
        reason: "Need more",
        effectiveDate: today,
        allowOverAllocation: allow,
      });
    await expect(move("8000.01")).rejects.toThrow(/only has \$8,000\.00 available/);
    await move("8000"); // exactly what's available is fine
    await move("100", "on");
    const bath = (await getLine(h.ctx, h.bathLabor)).line.numbers;
    expect(bath.available).toBe(-10_000n);
    const [latest] = (await getLine(h.ctx, h.bathLabor)).transfers;
    expect(latest?.allowOverAllocation).toBe(true);
  });

  it("undoes a transfer with a reversing one, once, and keeps both", async () => {
    await lockBudget(h.ctx, h.kitchen);
    await lockBudget(h.ctx, h.bath);
    const { id } = await transferBudget(h.ctx, {
      fromLineId: h.bathLabor,
      toLineId: h.kitchenLabor,
      amount: "1000",
      reason: "Oops",
      effectiveDate: today,
    });
    await reverseTransfer(h.ctx, { transferId: id, reason: "Wrong line" });
    await expect(reverseTransfer(h.ctx, { transferId: id, reason: "Again" })).rejects.toThrow(
      /already been reversed/,
    );
    const { transfers, line } = await getLine(h.ctx, h.kitchenLabor);
    expect(transfers).toHaveLength(2);
    expect(line.numbers.current).toBe(2_000_000n);
  });

  it("has the database keep transfers and adjustments permanently", async () => {
    await lockBudget(h.ctx, h.kitchen);
    await lockBudget(h.ctx, h.bath);
    await transferBudget(h.ctx, {
      fromLineId: h.bathLabor,
      toLineId: h.kitchenLabor,
      amount: "10",
      reason: "x",
      effectiveDate: today,
    });
    await adjustLine(h.ctx, {
      lineId: h.kitchenLabor,
      direction: "increase",
      amount: "10",
      reason: "x",
      effectiveDate: today,
    });
    await expect(sql(`DELETE FROM budget_transfers`)).rejects.toThrow(/permanent/);
    await expect(sql(`UPDATE budget_transfers SET amount_cents = 1`)).rejects.toThrow(/permanent/);
    await expect(sql(`DELETE FROM budget_adjustments`)).rejects.toThrow(/permanent/);
  });

  it("splits an expense to the cent, and the database refuses one that doesn't add up", async () => {
    const paint = (
      await createLine(h.ctx, { projectId: h.kitchen, categoryId: h.labor, name: "Paint" })
    ).id;
    const { id } = await createExpense(h.ctx, {
      description: "Hardware store",
      expenseDate: today,
      total: "100",
      allocations: [
        { lineId: h.kitchenLabor, amount: "" },
        { lineId: paint, amount: "" },
        { lineId: h.bathLabor, amount: "" },
      ],
    });
    const expense = await getExpense(h.ctx, id);
    expect(expense.allocations.map((a) => a.amountCents)).toEqual([3334n, 3333n, 3333n]);

    await expect(
      createExpense(h.ctx, {
        description: "Wrong",
        expenseDate: today,
        total: "100",
        allocations: [
          { lineId: h.kitchenLabor, amount: "60" },
          { lineId: paint, amount: "30" },
        ],
      }),
    ).rejects.toThrow(/\$10\.00 less than the total/);

    await expect(
      sql(`UPDATE expense_allocations SET amount_cents = amount_cents + 1 WHERE expense_id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/allocated/);
    await expect(sql(`UPDATE expenses SET total_cents = 1 WHERE id = $1`, [id])).rejects.toThrow(
      /allocated/,
    );
  });

  it("counts a refund against the original, and limits it to what's left", async () => {
    const { id } = await createExpense(h.ctx, {
      description: "Faucet",
      expenseDate: today,
      total: "300",
      allocations: [
        { lineId: h.kitchenLabor, amount: "200" },
        { lineId: h.bathLabor, amount: "100" },
      ],
    });
    await addPayment(h.ctx, id, { amount: "300", paidOn: today });
    await expect(addPayment(h.ctx, id, { amount: "1", paidOn: today })).rejects.toThrow(
      /more than is left/,
    );
    const refund = await refundExpense(h.ctx, id, {
      amount: "90",
      description: "Returned one",
      expenseDate: today,
    });
    const r = await getExpense(h.ctx, refund.id);
    expect(r.totalCents).toBe(-9000n);
    expect(r.allocations.map((a) => a.amountCents)).toEqual([-6000n, -3000n]);
    expect((await getLine(h.ctx, h.kitchenLabor)).line.numbers.expenses).toBe(14_000n);
    await expect(
      refundExpense(h.ctx, id, { amount: "210.01", description: "Too much", expenseDate: today }),
    ).rejects.toThrow(/Only \$210\.00/);
    await expect(deleteExpense(h.ctx, id)).rejects.toBeInstanceOf(RuleError);
    await expect(
      updateExpense(h.ctx, refund.id, {
        description: "x",
        expenseDate: today,
        total: "1",
        allocations: [{ lineId: h.kitchenLabor }],
      }),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("keeps the history: lines, commitments, projects and rooms in use can't be deleted", async () => {
    const commitment = await createCommitment(h.ctx, {
      lineId: h.kitchenLabor,
      source: "order",
      description: "Cabinets",
      amount: "4000",
      committedOn: today,
    });
    await createExpense(h.ctx, {
      commitmentId: commitment.id,
      description: "Cabinets invoice",
      expenseDate: today,
      total: "4000",
      allocations: [{ lineId: h.kitchenLabor }],
    });
    await expect(deleteCommitment(h.ctx, commitment.id)).rejects.toBeInstanceOf(RuleError);
    await expect(deleteLine(h.ctx, h.kitchenLabor)).rejects.toBeInstanceOf(RuleError);
    await expect(deleteProject(h.ctx, h.kitchen)).rejects.toBeInstanceOf(RuleError);
    await expect(deleteRoom(h.ctx, h.kitchenRoom)).rejects.toBeInstanceOf(RuleError);
    // An empty, unlocked line and a project with only empty lines can go.
    await deleteLine(h.ctx, h.bathLabor);
    await deleteProject(h.ctx, h.bath);
  });

  it("stores receipts (photos or PDFs) and refuses anything else", async () => {
    const { id } = await createExpense(h.ctx, {
      description: "Lumber",
      expenseDate: today,
      total: "50",
      allocations: [{ lineId: h.kitchenLabor }],
    });
    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
    const receipt = await uploadReceipt(h.ctx, id, { name: "receipt.pdf", bytes: pdf });
    expect((await readFileForDownload(h.ctx, receipt.fileId)).file.mimeType).toBe(
      "application/pdf",
    );
    await expect(
      uploadReceipt(h.ctx, id, {
        name: "receipt.pdf",
        bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>"),
      }),
    ).rejects.toBeInstanceOf(UploadError);
  });
});

describe("budget isolation between households", () => {
  let a: Household;
  let b: Household;
  let bExpense: string;
  let bCommitment: string;
  let bTransfer: string;

  beforeEach(async () => {
    await resetDatabase();
    a = await household("Alice");
    b = await household("Bob");
    await lockBudget(b.ctx, b.kitchen);
    await lockBudget(b.ctx, b.bath);
    bExpense = (
      await createExpense(b.ctx, {
        description: "B's bill",
        expenseDate: today,
        total: "10",
        allocations: [{ lineId: b.kitchenLabor }],
      })
    ).id;
    bCommitment = (
      await createCommitment(b.ctx, {
        lineId: b.kitchenLabor,
        source: "quote",
        description: "B's quote",
        amount: "10",
        committedOn: today,
      })
    ).id;
    bTransfer = (
      await transferBudget(b.ctx, {
        fromLineId: b.bathLabor,
        toLineId: b.kitchenLabor,
        amount: "1",
        reason: "B",
        effectiveDate: today,
      })
    ).id;
  });

  it("sees only its own budget", async () => {
    const mine = await getHouseholdBudget(a.ctx);
    expect(mine.projects.map((p) => p.name).sort()).toEqual(["Bath", "Kitchen"]);
    expect(mine.recentExpenses).toEqual([]);
    expect(mine.totals.current).toBe(2_800_000n);
    // Category lists are per household too.
    expect((await getCategories(a.ctx)).map((c) => c.id)).not.toContain(b.labor);
  });

  it("treats another household's budget records as not found", async () => {
    await notFound(getProjectBudget(a.ctx, b.kitchen));
    await notFound(getLine(a.ctx, b.kitchenLabor));
    await notFound(getExpense(a.ctx, bExpense));
    await notFound(lockBudget(a.ctx, b.kitchen));
    await notFound(updateLine(a.ctx, b.kitchenLabor, { planned: "1" }));
    await notFound(deleteLine(a.ctx, b.kitchenLabor));
    await notFound(deleteCommitment(a.ctx, bCommitment));
    await notFound(deleteExpense(a.ctx, bExpense));
    await notFound(addPayment(a.ctx, bExpense, { amount: "1", paidOn: today }));
    await notFound(
      refundExpense(a.ctx, bExpense, { amount: "1", description: "x", expenseDate: today }),
    );
    await notFound(reverseTransfer(a.ctx, { transferId: bTransfer, reason: "x" }));
    await notFound(
      uploadReceipt(a.ctx, bExpense, { name: "x.pdf", bytes: new TextEncoder().encode("%PDF-1") }),
    );
    await notFound(
      adjustLine(a.ctx, {
        lineId: b.kitchenLabor,
        direction: "increase",
        amount: "1",
        reason: "x",
        effectiveDate: today,
      }),
    );
    // Nothing in B changed.
    expect((await getExpense(b.ctx, bExpense)).paidCents).toBe(0n);
  });

  it("won't put records on another household's lines, projects, categories or commitments", async () => {
    await lockBudget(a.ctx, a.kitchen);
    await notFound(createLine(a.ctx, { projectId: b.kitchen, categoryId: a.labor }));
    await notFound(createLine(a.ctx, { projectId: a.kitchen, categoryId: b.labor }));
    await notFound(
      createLine(a.ctx, { projectId: a.kitchen, categoryId: a.labor, roomId: b.kitchenRoom }),
    );
    await notFound(
      createCommitment(a.ctx, {
        lineId: b.kitchenLabor,
        source: "manual",
        description: "x",
        amount: "1",
        committedOn: today,
      }),
    );
    await notFound(
      createExpense(a.ctx, {
        description: "x",
        expenseDate: today,
        total: "1",
        allocations: [{ lineId: b.kitchenLabor }],
      }),
    );
    await notFound(
      createExpense(a.ctx, {
        commitmentId: bCommitment,
        description: "x",
        expenseDate: today,
        total: "1",
        allocations: [{ lineId: a.kitchenLabor }],
      }),
    );
    await notFound(
      transferBudget(a.ctx, {
        fromLineId: a.kitchenLabor,
        toLineId: b.kitchenLabor,
        amount: "1",
        reason: "x",
        effectiveDate: today,
      }),
    );
    await notFound(
      transferBudget(a.ctx, {
        fromLineId: b.kitchenLabor,
        toLineId: a.kitchenLabor,
        amount: "1",
        reason: "x",
        effectiveDate: today,
      }),
    );
    expect((await getLine(b.ctx, b.kitchenLabor)).line.numbers.current).toBe(2_000_100n);
  });

  it("has the database refuse cross-household budget links", async () => {
    await expect(
      sql(
        `INSERT INTO budget_lines (id, workspace_id, project_id, category_id, updated_at)
         VALUES ('x', $1, $2, $3, now())`,
        [a.workspaceId, b.kitchen, a.labor],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(
        `INSERT INTO budget_transfers (id, workspace_id, from_line_id, to_line_id, amount_cents, reason, effective_date)
         VALUES ('x', $1, $2, $3, 1, 'x', now())`,
        [a.workspaceId, a.kitchenLabor, b.kitchenLabor],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("lets viewers see the budget but not change it", async () => {
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect((await getProjectBudget(viewer, a.kitchen)).lines).toHaveLength(1);
    const forbidden = (promise: Promise<unknown>) =>
      expect(promise).rejects.toBeInstanceOf(PermissionError);
    await forbidden(lockBudget(viewer, a.kitchen));
    await forbidden(createLine(viewer, { projectId: a.kitchen, categoryId: a.labor, name: "x" }));
    await forbidden(
      createExpense(viewer, {
        description: "x",
        expenseDate: today,
        total: "1",
        allocations: [{ lineId: a.kitchenLabor }],
      }),
    );
  });
});
