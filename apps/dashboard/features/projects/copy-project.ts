"use server";

import { withAccess } from "@repo/db";

import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { requireWorkspaceForAction } from "@/features/workspaces/require-workspace";

import { copyProject } from "./copy";
import { parseProjectInput } from "./project-input";
import { checkCustomerAndSite, newProjectOwner } from "./project-owner-check";
import { getProjectForUser } from "./queries";
import { revalidateOverviews } from "./revalidate";

/**
 * The copy page's form (rule 4a): a new project from `sourceId`, with the chosen name, customer, site and owner
 * (partners: their own partner; admins: the Owner select). Posts the source's `workspaceId`, where the
 * copy goes. Redirects to the new project.
 */
export async function copyProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const sourceId = String(formData.get("sourceId") ?? "");
  const result = await withAccess(session.user.id, async () => {
    const source = await getProjectForUser(session.user.id, sourceId);
    // Someone else's project, a made-up id, or a form posted for another workspace: all look missing.
    if (!source?.canChange || source.workspaceId !== workspace.id) {
      throw new Error("Not found");
    }
    const owner = await newProjectOwner(session.user.id, workspace, formData);
    if (!owner) {
      return invalid("Choose an owner", formData, "owner");
    }
    const input = parseProjectInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData);
    }
    const customerError = owner.partnerId && workspace.role === "admin" ? "Choose a customer assigned to this partner" : "Choose one of your customers";
    const checked = await checkCustomerAndSite(workspace.id, owner.partnerId, input.value, formData, customerError);
    if (!checked.ok) {
      return checked.state;
    }
    const id = await copyProject(session.user.id, source.id, {
      name: checked.value.name,
      ownerPartnerId: owner.partnerId,
      customerId: checked.value.organizationId,
      siteId: checked.value.siteId,
    });
    return { id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateOverviews();
  return redirectFromAction(`/projects/${result.id}`);
}
