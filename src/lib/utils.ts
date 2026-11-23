import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts ("p-2 p-4" becomes "p-4").
 * The name and location match what shadcn/ui components expect.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
