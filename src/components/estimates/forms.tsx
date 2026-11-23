"use client";

import { useState } from "react";

import { MoneyField } from "@/components/budget/money-field";
import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import {
  isCan,
  laborUnit,
  type Measure,
  MEASURE_LABELS,
  MEASURES,
  type PriceUnit,
  UNIT_LABELS,
} from "@/lib/room-estimate";
import {
  addTypedAreaAction,
  saveEstimateAction,
  savePriceItemAction,
  saveTaxAction,
} from "@/server/actions/estimates";

export type Choice = { value: string; label: string };

export type PriceItemValues = {
  id: string;
  name: string;
  measure: Measure;
  unit: PriceUnit;
  price: string;
  coverage: string;
  coats: string;
  labor: string;
  wastePercent: string;
  taxable: boolean;
  notes: string;
};

type Preset = {
  label: string;
  name: string;
  measure: Measure;
  unit: [PriceUnit, PriceUnit]; // imperial, metric
  coverage: [string, string];
  coats: string;
  wastePercent: string;
};

/** Ready-made starting points; everything can be changed before saving. */
const PRESETS: Record<string, Preset> = {
  flooring: {
    label: "Flooring (per sq ft)",
    name: "Flooring",
    measure: "floor",
    unit: ["sq_ft", "sq_m"],
    coverage: ["", ""],
    coats: "1",
    wastePercent: "10",
  },
  tile: {
    label: "Tile (per sq ft)",
    name: "Tile",
    measure: "floor",
    unit: ["sq_ft", "sq_m"],
    coverage: ["", ""],
    coats: "1",
    wastePercent: "15",
  },
  paint: {
    label: "Wall paint (per gallon)",
    name: "Wall paint",
    measure: "walls",
    unit: ["gallon", "litre"],
    coverage: ["350", "10"],
    coats: "2",
    wastePercent: "0",
  },
  paintArea: {
    label: "Painting, priced per sq ft",
    name: "Painting",
    measure: "walls",
    unit: ["sq_ft", "sq_m"],
    coverage: ["", ""],
    coats: "1",
    wastePercent: "0",
  },
  ceiling: {
    label: "Ceiling paint (per gallon)",
    name: "Ceiling paint",
    measure: "ceiling",
    unit: ["gallon", "litre"],
    coverage: ["350", "10"],
    coats: "1",
    wastePercent: "0",
  },
  trim: {
    label: "Baseboard or trim (per linear ft)",
    name: "Baseboard",
    measure: "perimeter",
    unit: ["lin_ft", "lin_m"],
    coverage: ["", ""],
    coats: "1",
    wastePercent: "10",
  },
};

function unitsFor(measure: Measure): PriceUnit[] {
  return measure === "perimeter" ? ["lin_ft", "lin_m"] : ["sq_ft", "sq_m", "gallon", "litre"];
}

