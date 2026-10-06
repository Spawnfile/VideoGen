CREATE OR REPLACE FUNCTION audit_row_text(r audit_log) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_array(r.seq, to_char(r.ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    r.actor_type, r.actor_id, r.action, r.subject_type, r.subject_id, r.run_id, r.step_id,
    r.session_id, r.tool_use_id, r.data)::text
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(72720002);
  SELECT coalesce(max(seq), 0) + 1 INTO NEW.seq FROM audit_log;
  SELECT hash INTO prev FROM audit_log WHERE seq = NEW.seq - 1;
  NEW.ts := clock_timestamp();
  NEW.prev_hash := coalesce(prev, repeat('0', 64));
  NEW.hash := encode(sha256(convert_to(NEW.prev_hash || '|' || audit_row_text(NEW), 'UTF8')), 'hex');
  RETURN NEW;
END $$;
