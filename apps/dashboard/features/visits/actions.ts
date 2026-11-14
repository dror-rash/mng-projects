"use server";

import { and, eq, getDb, schema, sql, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";

import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { requireProjectWorkAccess } from "@/features/projects/require-project-access";
import { todayUtc } from "@/features/tasks/due-dates";
import { isAssignable } from "@/features/workspaces/members";

import { getProjectVisit } from "./queries";
import { parseVisitInput, type VisitInput } from "./visit-input";

// Site visits (task 058). Whoever can work on the project records them; the author and admins change them
// (row-level security and `delete_visit` check it again). Each action does its reads and writes in one
// `withAccess` transaction and redirects after it commits.

type Project = Awaited<ReturnType<typeof requireProjectWorkAccess>>;

/** Whether everyone in `memberIds` is one of the project's people (who can be assigned its tasks). */
async function allMembersAllowed(project: Project, memberIds: string[]) {
  for (const id of memberIds) {
    if (!(await isAssignable(id, project))) return false;
  }
  return true;
}

/** The parsed form, or the form error to show (inside `withAccess`). */
async function readVisit(project: Project, formData: FormData): Promise<{ value: VisitInput } | { refused: FormState }> {
  const input = parseVisitInput(formData, todayUtc());
  if (!input.ok) {
    return { refused: invalid(input.error, formData, input.field) };
  }
  if (!(await allMembersAllowed(project, input.value.memberIds))) {
    return { refused: invalid("Choose who was there from the list", formData, "memberIds") };
  }
  return { value: input.value };
}

async function setMembers(visitId: string, memberIds: string[]) {
  const db = getDb();
  await db.delete(schema.siteVisitMember).where(eq(schema.siteVisitMember.visitId, visitId));
  await db.insert(schema.siteVisitMember).values(memberIds.map((userId) => ({ visitId, userId })));
}

function revalidateVisits(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/deleted");
}

/** Whether `visitId` is a visit `userId` recorded on the project: a form they sent before (inside `withAccess`). */
async function isMyVisit(userId: string, projectId: string, visitId: string) {
  const [row] = await getDb()
    .select({ id: schema.siteVisit.id })
    .from(schema.siteVisit)
    .where(and(eq(schema.siteVisit.id, visitId), eq(schema.siteVisit.projectId, projectId), eq(schema.siteVisit.createdBy, userId)));
  return row !== undefined;
}

/**
 * Records a visit under the id the form made in the browser. Sending the same form again inserts nothing
 * and lands on the same visit (`on conflict do nothing`), so a retried send never records it twice. An id
 * that belongs to any other visit is refused.
 */
export async function createVisitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const project = await requireProjectWorkAccess(session.user.id, String(formData.get("projectId") ?? ""));
    const read = await readVisit(project, formData);
    if ("refused" in read) {
      return read.refused;
    }
    const { visitId, memberIds, ...fields } = read.value;
    const inserted = await getDb()
      .insert(schema.siteVisit)
      .values({ id: visitId, projectId: project.id, createdBy: session.user.id, ...fields })
      .onConflictDoNothing({ target: schema.siteVisit.id })
      .returning({ id: schema.siteVisit.id });
    if (inserted.length > 0) {
      await setMembers(visitId, memberIds);
    } else if (!(await isMyVisit(session.user.id, project.id, visitId))) {
      // The id is someone else's visit (anywhere): refuse it like a tampered form, without landing on it.
      throw new Error("Not found");
    }
    return { projectId: project.id, visitId };
  });
  if (!("visitId" in result)) {
    return result;
  }
  revalidateVisits(result.projectId);
  return redirectFromAction(`/projects/${result.projectId}/visits/${result.visitId}`);
}

/** The visit of the form's project, if the user may change it; otherwise the not-found refusal. */
async function requireChangeableVisit(userId: string, project: Project, formData: FormData) {
  const visit = await getProjectVisit(userId, project.id, String(formData.get("visitId") ?? ""));
  if (!visit?.canChange) {
    throw new Error("Not found");
  }
  return visit;
}

export async function updateVisitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const project = await requireProjectWorkAccess(session.user.id, String(formData.get("projectId") ?? ""));
    const visit = await requireChangeableVisit(session.user.id, project, formData);
    const read = await readVisit(project, formData);
    if ("refused" in read) {
      return read.refused;
    }
    const { visitedOn, notes, memberIds } = read.value;
    await getDb()
      .update(schema.siteVisit)
      .set({ visitedOn, notes, updatedAt: new Date() })
      .where(and(eq(schema.siteVisit.id, visit.id), eq(schema.siteVisit.projectId, project.id)));
    await setMembers(visit.id, memberIds);
    return { projectId: project.id, visitId: visit.id };
  });
  if (!("visitId" in result)) {
    return result;
  }
  revalidateVisits(result.projectId);
  return redirectFromAction(`/projects/${result.projectId}/visits/${result.visitId}`);
}

/** Soft delete (design rule 8) through `delete_visit`; an admin restores it from the Deleted page. */
export async function deleteVisitAction(formData: FormData) {
  const session = await requireActionSession();
  const projectId = await withAccess(session.user.id, async () => {
    const project = await requireProjectWorkAccess(session.user.id, String(formData.get("projectId") ?? ""));
    const visit = await requireChangeableVisit(session.user.id, project, formData);
    const { rows } = await getDb().execute<{ deleted: boolean }>(sql`select delete_visit(${visit.id}) as deleted`);
    if (rows[0]?.deleted !== true) {
      throw new Error("Not found");
    }
    return project.id;
  });
  revalidateVisits(projectId);
  return redirectFromAction(`/projects/${projectId}`);
}
