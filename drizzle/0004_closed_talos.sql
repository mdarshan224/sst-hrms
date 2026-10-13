ALTER TABLE `jobs` ADD `version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER employee_history_no_update BEFORE UPDATE ON employee_history BEGIN SELECT RAISE(ABORT, 'Employee history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER employee_history_no_delete BEFORE DELETE ON employee_history BEGIN SELECT RAISE(ABORT, 'Employee history is immutable'); END;
