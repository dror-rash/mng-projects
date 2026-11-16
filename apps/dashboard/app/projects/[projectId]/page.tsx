import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { firstParam } from "@/features/navigation/search-params";
import { getOrganizationForUser } from "@/features/organizations/queries";
import { setProjectLifecycleAction } from "@/features/projects/actions";
import { toggleChecklistItemAction } from "@/features/projects/checklist-actions";
import { listChecklistTicks } from "@/features/projects/checklist-queries";
import { nextStep } from "@/features/projects/next-step";
import { NextStepCard } from "@/features/projects/next-step-card";
import { isCanceled, projectLifecycleLabel } from "@/features/projects/project-lifecycle";
import { openProjectTab, parseProjectTab, PROJECT_TABS, projectTabPath } from "@/features/projects/project-tabs";
import { ProjectTabs } from "@/features/projects/project-tabs-nav";
import { getProjectForUser } from "@/features/projects/queries";
import { changeStageAction } from "@/features/projects/stage-actions";
import { StageBar } from "@/features/projects/stage-bar";
import { getStageChangedAt } from "@/features/projects/stage-history";
import { stageLabels } from "@/features/projects/stage-labels";
import { StageSince } from "@/features/projects/stage-since";
import { formatDueDate, todayUtc } from "@/features/tasks/due-dates";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

import { LaterTab } from "./_tabs/later-tab";
import { OverviewTab } from "./_tabs/overview-tab";
import { ReportsTab } from "./_tabs/reports-tab";
import { WorkTab } from "./_tabs/work-tab";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: SearchParams }) {
  const { projectId } = await params;
  // The tab in the address (task 122), kept through sign-in; any other value opens the stage's tab.
  const tabParam = parseProjectTab(firstParam((await searchParams).tab));
  const { session, workspace } = await requireWorkspace(projectTabPath(projectId, tabParam));
  const project = await getProjectForUser(session.user.id, projectId);
  if (!project) {
    notFound();
  }

  // The customer is a link only for those who can open customer pages; partners see its name only. The
  // project it was copied from shows only to those who can see that one too (rule 4a).
  const [customerPage, copiedFrom, stageChangedAt, stages, ticks, tabText] = await Promise.all([
    project.customerName ? getOrganizationForUser(session.user.id, project.organizationId, "customer") : null,
    project.copiedFromId ? getProjectForUser(session.user.id, project.copiedFromId) : null,
    getStageChangedAt(session.user.id, project.id),
    stageLabels(),
    listChecklistTicks(session.user.id, project.id),
    getTranslations("projectTabs"),
  ]);
  // The stage's day (task 101): its latest change, or when the project was made if it has no history yet.
  const stageSince = todayUtc(stageChangedAt ?? project.createdAt);
  // The current stage's checklist and whose move it is (task 120, ADR-0014); a canceled project's too.
  const next = await nextStep(project.stage, ticks);
  const canceled = isCanceled(project.lifecycle);
  // Only the open tab's sections are rendered, so only its queries run (task 122).
  const tab = openProjectTab(tabParam, project.stage);

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, project.workspaceId)} className="max-w-6xl space-y-8 p-6">
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

      {/* Where the job is (task 121): every stage a button for whoever can change the project. */}
      <StageBar
        projectId={project.id}
        stage={project.stage}
        phases={stages.phases}
        label={stages.barLabel}
        doneLabel={stages.doneLabel}
        action={project.canChange ? changeStageAction : undefined}
      />

      <NextStepCard
        projectId={project.id}
        tab={tab}
        {...next}
        stageLine={<StageSince line={stages.since(project.stage)} since={stageSince} sinceText={formatDueDate(stageSince)} />}
        toggleAction={project.canChange ? toggleChecklistItemAction : undefined}
        moveAction={project.canChange ? changeStageAction : undefined}
      />

      <ProjectTabs
        projectId={project.id}
        open={tab}
        tabs={PROJECT_TABS.map((t) => ({ tab: t.tab, label: tabText(t.labelKey) }))}
        label={tabText("label")}
      />

      {tab === "overview" && <OverviewTab userId={session.user.id} project={project} />}
      {tab === "work" && <WorkTab userId={session.user.id} project={project} />}
      {tab === "reports" && <ReportsTab userId={session.user.id} project={project} />}
      {(tab === "sales" || tab === "billing") && <LaterTab tab={tab} />}
    </AppFrame>
  );
}
