import { Download, Printer } from "lucide-react";
import Link from "next/link";

import { inputClass } from "@/components/forms/field";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getProjects } from "@/server/services/projects";
import { CSV_REPORT_INFO, CSV_REPORTS } from "@/server/services/reports";

export const metadata = { title: "Reports" };

/** Spreadsheet exports and printable reports (Milestone 9, part 3, ADR-039). */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const projects = await getProjects(ctx);
  const chosen = projects.find((p) => p.id === params.project) ?? null;
  const query = chosen ? `?project=${encodeURIComponent(chosen.id)}` : "";
  const scope = chosen ? chosen.name : "all projects";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Download your records as spreadsheets, or print a project report (or save it as a PDF)."
      />

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Choose a project">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-project" className="text-sm font-medium">
            Project
          </label>
          <select
            id="report-project"
            name="project"
            defaultValue={chosen?.id ?? ""}
            className={`${inputClass} min-w-56`}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Show reports
        </Button>
      </form>

      <Panel title={`Spreadsheets for ${scope}`} id="csv">
        <p className="text-sm text-muted-foreground">
          CSV files open in Excel, Numbers and Google Sheets. Amounts are in dollars.
        </p>
        <ul className="divide-y divide-border">
          {CSV_REPORTS.map((report) => (
            <li
              key={report}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{CSV_REPORT_INFO[report].label}</p>
                <p className="text-sm text-muted-foreground">
                  {CSV_REPORT_INFO[report].description}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports/${report}${query}`} download>
                  <Download aria-hidden="true" />
                  Download {CSV_REPORT_INFO[report].label.toLowerCase()}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Printable project report" id="print">
        {chosen ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {chosen.name}: status, dates, the budget by category, milestones, open tasks and
              expenses, on one page to print or save as a PDF.
            </p>
            <Button asChild size="sm">
              <Link href={`/reports/projects/${chosen.id}`}>
                <Printer aria-hidden="true" />
                Open the report
              </Link>
            </Button>
          </div>
        ) : projects.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Choose a project above to open its report.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Start a project to get its report.</p>
        )}
      </Panel>
    </div>
  );
}
