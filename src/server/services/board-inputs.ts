import { z } from "zod";

import { optionalWebsite } from "./contractor-inputs";
import { optionalText, requiredText } from "./inputs";

/** Form rules for design boards (Milestone 8, part 2). */

export const BOARD_ITEM_KINDS = ["image", "product", "color", "finish"] as const;
export type BoardItemKind = (typeof BOARD_ITEM_KINDS)[number];

export const BOARD_ITEM_KIND_LABELS: Record<BoardItemKind, string> = {
  image: "Image",
  product: "Product",
  color: "Color",
  finish: "Finish",
};

export function boardItemKindLabel(kind: string): string {
  return BOARD_ITEM_KIND_LABELS[kind as BoardItemKind] ?? "Item";
}

export const boardInput = z.object({
  name: requiredText(120, "Give the board a name", "The name"),
  roomId: optionalText(64, "The room"),
  projectId: optionalText(64, "The project"),
  notes: optionalText(5000, "The notes"),
});

/** "#3A5F4B", "3a5f4b" or "#3a5" become "#3a5f4b"; "" is no color. */
export const optionalColor = z
  .string()
  .trim()
  .default("")
  .transform((value, context) => {
    if (value === "") return null;
    const hex = value.replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
    if (/^[0-9a-f]{3}$/.test(hex)) return `#${[...hex].map((c) => c + c).join("")}`;
    context.addIssue({ code: "custom", message: "Enter a color like #3a5f4b" });
    return z.NEVER;
  });

export const boardItemInput = z
  .object({
    kind: z.enum(BOARD_ITEM_KINDS, { message: "Choose what kind of item this is" }),
    title: requiredText(200, "Give it a name", "The name"),
    notes: optionalText(2000, "The notes"),
    colorHex: optionalColor,
    brand: optionalText(120, "The brand"),
    code: optionalText(120, "The code"),
    productUrl: optionalWebsite,
    materialId: optionalText(64, "The material"),
  })
  .superRefine((item, context) => {
    if (item.kind === "color" && !item.colorHex) {
      context.addIssue({ code: "custom", path: ["colorHex"], message: "Choose the color" });
    }
  });

export const reorderInput = z.array(z.string().min(1).max(64)).min(1).max(500);
