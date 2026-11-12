-- Task 088 (SEC-18): a user who uploaded a file or recorded a visit can be deleted. The user foreign keys clear
-- uploaded_by / created_by (ON DELETE SET NULL), which these two triggers refused as a change of author. They now
-- let an author become null once that user's account is gone, and nothing else: an author is never reassigned to
-- another user, nor cleared while the account exists (app_user may update site_visit.created_by, so a plain "to
-- null" would let an author or an admin disown a visit). The foreign key's action runs after the user row is
-- deleted, so the account is already gone when the trigger looks. Each function is 0034's / 0031's with only that
-- condition changed. A null author matches nobody in the access functions and policies (`created_by = p_user`,
-- `uploaded_by = current_setting(...)` are never true for null).
CREATE OR REPLACE FUNCTION attachment_check()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.visit_id IS DISTINCT FROM OLD.visit_id
    OR (NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
        AND (NEW.uploaded_by IS NOT NULL OR EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.uploaded_by)))
    OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.file_name IS DISTINCT FROM OLD.file_name OR NEW.content_type IS DISTINCT FROM OLD.content_type
  ) THEN
    RAISE EXCEPTION 'an attachment stays what and where it was put' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM project p WHERE p.id = NEW.project_id AND p.workspace_id = NEW.workspace_id) THEN
    RAISE EXCEPTION 'attachment % is not in its project''s workspace', NEW.id USING ERRCODE = '23514';
  END IF;
  IF NEW.visit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM site_visit v WHERE v.id = NEW.visit_id AND v.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'visit % is not one of project %''s', NEW.visit_id, NEW.project_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION site_visit_keep_project()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR (NEW.created_by IS DISTINCT FROM OLD.created_by
         AND (NEW.created_by IS NOT NULL OR EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.created_by))) THEN
    RAISE EXCEPTION 'a visit keeps its project and author' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
