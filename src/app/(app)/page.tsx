import { ImagePlus, ListPlus, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/home/activity-feed";
import { AttentionList } from "@/components/home/attention-list";
import { BudgetCard } from "@/components/home/budget-card";
import { ProjectCards } from "@/components/home/project-cards";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Panel } from "@/components/records/panel";
import { AgendaList } from "@/components/schedule/calendar";
import { Button } from "@/components/ui/button";
import { formatWeekday } from "@/lib/calendar";
import { can } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getDashboard } from "@/server/services/dashboard";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const [user, home] = await Promise.all([getCurrentUser(), getDashboard(ctx)]);
  const canEdit = can(ctx, "records:edit");
  const firstName = user?.name.split(/\s+/)[0] ?? "";
  // Photos and tasks belong to a project: offer the one worked on most recently.
  const latest = home.projects[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Home"
        description={`${firstName ? `Hi, ${firstName}. ` : ""}It's ${formatWeekday(home.today)}.`}
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              {home.budget ? (
                <Button asChild>
                  <Link href="/budget/expenses/new">
                    <Plus aria-hidden="true" />
                    Add expense
                  </Link>
                </Button>
              ) : null}
              {latest ? (
                <>
                  <Button asChild variant="outline">
                    <Link href={`/projects/${latest.id}#photos-heading`}>
                      <ImagePlus aria-hidden="true" />
                      Add photo<span className="sr-only"> to {latest.name}</span>
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/projects/${latest.id}#tasks-heading`}>
                      <ListPlus aria-hidden="true" />
                      Add task<span className="sr-only"> to {latest.name}</span>
                    </Link>
                  </Button>
                </>
              ) : (
                <Button asChild variant="outline">
                  <Link href="/projects/new">
                    <Plus aria-hidden="true" />
                    Start a project
                  </Link>
                </Button>
              )}
            </div>
          ) : null
        }
      />

      <Panel
        title="Budget"
        id="home-budget"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/budget">Open Budget</Link>
          </Button>
        }
      >
        {home.budget ? (
          <BudgetCard totals={home.budget} />
        ) : (
          <EmptyState>
            No budgets yet. Add budget lines to a project to see the totals here.
          </EmptyState>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Needs attention" id="attention">
          <AttentionList items={home.attention} />
        </Panel>
        <Panel
          title="This week"
          id="this-week"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/schedule?view=week">Open Schedule</Link>
            </Button>
          }
        >
          <AgendaList
            entries={home.week}
            today={home.today}
            empty="Nothing on the calendar this week."
          />
        </Panel>
      </div>

      <Panel
        title="Active projects"
        id="active-projects"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">All projects</Link>
          </Button>
        }
      >
        <ProjectCards projects={home.projects} />
      </Panel>

      <Panel
        title="Recent activity"
        id="recent-activity"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/activity">All activity</Link>
          </Button>
        }
      >
        <ActivityFeed items={home.activity} />
      </Panel>
    </div>
  );
}
