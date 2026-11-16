import { Badge } from "@repo/ui/badge";
import { Card } from "@repo/ui/card";
import { ClockAlertIcon } from "@repo/ui/icons";
import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";

import type { WhoseMove } from "./stage-checklist";
import { WhoseMoveBadge } from "./whose-move-badge";

/** A project as its board card shows it, its text translated by the page. */
export type StageBoardCard = {
  id: string;
  name: string;
  organizationId: string;
  /** Null when the user may not see it. */
  customerName: string | null;
  /** Whose move it is; null on a canceled project, whose `moveLabel` is then "Canceled". */
  move: WhoseMove | null;
  moveLabel: string;
  /** "N days" at the current stage. */
  daysText: string;
  /** More than 7 days at the stage. */
  longWait: boolean;
};

export type StageBoardPhase = {
  phase: string;
  label: string;
  columns: { stage: string; label: string; cards: StageBoardCard[] }[];
};

/**
 * All projects as a board (task 123): the phases as headings, a column per stage named with its count, and a card
 * per project, longest at its stage first (the page orders them). The columns scroll inside the board, so the page
 * doesn't scroll sideways on a phone. The page passes the translated text.
 */
export function StageBoard({
  phases,
  text,
  linkCustomers = true,
}: {
  phases: StageBoardPhase[];
  /** The board's name, an empty column's text, and what a long wait says to a screen reader. */
  text: { label: string; empty: string; longWait: string };
  /** Off for a partner's users, who see customer names but no customer pages. */
  linkCustomers?: boolean;
}) {
  return (
    <section aria-label={text.label} className="min-w-0 overflow-x-auto pb-2">
      <div className="flex w-max gap-6">
        {phases.map((phase) => (
          <div key={phase.phase} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{phase.label}</h2>
            <div className="flex gap-3">
              {phase.columns.map((column) => (
                <section
                  key={column.stage}
                  aria-labelledby={`stage-column-${column.stage}`}
                  className="w-64 shrink-0 space-y-3 rounded-lg bg-muted/50 p-3"
                >
                  <h3 id={`stage-column-${column.stage}`} className="flex items-center justify-between text-sm font-semibold">
                    {column.label}{" "}
                    <span className="rounded-full bg-secondary px-2 text-xs text-secondary-foreground">{column.cards.length}</span>
                  </h3>
                  {column.cards.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{text.empty}</p>
                  ) : (
                    <ul className="space-y-2">
                      {column.cards.map((card) => (
                        <li key={card.id}>
                          <BoardCard card={card} linkCustomers={linkCustomers} longWaitText={text.longWait} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BoardCard({ card, linkCustomers, longWaitText }: { card: StageBoardCard; linkCustomers: boolean; longWaitText: string }) {
  return (
    <Card className="flex flex-col gap-2 p-3 text-sm">
      <Link href={`/projects/${card.id}`} className="font-medium hover:underline">
        {card.name}
      </Link>
      {card.customerName &&
        (linkCustomers ? (
          <Link href={`/customers/${card.organizationId}`} className="text-xs text-muted-foreground hover:underline">
            {card.customerName}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">{card.customerName}</span>
        ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {card.move ? <WhoseMoveBadge move={card.move} label={card.moveLabel} /> : <Badge variant="outline">{card.moveLabel}</Badge>}
        <span className={cn("flex items-center gap-1 text-xs", card.longWait ? "font-medium text-destructive" : "text-muted-foreground")}>
          {card.longWait && <ClockAlertIcon className="size-3.5" aria-hidden />}
          {card.daysText}
          {card.longWait && <span className="sr-only">, {longWaitText}</span>}
        </span>
      </div>
    </Card>
  );
}
