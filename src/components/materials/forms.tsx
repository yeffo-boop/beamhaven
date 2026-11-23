"use client";

import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { Button } from "@/components/ui/button";
import { saveMaterialAction, setMaterialStatusAction } from "@/server/actions/materials";

import { materialStatusOptions } from "./labels";

export type Choice = { value: string; label: string };

export type MaterialValues = {
  id: string;
  name: string;
  category: string;
  projectId: string;
  roomId: string;
  supplier: string;
  brand: string;
  modelNumber: string;
  sku: string;
  colorFinish: string;
  productUrl: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  status: string;
  specs: string;
  notes: string;
};

/** Adds or edits a material. `start` fills in the project or room a page already knows. */
export function MaterialForm({
  material,
  start = {},
  projects,
  rooms,
  categories,
  suppliers,
  cancelHref,
}: {
  material?: MaterialValues;
  start?: { projectId?: string; roomId?: string };
  projects: Choice[];
  rooms: Choice[];
  categories: string[];
  suppliers: string[];
  cancelHref: string;
}) {
  const f = useForm(saveMaterialAction);
  const value = (name: keyof MaterialValues) =>
    f.typed(name) ??
    material?.[name] ??
    (name === "projectId" || name === "roomId" ? (start[name] ?? "") : "");
  const text = (name: keyof MaterialValues, label: string, more: object = {}) => (
    <TextField
      id={`material-${name}`}
      name={name}
      label={label}
      defaultValue={value(name)}
      error={f.error(name)}
      {...more}
    />
  );
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-6" noValidate>
      {material ? <input type="hidden" name="id" value={material.id} /> : null}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">What it is</legend>
        {text("name", "Name", { placeholder: "Kitchen backsplash tile", autoComplete: "off" })}
        {text("category", "Kind (optional)", {
          placeholder: "Tile",
          list: "material-categories",
          autoComplete: "off",
        })}
        <SelectField
          id="material-status"
          name="status"
          label="Status"
          options={materialStatusOptions}
          defaultValue={value("status") || "considering"}
          error={f.error("status")}
        />
        <SelectField
          id="material-projectId"
          name="projectId"
          label="Project (optional)"
          options={[{ value: "", label: "No project" }, ...projects]}
          defaultValue={value("projectId")}
          error={f.error("projectId")}
        />
        <SelectField
          id="material-roomId"
          name="roomId"
          label="Room (optional)"
          options={[{ value: "", label: "No room" }, ...rooms]}
          defaultValue={value("roomId")}
          error={f.error("roomId")}
        />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">The product</legend>
        {text("brand", "Brand (optional)", { autoComplete: "off" })}
        {text("modelNumber", "Model number (optional)", { autoComplete: "off" })}
        {text("sku", "SKU or item number (optional)", { autoComplete: "off" })}
        {text("colorFinish", "Color or finish (optional)", { placeholder: "Matte white" })}
        {text("supplier", "Supplier (optional)", {
          placeholder: "Home Depot",
          list: "material-suppliers",
          autoComplete: "off",
          hint: "The store or company you'd buy it from.",
        })}
        {text("productUrl", "Product link (optional)", {
          type: "url",
          inputMode: "url",
          placeholder: "https://…",
        })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">How much</legend>
        {text("quantity", "Quantity (optional)", { inputMode: "decimal", placeholder: "12" })}
        {text("unit", "Unit (optional)", { placeholder: "box" })}
        {text("unitPrice", "Expected price per unit (optional)", {
          inputMode: "decimal",
          placeholder: "54.99",
          hint: "What you'd expect to pay. The price you actually pay is kept on the order.",
        })}
      </fieldset>
      <TextAreaField
        id="material-specs"
        name="specs"
        label="Specifications (optional)"
        hint="Size, thickness, coverage, finish, anything you'd check before buying."
        defaultValue={value("specs")}
        error={f.error("specs")}
      />
      <TextAreaField
        id="material-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <datalist id="material-categories">
        {categories.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="material-suppliers">
        {suppliers.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={material ? "Save changes" : "Add material"}
        cancelHref={cancelHref}
      />
    </form>
  );
}

/** Moves a material to another status without opening the whole form. */
export function MaterialStatusForm({ id, status }: { id: string; status: string }) {
  return (
    <form action={setMaterialStatusAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <SelectField
        id="material-status-change"
        name="status"
        label="Status"
        options={materialStatusOptions}
        defaultValue={status}
        className="min-w-48"
      />
      <Button type="submit" variant="outline">
        Update status
      </Button>
    </form>
  );
}
