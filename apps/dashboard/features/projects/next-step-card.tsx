import { Badge } from "@repo/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { CheckIcon } from "@repo/ui/icons";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import type { FormState } from "@/features/forms/form-state";

import { MoveToNextStage } from "./move-to-next-stage";
import { type WhoseMove, whoseMoveChartSlot } from "./stage-checklist";

/** A checklist item as the card shows it, its text translated by the page. */
export type NextStepItem = {
  key: string;
  label: string;
  /** "Us" or "Customer", translated. */
  party: string;
  done: boolean;
  /** Who ticked it; null when not done, or once their account is deleted. */
  tickedBy: string | null;
  /** The day it was ticked, "YYYY-MM-DD", and as people read it; null when not done. */
  tickedOn: string | null;
  tickedOnText: string | null;
};

/** The badge's colors by its chart slot (task 118, `whoseMoveChartSlot`); the text stays the foreground's. */
const SLOT_COLORS: Record<ReturnType<typeof whoseMoveChartSlot>, string> = {
  1: "border-chart-1 bg-chart-1/15",
  3: "border-chart-3 bg-chart-3/15",
  4: "border-chart-4 bg-chart-4/15",
};

/**
 * The project page's "Next step" (task 120, ADR-0014): the stage line, whose move it is, "N of M done" and the
 * current stage's checklist. With `toggleAction` (whoever can change the project) each item is a submit button in
 * its own form, so it works before React hydrates; without it the same list has no buttons. With `moveTo` and
 * `moveAction` (task 121: there is a next stage and whoever can change the project) the card ends with "Move to
 * <next stage>", which asks first while items are open. The page passes the server actions and the translated
 * text, so this stays free of server code.
 */
export function NextStepCard({
  projectId,
  heading,
  stageLine,
  move,
  moveLabel,
  progress,
  doneLabel,
  openLabel,
  items,
  toggleAction,
  moveTo,
  moveAction,
}: {
  projectId: string;
  heading: string;
  /** "<Stage> since <date>", with the stage form for those who can change it. */
  stageLine: ReactNode;
  move: WhoseMove;
  moveLabel: string;
  /** "N of M done", translated. */
  progress: string;
  /** What the check box says to a screen reader on a read-only list. */
  doneLabel: string;
  openLabel: string;
  items: NextStepItem[];
  toggleAction?: (formData: FormData) => void | Promise<void>;
  /** The next stage's stored value and the button's and question's text, translated; none at Closed. */
  moveTo?: { stage: string; label: string; moveAnyway: string; cancel: string };
  moveAction?: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  return (
    <section aria-labelledby="next-step-heading">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle id="next-step-heading" className="text-base">{heading}</CardTitle>
            <Badge className={cn("border text-foreground", SLOT_COLORS[whoseMoveChartSlot(move)])}>{moveLabel}</Badge>
          </div>
          {stageLine}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">{progress}</p>
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0">
                {toggleAction ? (
                  <form action={toggleAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="item" value={item.key} />
                    <input type="hidden" name="done" value={item.done ? "false" : "true"} />
                    <button
                      type="submit"
                      aria-pressed={item.done}
                      className="flex items-center gap-2 rounded-md text-start hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <CheckBox done={item.done} />
                      {item.label}
                    </button>
                  </form>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckBox done={item.done} label={item.done ? doneLabel : openLabel} />
                    {item.label}
                  </span>
                )}
                <Badge variant="outline">{item.party}</Badge>
                {item.done && item.tickedOn && (
                  <span className="text-muted-foreground">
                    {item.tickedBy && `${item.tickedBy}, `}
                    <time dateTime={item.tickedOn}>{item.tickedOnText}</time>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {moveTo && moveAction && (
            <MoveToNextStage
              key={moveTo.stage}
              projectId={projectId}
              projectHref={`/projects/${projectId}`}
              action={moveAction}
              {...moveTo}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** A drawn check box: hidden inside a button (`aria-pressed` says it), an image with `label` on a read-only list. */
function CheckBox({ done, label }: { done: boolean; label?: string }) {
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
        done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground",
      )}
    >
      {done && <CheckIcon className="size-3" aria-hidden />}
    </span>
  );
}
