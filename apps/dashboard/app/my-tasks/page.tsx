import { Badge } from "@repo/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import Link from "next/link";

import { AppFrame } from "@/features/layout/app-frame";
import { dueState, formatDueDate, todayUtc } from "@/features/tasks/due-dates";
import { byDueThenPriority } from "@/features/tasks/my-tasks";
import { listMyOpenTasks } from "@/features/tasks/queries";
import { priorityLabel } from "@/features/tasks/task-priority";
import { TASK_STATUSES } from "@/features/tasks/task-status";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const { session, workspace } = await requireWorkspace("/my-tasks");
  const tasks = (await listMyOpenTasks(session.user.id)).sort(byDueThenPriority);
  const today = todayUtc();

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">My tasks</h1>

      <section aria-labelledby="my-tasks-heading">
        <Card>
          <CardHeader>
            <CardTitle id="my-tasks-heading" className="text-base">
              My tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
            ) : (
              <ul className="divide-y">
                {tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                    <div className="space-y-0.5 text-sm">
                      <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                        {t.title}
                      </Link>
                      <div className="text-muted-foreground">
                        {t.projectName} · {t.workspaceName}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{TASK_STATUSES.find((s) => s.status === t.status)?.label ?? "To do"}</Badge>
                      <span>{priorityLabel(t.priority)} priority</span>
                      {t.dueDate && (
                        <span>
                          Due <time dateTime={t.dueDate}>{formatDueDate(t.dueDate, "short", today)}</time>{" "}
                          {dueState(t.dueDate, t.status, today) === "overdue" && (
                            <span className="font-medium text-destructive">Overdue</span>
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </AppFrame>
  );
}
