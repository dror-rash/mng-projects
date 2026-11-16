import { type ProjectStage, projectStage } from "./project-stage";

/**
 * Each stage's checklist (task 120, ADR-0014): fixed items in display order, each done by us or by the customer.
 * Ticks are stored per project and item (`project_checklist_tick`, whose check lists the same keys) and stay with
 * their stage when the project moves on. `labelKey` is a key in the `stageChecklist.items` messages (ADR-0011):
 * the caller translates it.
 */
export const STAGE_CHECKLIST = [
  { key: "inquiry.details_recorded", stage: "inquiry", party: "us", labelKey: "inquiryDetailsRecorded" },
  { key: "inquiry.logged", stage: "inquiry", party: "us", labelKey: "inquiryLogged" },
  { key: "quote.costed", stage: "quote", party: "us", labelKey: "quoteCosted" },
  { key: "quote.sent", stage: "quote", party: "us", labelKey: "quoteSent" },
  { key: "quote.accepted", stage: "quote", party: "customer", labelKey: "quoteAccepted" },
  { key: "ordered.work_order", stage: "ordered", party: "customer", labelKey: "orderedWorkOrder" },
  { key: "ordered.payment_terms", stage: "ordered", party: "us", labelKey: "orderedPaymentTerms" },
  { key: "scheduled.date_set", stage: "scheduled", party: "us", labelKey: "scheduledDateSet" },
  { key: "scheduled.crew_assigned", stage: "scheduled", party: "us", labelKey: "scheduledCrewAssigned" },
  { key: "scheduled.customer_confirmed", stage: "scheduled", party: "customer", labelKey: "scheduledCustomerConfirmed" },
  { key: "in_work.visits_done", stage: "in_work", party: "us", labelKey: "inWorkVisitsDone" },
  { key: "in_work.materials_reported", stage: "in_work", party: "us", labelKey: "inWorkMaterialsReported" },
  { key: "in_work.reports_handed_over", stage: "in_work", party: "us", labelKey: "inWorkReportsHandedOver" },
  { key: "reporting.prepared", stage: "reporting", party: "us", labelKey: "reportingPrepared" },
  { key: "reporting.sent", stage: "reporting", party: "us", labelKey: "reportingSent" },
  { key: "reporting.received", stage: "reporting", party: "customer", labelKey: "reportingReceived" },
  { key: "billing.prepared", stage: "billing", party: "us", labelKey: "billingPrepared" },
  { key: "billing.sent", stage: "billing", party: "us", labelKey: "billingSent" },
  { key: "billing.received", stage: "billing", party: "customer", labelKey: "billingReceived" },
  { key: "closed.completion_report", stage: "closed", party: "us", labelKey: "closedCompletionReport" },
] as const satisfies readonly { key: string; stage: ProjectStage; party: "us" | "customer"; labelKey: string }[];

export type ChecklistItem = (typeof STAGE_CHECKLIST)[number];

export type ChecklistItemKey = ChecklistItem["key"];

export type ChecklistParty = ChecklistItem["party"];

/**
 * Whose move it is at a stage (ADR-0014): the first open item decides; with everything done the project is
 * ready for its next stage, or, at Closed, complete.
 */
export const WHOSE_MOVE = ["our_move", "waiting_for_customer", "ready", "complete"] as const;

export type WhoseMove = (typeof WHOSE_MOVE)[number];

const WHOSE_MOVE_LABEL_KEYS = {
  our_move: "ourMove",
  waiting_for_customer: "waitingForCustomer",
  ready: "ready",
  complete: "complete",
} as const satisfies Record<WhoseMove, string>;

/** The badge's message key in `stageChecklist.move`. */
export function whoseMoveLabelKey(move: WhoseMove) {
  return WHOSE_MOVE_LABEL_KEYS[move];
}

export function parseChecklistItem(value: unknown): ChecklistItemKey | null {
  return STAGE_CHECKLIST.find((i) => i.key === value)?.key ?? null;
}

/** A stored stage's items in display order (an unknown stage counts as Inquiry). */
export function checklistFor(stage: string): ChecklistItem[] {
  const current = projectStage(stage);
  return STAGE_CHECKLIST.filter((i) => i.stage === current);
}

/** Whose move it is at `stage`, given the project's ticked item keys (other stages' ticks don't count). */
export function whoseMove(stage: string, doneKeys: readonly string[]): WhoseMove {
  const done = new Set(doneKeys);
  const open = checklistFor(stage).find((i) => !done.has(i.key));
  if (open) return open.party === "us" ? "our_move" : "waiting_for_customer";
  return projectStage(stage) === "closed" ? "complete" : "ready";
}
