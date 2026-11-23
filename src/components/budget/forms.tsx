"use client";

import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import {
  addCategoryAction,
  addPaymentAction,
  adjustLineAction,
  refundAction,
  saveCommitmentAction,
  saveLineAction,
  transferAction,
} from "@/server/actions/budget";

import { MoneyField } from "./money-field";
import { DateField } from "./today-input";
import { useForm } from "./use-form";

export type Choice = { value: string; label: string };

/** Adds a line to a project's budget. */
export function NewLineForm({
  projectId,
  categories,
  rooms,
  locked,
}: {
  projectId: string;
  categories: Choice[];
  rooms: Choice[];
  locked: boolean;
}) {
  const f = useForm(saveLineAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          id="line-category"
          name="categoryId"
          label="Category"
          options={categories}
          defaultValue={f.typed("categoryId")}
          error={f.error("categoryId")}
        />
        <SelectField
          id="line-room"
          name="roomId"
          label="Room"
          options={[{ value: "", label: "Whole project" }, ...rooms]}
          defaultValue={f.typed("roomId")}
          error={f.error("roomId")}
        />
        <TextField
          id="line-name"
          name="name"
          label="Label (optional)"
          placeholder="Cabinets"
          defaultValue={f.typed("name")}
          error={f.error("name")}
        />
        {locked ? null : (
          <MoneyField
            id="line-planned"
            name="planned"
            label="Planned amount"
            defaultValue={f.typed("planned")}
            error={f.error("planned")}
          />
        )}
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          The budget is locked in, so a new line starts at $0. Move money to it with a transfer, or
          raise it with an adjustment.
        </p>
      ) : null}
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add line" />
    </form>
  );
}

