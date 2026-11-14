"use server";

import { and, eq, getDb, isNull, schema, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";

import { requireSiteChange } from "@/features/access/require-change";
import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { parseContactInput } from "@/features/organizations/contacts/contact-input";
import { requireOrganizationAccess } from "@/features/organizations/require-organization-access";

import { getSiteForUser, listProjectsAtSite } from "./queries";
import { siteInUseMessage } from "./site-in-use";
import { parseSiteInput } from "./site-input";

// Sites and their contacts (task 054): admins only. Each action does its reads and writes in one
// `withAccess` transaction and redirects after it commits. A site someone can't change is "Not found".

/** The form's site, if `userId` can change it (inside their `withAccess`). */
async function requireSite(userId: string, formData: FormData) {
  const siteId = String(formData.get("siteId") ?? "");
  await requireSiteChange(userId, siteId);
  const site = await getSiteForUser(userId, siteId);
  if (!site) {
    throw new Error("Not found");
  }
  return site;
}

/** Sites show on their page and on their customer's (and its parent's) page. */
function revalidateSite(siteId: string) {
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/customers", "layout");
}

export async function createSiteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const customer = await requireOrganizationAccess(session.user.id, String(formData.get("customerId") ?? ""), "customer");
    const input = parseSiteInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    const id = crypto.randomUUID();
    await getDb()
      .insert(schema.site)
      .values({ id, workspaceId: customer.workspaceId, organizationId: customer.id, createdBy: session.user.id, ...input.value });
    return { id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateSite(result.id);
  return redirectFromAction(`/sites/${result.id}`);
}

export async function updateSiteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const site = await requireSite(session.user.id, formData);
    const input = parseSiteInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    await getDb()
      .update(schema.site)
      .set({ ...input.value, updatedAt: new Date() })
      .where(eq(schema.site.id, site.id));
    return { id: site.id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateSite(result.id);
  return redirectFromAction(`/sites/${result.id}`);
}

/**
 * Soft delete: the site and its contacts disappear; an admin restores it from the Deleted page. Not while
 * projects (not deleted) are at it (task 055).
 */
export async function deleteSiteAction(formData: FormData) {
  const session = await requireActionSession();
  const site = await withAccess(session.user.id, async () => {
    const found = await requireSite(session.user.id, formData);
    // The delete page offers no button for a site in use (task 055); a posted form is refused the same way.
    const projects = await listProjectsAtSite(session.user.id, found.id);
    if (projects.length > 0) {
      throw new Error(siteInUseMessage(projects));
    }
    await getDb()
      .update(schema.site)
      .set({ deletedAt: new Date(), deletedBy: session.user.id })
      .where(eq(schema.site.id, found.id));
    return found;
  });
  revalidateSite(site.id);
  return redirectFromAction(`/customers/${site.organizationId}`);
}

/** The form's contact of the site, not deleted. */
function contactOf(formData: FormData, siteId: string) {
  return and(
    eq(schema.siteContact.id, String(formData.get("contactId") ?? "")),
    eq(schema.siteContact.siteId, siteId),
    isNull(schema.siteContact.deletedAt),
  );
}

export async function addSiteContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const site = await requireSite(session.user.id, formData);
    const input = parseContactInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    await getDb().insert(schema.siteContact).values({ id: crypto.randomUUID(), siteId: site.id, ...input.value });
    return { siteId: site.id };
  });
  if (!("siteId" in result)) {
    return result;
  }
  revalidateSite(result.siteId);
  return {};
}

export async function updateSiteContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const site = await requireSite(session.user.id, formData);
    const input = parseContactInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    const updated = await getDb()
      .update(schema.siteContact)
      .set({ ...input.value, updatedAt: new Date() })
      .where(contactOf(formData, site.id))
      .returning({ id: schema.siteContact.id });
    if (updated.length === 0) {
      return invalid("This contact no longer exists", formData);
    }
    return { siteId: site.id };
  });
  if (!("siteId" in result)) {
    return result;
  }
  revalidateSite(result.siteId);
  return redirectFromAction(`/sites/${result.siteId}`);
}

/** Soft delete: an admin restores the contact from the Deleted page. */
export async function removeSiteContactAction(formData: FormData) {
  const session = await requireActionSession();
  const siteId = await withAccess(session.user.id, async () => {
    const site = await requireSite(session.user.id, formData);
    await getDb()
      .update(schema.siteContact)
      .set({ deletedAt: new Date(), deletedBy: session.user.id })
      .where(contactOf(formData, site.id));
    return site.id;
  });
  revalidateSite(siteId);
}
