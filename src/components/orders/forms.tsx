"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { MoneyField } from "@/components/budget/money-field";
import { DateField } from "@/components/budget/today-input";
import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { Button } from "@/components/ui/button";
import { formatMoney, parseMoney } from "@/lib/money";
import { lineTotal, parseQuantity } from "@/lib/quantity";
import {
  recordBillAction,
  recordDeliveryAction,
  recordReturnAction,
  saveOrderAction,
} from "@/server/actions/orders";

export type Choice = { value: string; label: string };
export type MaterialChoice = Choice & { unitPrice: string; quantity: string };

export type OrderItemValues = {
  id: string;
  materialId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineId: string;
};

export type OrderValues = {
  id: string;
  supplier: string;
  orderNumber: string;
  orderedOn: string;
  expectedOn: string;
  shipping: string;
  tax: string;
  notes: string;
  items: OrderItemValues[];
};

type Row = OrderItemValues & { key: number };

const blankRow = (key: number, start: Partial<OrderItemValues> = {}): Row => ({
  key,
  id: "",
  materialId: "",
  description: "",
  quantity: "",
  unitPrice: "",
  lineId: "",
  ...start,
});

/**
 * Places or changes an order: where from, and each item with its quantity,
 * the price paid for one, and the budget line that pays for it. Picking a
 * material fills in its expected quantity and price, which can be changed
 * to what was actually paid.
 */
