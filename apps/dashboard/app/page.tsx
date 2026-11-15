import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import { StackedBar } from "@repo/ui/stacked-bar";
import Link from "next/link";

import { canSeeCustomers } from "@/features/access/scope";
import { AppHeader } from "@/features/layout/app-header";
import { ProjectList } from "@/features/projects/project-list";
import { countProjects, listProjects } from "@/features/projects/queries";
import { overviewWindow, summarizeOverview } from "@/features/tasks/overview";
import { summarizeProjectStatusCounts } from "@/features/tasks/progress";
import { countTasksByProjectAndStatus, countWorkspaceOverview } from "@/features/tasks/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

const RECENT_PROJECTS = 5;

export default async function DashboardPage() {
  const { session, workspace } = await requireWorkspace("/");
  const [projectCount, recentProjects, overviewCounts, projectCounts] = await Promise.all([
    countProjects(session.user.id, workspace.id),
    listProjects(session.user.id, workspace.id, RECENT_PROJECTS),
    countWorkspaceOverview(session.user.id, workspace.id, overviewWindow(new Date())),
    countTasksByProjectAndStatus(session.user.id, workspace.id),
  ]);
  const { summary: overall, overdue, dueSoon, thisWeek, byStatus } = summarizeOverview(overviewCounts);

  const stats = [
    { id: "total-projects", label: "Total Projects", value: String(projectCount), hint: "Active in your workspace" },
    { id: "open-tasks", label: "Open Tasks", value: String(overall.open), hint: "To do or in progress" },
    { id: "completion-rate", label: "Completion Rate", value: `${overall.completionRate}%`, hint: `${overall.done} of ${overall.total} tasks done` },
    { id: "overdue", label: "Overdue", value: String(overdue), hint: "Open tasks past their due date" },
    { id: "due-this-week", label: "Due This Week", value: String(dueSoon), hint: "Open tasks due within seven days, including today" },
  ];
  const weekStats = [
    { id: "created-this-week", label: "Created", value: thisWeek.created, hint: "New tasks, last seven days" },
    { id: "completed-this-week", label: "Completed", value: thisWeek.completed, hint: "Moved to Done, last seven days" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader email={session.user.email} role={workspace.role} workspaceName={workspace.name} />

      <main className="mx-auto w-full max-w-6xl space-y-8 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Project Dashboard</h1>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
          {/* Five tiles: on two-column screens the last one spans the row instead of sitting alone. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 sm:[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
            {stats.map((stat) => (
              <Card key={stat.id} role="group" aria-labelledby={`stat-${stat.id}`}>
                <CardHeader className="pb-2">
                  <CardDescription id={`stat-${stat.id}`}>{stat.label}</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{stat.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tasks by status</CardTitle>
              </CardHeader>
              <CardContent>
                <StackedBar label="Tasks by status" segments={byStatus} emptyText="No tasks yet. Open a project to add some." />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">This week</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {weekStats.map((stat) => (
                  <div key={stat.id} role="group" aria-labelledby={`stat-${stat.id}`} className="space-y-1">
                    <p id={`stat-${stat.id}`} className="text-sm text-muted-foreground">
                      {stat.label}
                      <span className="sr-only"> this week</span>
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="recent-projects" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="recent-projects" className="text-xl font-semibold tracking-tight">Recently started</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/projects">View all projects</Link>
            </Button>
          </div>
          {recentProjects.length === 0 ? (
            <Card className="border-dashed p-8 text-center text-muted-foreground">
              No projects yet. <Link href="/projects" className="underline">Create your first project</Link>.
            </Card>
          ) : (
            <ProjectList
              projects={recentProjects}
              progress={summarizeProjectStatusCounts(projectCounts)}
              linkCustomers={canSeeCustomers(workspace.role)}
            />
          )}
        </section>
      </main>
    </div>
  );
}
