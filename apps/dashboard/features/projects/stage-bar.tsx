"use client";

import { FieldError } from "@repo/ui/field-error";
import { CheckIcon } from "@repo/ui/icons";
import { cn } from "@repo/ui/lib/utils";
import { useActionState, useEffect, useId, useRef } from "react";

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
 * shows above the bar. On a narrow screen the bar scrolls inside itself (focusable for those without buttons
 * on it), the current stage centred when it is out of view; only the bar scrolls, never the page. The phases are
 * h3s under a visually hidden "Stages" h2 that names the group.
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
  const barRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Centre the current stage when it is out of the bar's view. Boxes and scrollLeft are physical (left to right)
  // in both directions, so the same arithmetic holds right to left.
  useEffect(() => {
    const bar = barRef.current;
    const item = currentRef.current;
    if (!bar || !item) return;
    const view = bar.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.left >= view.left && box.right <= view.right) return;
    bar.scrollLeft = bar.scrollLeft + box.left - view.left - (view.width - box.width) / 2;
  }, [current]);

  return (
    <div className="min-w-0 space-y-2">
      <FieldError message={error} />
      <h2 id={headingId} className="sr-only">{label}</h2>
      <div
        ref={barRef}
        role="group"
        aria-labelledby={headingId}
        // Without buttons nothing on the bar takes focus, so the bar itself does, for scrolling by keyboard.
        tabIndex={action ? undefined : 0}
        // `relative`: the visually hidden ", done" texts are positioned, and without a positioned bar they escape its
        // clip once it scrolls (a late stage on a phone, task 122) and the page scrolls sideways.
        className="relative overflow-x-auto pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ol className="flex w-max gap-4">
          {phases.map((phase) => (
            <li key={phase.phase} className="space-y-1">
              <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{phase.label}</h3>
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
