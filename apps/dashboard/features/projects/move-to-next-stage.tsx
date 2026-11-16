"use client";

import { Button } from "@repo/ui/button";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import type { FormState } from "@/features/forms/form-state";

/**
 * "Move to <next stage>" on the "Next step" card (task 121, ADR-0014), for whoever can change the project. It posts
 * `from=next`; while the stage's checklist has open items the action answers with the question on the `confirm`
 * field, and the card shows it with "Move anyway" (posts again with `confirm=yes`) and "Cancel". Both work before
 * React hydrates: Cancel is a link back to the project page, and with JavaScript it just drops the question and
 * puts focus back on "Move to". The question is an alert, so screen readers announce it when it appears.
 * The page keys this on the project's stage, so a move starts it over.
 */
export function MoveToNextStage({
  projectId,
  stage,
  projectHref,
  label,
  moveAnyway,
  cancel,
  action,
}: {
  projectId: string;
  /** The next stage's stored value. */
  stage: string;
  /** The project page, in this zone (no basePath). */
  projectHref: string;
  /** "Move to <stage>", translated. */
  label: string;
  moveAnyway: string;
  cancel: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  // The answer Cancel dropped: the question shows until the next answer.
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  const question = state.field === "confirm" && state !== dismissed ? state.error : undefined;
  // After Cancel, focus goes back to "Move to" (the link that had it is gone).
  const moveButton = useRef<HTMLButtonElement>(null);
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (refocus && !question) {
      moveButton.current?.focus();
      setRefocus(false);
    }
  }, [refocus, question]);

  const fields = (
    <>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stage" value={stage} />
      <input type="hidden" name="from" value="next" />
    </>
  );

  if (!question) {
    return (
      <form action={formAction}>
        {fields}
        <Button ref={moveButton} type="submit" size="sm" disabled={pending}>{label}</Button>
      </form>
    );
  }
  return (
    <form action={formAction} className="space-y-2 rounded-md border border-accent p-3">
      {fields}
      <input type="hidden" name="confirm" value="yes" />
      <p role="alert" className="font-medium">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>{moveAnyway}</Button>
        <Button asChild variant="outline" size="sm">
          <Link
            href={projectHref}
            onClick={(event) => {
              event.preventDefault();
              setDismissed(state);
              setRefocus(true);
            }}
          >
            {cancel}
          </Link>
        </Button>
      </div>
    </form>
  );
}
