"use client";

import { Button } from "@repo/ui/button";
import { FieldError } from "@repo/ui/field-error";
import { NativeSelect } from "@repo/ui/native-select";
import { type ReactNode, useActionState } from "react";

import type { FormState } from "@/features/forms/form-state";

import { parseProjectStage } from "./project-stage";

type StageOption = { value: string; label: string };

const noAction = async (): Promise<FormState> => ({});

/**
 * A project's stage on its page (task 101, ADR-0012): "<Stage> since <date>" for everyone who sees the project,
 * and, with `action` (whoever can change it), a Stage select and "Change stage". The page passes the server
 * action and the translated text, so this stays free of server code.
 */
export function StageControl({
  projectId,
  stage,
  options,
  line,
  since,
  sinceText,
  action,
}: {
  projectId: string;
  /** The stored stage, chosen in the select to start with. */
  stage: string;
  /** Every stage in order, with its label. */
  options: StageOption[];
  /** "<Stage> since", translated, the stage's label in its own element. */
  line: ReactNode;
  /** The day of the latest change, "YYYY-MM-DD". */
  since: string;
  /** That day as people read it. */
  sinceText: string;
  action?: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action ?? noAction, {});
  // After a refused value that isn't a stage (a tampered form), the select starts over from the current one.
  const chosen = parseProjectStage(state.values?.stage) ?? stage;
  const error = state.field === "stage" ? state.error : undefined;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <p className="text-sm">
        {line} <time dateTime={since}>{sinceText}</time>
      </p>
      {action && (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="space-y-1">
            <label htmlFor="stage" className="text-sm font-medium">Stage</label>
            {/* Keyed on the value: a select only applies defaultValue when it mounts. */}
            <NativeSelect
              key={chosen}
              id="stage"
              name="stage"
              defaultValue={chosen}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "stage-error" : undefined}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>Change stage</Button>
          <FieldError id="stage-error" message={error} />
        </form>
      )}
    </div>
  );
}
