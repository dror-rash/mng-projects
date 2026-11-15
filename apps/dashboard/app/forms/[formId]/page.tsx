import { Badge } from "@repo/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { addFieldAction, archiveFormAction, publishFormAction, removeFieldAction } from "@/features/reading-forms/actions";
import { AddFieldForm } from "@/features/reading-forms/add-field-form";
import { FormActionButton } from "@/features/reading-forms/form-action-button";
import { FormFieldsSection } from "@/features/reading-forms/form-fields-section";
import { formStatusLabel } from "@/features/reading-forms/form-status";
import { getReadingFormForUser } from "@/features/reading-forms/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

/**
 * A reading form (task 060): its status, description and fields. Admins build a draft (add and remove
 * fields), publish it, and archive a published one. Admins and auditors only; anyone else, and a form of a
 * workspace they aren't in, gets "Form not found".
 */
export default async function ReadingFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const { session, workspace } = await requireWorkspace(`/forms/${formId}`);
  const form = await getReadingFormForUser(session.user.id, formId);
  if (!form) {
    notFound();
  }
  const hidden = { workspaceId: form.workspaceId, formId: form.id };
  const editing = form.canChange && form.status === "draft";

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, form.workspaceId)} className="max-w-3xl space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/forms" className="hover:underline">Reading forms</Link>
      </nav>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{form.name}</h1>
          <Badge variant="outline">{formStatusLabel(form.status)}</Badge>
        </div>
        {form.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{form.description}</p>}
      </div>

      <FormFieldsSection
        fields={form.fields}
        {...(editing
          ? {
              removeAction: removeFieldAction,
              hidden,
              addForm: <AddFieldForm action={addFieldAction} workspaceId={form.workspaceId} formId={form.id} />,
            }
          : {})}
      />

      {editing && (
        <section aria-labelledby="publish-heading" className="space-y-2">
          <h2 id="publish-heading" className="text-base font-semibold">Publish</h2>
          <p className="text-sm text-muted-foreground">
            Once you publish it, technicians can fill it in and its fields can&apos;t change: to change them later, archive
            it and build a new form.
          </p>
          <FormActionButton action={publishFormAction} hidden={hidden}>Publish</FormActionButton>
        </section>
      )}
      {form.canChange && form.status === "published" && (
        <section aria-labelledby="archive-heading" className="space-y-2">
          <h2 id="archive-heading" className="text-base font-semibold">Archive</h2>
          <p className="text-sm text-muted-foreground">Once you archive it, technicians can no longer fill it in. Readings already taken stay.</p>
          <FormActionButton action={archiveFormAction} hidden={hidden} variant="outline">Archive</FormActionButton>
        </section>
      )}
    </AppFrame>
  );
}
