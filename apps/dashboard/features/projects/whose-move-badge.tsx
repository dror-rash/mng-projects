import { Badge } from "@repo/ui/badge";
import { cn } from "@repo/ui/lib/utils";

import { type WhoseMove, whoseMoveChartSlot } from "./stage-checklist";

/** The badge's colors by its chart slot (task 118, `whoseMoveChartSlot`); the text stays the foreground's. */
const SLOT_COLORS: Record<ReturnType<typeof whoseMoveChartSlot>, string> = {
  1: "border-chart-1 bg-chart-1/15",
  3: "border-chart-3 bg-chart-3/15",
  4: "border-chart-4 bg-chart-4/15",
};

/** Whose move it is (task 120, ADR-0014): the "Next step" card's badge and the stage board's (task 123). */
export function WhoseMoveBadge({ move, label }: { move: WhoseMove; label: string }) {
  return <Badge className={cn("border text-foreground", SLOT_COLORS[whoseMoveChartSlot(move)])}>{label}</Badge>;
}
