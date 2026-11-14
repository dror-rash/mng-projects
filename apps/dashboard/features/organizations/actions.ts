"use server";

import { eq, getDb, schema, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/features/access/require-change";
import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { listParentProjectsAtSitesOf } from "@/features/sites/queries";
import { requireWorkspaceForAction } from "@/features/workspaces/require-workspace";

import { parseOrganizationInput } from "./organization-input";
import { isParentChoice, listProjectsOfCustomer, listSubCompanies } from "./queries";
import { requireOrganizationAccess } from "./require-organization-access";

/** The "Part of" error for a parent the form wouldn't offer (task 053). */
const NOT_A_CHOICE = "Choose a company from the list";

// Each action does its reads and writes in one `withAccess` transaction, and redirects after it commits.

/** Customer names appear on project lists, project and task pages: refresh the whole zone ("/" is /dashboard). */
function revalidateCustomerNames() {
  revalidatePath("/", "layout");
}

export async function createCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    await requireAdmin(session.user.id, workspace.id);
    const input = parseOrganizationInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    const { parentId } = input.value;
    if (parentId && !(await isParentChoice(session.user.id, workspace.id, parentId))) {
      return invalid(NOT_A_CHOICE, formData, "parentId");
    }

    const id = crypto.randomUUID();
    await getDb()
      .insert(schema.organization)
      .values({ id, kind: "customer", ownerId: session.user.id, workspaceId: workspace.id, ...input.value });
    return { id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateCustomerNames();
  return redirectFromAction(`/customers/${result.id}`);
}

export async function updateCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const customer = await requireOrganizationAccess(session.user.id, String(formData.get("customerId") ?? ""), "customer");
    const input = parseOrganizationInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    const { parentId } = input.value;
    if (parentId && customer.hasSubCompanies) {
      return invalid(`${customer.name} has sub-companies, so it can't be part of another company.`, formData, "parentId");
    }
    if (parentId && !(await isParentChoice(session.user.id, customer.workspaceId, parentId, customer.id))) {
      return invalid(NOT_A_CHOICE, formData, "parentId");
    }
    // Leaving a parent whose projects are at this sub-company's sites would put them at another customer's
    // site (task 055; the database refuses it too).
    if (parentId !== undefined && customer.parentId && parentId !== customer.parentId) {
      const projects = await listParentProjectsAtSitesOf(session.user.id, customer.id, customer.parentId);
      if (projects.length > 0) {
        return invalid(`Projects of ${customer.parentName} are at its sites: ${projects.join(", ")}`, formData, "parentId");
      }
    }

    await getDb()
      .update(schema.organization)
      .set({ ...input.value, updatedAt: new Date() })
      .where(eq(schema.organization.id, customer.id));
    return { id: customer.id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateCustomerNames();
  return redirectFromAction(`/customers/${result.id}`);
}

/**
 * Soft delete (design rule 8b): the customer, its contacts and notes disappear (they stay as they are and
 * come back when it is restored). Admins only. A company with sub-companies that aren't deleted stays (task
 * 053): back to its delete page, which says why. So does one with projects (not deleted) for it or at its
 * sites (task 071): the page offers no button then, and a posted form goes back to it too.
 */
export async function deleteCustomerAction(formData: FormData) {
  const session = await requireActionSession();
  const blocked = await withAccess(session.user.id, async () => {
    const customer = await requireOrganizationAccess(session.user.id, String(formData.get("customerId") ?? ""), "customer");
    // Lock the customer and its sites first. A project (for it or at one of its sites) or a sub-company
    // being added holds a key-share lock on one of these rows (its foreign key) until it commits, so the
    // lock waits for it and the checks below then see it. One that starts after this lock but checked the
    // customer before it can still land after the delete: the app's checks aren't a database rule (parked).
    await getDb()
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, customer.id))
      .for("update");
    await getDb()
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(eq(schema.site.organizationId, customer.id))
      .for("update");
    if ((await listSubCompanies(session.user.id, customer.workspaceId, customer.id)).length > 0) {
      return customer.id;
    }
    // The delete page offers no button for a customer in use (task 071) and says why.
    if ((await listProjectsOfCustomer(session.user.id, customer.id)).length > 0) {
      return customer.id;
    }
    await getDb()
      .update(schema.organization)
      .set({ deletedAt: new Date(), deletedBy: session.user.id })
      .where(eq(schema.organization.id, customer.id));
    return null;
  });
  if (blocked) {
    return redirectFromAction(`/customers/${blocked}/delete`);
  }
  revalidateCustomerNames();
  return redirectFromAction("/customers");
}
