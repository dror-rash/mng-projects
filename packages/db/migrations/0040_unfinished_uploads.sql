CREATE INDEX "attachment_unconfirmed_idx" ON "attachment" USING btree ("workspace_id","uploaded_by","created_at") WHERE "attachment"."confirmed_at" is null;--> statement-breakpoint
-- Task 087 (register SEC-07, cleanup part): an upload is recorded unconfirmed before the browser sends the
-- file, and confirmed when it comes back. One that never comes back (a dropped connection, a closed tab, or
-- on purpose) is stale after an hour (its signed URL lasts 15 minutes, so nothing can still be arriving).
--
-- Whoever starts an upload clears their workspace's stale uploads first: whoever may work on the project
-- (p_project) deletes the stale uploads of that project's workspace, whoever left them (a deleted uploader
-- too), and gets their storage keys back to remove the stored objects. Only unconfirmed rows past the cutoff,
-- only in that workspace, and only keys under the workspace's own prefix. Unconfirmed uploads are visible to
-- their uploader alone (attachment_select), so clearing someone else's changes nothing anyone else sees.
-- Anyone else (an auditor, another partner's user, a user of another workspace, no user, a made-up project)
-- clears nothing.
CREATE FUNCTION clear_stale_uploads(p_project text)
RETURNS SETOF text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller text := current_setting('app.user_id', true);
  v_workspace text;
BEGIN
  IF coalesce(v_caller, '') = '' OR NOT can_work_on_project(v_caller, p_project) THEN
    RETURN;
  END IF;
  SELECT p.workspace_id INTO v_workspace FROM project p WHERE p.id = p_project;
  RETURN QUERY
    DELETE FROM attachment a
    WHERE a.workspace_id = v_workspace
      AND a.confirmed_at IS NULL
      AND a.created_at < localtimestamp - interval '1 hour'
      AND starts_with(a.storage_key, v_workspace || '/')
    RETURNING a.storage_key;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION clear_stale_uploads(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION clear_stale_uploads(text) TO app_user;
