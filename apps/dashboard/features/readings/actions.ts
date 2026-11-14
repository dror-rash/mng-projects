"use server";

import { getDb, schema, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";

import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { requireProjectWorkAccess } from "@/features/projects/require-project-access";
import { getProjectVisit } from "@/features/visits/queries";

import { getOpenFormVersion, isMyReading } from "./queries";
import { parseReadingValues } from "./reading-values";

// Readings (task 061, ADR-0008). Whoever can work on the project fills one in on a visit that isn't deleted,
// with the version of a form that is Published now in the project's workspace (row-level security checks it
// again: `can_fill_reading`). Reads and the write run in one `withAccess`; the redirect comes after it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Records a reading under the id the form made in the browser. Sending the same form again inserts nothing
 * and lands on the same reading (`on conflict do nothing`); an id that is any other reading is refused like a
 * tampered form. A visit that isn't the project's (or one the user can't work on) is refused like a made-up one;
 * a version that can't be filled now gets "Choose a form from the list".
 */
export async function createReadingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const userId = session.user.id;
  const result = await withAccess(userId, async () => {
    const project = await requireProjectWorkAccess(userId, String(formData.get("projectId") ?? ""));
    const visit = await getProjectVisit(userId, project.id, String(formData.get("visitId") ?? ""));
    if (!visit) {
      throw new Error("Not found");
    }
    const readingId = String(formData.get("readingId") ?? "");
    if (!UUID.test(readingId)) {
      throw new Error("Invalid reading id");
    }
    const done = { projectId: project.id, visitId: visit.id, readingId };
    // Sent before (a retry, a double click): it is recorded, even if its form has been archived since.
    if (await isMyReading(userId, visit.id, readingId)) {
      return done;
    }
    const version = await getOpenFormVersion(userId, project.workspaceId, String(formData.get("versionId") ?? ""));
    if (!version) {
      return invalid("Choose a form from the list", formData);
    }
    const values = parseReadingValues(formData, version.fields);
    if (!values.ok) {
      return invalid(values.error, formData, values.field);
    }
    const inserted = await getDb()
      .insert(schema.formSubmission)
      .values({ id: readingId, visitId: visit.id, versionId: version.versionId, values: values.value, submittedBy: userId })
      .onConflictDoNothing({ target: schema.formSubmission.id })
      .returning({ id: schema.formSubmission.id });
    if (inserted.length === 0 && !(await isMyReading(userId, visit.id, readingId))) {
      // The id is someone else's reading, or another visit's: refuse it without landing on it. (Mine means the
      // same form was sent twice at once, and the other send recorded it.)
      throw new Error("Not found");
    }
    return done;
  });
  if (!("readingId" in result)) {
    return result;
  }
  revalidatePath(`/projects/${result.projectId}`, "layout");
  return redirectFromAction(`/projects/${result.projectId}/visits/${result.visitId}/readings/${result.readingId}`);
}
