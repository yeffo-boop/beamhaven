import Link from "next/link";

import { inputClass } from "@/components/forms/field";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { search, SEARCH_MIN_LENGTH } from "@/server/services/search";

export const metadata = { title: "Search" };

/** Search across the household's records (Milestone 9, part 2, ADR-038). */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const outcome = await search(ctx, params.q);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Search"
        description="Projects, rooms, tasks, expenses, contractors, quotes, materials, orders, files and boards."
      />
      <form method="get" role="search" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
          Search for
          <input
            type="search"
            name="q"
            defaultValue={outcome.query}
            placeholder="Tile, plumber, invoice…"
            maxLength={100}
            className={`${inputClass} w-full`}
          />
        </label>
        <Button type="submit">Search</Button>
      </form>

      {!outcome.searched ? (
        outcome.query ? (
          <EmptyState>Type at least {SEARCH_MIN_LENGTH} letters.</EmptyState>
        ) : null
      ) : outcome.total === 0 ? (
        <EmptyState>Nothing matches “{outcome.query}”.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <p role="status" className="text-sm text-muted-foreground">
            {outcome.total === 1 ? "1 match" : `${outcome.total} matches`} for “{outcome.query}”
          </p>
          {outcome.groups.map((group) => (
            <section
              key={group.kind}
              aria-labelledby={`search-${group.kind}`}
              className="flex flex-col gap-2"
            >
              <h2 id={`search-${group.kind}`} className="text-sm font-semibold">
                {group.label}{" "}
                <span className="font-normal text-muted-foreground">({group.results.length})</span>
              </h2>
              <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
                {group.results.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={r.href}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-muted"
                    >
                      <span className="min-w-0 font-medium break-words">{r.title}</span>
                      {r.context ? (
                        <span className="min-w-0 text-sm break-words text-muted-foreground">
                          {r.context}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
