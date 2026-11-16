import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { listCustomerNames } from "@/features/organizations/customer-names";
import { getOrganizationForUser } from "@/features/organizations/queries";
import { projectTabPath } from "@/features/projects/project-tabs";
import { getProjectForUser } from "@/features/projects/queries";
import { deleteTaskFromPageAction } from "@/features/tasks/actions";
import { EditTaskForm } from "@/features/tasks/edit-task-form";
import { getProjectTask } from "@/features/tasks/queries";
import { dueState, formatDueDate, todayUtc } from "@/features/tasks/due-dates";
import { priorityLabel } from "@/features/tasks/task-priority";
import { parseTaskStatus, TASK_STATUSES } from "@/features/tasks/task-status";
import { listAssigneeOptions } from "@/features/workspaces/members";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const { session, workspace } = await requireWorkspace(`/projects/${projectId}/tasks/${taskId}`);
  const project = await getProjectForUser(session.user.id, projectId);
  const task = project ? await getProjectTask(session.user.id, project.id, taskId) : null;
  if (!project || !task) {
    notFound();
  }

  // A partner's project offers only the partner's customers (rule 7a) and assignees (rule 7). The task's
  // customer is a link only for those who can open customer pages; partners see its name only.
  const [customers, members, customerPage] = await Promise.all([
    listCustomerNames(session.user.id, project.workspaceId, project.partnerId),
    listAssigneeOptions(session.user.id, project),
    task.organizationId && task.customerName ? getOrganizationForUser(session.user.id, task.organizationId, "customer") : null,
  ]);
  const status = TASK_STATUSES.find((s) => s.status === (parseTaskStatus(task.status) ?? "todo"))!;
  // Only the fields the edit form uses cross to the client. A customer that isn't one of the choices (a
  // partner can't see it, rule 7a) goes as hidden, never its id; the form then leaves it as it is.
  const customerHidden = task.organizationId !== null && !customers.some((c) => c.id === task.organizationId);
  // Likewise an assignee who isn't one of the choices (an auditor, rule 7): kept on save, never sent.
  const assigneeHidden = task.assigneeId !== null && !members.some((m) => m.userId === task.assigneeId);
  const editableTask = {
    id: task.id,
    title: task.title,
    description: task.description,
    organizationId: customerHidden ? null : task.organizationId,
    customerHidden,
    priority: task.priority,
    dueDate: task.dueDate,
    assigneeId: assigneeHidden ? null : task.assigneeId,
    assigneeHidden,
  };

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, project.workspaceId)} className="max-w-3xl space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href={projectTabPath(project.id, "overview")} className="hover:underline">
          {project.name}
        </Link>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {status.label}
          </span>
          <span>{priorityLabel(task.priority)} priority</span>
          <span>{task.assigneeName ? `Assigned to ${task.assigneeName}` : "Unassigned"}</span>
          {task.dueDate ? (
            <span>
              Due <time dateTime={task.dueDate}>{formatDueDate(task.dueDate)}</time>{" "}
              {dueState(task.dueDate, task.status, todayUtc()) === "overdue" && (
                <span className="ml-2 font-medium text-destructive">Overdue</span>
              )}
            </span>
          ) : (
            <span>No due date</span>
          )}
          {task.customerName ? (
            <span>
              Customer:{" "}
              {customerPage ? (
                <Link href={`/customers/${customerPage.id}`} className="font-medium text-foreground hover:underline">
                  {task.customerName}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{task.customerName}</span>
              )}
            </span>
          ) : (
            <span>No customer</span>
          )}
        </div>
        {task.description ? (
          <p className="whitespace-pre-wrap pt-2 text-muted-foreground">{task.description}</p>
        ) : (
          <p className="pt-2 text-sm text-muted-foreground">No description yet.</p>
        )}
      </section>

      {/* Workers on the crew edit tasks too, but only those who can change the project delete them (task 056). */}
      {project.canWork && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit task</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Keyed on the last save, so the form starts from the saved values after each save
                (React resets a submitted form to its initial defaults otherwise). */}
            <EditTaskForm
              key={task.updatedAt.toISOString()}
              projectId={project.id}
              task={editableTask}
              customers={customers}
              members={members}
            />
          </CardContent>
        </Card>
      )}
      {project.canChange && (
        <form action={deleteTaskFromPageAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="taskId" value={task.id} />
          <Button type="submit" variant="outline">Delete task</Button>
        </form>
      )}
    </AppFrame>
  );
}
