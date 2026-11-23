import Link from "next/link";

import { lineTitle } from "@/server/data/budget";
import type { LineView } from "@/server/services/budget";

import { Available, Money } from "./money";

/**
 * A project's budget lines, grouped by category. On a phone the table
 * scrolls sideways inside its box; the page itself never does.
 */
export function LinesTable({ lines }: { lines: LineView[] }) {
  const groups = Map.groupBy(lines, (l) => l.categoryName);
  return (
    <div className="-mx-5 overflow-x-auto md:mx-0">
      <table aria-label="Budget lines" className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="px-5 py-2 font-medium md:pl-0">
              Line
            </th>
            <Num>Budget</Num>
            <Num>Forecast</Num>
            <Num>Committed</Num>
            <Num>Spent</Num>
            <Num last>Available</Num>
          </tr>
        </thead>
        {[...groups].map(([category, rows]) => (
          <tbody key={category} className="border-b border-border">
            <tr>
              <th
                scope="rowgroup"
                colSpan={6}
                className="px-5 pt-3 pb-1 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase md:pl-0"
              >
                {category}
              </th>
            </tr>
            {rows.map((line) => (
              <tr key={line.id} className="hover:bg-muted/50">
                <th scope="row" className="px-5 py-2 text-left font-normal md:pl-0">
                  <Link href={`/budget/lines/${line.id}`} className="font-medium hover:underline">
                    {[line.roomName ?? "Whole project", line.name || null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Link>
                  <span className="sr-only"> ({lineTitle(line, { withProject: false })})</span>
                </th>
                <Cell>
                  <Money cents={line.numbers.current} />
                </Cell>
                <Cell>
                  <Money cents={line.numbers.forecast} />
                </Cell>
                <Cell>
                  <Money cents={line.numbers.committed} />
                </Cell>
                <Cell>
                  <Money cents={line.numbers.expenses} />
                </Cell>
                <Cell last>
                  <Available cents={line.numbers.available} />
                </Cell>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Num({ children, last }: { children: string; last?: boolean }) {
  return (
    <th scope="col" className={`px-3 py-2 text-right font-medium ${last ? "pr-5 md:pr-0" : ""}`}>
      {children}
    </th>
  );
}

function Cell({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <td className={`px-3 py-2 text-right whitespace-nowrap ${last ? "pr-5 md:pr-0" : ""}`}>
      {children}
    </td>
  );
}
