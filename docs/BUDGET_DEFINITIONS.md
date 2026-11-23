# Budget Definitions

**Status:** Built in Milestone 4. The code in `src/server/services/budget-math.ts` follows this file, and `docs/budget-worked-example.csv` is the worked example below as a spreadsheet that a test checks BeamHaven against.

Budget numbers are only useful if every term means exactly one thing, and no dollar is counted twice.
This file is the single source of truth. Code, tests and on-screen help text must all use these definitions.

All amounts are stored as whole cents (see ADR-008).

---

## The building block: a budget line

A **budget line** is one bucket of money. It is identified by:

- a **project** (required);
- a **category** (required, for example Labor, Materials, Fixtures, Permits, Appliances or Contingency);
- a **room or area** (optional; leave it empty for project-wide items such as permits).

Every total in BeamHaven, whether for a room, a category, a project or the whole household, is the **sum of its budget lines**. Nothing is stored twice at different levels.

> Example: "Kitchen remodel · Materials · Kitchen" and "Kitchen remodel · Permits · (no room)" are two budget lines.

---

## The terms

| Term                      | Plain-English meaning                                                                                       | How it is calculated                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Original budget**       | What we planned to spend when the project budget was first approved. It never changes afterward.            | The sum of the line allocations at the moment the project budget is **baselined** (a one-time "lock in" action). |
| **Budget adjustment**     | A deliberate decision to raise or lower the total budget.                                                   | Entered with a date and a reason.                                                                                |
| **Budget transfer**       | Moving allocated money from one line to another. The total does not change.                                 | `amount` out of the source line, the same `amount` into the destination line.                                    |
| **Current budget**        | What we are allowed to spend now.                                                                           | `original + adjustments + transfers in − transfers out`                                                          |
| **Estimate**              | Our best guess of what a line will cost, before anything is agreed. Owes nobody anything.                   | Entered by hand, or taken from a quote that isn't approved yet.                                                  |
| **Commitment**            | Money we have **agreed** to spend: an approved quote, a signed contract, a change order, or a placed order. | The sum of the commitment amounts on the line.                                                                   |
| **Expense (actual cost)** | A cost that has actually happened: an invoice or bill received, or a purchase made.                         | The sum of the expense allocations on the line.                                                                  |
| **Payment**               | Money that has actually left our account.                                                                   | The sum of the payments.                                                                                         |

### Derived numbers (calculated, never typed in)

| Number                             | Meaning                                       | Formula (per line, then summed)                                                                      |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Committed total**                | Everything we're on the hook for.             | `commitments + expenses not linked to a commitment`                                                  |
| **Not yet invoiced**               | Agreed, but no bill yet.                      | `max(commitment − expenses linked to it, 0)`, per commitment                                         |
| **Unpaid**                         | Bills we owe right now.                       | `expenses − payments`                                                                                |
| **Forecast** (expected final cost) | Where this line will probably end up.         | If the line has commitments: `max(committed total, expenses)`. Otherwise: `max(estimate, expenses)`. |
| **Available**                      | What's left to plan with.                     | `current budget − forecast`                                                                          |
| **Variance**                       | How far we've drifted from the original plan. | `forecast − original budget` (positive = **over** plan)                                              |
| **Contingency remaining**          | The safety buffer that's left.                | `available` on the Contingency lines                                                                 |

---

## Rules that prevent double-counting

1. **An expense linked to a commitment uses up the commitment. It does not add to it.**
   A $10,000 contract plus a $4,000 deposit invoice is still $10,000 committed, not $14,000. It means $4,000 has been invoiced and $6,000 is not yet invoiced.
2. **An expense with no commitment counts as both committed and actual.** An unplanned trip to the hardware store is money spent, so it counts as committed straight away.
3. **A payment never changes cost.** A payment only moves money from "unpaid" to "paid". The forecast stays the same.
4. **An estimate is ignored once a line has a commitment.** At that point the commitment is the better number.
5. **A split expense must add up exactly.** Its allocations must sum to the expense total, to the cent. Amounts that don't divide evenly are rounded with the largest-remainder method.
6. **Transfers only move money between lines in the same household.** They can cross rooms, categories and projects.
7. **A transfer can't push the source line below zero.** It is refused if the source's `available` would drop below zero, unless the user explicitly ticks "allow over-allocation" and gives a reason. Every transfer is kept permanently. A transfer is undone by recording a reversing transfer, never by editing or deleting the original.
8. **Refunds and returns are negative expenses** linked to the original expense. They lower the actual cost, but leave the original record intact.
9. **Taxes and shipping** are added as extra allocation lines on the expense, normally to the same budget line as the item, so the total always matches the receipt.

---

## Worked example (this becomes an automated test in Milestone 4)

The kitchen has a Labor line with an **original budget of $20,000.00**.

1. A quote for $18,500 arrives but isn't approved yet. **Estimate = $18,500.** Forecast = $18,500. Available = $1,500.
2. The quote is approved, creating a **commitment of $18,500**.
3. The contractor sends a deposit invoice of $5,000, linked to the commitment. **Expenses = $5,000.** Committed total is still $18,500. Not yet invoiced = $13,500. Unpaid = $5,000.
4. We pay the $5,000. **Unpaid = $0.** Forecast is unchanged at $18,500.
5. A change order adds **$2,000 of commitment**. Committed total = $20,500. Forecast = $20,500. Available = **−$500**. Variance = **+$500** (over plan).
6. We **transfer $1,000** from the bathroom's Labor line into the kitchen's Labor line. Current budget = $21,000. Available = **$500**. Variance is still +$500, because the original plan doesn't change.

---

## Decisions (Milestone 4)

- **Locking in (baselining)** happens when someone presses **Lock in budget** on the project's budget page (Jeff, 2026-11-23). Until then the planned amounts can be edited freely, and there's no variance. Once a project is In progress, its pages remind you if the budget isn't locked in yet. Owners and Members can lock in.
- After lock-in, a **new line starts at $0** (original and current), so the locked-in total never changes; money reaches it by a transfer or an adjustment.
- **Adjustments and transfers** need the budget locked in (before that, edit the plan).
- **Viewers can see the budget**, read-only, like everything else in the household.
- An expense's **paid status** (unpaid, partly paid, paid) is worked out from its payments, never stored. Payments can't add up to more than the expense.
- A **refund** is charged back to the original expense's lines in the same proportions, and linked to the same commitment.

## Decisions (Milestone 5)

- A quote adds nothing to the budget until it is **approved**. Approving creates one commitment for the latest price, on a line of the quote's own project.
- A **contract made from an approved quote takes over that same commitment** and sets it to the contract amount. It is never a second commitment, so the money is counted once.
- A **change order** is a commitment of its own, linked to the contract, and can be negative (a credit). It can go on another line of the same project.
- A contract's **total** = its commitment + its change orders. **Billed** and **paid** add up the expenses (and their payments) linked to any of those commitments.
- A quote's, contract's or change order's commitment is changed **only on its own page**, never in the budget, so the two always agree. Bills linked to one keep it from being deleted.
- Each bill can say which **payment stage** it is: deposit, progress payment or final payment. The stage is a label only; it changes no totals.
