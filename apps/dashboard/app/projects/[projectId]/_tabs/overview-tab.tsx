import { mapsLink } from "@/features/sites/maps-link";
import { ProjectSiteSection } from "@/features/sites/project-site-section";
import { getSiteForUser, listSiteContacts } from "@/features/sites/queries";
import { deleteTaskAction, updateTaskStatusAction } from "@/features/tasks/actions";
import { AddTaskForm } from "@/features/tasks/add-task-form";
import { todayUtc } from "@/features/tasks/due-dates";
import { listProjectTasks } from "@/features/tasks/queries";
import { TaskBoard } from "@/features/tasks/task-board";
import { byPriority } from "@/features/tasks/task-priority";

import type { PageProject } from "./types";

/** The Overview tab (task 122): where the work is, and the job's tasks. */
export async function OverviewTab({ userId, project }: { userId: string; project: PageProject }) {
  const [tasks, site] = await Promise.all([listProjectTasks(userId, project.id), getSiteForUser(userId, project.siteId)]);
  // Where the work is (task 055). Every project has a site (task 071); it shows while it isn't deleted.
  const siteContacts = site ? await listSiteContacts(userId, site.id) : [];
  // Most urgent first in each column; tasks arrive oldest first, and the sort keeps that within a priority.
  // Only the fields a card shows cross to the client.
  const boardTasks = [...tasks]
    .sort(byPriority)
    .map(({ id, title, status, priority, dueDate, assigneeName, customerName }) => ({ id, title, status, priority, dueDate, assigneeName, customerName }));

  return (
    <>
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

      {project.canWork && <AddTaskForm projectId={project.id} />}

      <TaskBoard
        projectId={project.id}
        tasks={boardTasks}
        today={todayUtc()}
        moveAction={updateTaskStatusAction}
        deleteAction={project.canChange ? deleteTaskAction : undefined}
        readOnly={!project.canWork}
      />
    </>
  );
}
