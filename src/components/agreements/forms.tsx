"use client";

import { MoneyField } from "@/components/budget/money-field";
import { DateField } from "@/components/budget/today-input";
import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import {
  addChangeOrderAction,
  approveQuoteAction,
  createContractAction,
  createQuoteAction,
  rejectQuoteAction,
  reviseQuoteAction,
  saveContractAction,
  saveQuoteDetailsAction,
} from "@/server/actions/agreements";

export type Choice = { value: string; label: string };

/**
 * A new quote. `fixed` holds what the page already knows (the contractor
 * or the project it was opened from); the rest is chosen.
 */
export function QuoteForm({
  fixed = {},
  contractors,
  projects,
  cancelHref,
}: {
  fixed?: { contractorId?: string; projectId?: string };
  contractors: Choice[];
  projects: Choice[];
  cancelHref: string;
}) {
  const f = useForm(createQuoteAction);
  const pick = (name: "contractorId" | "projectId", label: string, options: Choice[]) =>
    fixed[name] ? (
      <input type="hidden" name={name} value={fixed[name]} />
    ) : (
      <SelectField
        id={`quote-${name}`}
        name={name}
        label={label}
        options={[{ value: "", label: "Choose…" }, ...options]}
        defaultValue={f.typed(name)}
        error={f.error(name)}
      />
    );
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {pick("contractorId", "Contractor", contractors)}
        {pick("projectId", "Project", projects)}
        <TextField
          id="quote-title"
          name="title"
          label="What it's for"
          placeholder="Kitchen electrical"
          defaultValue={f.typed("title")}
          error={f.error("title")}
          className="sm:col-span-2"
        />
        <MoneyField
          id="quote-amount"
          name="amount"
          label="Amount"
          defaultValue={f.typed("amount")}
          error={f.error("amount")}
        />
        <DateField
          id="quote-received"
          name="receivedOn"
          label="Received"
          defaultToday
          defaultValue={f.typed("receivedOn")}
          error={f.error("receivedOn")}
        />
        <DateField
          id="quote-valid"
          name="validUntil"
          label="Good until (optional)"
          defaultValue={f.typed("validUntil")}
          error={f.error("validUntil")}
        />
      </div>
      <TextAreaField
        id="quote-summary"
        name="summary"
        label="What's included (optional)"
        defaultValue={f.typed("summary")}
        error={f.error("summary")}
      />
      <TextAreaField
        id="quote-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={f.typed("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel="Add quote"
        cancelHref={cancelHref}
      />
    </form>
  );
}

