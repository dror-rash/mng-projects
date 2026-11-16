"use client";

import { FieldError } from "@repo/ui/field-error";
import { CheckIcon } from "@repo/ui/icons";
import { cn } from "@repo/ui/lib/utils";
import { useActionState, useEffect, useRef } from "react";

import type { FormState } from "@/features/forms/form-state";

import { projectStage } from "./project-stage";

/** A phase with its stages, in the flow's order, the text translated by the page. */
export type StageBarPhase = { phase: string; label: string; stages: { value: string; label: string }[] };

const noAction = async (): Promise<FormState> => ({});

/**
 * Where the project is in the flow (task 121, ADR-0014): the stages under their phases (`STAGE_PHASES`), the ones
 * behind it checked and "done" for screen readers, the current one ringed and `aria-current="step"`, later ones
 * muted. With `action` (whoever can change the project) every other stage is a submit button in its own form
 * that moves the project there at once, forward or back, before React hydrates too; a refused stage's error
 * shows above the bar. On a narrow screen the bar scrolls inside itself, the current stage scrolled into view.
 */
export function StageBar({
  projectId,
  stage,
  phases,
  label,
  doneLabel,
  action,
}: {
  projectId: string;
  /** The stored stage; an unknown value counts as Inquiry. */
  stage: string;
  phases: StageBarPhase[];
  /** The bar's name, "Stages". */
  label: string;
  /** What a done stage says to screen readers. */
  doneLabel: string;
  action?: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action ?? noAction, {});
  const error = state.field === "stage" ? state.error : undefined;
  const current = projectStage(stage);
  const order = phases.flatMap((p) => p.stages.map((s) => s.value));
  const currentIndex = order.indexOf(current);
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  return (
    <div className="min-w-0 space-y-2">
      <FieldError message={error} />
      <div role="group" aria-label={label} className="overflow-x-auto pb-1">
        <ol className="flex w-max gap-4">
          {phases.map((phase) => (
            <li key={phase.phase} className="space-y-1">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{phase.label}</h2>
              <ol className="flex gap-1">
                {phase.stages.map((s) => {
                  const index = order.indexOf(s.value);
                  const done = index < currentIndex;
                  const isCurrent = s.value === current;
                  const content = (
                    <>
                      {done && <CheckIcon className="size-3.5 text-primary" aria-hidden />}
                      {s.label}
                      {done && <span className="sr-only">, {doneLabel}</span>}
                    </>
                  );
                  const look = cn(
                    "flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-sm",
                    isCurrent && "border-accent font-medium ring-2 ring-accent",
                    done && "text-foreground",
                    !done && !isCurrent && "text-muted-foreground",
                  );
                  return (
                    <li key={s.value} ref={isCurrent ? currentRef : undefined} aria-current={isCurrent ? "step" : undefined}>
                      {action && !isCurrent ? (
                        <form action={formAction}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="stage" value={s.value} />
                          <button
                            type="submit"
                            disabled={pending}
                            className={cn(
                              look,
                              "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
                            )}
                          >
                            {content}
                          </button>
                        </form>
                      ) : (
                        <span className={look}>{content}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
