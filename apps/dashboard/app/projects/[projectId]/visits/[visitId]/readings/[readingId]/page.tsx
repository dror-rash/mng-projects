import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { projectTabPath } from "@/features/projects/project-tabs";
import { getProjectForUser } from "@/features/projects/queries";
import { getReading } from "@/features/readings/queries";
import { isFilledIn, readingValueText } from "@/features/readings/reading-values";
import { formatDueDate } from "@/features/tasks/due-dates";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

/**
 * A reading (task 061): the form's name, the visit's day, who filled it in, and each field of the version it was
 * filled against with its value (also after the form is archived). Anything the user can't see, a deleted
 * visit's, or made up: "Reading not found". Read-only: readings are append-only for now.
 */
export default async function ReadingPage({ params }: { params: Promise<{ projectId: string; visitId: string; readingId: string }> }) {
  const { projectId, visitId, readingId } = await params;
  const { session, workspace } = await requireWorkspace(`/projects/${projectId}/visits/${visitId}/readings/${readingId}`);
  const project = await getProjectForUser(session.user.id, projectId);
  const reading = project ? await getReading(session.user.id, project.id, visitId, readingId) : null;
  if (!project || !reading) {
    notFound();
  }
  const visitHref = `/projects/${project.id}/visits/${visitId}`;

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, project.workspaceId)} className="max-w-3xl space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted-foreground">
        <Link href={projectTabPath(project.id, "work")} className="hover:underline">{project.name}</Link>
        <span aria-hidden>›</span>
        <Link href={visitHref} className="hover:underline">
          Visit on <time dateTime={reading.visitedOn}>{formatDueDate(reading.visitedOn)}</time>
        </Link>
      </nav>

      <section className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{reading.formName}</h1>
        <p className="text-sm text-muted-foreground">
          Visit on <time dateTime={reading.visitedOn}>{formatDueDate(reading.visitedOn)}</time>
          {reading.authorName && <> · Filled in by {reading.authorName}</>}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Values</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {reading.fields.map((field) => {
              const value = reading.values[field.id];
              const text = readingValueText(field, value);
              const empty = !isFilledIn(value);
              return (
                <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 py-2 first:pt-0">
                  <dt className="font-medium">{field.label}</dt>
                  <dd className={empty ? "text-muted-foreground" : "whitespace-pre-wrap"}>{text}</dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>
    </AppFrame>
  );
}
