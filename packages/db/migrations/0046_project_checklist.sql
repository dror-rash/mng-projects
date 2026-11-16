CREATE TABLE "project_checklist_tick" (
	"project_id" text NOT NULL,
	"item" text NOT NULL,
	"ticked_by" text,
	"ticked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_checklist_tick_project_id_item_pk" PRIMARY KEY("project_id","item"),
	CONSTRAINT "project_checklist_tick_item_check" CHECK ("project_checklist_tick"."item" in ('inquiry.details_recorded', 'inquiry.logged', 'quote.costed', 'quote.sent', 'quote.accepted', 'ordered.work_order', 'ordered.payment_terms', 'scheduled.date_set', 'scheduled.crew_assigned', 'scheduled.customer_confirmed', 'in_work.visits_done', 'in_work.materials_reported', 'in_work.reports_handed_over', 'reporting.prepared', 'reporting.sent', 'reporting.received', 'billing.prepared', 'billing.sent', 'billing.received', 'closed.completion_report'))
);
--> statement-breakpoint
ALTER TABLE "project_checklist_tick" ADD CONSTRAINT "project_checklist_tick_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_checklist_tick" ADD CONSTRAINT "project_checklist_tick_ticked_by_user_id_fk" FOREIGN KEY ("ticked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Task 120 (ADR-0014): the ticks follow their project, like its stage history (0045). Whoever sees the project
-- (can_see_project, so not once it's deleted) reads them; whoever can change the project ticks an item, as
-- themselves, and unticks it. A tick is never changed: no update policy and no update privilege, so a later
-- permissive policy can't open it by accident.
ALTER TABLE project_checklist_tick ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY project_checklist_tick_select ON project_checklist_tick FOR SELECT
  USING (can_see_project(current_setting('app.user_id', true), project_id));
--> statement-breakpoint
CREATE POLICY project_checklist_tick_insert ON project_checklist_tick FOR INSERT
  WITH CHECK (
    ticked_by = current_setting('app.user_id', true)
    AND can_change_project(current_setting('app.user_id', true), project_id)
  );
--> statement-breakpoint
CREATE POLICY project_checklist_tick_delete ON project_checklist_tick FOR DELETE
  USING (can_change_project(current_setting('app.user_id', true), project_id));
--> statement-breakpoint
REVOKE UPDATE ON project_checklist_tick FROM app_user;
--> statement-breakpoint
-- The time of a tick is the database's: the runtime role inserts every column but ticked_at (as 0045 for
-- changed_at), so ticked_at always comes from its default.
REVOKE INSERT ON project_checklist_tick FROM app_user;
--> statement-breakpoint
GRANT INSERT (project_id, item, ticked_by) ON project_checklist_tick TO app_user;