export function OrderForm({
  projectId,
  order,
  start,
  lines,
  materials,
  suppliers,
  cancelHref,
}: {
  projectId: string;
  order?: OrderValues;
  /** A new order started from a material's page. */
  start?: Partial<OrderItemValues>;
  lines: Choice[];
  materials: MaterialChoice[];
  suppliers: string[];
  cancelHref: string;
}) {
  const f = useForm(saveOrderAction);
  const defaultLine = lines.length === 1 ? (lines[0]?.value ?? "") : "";
  const [rows, setRows] = useState<Row[]>(() =>
    order
      ? order.items.map((item, index) => ({ key: index, ...item }))
      : [blankRow(0, { lineId: defaultLine, ...start })],
  );
  const [shipping, setShipping] = useState(order?.shipping ?? "");
  const [tax, setTax] = useState(order?.tax ?? "");
  const value = (name: keyof Omit<OrderValues, "items">) => f.typed(name) ?? order?.[name] ?? "";
  const update = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const pickMaterial = (key: number, materialId: string) => {
    const material = materials.find((m) => m.value === materialId);
    setRows((current) =>
      current.map((r) =>
        r.key === key
          ? {
              ...r,
              materialId,
              // Only fill boxes that are still empty, so typed prices stay.
              quantity: r.quantity || material?.quantity || "",
              unitPrice: r.unitPrice || material?.unitPrice || "",
            }
          : r,
      ),
    );
  };

  const rowTotal = (r: Row) => {
    const q = parseQuantity(r.quantity);
    const p = parseMoney(r.unitPrice);
    return q === null || p === null ? null : lineTotal(p, q);
  };
  const itemsCents = rows.reduce((sum, r) => sum + (rowTotal(r) ?? 0n), 0n);
  const total = itemsCents + (parseMoney(shipping) ?? 0n) + (parseMoney(tax) ?? 0n);
  const lineOptions = [{ value: "", label: "Choose a line" }, ...lines];
  const materialOptions = [{ value: "", label: "Not on the materials list" }, ...materials];

  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-6" noValidate>
      {order ? <input type="hidden" name="id" value={order.id} /> : null}
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="order-supplier"
          name="supplier"
          label="Ordered from"
          placeholder="Home Depot"
          list="order-suppliers"
          autoComplete="off"
          defaultValue={value("supplier")}
          error={f.error("supplier")}
        />
        <TextField
          id="order-number"
          name="orderNumber"
          label="Order number (optional)"
          autoComplete="off"
          defaultValue={value("orderNumber")}
          error={f.error("orderNumber")}
        />
        <DateField
          id="order-date"
          name="orderedOn"
          label="Ordered on"
          defaultToday
          defaultValue={value("orderedOn")}
          error={f.error("orderedOn")}
        />
        <DateField
          id="order-expected"
          name="expectedOn"
          label="Expected (optional)"
          hint="When the store says it should arrive. It goes on the calendar."
          defaultValue={value("expectedOn")}
          error={f.error("expectedOn")}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Items</legend>
        <ul aria-label="Items" className="flex flex-col gap-4">
          {rows.map((row, index) => {
            const n = index + 1;
            const cents = rowTotal(row);
            return (
              <li
                key={row.key}
                className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border p-3"
              >
                <input type="hidden" name="itemId" value={row.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    id={`item-material-${row.key}`}
                    name="itemMaterial"
                    label={`Item ${n}: material (optional)`}
                    options={materialOptions}
                    value={row.materialId}
                    onChange={(event) => pickMaterial(row.key, event.target.value)}
                  />
                  <TextField
                    id={`item-description-${row.key}`}
                    name="itemDescription"
                    label={`Item ${n}: description${row.materialId ? " (optional)" : ""}`}
                    placeholder={row.materialId ? "The material's name" : "Grout, 25 lb"}
                    value={row.description}
                    onChange={(event) => update(row.key, { description: event.target.value })}
                  />
                </div>
                <div className="grid items-end gap-3 sm:grid-cols-[7rem_9rem_1fr_auto]">
                  <TextField
                    id={`item-quantity-${row.key}`}
                    name="itemQuantity"
                    label="Quantity"
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.quantity}
                    onChange={(event) => update(row.key, { quantity: event.target.value })}
                  />
                  <MoneyField
                    id={`item-price-${row.key}`}
                    name="itemPrice"
                    label="Price paid for one"
                    value={row.unitPrice}
                    onChange={(event) => update(row.key, { unitPrice: event.target.value })}
                  />
                  <SelectField
                    id={`item-line-${row.key}`}
                    name="itemLine"
                    label="Budget line"
                    options={lineOptions}
                    value={row.lineId}
                    onChange={(event) => update(row.key, { lineId: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  >
                    <X aria-hidden="true" />
                    <span className="sr-only">Remove item {n}</span>
                  </Button>
                </div>
                {cents !== null ? (
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Item {n} comes to {formatMoney(cents)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setRows((current) => [
              ...current,
              blankRow(Math.max(...current.map((r) => r.key)) + 1, {
                lineId: current.at(-1)?.lineId ?? defaultLine,
              }),
            ])
          }
        >
          <Plus aria-hidden="true" />
          Add an item
        </Button>
        {f.error("items") ? <p className="text-sm text-destructive">{f.error("items")}</p> : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyField
          id="order-shipping"
          name="shipping"
          label="Shipping (optional)"
          value={shipping}
          onChange={(event) => setShipping(event.target.value)}
          error={f.error("shipping")}
        />
        <MoneyField
          id="order-tax"
          name="tax"
          label="Tax (optional)"
          hint="As charged on the order."
          value={tax}
          onChange={(event) => setTax(event.target.value)}
          error={f.error("tax")}
        />
        <div className="flex flex-col justify-end gap-0.5 pb-2">
          <span className="text-xs text-muted-foreground">Order total</span>
          <span className="text-lg font-semibold tabular-nums" aria-live="polite">
            {formatMoney(total)}
          </span>
        </div>
      </div>
      <TextAreaField
        id="order-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <datalist id="order-suppliers">
        {suppliers.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={order ? "Save changes" : "Place order"}
        cancelHref={cancelHref}
      />
    </form>
  );
}

/** Records what arrived. Each box starts at what's still to come. */
export function DeliveryForm({
  orderId,
  items,
}: {
  orderId: string;
  items: { id: string; description: string; remaining: string }[];
}) {
  const f = useForm(recordDeliveryAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <DateField
        id="delivery-date"
        name="deliveredOn"
        label="Arrived on"
        defaultToday
        defaultValue={f.typed("deliveredOn") ?? ""}
        error={f.error("deliveredOn")}
        className="max-w-48"
      />
      <ul aria-label="What arrived" className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <TextField
              id={`deliver-${item.id}`}
              name={`deliver:${item.id}`}
              label={`${item.description} (${item.remaining} to come)`}
              inputMode="decimal"
              autoComplete="off"
              defaultValue={f.typed(`deliver:${item.id}`) ?? item.remaining}
            />
          </li>
        ))}
      </ul>
      {f.error("items") ? <p className="text-sm text-destructive">{f.error("items")}</p> : null}
      <TextField
        id="delivery-notes"
        name="notes"
        label="Notes (optional)"
        placeholder="Two boxes damaged"
        defaultValue={f.typed("notes") ?? ""}
        error={f.error("notes")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Record delivery" />
    </form>
  );
}

const methodOptions = [
  { value: "card", label: "Card" },
  { value: "check", label: "Check" },
  { value: "transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

/** Records the order's bill or receipt, and whether it's already paid. */
export function BillForm({
  orderId,
  orderedOn,
  total,
}: {
  orderId: string;
  orderedOn: string;
  total: string;
}) {
  const f = useForm(recordBillAction);
  const [paid, setPaid] = useState(true);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          id="bill-date"
          name="billDate"
          label="Date on the bill or receipt"
          defaultValue={f.typed("billDate") ?? orderedOn}
          error={f.error("billDate")}
        />
        <DateField
          id="bill-due"
          name="dueDate"
          label="Due by (optional)"
          defaultValue={f.typed("dueDate") ?? ""}
          error={f.error("dueDate")}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="paid"
          checked={paid}
          onChange={(event) => setPaid(event.target.checked)}
          className="size-4"
        />
        Already paid in full ({total})
      </label>
      {paid ? (
        <SelectField
          id="bill-method"
          name="method"
          label="Paid by"
          options={methodOptions}
          defaultValue={f.typed("method") ?? "card"}
          className="max-w-48"
        />
      ) : null}
      <FormFooter pending={f.pending} state={f.state} saveLabel="Record the bill" />
    </form>
  );
}

/**
 * Records items sent back and what came back for them (part 3). Boxes
 * start empty: a return is usually only some of the order.
 */
export function ReturnForm({
  orderId,
  items,
}: {
  orderId: string;
  items: { id: string; description: string; here: string }[];
}) {
  const f = useForm(recordReturnAction);
  const [received, setReceived] = useState(f.typed("received") !== "");
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <DateField
        id="return-date"
        name="returnedOn"
        label="Returned on"
        defaultToday
        defaultValue={f.typed("returnedOn") ?? ""}
        error={f.error("returnedOn")}
        className="max-w-48"
      />
      <ul aria-label="What went back" className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <TextField
              id={`return-${item.id}`}
              name={`return:${item.id}`}
              label={`${item.description} (${item.here} here)`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              defaultValue={f.typed(`return:${item.id}`) ?? ""}
            />
          </li>
        ))}
      </ul>
      {f.error("items") ? <p className="text-sm text-destructive">{f.error("items")}</p> : null}
      <MoneyField
        id="return-refund"
        name="refund"
        label="Refund (optional)"
        hint="Leave blank for the price you paid plus its tax. Type what the store actually gave back if it kept a fee, refunded shipping, or gave nothing (0)."
        placeholder=""
        defaultValue={f.typed("refund") ?? ""}
        error={f.error("refund")}
        className="max-w-48"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="received"
          checked={received}
          onChange={(event) => setReceived(event.target.checked)}
          className="size-4"
        />
        The refund has already come back
      </label>
      {received ? (
        <SelectField
          id="return-method"
          name="method"
          label="Came back to"
          options={methodOptions}
          defaultValue={f.typed("method") ?? "card"}
          className="max-w-48"
        />
      ) : null}
      <TextField
        id="return-notes"
        name="notes"
        label="Notes (optional)"
        placeholder="Wrong color; 15% restocking fee"
        defaultValue={f.typed("notes") ?? ""}
        error={f.error("notes")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Record return" />
    </form>
  );
}