/** The parts of a quote that don't change its price. */
export function QuoteDetailsForm({
  quote,
}: {
  quote: { id: string; title: string; validUntil: string; notes: string };
}) {
  const f = useForm(saveQuoteDetailsAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={quote.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="quote-details-title"
          name="title"
          label="What it's for"
          defaultValue={f.typed("title") ?? quote.title}
          error={f.error("title")}
        />
        <DateField
          id="quote-details-valid"
          name="validUntil"
          label="Good until (optional)"
          defaultValue={f.typed("validUntil") ?? quote.validUntil}
          error={f.error("validUntil")}
        />
      </div>
      <TextAreaField
        id="quote-details-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={f.typed("notes") ?? quote.notes}
        error={f.error("notes")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Save changes" />
    </form>
  );
}

/** A new price from the contractor. The earlier ones stay in the history. */
export function RevisionForm({ quoteId }: { quoteId: string }) {
  const f = useForm(reviseQuoteAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={quoteId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          id="revision-amount"
          name="amount"
          label="New amount"
          defaultValue={f.typed("amount")}
          error={f.error("amount")}
        />
        <DateField
          id="revision-received"
          name="receivedOn"
          label="Received"
          defaultToday
          defaultValue={f.typed("receivedOn")}
          error={f.error("receivedOn")}
        />
      </div>
      <TextAreaField
        id="revision-summary"
        name="summary"
        label="What changed (optional)"
        defaultValue={f.typed("summary")}
        error={f.error("summary")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add revision" />
    </form>
  );
}

/** Approving puts the latest price into the budget, on the line chosen here. */
export function ApproveForm({ quoteId, lines }: { quoteId: string; lines: Choice[] }) {
  const f = useForm(approveQuoteAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={quoteId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="approve-line"
          name="lineId"
          label="Comes out of budget line"
          options={[{ value: "", label: "Choose…" }, ...lines]}
          defaultValue={f.typed("lineId")}
          error={f.error("lineId")}
        />
        <DateField
          id="approve-date"
          name="committedOn"
          label="Approved on"
          defaultToday
          defaultValue={f.typed("committedOn")}
          error={f.error("committedOn")}
        />
      </div>
      <TextAreaField
        id="approve-note"
        name="note"
        label="Note (optional)"
        defaultValue={f.typed("note")}
        error={f.error("note")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Approve quote" />
    </form>
  );
}

export function RejectForm({ quoteId }: { quoteId: string }) {
  const f = useForm(rejectQuoteAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={quoteId} />
      <TextAreaField
        id="reject-note"
        name="note"
        label="Why (optional)"
        placeholder="Went with another bid"
        defaultValue={f.typed("note")}
        error={f.error("note")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Turn down" />
    </form>
  );
}

export type ContractValues = {
  id: string;
  title: string;
  value: string;
  signedOn: string;
  startDate: string;
  endDate: string;
  notes: string;
};

/**
 * Adds or edits a contract. A new one comes from an approved quote (its
 * contractor and line are already known) or from scratch, with both chosen.
 */
export function ContractForm({
  contract,
  fromQuote,
  contractorId,
  contractors = [],
  lines = [],
  cancelHref,
}: {
  contract?: ContractValues;
  fromQuote?: { quoteId: string; title: string; value: string };
  contractorId?: string;
  contractors?: Choice[];
  lines?: Choice[];
  cancelHref: string;
}) {
  const f = useForm(contract ? saveContractAction : createContractAction);
  const start = contract ?? (fromQuote ? { title: fromQuote.title, value: fromQuote.value } : {});
  const value = (name: keyof ContractValues) =>
    f.typed(name) ?? (start as Partial<ContractValues>)[name] ?? "";
  const choosing = !contract && !fromQuote;
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {contract ? <input type="hidden" name="id" value={contract.id} /> : null}
      {fromQuote ? <input type="hidden" name="quoteId" value={fromQuote.quoteId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {choosing ? (
          contractorId ? (
            <input type="hidden" name="contractorId" value={contractorId} />
          ) : (
            <SelectField
              id="contract-contractor"
              name="contractorId"
              label="Contractor"
              options={[{ value: "", label: "Choose…" }, ...contractors]}
              defaultValue={f.typed("contractorId")}
              error={f.error("contractorId")}
            />
          )
        ) : null}
        {choosing ? (
          <SelectField
            id="contract-line"
            name="lineId"
            label="Comes out of budget line"
            options={[{ value: "", label: "Choose…" }, ...lines]}
            defaultValue={f.typed("lineId")}
            error={f.error("lineId")}
          />
        ) : null}
        <TextField
          id="contract-title"
          name="title"
          label="What it's for"
          defaultValue={value("title")}
          error={f.error("title")}
          className="sm:col-span-2"
        />
        <MoneyField
          id="contract-value"
          name="value"
          label="Contract amount"
          hint={
            fromQuote ? "The quote's latest price, unless the contract says otherwise." : undefined
          }
          defaultValue={value("value")}
          error={f.error("value")}
        />
        <DateField
          id="contract-signed"
          name="signedOn"
          label="Signed (optional)"
          defaultValue={value("signedOn")}
          error={f.error("signedOn")}
        />
        <DateField
          id="contract-start"
          name="startDate"
          label="Work starts (optional)"
          defaultValue={value("startDate")}
          error={f.error("startDate")}
        />
        <DateField
          id="contract-end"
          name="endDate"
          label="Work ends (optional)"
          defaultValue={value("endDate")}
          error={f.error("endDate")}
        />
      </div>
      {f.error("quoteId") ? (
        <p role="alert" className="text-sm text-destructive">
          {f.error("quoteId")}
        </p>
      ) : null}
      <TextAreaField
        id="contract-notes"
        name="notes"
        label="Notes (optional)"
        hint="Payment schedule, retainage, anything worth remembering."
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={contract ? "Save changes" : "Add contract"}
        cancelHref={cancelHref}
      />
    </form>
  );
}

/** Extra work (or a credit) agreed after signing. */
export function ChangeOrderForm({
  contractId,
  lines,
  defaultLineId,
}: {
  contractId: string;
  lines: Choice[];
  defaultLineId: string;
}) {
  const f = useForm(addChangeOrderAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="contractId" value={contractId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="change-description"
          name="description"
          label="What changed"
          placeholder="Two extra outlets"
          defaultValue={f.typed("description")}
          error={f.error("description")}
          className="sm:col-span-2"
        />
        <MoneyField
          id="change-amount"
          name="amount"
          label="Amount"
          hint="Put a minus sign in front for a credit, like -150."
          inputMode="text"
          defaultValue={f.typed("amount")}
          error={f.error("amount")}
        />
        <DateField
          id="change-date"
          name="committedOn"
          label="Agreed on"
          defaultToday
          defaultValue={f.typed("committedOn")}
          error={f.error("committedOn")}
        />
        <SelectField
          id="change-line"
          name="lineId"
          label="Budget line"
          options={lines}
          defaultValue={f.typed("lineId") ?? defaultLineId}
          error={f.error("lineId")}
        />
      </div>
      <TextAreaField
        id="change-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={f.typed("notes")}
        error={f.error("notes")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add change order" />
    </form>
  );
}
