DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'videogen_app') THEN
    CREATE ROLE videogen_app LOGIN PASSWORD 'videogen_app';
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO videogen_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO videogen_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO videogen_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM videogen_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO videogen_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO videogen_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_row_text(r audit_log) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws('|', r.seq::text,
    to_char(r.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    r.actor_type, coalesce(r.actor_id, ''), r.action,
    coalesce(r.subject_type, ''), coalesce(r.subject_id, ''),
    coalesce(r.run_id, ''), coalesce(r.step_id, ''), coalesce(r.session_id, ''), coalesce(r.tool_use_id, ''),
    coalesce(r.data::text, 'null'))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(72720002);
  SELECT coalesce(max(seq), 0) + 1 INTO NEW.seq FROM audit_log;
  SELECT hash INTO prev FROM audit_log WHERE seq = NEW.seq - 1;
  NEW.prev_hash := coalesce(prev, repeat('0', 64));
  NEW.hash := encode(sha256(convert_to(NEW.prev_hash || '|' || audit_row_text(NEW), 'UTF8')), 'hex');
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_verify() RETURNS TABLE(ok boolean, checked bigint, first_bad_seq bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE r audit_log; prev text := repeat('0', 64); n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY seq LOOP
    n := n + 1;
    IF r.seq <> n OR r.prev_hash <> prev
       OR r.hash <> encode(sha256(convert_to(r.prev_hash || '|' || audit_row_text(r), 'UTF8')), 'hex') THEN
      RETURN QUERY SELECT false, n, r.seq; RETURN;
    END IF;
    prev := r.hash;
  END LOOP;
  RETURN QUERY SELECT true, n, NULL::bigint;
END $$;