/** Changes a line's label, plan (until locked in), estimate and notes. */
export function EditLineForm({
  line,
}: {
  line: {
    id: string;
    name: string;
    planned: string;
    estimate: string;
    notes: string;
    locked: boolean;
  };
}) {
  const f = useForm(saveLineAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={line.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="edit-line-name"
          name="name"
          label="Label (optional)"
          defaultValue={f.typed("name") ?? line.name}
          error={f.error("name")}
        />
        {line.locked ? (
          <input type="hidden" name="planned" value={line.planned} />
        ) : (
          <MoneyField
            id="edit-line-planned"
            name="planned"
            label="Planned amount"
            defaultValue={f.typed("planned") ?? line.planned}
            error={f.error("planned")}
          />
        )}
        <MoneyField
          id="edit-line-estimate"
          name="estimate"
          label="Estimate (optional)"
          hint="Your best guess before anything is agreed."
          defaultValue={f.typed("estimate") ?? line.estimate}
          error={f.error("estimate")}
        />
      </div>
      <TextAreaField
        id="edit-line-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={f.typed("notes") ?? line.notes}
        error={f.error("notes")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Save line" />
    </form>
  );
}

/** Raises or lowers a line's budget on purpose, with a reason. */
export function AdjustmentForm({ lineId }: { lineId: string }) {
  const f = useForm(adjustLineAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="lineId" value={lineId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          id="adjust-direction"
          name="direction"
          label="Change"
          options={[
            { value: "increase", label: "Raise the budget" },
            { value: "decrease", label: "Lower the budget" },
          ]}
          defaultValue={f.typed("direction")}
          error={f.error("direction")}
        />
        <MoneyField
          id="adjust-amount"
          name="amount"
          label="Amount"
          defaultValue={f.typed("amount")}
          error={f.error("amount")}
        />
        <DateField
          id="adjust-date"
          name="effectiveDate"
          label="Date"
          defaultToday
          defaultValue={f.typed("effectiveDate")}
          error={f.error("effectiveDate")}
        />
      </div>
      <TextField
        id="adjust-reason"
        name="reason"
        label="Reason"
        placeholder="Decided to add a skylight"
        defaultValue={f.typed("reason")}
        error={f.error("reason")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Record adjustment" />
    </form>
  );
}

/** Moves money from one line to another (the total stays the same). */
export function TransferForm({
  lines,
  defaultFrom,
  defaultTo,
}: {
  lines: Choice[];
  defaultFrom?: string;
  defaultTo?: string;
}) {
  const f = useForm(transferAction);
  const options = [{ value: "", label: "Choose a line" }, ...lines];
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          id="transfer-from"
          name="fromLineId"
          label="From"
          options={options}
          defaultValue={f.typed("fromLineId") ?? defaultFrom ?? ""}
          error={f.error("fromLineId")}
        />
        <SelectField
          id="transfer-to"
          name="toLineId"
          label="To"
          options={options}
          defaultValue={f.typed("toLineId") ?? defaultTo ?? ""}
          error={f.error("toLineId")}
        />
        <MoneyField
          id="transfer-amount"
          name="amount"
          label="Amount"
          defaultValue={f.typed("amount")}
          error={f.error("amount")}
        />
        <DateField
          id="transfer-date"
          name="effectiveDate"
          label="Date"
          defaultToday
          defaultValue={f.typed("effectiveDate")}
          error={f.error("effectiveDate")}
        />
      </div>
      <TextField
        id="transfer-reason"
        name="reason"
        label="Reason"
        placeholder="Bathroom tile came in under budget"
        defaultValue={f.typed("reason")}
        error={f.error("reason")}
      />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="allowOverAllocation"
          defaultChecked={f.typed("allowOverAllocation") === "on"}
          className="mt-0.5 size-4"
        />
        <span>
          Allow going over: move it even if the “from” line doesn’t have that much available.
        </span>
      </label>
      <FormFooter pending={f.pending} state={f.state} saveLabel="Move money" />
    </form>
  );
}

/** Records an approved quote, contract, change order or order. */
export function CommitmentForm({
  lines,
  vendors,
  fixedLineId,
  commitment,
  cancelHref,
}: {
  lines: Choice[];
  vendors: string[];
  fixedLineId?: string;
  commitment?: {
    id: string;
    lineId: string;
    vendorName: string;
    source: string;
    description: string;
    amount: string;
    committedOn: string;
    notes: string;
  };
  cancelHref?: string;
}) {
  const f = useForm(saveCommitmentAction);
  const value = (name: keyof NonNullable<typeof commitment>) =>
    f.typed(name) ?? commitment?.[name] ?? "";
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {commitment ? <input type="hidden" name="id" value={commitment.id} /> : null}
      {fixedLineId ? (
        <input type="hidden" name="lineId" value={fixedLineId} />
      ) : (
        <SelectField
          id="commitment-line"
          name="lineId"
          label="Budget line"
          options={[{ value: "", label: "Choose a line" }, ...lines]}
          defaultValue={value("lineId")}
          error={f.error("lineId")}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="commitment-description"
          name="description"
          label="What was agreed"
          placeholder="Cabinet install"
          defaultValue={value("description")}
          error={f.error("description")}
        />
        <SelectField
          id="commitment-source"
          name="source"
          label="Kind"
          options={[
            { value: "quote", label: "Approved quote" },
            { value: "contract", label: "Contract" },
            { value: "change_order", label: "Change order" },
            { value: "order", label: "Order" },
            { value: "manual", label: "Other agreement" },
          ]}
          defaultValue={value("source") || "contract"}
          error={f.error("source")}
        />
        <TextField
          id="commitment-vendor"
          name="vendorName"
          label="Who with (optional)"
          list="vendor-names"
          defaultValue={value("vendorName")}
          error={f.error("vendorName")}
        />
        <MoneyField
          id="commitment-amount"
          name="amount"
          label="Amount"
          hint="A change order that lowers the price can be negative."
          defaultValue={value("amount")}
          error={f.error("amount")}
        />
        <DateField
          id="commitment-date"
          name="committedOn"
          label="Agreed on"
          defaultToday
          defaultValue={value("committedOn")}
          error={f.error("committedOn")}
        />
      </div>
      <TextAreaField
        id="commitment-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <VendorList vendors={vendors} />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={commitment ? "Save changes" : "Add commitment"}
        cancelHref={cancelHref}
      />
    </form>
  );
}

export function VendorList({ vendors }: { vendors: string[] }) {
  return (
    <datalist id="vendor-names">
      {vendors.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  );
}

/** Records a payment (or, for a refund, money coming back). */
export function PaymentForm({
  expenseId,
  owed,
  isRefund,
}: {
  expenseId: string;
  owed: string;
  isRefund: boolean;
}) {
  const f = useForm(addPaymentAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="expenseId" value={expenseId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyField
          id="payment-amount"
          name="amount"
          label={isRefund ? "Amount received" : "Amount paid"}
          defaultValue={f.typed("amount") ?? owed}
          error={f.error("amount")}
        />
        <DateField
          id="payment-date"
          name="paidOn"
          label={isRefund ? "Received on" : "Paid on"}
          defaultToday
          defaultValue={f.typed("paidOn")}
          error={f.error("paidOn")}
        />
        <SelectField
          id="payment-method"
          name="method"
          label="How"
          options={[
            { value: "card", label: "Card" },
            { value: "check", label: "Check" },
            { value: "transfer", label: "Bank transfer" },
            { value: "cash", label: "Cash" },
            { value: "other", label: "Other" },
          ]}
          defaultValue={f.typed("method") ?? "card"}
          error={f.error("method")}
        />
        <TextField
          id="payment-reference"
          name="reference"
          label="Reference (optional)"
          placeholder="Check #1042"
          defaultValue={f.typed("reference")}
          error={f.error("reference")}
        />
      </div>
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={isRefund ? "Record money received" : "Record payment"}
      />
    </form>
  );
}

/** Records a refund or return against an expense. */
export function RefundForm({ expenseId, left }: { expenseId: string; left: string }) {
  const f = useForm(refundAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="expenseId" value={expenseId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyField
          id="refund-amount"
          name="amount"
          label="Amount refunded"
          hint={`Up to ${left}.`}
          defaultValue={f.typed("amount")}
          error={f.error("amount")}
        />
        <TextField
          id="refund-description"
          name="description"
          label="What was returned"
          placeholder="Returned one faucet"
          defaultValue={f.typed("description")}
          error={f.error("description")}
        />
        <DateField
          id="refund-date"
          name="expenseDate"
          label="Date"
          defaultToday
          defaultValue={f.typed("expenseDate")}
          error={f.error("expenseDate")}
        />
      </div>
      <FormFooter pending={f.pending} state={f.state} saveLabel="Record refund" />
    </form>
  );
}

/** Adds a budget category to the household's list. */
export function CategoryForm() {
  const f = useForm(addCategoryAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="category-name"
          name="name"
          label="New category"
          placeholder="Landscaping"
          defaultValue={f.typed("name")}
          error={f.error("name")}
        />
        <SelectField
          id="category-kind"
          name="kind"
          label="Kind"
          options={[
            { value: "standard", label: "Ordinary" },
            { value: "contingency", label: "Contingency (safety buffer)" },
          ]}
          defaultValue={f.typed("kind")}
          error={f.error("kind")}
        />
      </div>
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add category" />
    </form>
  );
}
