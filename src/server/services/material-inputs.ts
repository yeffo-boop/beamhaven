import { z } from "zod";

import { parseQuantity } from "@/lib/quantity";

import { optionalMoney } from "./budget-inputs";
import { optionalWebsite } from "./contractor-inputs";
import { optionalText, requiredText } from "./inputs";

/** Form rules for materials (Milestone 6). */

/** In the order a product usually moves through them. */
export const MATERIAL_STATUSES = [
  "considering",
  "selected",
  "ordered",
  "delivered",
  "installed",
  "returned",
  "canceled",
] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  considering: "Considering",
  selected: "Selected",
  ordered: "Ordered",
  delivered: "Delivered",
  installed: "Installed",
  returned: "Returned",
  canceled: "Canceled",
};

/** Statuses that are finished with: shown last and left out of "still to buy". */
export const CLOSED_MATERIAL_STATUSES: readonly MaterialStatus[] = ["returned", "canceled"];

/** Kinds offered as suggestions; anything else can be typed. */
export const MATERIAL_CATEGORY_SUGGESTIONS = [
  "Flooring",
  "Tile",
  "Paint",
  "Lumber",
  "Drywall",
  "Trim",
  "Cabinets",
  "Countertops",
  "Plumbing fixture",
  "Lighting",
  "Electrical",
  "Hardware",
  "Appliance",
  "Window",
  "Door",
  "Roofing",
  "Insulation",
] as const;

const optionalQuantity = z
  .string()
  .trim()
  .default("")
  .transform((value, context) => {
    if (value === "") return null;
    const milli = parseQuantity(value);
    if (milli === null) {
      context.addIssue({ code: "custom", message: "Enter a number above zero, like 3 or 2.5" });
      return z.NEVER;
    }
    return milli;
  });

export const materialStatusInput = z.enum(MATERIAL_STATUSES, { message: "Choose a status" });

export const materialInput = z.object({
  name: requiredText(200, "Give the material a name", "The name"),
  category: optionalText(60, "The kind"),
  projectId: optionalText(64, "The project"),
  roomId: optionalText(64, "The room"),
  supplier: optionalText(150, "The supplier"),
  brand: optionalText(100, "The brand"),
  modelNumber: optionalText(100, "The model number"),
  sku: optionalText(100, "The SKU"),
  colorFinish: optionalText(150, "The color or finish"),
  productUrl: optionalWebsite,
  quantity: optionalQuantity,
  unit: optionalText(30, "The unit"),
  unitPrice: optionalMoney,
  // A new material's form may leave the status out: "" means "considering".
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    materialStatusInput.default("considering"),
  ),
  specs: optionalText(5000, "The specifications"),
  notes: optionalText(5000, "The notes"),
});
