CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit logs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit logs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER candidate_history_no_update BEFORE UPDATE ON candidate_history BEGIN SELECT RAISE(ABORT, 'Candidate decisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER candidate_history_no_delete BEFORE DELETE ON candidate_history BEGIN SELECT RAISE(ABORT, 'Candidate decisions are immutable'); END;
