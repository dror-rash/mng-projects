import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { FilterChip } from "@repo/ui/filter-chip";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { canChange, canSeeCustomers } from "@/features/access/scope";
import { AppFrame } from "@/features/layout/app-frame";
import { firstParam, withParams } from "@/features/navigation/search-params";
import { listCustomerNames } from "@/features/organizations/customer-names";
import { listChecklistTicksForProjects } from "@/features/projects/checklist-queries";
import { ProjectFilterForm } from "@/features/projects/project-filter-form";
import { filterParams, filterProjects, parseProjectFilters, type ProjectFilters } from "@/features/projects/project-filters";
import { ProjectList } from "@/features/projects/project-list";
import { parseProjectSort, type ProjectSort, sortParams, sortProjects } from "@/features/projects/project-sort";
import { projectStatus } from "@/features/projects/project-status";
import { ProjectTable } from "@/features/projects/project-table";
import { listProjects } from "@/features/projects/queries";
import { StageBoard } from "@/features/projects/stage-board-view";
import { stageBoard } from "@/features/projects/stage-board-data";
import { listStageChangedAt } from "@/features/projects/stage-history";
import { stageLabels } from "@/features/projects/stage-labels";
import { todayUtc } from "@/features/tasks/due-dates";
import { groupStatusCountsByProject, summarizeProjectStatusCounts } from "@/features/tasks/progress";
import { countOverdueTasksByProject, countTasksByProjectAndStatus } from "@/features/tasks/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = ["customer", "status", "stage", "overdue", "q", "view", "sort", "dir"] as const;

export default async function AllProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Customers are checked once the workspace is known; come back to the same filters after login.
  const { session, workspace } = await requireWorkspace(
    withParams("/projects", Object.fromEntries(FILTER_KEYS.map((key) => [key, firstParam(params[key])]))),
  );

  const [projects, projectCounts, overdue, customers, stages, t] = await Promise.all([
    listProjects(session.user.id, workspace.id),
    countTasksByProjectAndStatus(session.user.id, workspace.id),
    countOverdueTasksByProject(session.user.id, workspace.id, todayUtc()),
    listCustomerNames(session.user.id, workspace.id),
    stageLabels(),
    getTranslations("stageBoard"),
  ]);
  const filters = parseProjectFilters(params, customers.map((c) => c.id));
  const sort = parseProjectSort(params);
  const countsByProject = groupStatusCountsByProject(projectCounts);
  const progress = summarizeProjectStatusCounts(projectCounts);
  const rows = projects.map((p) => ({
    ...p,
    status: projectStatus(countsByProject.get(p.id) ?? [], p.lifecycle),
    stageLabel: stages.label(p.stage),
    overdue: overdue.get(p.id) ?? 0,
    progress: progress.get(p.id)?.completionRate ?? 0,
  }));
  const shown = sortProjects(filterProjects(rows, filters), sort);
  // The stage board (task 123): whose move and since when, for the listed projects only (no queries otherwise).
  const boardIds = filters.view === "board" ? shown.map((p) => p.id) : [];
  const [ticks, changedAt] = await Promise.all([
    listChecklistTicksForProjects(session.user.id, workspace.id, boardIds),
    listStageChangedAt(session.user.id, workspace.id, boardIds),
  ]);
  const board = filters.view === "board" ? await stageBoard(shown, ticks, changedAt, todayUtc()) : null;
  // Each link changes one thing and keeps the rest.
  const link = (next: Partial<ProjectFilters>, nextSort: ProjectSort = sort) =>
    withParams("/projects", { ...filterParams({ ...filters, ...next }), ...sortParams(nextSort) });
  const clearFilters = link({ customer: undefined, status: undefined, stage: undefined, overdue: false, q: undefined });

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">All projects</h1>
        {canChange(workspace.role) && (
          <Button asChild>
            <Link href="/projects/new">New project</Link>
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-muted-foreground">
          {canChange(workspace.role) ? "No projects yet. Add your first one with “New project”." : "No projects yet."}
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <ProjectFilterForm
              key={JSON.stringify(filters)}
              filters={filters}
              sortParams={sortParams(sort)}
              customers={customers}
              stages={stages.options}
            />
            <nav aria-label="View" className="flex gap-2">
              <FilterChip selected={filters.view === "table"}>
                <Link href={link({ view: "table" })}>Table</Link>
              </FilterChip>
              <FilterChip selected={filters.view === "tiles"}>
                <Link href={link({ view: "tiles" })}>Tiles</Link>
              </FilterChip>
              <FilterChip selected={filters.view === "board"}>
                <Link href={link({ view: "board" })}>{t("view")}</Link>
              </FilterChip>
            </nav>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {shown.length === projects.length
              ? `${projects.length} ${projects.length === 1 ? "project" : "projects"}`
              : `${shown.length} of ${projects.length} projects`}
            {shown.length !== projects.length && (
              <>
                {" · "}
                <Link href={clearFilters} className="underline">Clear filters</Link>
              </>
            )}
          </p>

          {shown.length === 0 ? (
            <Card className="border-dashed p-8 text-center text-muted-foreground">No projects match these filters.</Card>
          ) : board ? (
            <StageBoard phases={board.phases} text={board.text} linkCustomers={canSeeCustomers(workspace.role)} />
          ) : filters.view === "tiles" ? (
            <ProjectList projects={shown} progress={progress} linkCustomers={canSeeCustomers(workspace.role)} />
          ) : (
            <ProjectTable
              projects={shown}
              progress={progress}
              sort={sort}
              sortHref={(next) => link({}, next)}
              linkCustomers={canSeeCustomers(workspace.role)}
            />
          )}
        </>
      )}
    </AppFrame>
  );
}
