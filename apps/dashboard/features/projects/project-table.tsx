import { Badge } from "@repo/ui/badge";
import { Meter } from "@repo/ui/meter";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableSortIndicator } from "@repo/ui/table";
import Link from "next/link";

import type { TaskSummary } from "@/features/tasks/progress";

import { nextSort, PROJECT_SORTS, type ProjectSort } from "./project-sort";
import { type ProjectStatus, projectStatusLabel } from "./project-status";

type Project = {
  id: string;
  name: string;
  createdAt: Date;
  organizationId: string;
  /** Null when the user may not see the customer's name. */
  customerName: string | null;
  status: ProjectStatus;
  /** The stage's label, translated (task 101). */
  stageLabel: string;
  overdue: number;
};

const NO_TASKS: TaskSummary = { total: 0, done: 0, open: 0, completionRate: 0 };

/** All projects as rows: one line each, so many projects can be scanned and compared. Headers sort by their column. */
export function ProjectTable({
  projects,
  progress,
  sort,
  sortHref,
  linkCustomers = true,
}: {
  projects: Project[];
  progress: Map<string, TaskSummary>;
  sort: ProjectSort;
  /** The page's URL with this sort, keeping the filters. */
  sortHref: (sort: ProjectSort) => string;
  /** Off for a partner's users, who see customer names but no customer pages. */
  linkCustomers?: boolean;
}) {
  return (
    <Table>
      <TableCaption className="sr-only">Projects</TableCaption>
      <TableHeader>
        <TableRow>
          {PROJECT_SORTS.map(({ column, label }) => {
            const direction = sort.column === column ? (sort.dir === "asc" ? "ascending" : "descending") : undefined;
            return (
              <TableHead key={column} aria-sort={direction}>
                <Link
                  href={sortHref(nextSort(sort, column))}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  {label}
                  <TableSortIndicator direction={direction} />
                </Link>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => {
          const summary = progress.get(project.id) ?? NO_TASKS;
          return (
            <TableRow key={project.id}>
              <TableHead scope="row">
                <Link href={`/projects/${project.id}`} className="hover:underline">
                  {project.name}
                </Link>
              </TableHead>
              <TableCell>
                {project.customerName ? (
                  linkCustomers ? (
                    <Link href={`/customers/${project.organizationId}`} className="hover:underline">
                      {project.customerName}
                    </Link>
                  ) : (
                    project.customerName
                  )
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{projectStatusLabel(project.status)}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">{project.stageLabel}</TableCell>
              <TableCell className="min-w-40 space-y-1">
                <Meter label={`${project.name} progress`} value={summary.completionRate} />
                <div className="text-xs text-muted-foreground">
                  {summary.total === 0 ? "No tasks yet" : `${summary.done} of ${summary.total} done`}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {project.overdue > 0 ? (
                  <span className="font-medium text-destructive">{project.overdue} overdue</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(project.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
