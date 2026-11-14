"use server";

import { and, eq, exists, getDb, isNull, schema, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";

import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";

import { requireOrganizationAccess } from "../require-organization-access";
import { parseContactInput } from "./contact-input";

// Each action does its reads and writes in one `withAccess` transaction, and redirects after it commits.

/** The form's contact of the customer, not deleted. */
function contactOf(formData: FormData, organizationId: string) {
  return and(
    eq(schema.organizationContact.id, String(formData.get("contactId") ?? "")),
    eq(schema.organizationContact.organizationId, organizationId),
    isNull(schema.organizationContact.deletedAt),
  );
}

function revalidateCustomer(customerId: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

/** Runs `fn` as the signed-in user (`userId`) with the customer of the form, if they can change it. */
async function withCustomer<T>(formData: FormData, fn: (customer: { id: string }, userId: string) => Promise<T>) {
  const session = await requireActionSession();
  return withAccess(session.user.id, async () =>
    fn(await requireOrganizationAccess(session.user.id, String(formData.get("customerId") ?? ""), "customer"), session.user.id),
  );
}

export async function addContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await withCustomer(formData, async (customer) => {
    const input = parseContactInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }

    await getDb()
      .insert(schema.organizationContact)
      .values({ id: crypto.randomUUID(), organizationId: customer.id, ...input.value });
    return { customerId: customer.id };
  });
  if (!("customerId" in result)) {
    return result;
  }
  revalidateCustomer(result.customerId);
  return {};
}

export async function updateContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await withCustomer(formData, async (customer) => {
    const input = parseContactInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }

    const updated = await getDb()
      .update(schema.organizationContact)
      .set({ ...input.value, updatedAt: new Date() })
      .where(contactOf(formData, customer.id))
      .returning({ id: schema.organizationContact.id });
    if (updated.length === 0) {
      return invalid("This contact no longer exists", formData);
    }
    return { customerId: customer.id };
  });
  if (!("customerId" in result)) {
    return result;
  }
  revalidateCustomer(result.customerId);
  return redirectFromAction(`/customers/${result.customerId}`);
}

/** Soft delete: an admin restores the contact from the Deleted page (still the primary one if it was). */
export async function removeContactAction(formData: FormData) {
  const customerId = await withCustomer(formData, async (customer, userId) => {
    await getDb()
      .update(schema.organizationContact)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(contactOf(formData, customer.id));
    return customer.id;
  });
  revalidateCustomer(customerId);
}

/** Makes the contact the customer's primary one; only a contact of that same customer qualifies. */
export async function makePrimaryContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await withCustomer(formData, async (customer) => {
    const db = getDb();
    const contactId = String(formData.get("contactId") ?? "");
    const updated = await db
      .update(schema.organization)
      .set({ primaryContactId: contactId })
      .where(
        and(
          eq(schema.organization.id, customer.id),
          exists(db.select({ id: schema.organizationContact.id }).from(schema.organizationContact).where(contactOf(formData, customer.id))),
        ),
      )
      .returning({ id: schema.organization.id });
    if (updated.length === 0) {
      return invalid("This contact no longer exists", formData);
    }
    return { customerId: customer.id };
  });
  if (!("customerId" in result)) {
    return result;
  }
  revalidateCustomer(result.customerId);
  return {};
}
