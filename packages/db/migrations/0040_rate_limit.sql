-- Better Auth's rate-limit counts in the database, shared by every server instance (task 089, SEC-10).
-- Like Better Auth's other tables: no row-level security (ADR-0006); app_user gets SELECT, INSERT, UPDATE and
-- DELETE from the default privileges (0020). Never read by the app.
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
