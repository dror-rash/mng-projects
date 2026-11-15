import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isAdmin } from "@/features/access/require-change";
import { deleteAttachmentAction } from "@/features/attachments/actions";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import { AttachmentsSection } from "@/features/attachments/attachments-section";
import { listProjectAttachments, listProjectReports } from "@/features/attachments/queries";
import { ReportsSection } from "@/features/attachments/reports-section";
import { removeCrewMemberAction } from "@/features/crews/actions";
import { AddToCrewForm } from "@/features/crews/add-to-crew-form";
import { CrewSection } from "@/features/crews/crew-section";
import { listCrew, listCrewChoices } from "@/features/crews/queries";
import { AppHeader } from "@/features/layout/app-header";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { getOrganizationForUser } from "@/features/organizations/queries";
import { setProjectLifecycleAction } from "@/features/projects/actions";
import { isCanceled, projectLifecycleLabel } from "@/features/projects/project-lifecycle";
import { getProjectForUser } from "@/features/projects/queries";
import { changeStageAction } from "@/features/projects/stage-actions";
import { StageControl } from "@/features/projects/stage-control";
import { getStageChangedAt } from "@/features/projects/stage-history";
import { stageLabels } from "@/features/projects/stage-labels";
import { listProjectReadings } from "@/features/readings/queries";
import { ReadingsSection } from "@/features/readings/readings-section";
import { mapsLink } from "@/features/sites/maps-link";
import { ProjectSiteSection } from "@/features/sites/project-site-section";
import { getSiteForUser, listSiteContacts } from "@/features/sites/queries";
import { listProjectVisits } from "@/features/visits/queries";
import { VisitsSection } from "@/features/visits/visits-section";
import { deleteTaskAction, updateTaskStatusAction } from "@/features/tasks/actions";
import { AddTaskForm } from "@/features/tasks/add-task-form";
import { listProjectTasks } from "@/features/tasks/queries";
import { formatDueDate, todayUtc } from "@/features/tasks/due-dates";
import { byPriority } from "@/features/tasks/task-priority";
import { TaskBoard } from "@/features/tasks/task-board";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {

  const { projectId } = await params;
  const { session, workspace } = await requireWorkspace(`/projects/${projectId}`);
  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    notFound();
  }

  // The customer is a link only for those who can open customer pages; partners see its name only. The
  // project it was copied from shows only to those who can see that one too (rule 4a).
  const [tasks, customerPage, copiedFrom, site, crew, manageCrew, visits, readings, attachments, reports, stageChangedAt, stages] = await Promise.all([
    listProjectTasks(session.user.id, project.id),
    project.customerName ? getOrganizationForUser(session.user.id, project.organizationId, "customer") : null,
    project.copiedFromId ? getProjectForUser(session.user.id, project.copiedFromId) : null,
    getSiteForUser(session.user.id, project.siteId),
    listCrew(session.user.id, project.id),
    isAdmin(session.user.id, project.workspaceId),
    listProjectVisits(session.user.id, project.id),
    listProjectReadings(session.user.id, project.id),
    listProjectAttachments(session.user.id, project.id),
    listProjectReports(session.user.id, project.id),
    getStageChangedAt(session.user.id, project.id),
    stageLabels(),
  ]);
  // The stage's day (task 101): its latest change, or when the project was made if it has no history yet.
  const stageSince = todayUtc(stageChangedAt ?? project.createdAt);
  // Admins put the workspace's workers on the crew (task 056).
  const crewChoices = manageCrew ? await listCrewChoices(session.user.id, project) : [];
  // Where the work is (task 055). Every project has a site (task 071); it shows while it isn't deleted.
  const siteContacts = site ? await listSiteContacts(session.user.id, site.id) : [];
  const canceled = isCanceled(project.lifecycle);
  // Most urgent first in each column; tasks arrive oldest first, and the sort keeps that within a priority.
  // Only the fields a card shows cross to the client.
  const boardTasks = [...tasks]
    .sort(byPriority)
    .map(({ id, title, status, priority, dueDate, assigneeName, customerName }) => ({ id, title, status, priority, dueDate, assigneeName, customerName }));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader email={session.user.email} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, project.workspaceId)} />

      <main className="mx-auto w-full max-w-6xl space-y-8 p-6">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              {canceled && <Badge variant="outline">{projectLifecycleLabel(project.lifecycle)}</Badge>}
            </div>
            {project.description && <p className="text-muted-foreground">{project.description}</p>}
            {/* Every project has a customer (task 071); its name shows to whoever may see it. */}
            {project.customerName && (
              <p className="text-sm text-muted-foreground">
                Customer:{" "}
                {customerPage ? (
                  <Link href={`/customers/${customerPage.id}`} className="font-medium text-foreground hover:underline">
                    {project.customerName}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{project.customerName}</span>
                )}
              </p>
            )}
            {copiedFrom && (
              <p className="text-sm text-muted-foreground">
                Copied from{" "}
                <Link href={`/projects/${copiedFrom.id}`} className="font-medium text-foreground hover:underline">
                  {copiedFrom.name}
                </Link>
              </p>
            )}
          </div>
          {project.canChange && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${project.id}/edit`}>Edit project</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${project.id}/copy`}>Copy to new project</Link>
              </Button>
              {/* Cancel or reopen (rule 4b): the project and its tasks stay editable either way. */}
              <form action={setProjectLifecycleAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="lifecycle" value={canceled ? "active" : "canceled"} />
                <Button type="submit" variant="outline" size="sm">{canceled ? "Reopen project" : "Cancel project"}</Button>
              </form>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/projects/${project.id}/delete`}>Delete project</Link>
              </Button>
            </div>
          )}
        </section>

        <StageControl
          projectId={project.id}
          stage={project.stage}
          options={stages.options}
          line={stages.since(project.stage)}
          since={stageSince}
          sinceText={formatDueDate(stageSince)}
          action={project.canChange ? changeStageAction : undefined}
        />

        {site && (
          <ProjectSiteSection
            site={{
              id: site.id,
              name: site.name,
              address: site.address,
              accessNotes: site.accessNotes,
              mapsHref: mapsLink(site),
              contacts: siteContacts,
            }}
          />
        )}

        <VisitsSection projectId={project.id} visits={visits} canRecord={project.canWork} />

        <ReadingsSection projectId={project.id} readings={readings} showVisitDates />

        <AttachmentsSection
          projectId={project.id}
          items={attachments}
          showVisits
          uploader={project.canWork ? <AttachmentUploader visitId={null} /> : undefined}
          deleteAction={project.canWork ? deleteAttachmentAction : undefined}
        />

        <ReportsSection
          projectId={project.id}
          reports={reports}
          uploader={project.canWork ? <AttachmentUploader visitId={null} kinds={["report"]} /> : undefined}
          deleteAction={project.canWork ? deleteAttachmentAction : undefined}
        />

        <CrewSection
          projectId={project.id}
          crew={crew}
          removeAction={manageCrew ? removeCrewMemberAction : undefined}
          addForm={manageCrew ? <AddToCrewForm projectId={project.id} workers={crewChoices} /> : undefined}
        />

        {project.canWork && <AddTaskForm projectId={project.id} />}

        <TaskBoard
          projectId={project.id}
          tasks={boardTasks}
          today={todayUtc()}
          moveAction={updateTaskStatusAction}
          deleteAction={project.canChange ? deleteTaskAction : undefined}
          readOnly={!project.canWork}
        />
      </main>
    </div>
  );
}
