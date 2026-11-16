import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { notFound } from "next/navigation";

import { projectTabPath } from "@/features/projects/project-tabs";
import { getProjectForUser } from "@/features/projects/queries";
import { todayUtc } from "@/features/tasks/due-dates";
import { VisitForm } from "@/features/visits/visit-form";
import { listAssigneeOptions } from "@/features/workspaces/members";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

/** Record a visit (task 058), for whoever can work on the project; anyone else gets "Project not found". */
export default async function NewVisitPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { session } = await requireWorkspace(`/projects/${projectId}/visits/new`);
  const project = await getProjectForUser(session.user.id, projectId);
  if (!project?.canWork) {
    notFound();
  }
  // The project's people: whoever can be assigned its tasks. The recorder is checked when they are one.
  const people = await listAssigneeOptions(session.user.id, project);
  const me = people.some((p) => p.userId === session.user.id) ? [session.user.id] : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            <h1>Record a visit</h1>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </CardHeader>
        <CardContent>
          <VisitForm
            projectId={project.id}
            people={people}
            defaultMemberIds={me}
            today={todayUtc()}
            cancelHref={projectTabPath(project.id, "work")}
          />
        </CardContent>
      </Card>
    </main>
  );
}
