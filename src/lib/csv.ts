/**
 * Builds CSV files that open cleanly in Excel, Numbers and Google Sheets
 * (Milestone 9, part 3, ADR-039). Pure, so it's unit-tested.
 */

/** A cell: text, a number of cents (written as dollars), or empty. */
export type CsvCell = string | { cents: bigint } | null;

/**
 * Text that starts with = + - @ (or a tab or carriage return) could run as a
 * formula when the file is opened in a spreadsheet ("CSV injection"), so it
 * gets a leading apostrophe, which spreadsheets show as plain text.
 */
function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function quote(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Whole cents as "1234.56" or "-12.00", with no symbol or commas, so spreadsheets read a number. */
export function centsCell(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function cell(value: CsvCell): string {
  if (value === null) return "";
  if (typeof value === "object") return centsCell(value.cents);
  return quote(safeText(value));
}

/**
 * The whole file: a byte-order mark (so Excel reads accents and symbols as
 * UTF-8), a header row, then the rows, with Windows line endings as RFC 4180 asks.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map((h) => quote(h)), ...rows.map((r) => r.map(cell))];
  return `﻿${lines.map((l) => l.join(",")).join("\r\n")}\r\n`;
}

/** A safe file name: letters, digits and dashes only. */
export function csvFileName(...parts: string[]): string {
  const slug = parts
    .join("-")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "report"}.csv`;
}