/** Adds an item to the price list, or edits one. */
export function PriceItemForm({ item, metric }: { item?: PriceItemValues; metric: boolean }) {
  const f = useForm(savePriceItemAction);
  const typed = (name: keyof PriceItemValues) => f.typed(name);
  const pick = metric ? 1 : 0;
  const [values, setValues] = useState(() => ({
    name: typed("name") ?? item?.name ?? "",
    measure: ((typed("measure") as Measure | undefined) ?? item?.measure ?? "floor") as Measure,
    unit: ((typed("unit") as PriceUnit | undefined) ??
      item?.unit ??
      (metric ? "sq_m" : "sq_ft")) as PriceUnit,
    coverage: typed("coverage") ?? item?.coverage ?? "",
    coats: typed("coats") ?? item?.coats ?? "1",
    wastePercent: typed("wastePercent") ?? item?.wastePercent ?? "10",
  }));
  const set = (patch: Partial<typeof values>) => setValues((v) => ({ ...v, ...patch }));
  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    set({
      name: values.name || p.name,
      measure: p.measure,
      unit: p.unit[pick],
      coverage: p.coverage[pick],
      coats: p.coats,
      wastePercent: p.wastePercent,
    });
  };
  const can = isCan(values.unit);
  const labor = UNIT_LABELS[laborUnit(values.measure, values.unit)];
  const id = item?.id ?? "new";

  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item ? null : (
        <SelectField
          id={`price-${id}-preset`}
          label="Start from"
          hint="Fills in the usual settings. You can change any of them."
          options={[
            { value: "", label: "Choose a kind…" },
            ...Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })),
          ]}
          defaultValue=""
          onChange={(event) => applyPreset(event.target.value)}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`price-${id}-name`}
          name="name"
          label="Name"
          placeholder="White oak LVP"
          value={values.name}
          onChange={(event) => set({ name: event.target.value })}
          error={f.error("name")}
          className="sm:col-span-2"
        />
        <SelectField
          id={`price-${id}-measure`}
          name="measure"
          label="Measured by"
          options={MEASURES.map((m) => ({ value: m, label: MEASURE_LABELS[m] }))}
          value={values.measure}
          onChange={(event) => {
            const measure = event.target.value as Measure;
            const units = unitsFor(measure);
            set({
              measure,
              unit: units.includes(values.unit)
                ? values.unit
                : (units[pick] ?? units[0] ?? "sq_ft"),
            });
          }}
          error={f.error("measure")}
        />
        <SelectField
          id={`price-${id}-unit`}
          name="unit"
          label="Priced per"
          options={unitsFor(values.measure).map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
          value={values.unit}
          onChange={(event) => set({ unit: event.target.value as PriceUnit })}
          error={f.error("unit")}
        />
        <MoneyField
          id={`price-${id}-price`}
          name="price"
          label={`Price per ${UNIT_LABELS[values.unit]}`}
          defaultValue={typed("price") ?? item?.price ?? ""}
          error={f.error("price")}
        />
        {can ? (
          <>
            <TextField
              id={`price-${id}-coverage`}
              name="coverage"
              label={values.unit === "gallon" ? "Sq ft a gallon covers" : "m² a litre covers"}
              inputMode="decimal"
              value={values.coverage}
              onChange={(event) => set({ coverage: event.target.value })}
              hint="It's on the can. About 350 sq ft a gallon is typical."
              error={f.error("coverage")}
            />
            <TextField
              id={`price-${id}-coats`}
              name="coats"
              label="Coats"
              inputMode="numeric"
              value={values.coats}
              onChange={(event) => set({ coats: event.target.value })}
              error={f.error("coats")}
            />
          </>
        ) : null}
        <MoneyField
          id={`price-${id}-labor`}
          name="labor"
          label={`Install price per ${labor} (optional)`}
          defaultValue={typed("labor") ?? item?.labor ?? ""}
          error={f.error("labor")}
        />
        <TextField
          id={`price-${id}-waste`}
          name="wastePercent"
          label="Extra for waste and cuts (%)"
          inputMode="numeric"
          value={values.wastePercent}
          onChange={(event) => set({ wastePercent: event.target.value })}
          hint="10% is usual for flooring and trim, 15% for tile laid on a diagonal."
          error={f.error("wastePercent")}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="taxable"
          defaultChecked={typed("taxable") ? typed("taxable") === "on" : (item?.taxable ?? true)}
          className="size-4 accent-[var(--accent)]"
        />
        Add sales tax to the material
      </label>
      <TextAreaField
        id={`price-${id}-notes`}
        name="notes"
        label="Notes (optional)"
        hint="Store, color, product number."
        defaultValue={typed("notes") ?? item?.notes ?? ""}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={item ? "Save changes" : "Add to price list"}
      />
    </form>
  );
}

export function TaxForm({ rate }: { rate: string }) {
  const f = useForm(saveTaxAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <div className="max-w-xs">
        <TextField
          id="tax-rate"
          name="rate"
          label="Sales tax on materials (%)"
          inputMode="decimal"
          placeholder="0"
          defaultValue={f.typed("rate") ?? rate}
          hint="Added to the material in room estimates, never to labor."
          error={f.error("rate")}
        />
      </div>
      <FormFooter pending={f.pending} state={f.state} saveLabel="Save tax rate" />
    </form>
  );
}

