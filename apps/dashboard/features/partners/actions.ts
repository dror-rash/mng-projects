"use server";

import { and, eq, getDb, isNull, schema, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";

import { canChangeCustomer } from "@/features/access/predicates";
import { requireAdmin } from "@/features/access/require-change";
import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { requireWorkspaceForAction } from "@/features/workspaces/require-workspace";

import { parsePartnerName } from "./partner-name";

/** Creates a partner company in the form's workspace (admins only) and opens its page. */
export async function createPartnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    await requireAdmin(session.user.id, workspace.id);
    const name = parsePartnerName(formData.get("name"));
    if (!name.ok) {
      return invalid(name.error, formData, name.field);
    }
    const id = crypto.randomUUID();
    await getDb().insert(schema.partner).values({ id, workspaceId: workspace.id, name: name.name });
    return { id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidatePath("/partners");
  return redirectFromAction(`/partners/${result.id}`);
}

/**
 * The form's partner (not deleted) when `userId` is an admin of its workspace; otherwise throws, the same
 * as a missing partner. Call it inside `withAccess`.
 */
async function requirePartnerChange(userId: string, formData: FormData) {
  const [partner] = await getDb()
    .select({ id: schema.partner.id, workspaceId: schema.partner.workspaceId })
    .from(schema.partner)
    .where(and(eq(schema.partner.id, String(formData.get("partnerId") ?? "")), isNull(schema.partner.deletedAt)));
  if (!partner) {
    throw new Error("Not found");
  }
  await requireAdmin(userId, partner.workspaceId);
  return partner;
}

function revalidatePartner(partnerId: string) {
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
}

const CHOOSE_A_CUSTOMER = "Choose a customer";

/** Assigns one of the workspace's customers to the partner (admins only, design rule 3). */
export async function assignCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const partner = await requirePartnerChange(session.user.id, formData);
    const organizationId = String(formData.get("organizationId") ?? "");
    const [customer] = organizationId
      ? await getDb()
          .select({ id: schema.organization.id })
          .from(schema.organization)
          .where(
            and(
              eq(schema.organization.id, organizationId),
              eq(schema.organization.workspaceId, partner.workspaceId),
              eq(schema.organization.kind, "customer"),
              isNull(schema.organization.deletedAt),
              canChangeCustomer(session.user.id, schema.organization.id),
            ),
          )
      : [];
    if (!customer) {
      return invalid(CHOOSE_A_CUSTOMER, formData, "organizationId");
    }
    await getDb()
      .insert(schema.customerPartner)
      .values({ organizationId: customer.id, partnerId: partner.id, workspaceId: partner.workspaceId })
      .onConflictDoNothing();
    return { id: partner.id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidatePartner(result.id);
  return {};
}

/** Takes a customer away from the partner (admins only). Its projects for that customer are kept, hidden from the partner (design rule 6). */
export async function unassignCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const partnerId = await withAccess(session.user.id, async () => {
    const partner = await requirePartnerChange(session.user.id, formData);
    await getDb()
      .delete(schema.customerPartner)
      .where(
        and(
          eq(schema.customerPartner.partnerId, partner.id),
          eq(schema.customerPartner.organizationId, String(formData.get("organizationId") ?? "")),
        ),
      );
    return partner.id;
  });
  revalidatePartner(partnerId);
  return {};
}

/**
 * Soft-deletes the partner company (admins only, design rule 8c): its users lose access to the workspace
 * and its invite links stop working; its projects stay, for admins and auditors. An admin restores it
 * from the Deleted page, which gives everything back.
 */
export async function deletePartnerAction(formData: FormData) {
  const session = await requireActionSession();
  await withAccess(session.user.id, async () => {
    const partner = await requirePartnerChange(session.user.id, formData);
    await getDb()
      .update(schema.partner)
      .set({ deletedAt: new Date(), deletedBy: session.user.id })
      .where(eq(schema.partner.id, partner.id));
  });
  // Partner names show on the members page and in role choices; projects lose their partner's users.
  revalidatePath("/", "layout");
  return redirectFromAction("/partners");
}
