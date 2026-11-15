CREATE TABLE "project_stage_change" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"changed_by" text,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_stage_change_from_check" CHECK ("project_stage_change"."from_stage" is null or "project_stage_change"."from_stage" in ('inquiry', 'quote', 'ordered', 'scheduled', 'in_work', 'reporting', 'billing', 'closed')),
	CONSTRAINT "project_stage_change_to_check" CHECK ("project_stage_change"."to_stage" in ('inquiry', 'quote', 'ordered', 'scheduled', 'in_work', 'reporting', 'billing', 'closed'))
);
--> statement-breakpoint
-- Task 101 (ADR-0012): projects that exist now are In work (canceled ones too; their lifecycle stays), each with a
-- first history row by nobody, dated when the project was made; new projects start at Inquiry.
ALTER TABLE "project" ADD COLUMN "stage" text DEFAULT 'in_work' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "stage" SET DEFAULT 'inquiry';--> statement-breakpoint
ALTER TABLE "project_stage_change" ADD CONSTRAINT "project_stage_change_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_change" ADD CONSTRAINT "project_stage_change_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_stage_change_project_idx" ON "project_stage_change" USING btree ("project_id","changed_at");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_stage_check" CHECK ("project"."stage" in ('inquiry', 'quote', 'ordered', 'scheduled', 'in_work', 'reporting', 'billing', 'closed'));--> statement-breakpoint
INSERT INTO project_stage_change (id, project_id, from_stage, to_stage, changed_by, changed_at)
  SELECT gen_random_uuid()::text, id, NULL, 'in_work', NULL, created_at FROM project;
--> statement-breakpoint
-- The history follows its project: whoever sees the project (can_see_project, so not once it's deleted) reads
-- it; whoever can change the project adds to it, as themselves, recording the stage the project is now at (the
-- action updates the project first, in the same transaction). Append-only: no update or delete policy, and no
-- update or delete privilege, so a later permissive policy can't open it by accident (as 0039 for readings).
ALTER TABLE project_stage_change ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY project_stage_change_select ON project_stage_change FOR SELECT
  USING (can_see_project(current_setting('app.user_id', true), project_id));
--> statement-breakpoint
CREATE POLICY project_stage_change_insert ON project_stage_change FOR INSERT
  WITH CHECK (
    changed_by = current_setting('app.user_id', true)
    AND can_change_project(current_setting('app.user_id', true), project_id)
    AND to_stage = (SELECT p.stage FROM project p WHERE p.id = project_id)
  );
--> statement-breakpoint
REVOKE UPDATE, DELETE ON project_stage_change FROM app_user;
--> statement-breakpoint
-- The time of a change is the database's: the runtime role inserts every column but changed_at (as 0034 does for
-- attachment updates), so changed_at always comes from its default.
REVOKE INSERT ON project_stage_change FROM app_user;
--> statement-breakpoint
GRANT INSERT (id, project_id, from_stage, to_stage, changed_by) ON project_stage_change TO app_user;
