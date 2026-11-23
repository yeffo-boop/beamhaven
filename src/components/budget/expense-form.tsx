"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { Button } from "@/components/ui/button";
import { formatMoney, parseMoney } from "@/lib/money";
import { saveExpenseAction } from "@/server/actions/budget";

import type { Choice } from "./forms";
import { VendorList } from "./forms";
import { MoneyField } from "./money-field";
import { DateField } from "./today-input";
import { useForm } from "./use-form";

type Row = { key: number; lineId: string; amount: string; kind: string };

export type ExpenseFormValues = {
  id: string;
  vendorName: string;
  commitmentId: string;
  description: string;
  expenseDate: string;
  dueDate: string;
  total: string;
  notes: string;
  rows: { lineId: string; amount: string; kind: string }[];
};

/**
 * Records a bill or purchase and which budget lines it's charged to. Rows
 * left blank share the rest of the total evenly (worked out on the server,
 * to the cent), so one row with no amount takes all of it.
 */
export function ExpenseForm({
  lines,
  vendors,
  commitments,
  expense,
  defaultLineId,
  cancelHref,
}: {
  lines: Choice[];
  vendors: string[];
  commitments: Choice[];
  expense?: ExpenseFormValues;
  defaultLineId?: string;
  cancelHref: string;
}) {
  const f = useForm(saveExpenseAction);
  const initialRows = expense?.rows ?? [{ lineId: defaultLineId ?? "", amount: "", kind: "item" }];
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((row, index) => ({ key: index, ...row })),
  );
  const [total, setTotal] = useState(expense?.total ?? "");
  const value = (name: keyof ExpenseFormValues) =>
    f.typed(name) ?? (expense?.[name] as string | undefined) ?? "";

  const totalCents = parseMoney(total);
  const typedCents = rows.reduce((sum, r) => sum + (parseMoney(r.amount) ?? 0n), 0n);
  const blanks = rows.filter((r) => r.amount.trim() === "").length;
  const left = totalCents === null ? null : totalCents - typedCents;

  const update = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const lineOptions = [{ value: "", label: "Choose a line" }, ...lines];

  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-5" noValidate>
      {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="expense-description"
          name="description"
          label="What it was"
          placeholder="Tile and grout"
          defaultValue={value("description")}
          error={f.error("description")}
        />
        <TextField
          id="expense-vendor"
          name="vendorName"
          label="Shop or supplier (optional)"
          list="vendor-names"
          defaultValue={value("vendorName")}
          error={f.error("vendorName")}
        />
        <MoneyField
          id="expense-total"
          name="total"
          label="Total"
          hint="Including tax and shipping, as on the receipt."
          value={total}
          onChange={(event) => setTotal(event.target.value)}
          error={f.error("total")}
        />
        <DateField
          id="expense-date"
          name="expenseDate"
          label="Date"
          defaultToday
          defaultValue={value("expenseDate")}
          error={f.error("expenseDate")}
        />
        <DateField
          id="expense-due"
          name="dueDate"
          label="Due by (optional)"
          defaultValue={value("dueDate")}
          error={f.error("dueDate")}
        />
        {commitments.length > 0 ? (
          <SelectField
            id="expense-commitment"
            name="commitmentId"
            label="Bill for an agreement (optional)"
            hint="Linking it uses up the agreement instead of adding to it."
            options={[{ value: "", label: "Not linked" }, ...commitments]}
            defaultValue={value("commitmentId")}
            error={f.error("commitmentId")}
          />
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Charge it to</legend>
        <ul aria-label="Charge it to" className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.key} className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_8rem_auto]">
              <SelectField
                id={`alloc-line-${row.key}`}
                name="allocLine"
                label={`Budget line ${index + 1}`}
                options={lineOptions}
                value={row.lineId}
                onChange={(event) => update(row.key, { lineId: event.target.value })}
              />
              <MoneyField
                id={`alloc-amount-${row.key}`}
                name="allocAmount"
                label="Amount"
                placeholder={rows.length === 1 ? "All of it" : "Share of the rest"}
                value={row.amount}
                onChange={(event) => update(row.key, { amount: event.target.value })}
              />
              <SelectField
                id={`alloc-kind-${row.key}`}
                name="allocKind"
                label="For"
                options={[
                  { value: "item", label: "Items" },
                  { value: "tax", label: "Tax" },
                  { value: "shipping", label: "Shipping" },
                ]}
                value={row.kind}
                onChange={(event) => update(row.key, { kind: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Remove line {index + 1}</span>
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: Math.max(...current.map((r) => r.key)) + 1,
                  lineId: "",
                  amount: "",
                  kind: "item",
                },
              ])
            }
          >
            <Plus aria-hidden="true" />
            Split across another line
          </Button>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {left === null
              ? null
              : left === 0n
                ? "Adds up to the total."
                : left > 0n
                  ? blanks > 0
                    ? `${formatMoney(left)} will be shared by the ${blanks === 1 ? "blank line" : `${blanks} blank lines`}.`
                    : `${formatMoney(left)} still to charge.`
                  : `${formatMoney(-left)} more than the total.`}
          </p>
        </div>
        {f.error("allocations") ? (
          <p className="text-sm text-destructive">{f.error("allocations")}</p>
        ) : null}
      </fieldset>

      <TextAreaField
        id="expense-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <VendorList vendors={vendors} />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={expense ? "Save changes" : "Record expense"}
        cancelHref={cancelHref}
      />
    </form>
  );
}
