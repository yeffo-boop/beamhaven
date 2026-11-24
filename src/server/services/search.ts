import "server-only";

import { z } from "zod";

import { assertCan } from "@/server/auth/permissions";
import type { WorkspaceContext } from "@/server/data/context";
import { type SearchHit, type SearchKind, searchHousehold } from "@/server/data/search";

/** Search across the household (Milestone 9, part 2, ADR-038). */

export const SEARCH_MIN_LENGTH = 2;
const MAX_WORDS = 6;
/** Hits per kind on the results page. */
const PER_KIND = 8;

const queryInput = z.string().trim().max(100);

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  project: "Projects",
  room: "Rooms",
  property: "Properties",
  task: "Tasks",
  milestone: "Milestones",
  expense: "Expenses",
  contractor: "Contractors",
  quote: "Quotes",
  contract: "Contracts",
  warranty: "Warranties",
  material: "Materials",
  order: "Orders",
  appointment: "Appointments",
  document: "Files",
  board: "Design boards",
  board_item: "On design boards",
};

const PATHS: Record<SearchKind, string> = {
  project: "/projects",
  room: "/rooms",
  property: "/properties",
  task: "/tasks",
  milestone: "/milestones",
  expense: "/budget/expenses",
  contractor: "/contractors",
  quote: "/quotes",
  contract: "/contracts",
  warranty: "/warranties",
  material: "/materials",
  order: "/orders",
  appointment: "/appointments",
  document: "/files",
  board: "/inspiration",
  board_item: "/inspiration",
};

export type SearchResult = SearchHit & { href: string };
export type SearchGroup = { kind: SearchKind; label: string; results: SearchResult[] };
export type SearchOutcome = {
  query: string;
  /** False when the query is too short to search. */
  searched: boolean;
  groups: SearchGroup[];
  total: number;
};

/** Splits a query into distinct lower-case words, ignoring one-letter ones. */
export function searchWords(query: string): string[] {
  const all = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
  const long = all.filter((w) => w.length >= SEARCH_MIN_LENGTH);
  return long.slice(0, MAX_WORDS);
}

export async function search(ctx: WorkspaceContext, raw: unknown): Promise<SearchOutcome> {
  assertCan(ctx, "records:view");
  const parsed = queryInput.safeParse(typeof raw === "string" ? raw : "");
  const query = parsed.success ? parsed.data : "";
  const words = searchWords(query);
  if (words.length === 0) return { query, searched: false, groups: [], total: 0 };

  const hits = await searchHousehold(ctx, words, PER_KIND);
  const byKind = new Map<SearchKind, SearchResult[]>();
  for (const hit of hits) {
    const list = byKind.get(hit.kind) ?? [];
    list.push({ ...hit, href: `${PATHS[hit.kind]}/${hit.linkId}` });
    byKind.set(hit.kind, list);
  }
  const groups = [...byKind.entries()].map(([kind, results]) => ({
    kind,
    label: SEARCH_KIND_LABELS[kind],
    // A title that starts with the first word ranks above one that only contains it.
    results: results.sort((a, b) => rank(a, words) - rank(b, words)),
  }));
  return { query, searched: true, groups, total: hits.length };
}

function rank(hit: SearchHit, words: string[]): number {
  const title = hit.title.toLowerCase();
  if (title === words.join(" ")) return 0;
  if (words.every((w) => title.includes(w))) return title.startsWith(words[0] ?? "") ? 1 : 2;
  return 3;
}
