import type { ReactNode } from "react";

/**
 * "<Stage> since <date>" on the project's "Next step" card (task 101, ADR-0012), for everyone who sees the
 * project. Moving the project is the stage bar's (task 121) and "Move to <next stage>"'s.
 */
export function StageSince({ line, since, sinceText }: {
  /** "<Stage> since", translated, the stage's label in its own element. */
  line: ReactNode;
  /** The day of the latest change, "YYYY-MM-DD". */
  since: string;
  /** That day as people read it. */
  sinceText: string;
}) {
  return (
    <p className="text-sm">
      {line} <time dateTime={since}>{sinceText}</time>
    </p>
  );
}
