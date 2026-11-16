import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteAttachmentAction } from "@/features/attachments/actions";
import { AttachmentUploader } from "@/features/attachments/attachment-uploader";
import { AttachmentsSection } from "@/features/attachments/attachments-section";
import { listVisitAttachments } from "@/features/attachments/queries";
import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { projectTabPath } from "@/features/projects/project-tabs";
import { getProjectForUser } from "@/features/projects/queries";
import { listVisitReadings } from "@/features/readings/queries";
import { ReadingsSection } from "@/features/readings/readings-section";
import { getSiteForUser } from "@/features/sites/queries";
import { formatDueDate } from "@/features/tasks/due-dates";
import { deleteVisitAction } from "@/features/visits/actions";
import { getProjectVisit } from "@/features/visits/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

/**
 * A visit (task 058): the day, the site, who recorded it, who was there and the notes. Its author and
 * admins edit and delete it. A made-up visit, another project's, or one the user can't see: "Visit not found".
 */
export default async function VisitPage({ params }: { params: Promise<{ projectId: string; visitId: string }> }) {
  const { projectId, visitId } = await params;
  const { session, workspace } = await requireWorkspace(`/projects/${projectId}/visits/${visitId}`);
  const project = await getProjectForUser(session.user.id, projectId);
  const visit = project ? await getProjectVisit(session.user.id, project.id, visitId) : null;
  if (!project || !visit) {
    notFound();
  }
  const [site, attachments, readings] = await Promise.all([
    getSiteForUser(session.user.id, project.siteId),
    listVisitAttachments(session.user.id, project.id, visit.id),
    listVisitReadings(session.user.id, visit.id),
  ]);

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, project.workspaceId)} className="max-w-3xl space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href={projectTabPath(project.id, "work")} className="hover:underline">{project.name}</Link>
      </nav>

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Visit on <time dateTime={visit.visitedOn}>{formatDueDate(visit.visitedOn)}</time>
          </h1>
          <p className="text-sm text-muted-foreground">
            {site ? (
              <>At <Link href={`/sites/${site.id}`} className="font-medium text-foreground hover:underline">{site.name}</Link></>
            ) : (
              "No site"
            )}
            {visit.authorName && <> · Recorded by {visit.authorName}</>}
          </p>
        </div>
        {visit.canChange && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${project.id}/visits/${visit.id}/edit`}>Edit visit</Link>
            </Button>
            <form action={deleteVisitAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="visitId" value={visit.id} />
              <Button type="submit" variant="ghost" size="sm">Delete visit</Button>
            </form>
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who was there</CardTitle>
        </CardHeader>
        <CardContent>
          {visit.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one listed.</p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {visit.members.map((m) => (
                <li key={m.userId}>{m.name}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {visit.notes ? (
            <p className="whitespace-pre-wrap text-sm">{visit.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No notes.</p>
          )}
        </CardContent>
      </Card>
      <ReadingsSection
        projectId={project.id}
        readings={readings}
        showVisitDates={false}
        addHref={project.canWork ? `/projects/${project.id}/visits/${visit.id}/readings/new` : undefined}
      />
      <AttachmentsSection
        projectId={project.id}
        items={attachments}
        showVisits={false}
        uploader={project.canWork ? <AttachmentUploader visitId={visit.id} /> : undefined}
        deleteAction={project.canWork ? deleteAttachmentAction : undefined}
      />
    </AppFrame>
  );
}
