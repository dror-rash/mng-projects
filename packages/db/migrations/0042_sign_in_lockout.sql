-- Failed sign-ins per hashed email (task 090, SEC-10), read and written only by the sign-in hooks in @repo/auth.
-- Like Better Auth's tables: no row-level security (ADR-0006); app_user gets SELECT, INSERT, UPDATE and DELETE
-- from the default privileges (0020). Holds no email: key is an HMAC of the normalized email.
CREATE TABLE "sign_in_lockout" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"removable_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sign_in_lockout_removable_after_idx" ON "sign_in_lockout" USING btree ("removable_after");