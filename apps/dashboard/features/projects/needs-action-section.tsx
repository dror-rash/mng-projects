import type { NeedsActionGroup } from "./needs-action";
import type { WhoseMove } from "./stage-checklist";

/** A project as "Needs action" lists it, its text translated by the page. */
export type NeedsActionItem = {
  id: string;
  name: string;
  organizationId: string;
  /** Null when the user may not see it. */
  customerName: string | null;
  stageLabel: string;
  /** "N days" waited. */
  daysText: string;
  /** Whose move it is when the group's name doesn't say it (Ready for next stage under Our move), else null. */
  badge: { move: WhoseMove; label: string } | null;
};

export type NeedsActionList = { group: NeedsActionGroup; label: string; items: NeedsActionItem[]; more: boolean };

export type NeedsActionText = { heading: string; empty: string; viewAll: string };

export function NeedsActionSection(_props: { groups: NeedsActionList[]; text: NeedsActionText; linkCustomers?: boolean }): React.ReactNode {
  throw new Error("not implemented");
}
