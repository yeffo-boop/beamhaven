import Link from "next/link";

import { TaskList } from "@/components/contractors/lists";
import { inputClass } from "@/components/forms/field";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/records/panel";
import { MilestoneList } from "@/components/schedule/milestones";
import { Button } from "@/components/ui/button";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import type { TaskRecord } from "@/server/data/tasks";
import { getMilestones } from "@/server/services/milestones";
import { getProjects } from "@/server/services/projects";
import { getTasks } from "@/server/services/tasks";

export const metadata = { title: "Schedule" };

const SHOW = {
  open: { label: "Still to do", keep: (t: TaskRecord) => t.status !== "done" },
  blocked: {
    label: "Blocked",
    keep: (t: TaskRecord) => t.status !== "done" && t.blockedBy.length > 0,
  },
  done: { label: "Done", keep: (t: TaskRecord) => t.status === "done" },
  all: { label: "All tasks", keep: () => true },
} as const;
type Show = keyof typeof SHOW;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const projectId = one(params.project);
  const show: Show = one(params.show) in SHOW ? (one(params.show) as Show) : "open";
  const [tasks, milestones, projects] = await Promise.all([
    getTasks(ctx, projectId ? { projectId } : {}),
    getMilestones(ctx, projectId ? { projectId } : {}),
    getProjects(ctx),
  ]);
  const shown = tasks.filter(SHOW[show].keep);
  const blockedCount = tasks.filter(SHOW.blocked.keep).length;
  const today = new Date();
  const filtered = Boolean(projectId || show !== "open");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        description="Every project's milestones and tasks, with what's blocked and what's late."
      />
      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        aria-label="Filter the schedule"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Project
          <select name="project" defaultValue={projectId} className={`${inputClass} min-w-48`}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Tasks
          <select name="show" defaultValue={show} className={`${inputClass} min-w-40`}>
            {Object.entries(SHOW).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Show
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            <Link href="/schedule">Clear</Link>
          </Button>
        ) : null}
      </form>

      <Panel title="Milestones" id="milestones">
        <MilestoneList milestones={milestones} today={today} showProject={!projectId} />
      </Panel>

      <Panel title={SHOW[show].label} id="tasks">
        {show === "open" && blockedCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {blockedCount} {blockedCount === 1 ? "task is" : "tasks are"} blocked, waiting on
            others.{" "}
            <Link
              href={`/schedule?show=blocked${projectId ? `&project=${projectId}` : ""}`}
              className="text-primary hover:underline"
            >
              See which
            </Link>
          </p>
        ) : null}
        <TaskList
          tasks={shown}
          canEdit={canEdit}
          today={today}
          show={projectId ? ["room", "milestone"] : ["project", "milestone"]}
        />
      </Panel>
    </div>
  );
}