export type EstimateValues = {
  id: string;
  name: string;
  priceItemId: string;
  materialCategoryId: string;
  laborCategoryId: string;
  lineMode: string;
  notes: string;
  roomIds: string[];
};

/** A price-list item used in some of a project's rooms. */
export function EstimateForm({
  projectId,
  estimate,
  items,
  categories,
  rooms,
  defaults,
  cancelHref,
}: {
  projectId: string;
  estimate?: EstimateValues;
  items: Choice[];
  categories: Choice[];
  rooms: Choice[];
  defaults: { materialCategoryId: string; laborCategoryId: string };
  cancelHref?: string;
}) {
  const f = useForm(saveEstimateAction);
  const value = (name: Exclude<keyof EstimateValues, "roomIds">, fallback = "") =>
    f.typed(name) ?? estimate?.[name] ?? fallback;
  const chosen = new Set(estimate?.roomIds ?? rooms.map((r) => r.value));
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      {estimate ? <input type="hidden" name="id" value={estimate.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="estimate-item"
          name="priceItemId"
          label="From the price list"
          options={[{ value: "", label: "Choose…" }, ...items]}
          defaultValue={value("priceItemId")}
          error={f.error("priceItemId")}
        />
        <TextField
          id="estimate-name"
          name="name"
          label="Name in the budget"
          placeholder="Flooring"
          defaultValue={value("name")}
          error={f.error("name")}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Rooms</legend>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This project has no rooms yet. Add them on the project page, or type areas in by hand
            after saving.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <label key={room.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="roomIds"
                  value={room.value}
                  defaultChecked={chosen.has(room.value)}
                  className="size-4 accent-[var(--accent)]"
                />
                {room.label}
              </label>
            ))}
          </div>
        )}
        {f.error("roomIds") ? (
          <p role="alert" className="text-sm text-destructive">
            {f.error("roomIds")}
          </p>
        ) : null}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          id="estimate-material-category"
          name="materialCategoryId"
          label="Material goes under"
          options={categories}
          defaultValue={value("materialCategoryId", defaults.materialCategoryId)}
          error={f.error("materialCategoryId")}
        />
        <SelectField
          id="estimate-labor-category"
          name="laborCategoryId"
          label="Install goes under"
          options={[{ value: "", label: "Same line as the material" }, ...categories]}
          defaultValue={value("laborCategoryId", defaults.laborCategoryId)}
          error={f.error("laborCategoryId")}
        />
        <SelectField
          id="estimate-line-mode"
          name="lineMode"
          label="Budget lines"
          options={[
            { value: "per_room", label: "One for each room" },
            { value: "one_line", label: "One for the whole project" },
          ]}
          defaultValue={value("lineMode", "per_room")}
          error={f.error("lineMode")}
        />
      </div>
      <TextAreaField
        id="estimate-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={estimate ? "Save changes" : "Add estimate"}
        cancelHref={cancelHref}
      />
    </form>
  );
}

/** A size typed by hand: for one of the rooms, or an area of its own. */
export function TypedAreaForm({
  estimateId,
  rooms,
  unitLabel,
}: {
  estimateId: string;
  rooms: Choice[];
  unitLabel: string;
}) {
  const f = useForm(addTypedAreaAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="estimateId" value={estimateId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          id="typed-room"
          name="roomId"
          label="For"
          options={[{ value: "", label: "An area of its own" }, ...rooms]}
          defaultValue={f.typed("roomId")}
          error={f.error("roomId")}
        />
        <TextField
          id="typed-label"
          name="label"
          label="What it is"
          placeholder="Shower walls"
          hint="Needed for an area of its own."
          defaultValue={f.typed("label")}
          error={f.error("label")}
        />
        <TextField
          id="typed-amount"
          name="amount"
          label={`Size (${unitLabel})`}
          inputMode="decimal"
          defaultValue={f.typed("amount")}
          error={f.error("amount")}
        />
      </div>
      <FormFooter pending={f.pending} state={f.state} saveLabel="Use this size" />
    </form>
  );
}
