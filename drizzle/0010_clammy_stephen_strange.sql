CREATE TABLE `document_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`category` text NOT NULL,
	`current_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`,`employee_id`,`current_id`) REFERENCES `private_employee_documents`(`tenant_id`,`employee_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_slot_unique` ON `document_slots` (`tenant_id`,`employee_id`,`category`);--> statement-breakpoint
CREATE TABLE `hosted_verification_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`request_id` text NOT NULL,
	`product` text DEFAULT 'digilocker_consent' NOT NULL,
	`provider_reference` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`url_ciphertext` text,
	`consent_at` text NOT NULL,
	`consent_version` text NOT NULL,
	`consent_valid_until` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hosted_verification_request` ON `hosted_verification_flows` (`tenant_id`,`employee_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `hosted_verification_pending` ON `hosted_verification_flows` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `inapp_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inapp_notification_once` ON `inapp_notifications` (`user_id`,`event_key`);--> statement-breakpoint
CREATE INDEX `inapp_notification_queue` ON `inapp_notifications` (`user_id`,`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `interview_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`interview_id` text NOT NULL,
	`user_id` text NOT NULL,
	`score` integer NOT NULL,
	`decision` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`interview_id`) REFERENCES `recruitment_interviews`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_feedback_once` ON `interview_feedback` (`interview_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `job_publications` (
	`job_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`,`job_id`) REFERENCES `jobs`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `onboarding_case_checks` (
	`check_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`case_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`,`employee_id`,`case_id`) REFERENCES `onboarding_cases`(`tenant_id`,`employee_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`,`check_id`) REFERENCES `employee_verification_checks`(`tenant_id`,`employee_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `onboarding_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`candidate_id` text,
	`offer_id` text,
	`invitation_id` text NOT NULL,
	`template_id` text NOT NULL,
	`template_snapshot` text NOT NULL,
	`user_id` text,
	`creator_id` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`form_ciphertext` text,
	`form_consent_at` text,
	`submitted_at` text,
	`reason` text,
	`reviewer_id` text,
	`approved_at` text,
	`approval_nonce` text,
	`current_check_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`candidate_id`) REFERENCES `candidates`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`candidate_id`,`offer_id`) REFERENCES `recruitment_offers`(`tenant_id`,`candidate_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`template_id`) REFERENCES `onboarding_templates`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_cases_invitation_id_unique` ON `onboarding_cases` (`invitation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_case_scope` ON `onboarding_cases` (`tenant_id`,`employee_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_candidate_once` ON `onboarding_cases` (`tenant_id`,`candidate_id`) WHERE "onboarding_cases"."candidate_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_employee_inflight` ON `onboarding_cases` (`tenant_id`,`employee_id`) WHERE "onboarding_cases"."status" NOT IN ('approved','rejected','revoked');--> statement-breakpoint
CREATE INDEX `onboarding_queue` ON `onboarding_cases` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `onboarding_task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`case_id` text NOT NULL,
	`task_key` text NOT NULL,
	`actor_id` text NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`,`case_id`) REFERENCES `onboarding_cases`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_task_once` ON `onboarding_task_completions` (`case_id`,`task_key`);--> statement-breakpoint
CREATE TABLE `onboarding_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`definition` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_template_scope` ON `onboarding_templates` (`tenant_id`,`id`);--> statement-breakpoint
CREATE TABLE `recruitment_interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`panel` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`candidate_id`) REFERENCES `candidates`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruitment_interview_scope` ON `recruitment_interviews` (`tenant_id`,`id`);--> statement-breakpoint
CREATE TABLE `recruitment_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`terms` text NOT NULL,
	`joining_date` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`maker_id` text NOT NULL,
	`checker_id` text,
	`approved_at` text,
	`accepted_by` text,
	`accepted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`maker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`candidate_id`) REFERENCES `candidates`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruitment_offer_scope` ON `recruitment_offers` (`tenant_id`,`candidate_id`,`id`);--> statement-breakpoint
CREATE TABLE `verification_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`check_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`,`employee_id`,`check_id`) REFERENCES `employee_verification_checks`(`tenant_id`,`employee_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `verification_reconciliation_history` ON `verification_reconciliations` (`check_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workflow_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`lease_id` text,
	`lease_until` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_jobs_dedupe_key_unique` ON `workflow_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `workflow_job_due` ON `workflow_jobs` (`status`,`available_at`);--> statement-breakpoint
ALTER TABLE `employee_verification_checks` ADD `subject_name_hash` text;--> statement-breakpoint
ALTER TABLE `employee_verification_checks` ADD `name_score` integer;--> statement-breakpoint
ALTER TABLE `employee_verification_checks` ADD `purpose` text DEFAULT 'employment_identity' NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_verification_checks` ADD `transport_status` text;--> statement-breakpoint
CREATE UNIQUE INDEX `verification_check_scope` ON `employee_verification_checks` (`tenant_id`,`employee_id`,`id`);--> statement-breakpoint
ALTER TABLE `employee_verification_policy` ADD `name_review_threshold` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `private_employee_documents` ADD `scan_request_id` text;--> statement-breakpoint
ALTER TABLE `private_employee_documents` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `private_employee_documents` ADD `document_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `private_employee_documents` ADD `review_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `private_employee_documents` ADD `reviewer_id` text;--> statement-breakpoint
ALTER TABLE `private_employee_documents` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `private_employee_documents` ADD `review_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `private_document_scope` ON `private_employee_documents` (`tenant_id`,`employee_id`,`id`);--> statement-breakpoint
ALTER TABLE `secure_id_webhook_receipts` ADD `processing_status` text DEFAULT 'unsupported' NOT NULL;--> statement-breakpoint
ALTER TABLE `secure_id_webhook_receipts` ADD `check_id` text;--> statement-breakpoint
ALTER TABLE `secure_id_webhook_receipts` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `verification_role_grants` ADD `can_review_documents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `verification_role_grants` ADD `can_manage_onboarding` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `verification_role_grants` ADD `can_approve_onboarding` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TRIGGER onboarding_case_insert_guard_1 BEFORE INSERT ON onboarding_cases WHEN (1) AND (NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id AND e.status='onboarding')) BEGIN SELECT RAISE(ABORT,'onboarding employee changed'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_case_insert_guard_2 BEFORE INSERT ON onboarding_cases WHEN (1) AND (NOT EXISTS(SELECT 1 FROM invitations i JOIN roles r ON r.id=i.role_id AND r.tenant_id=i.tenant_id WHERE i.id=NEW.invitation_id AND i.tenant_id=NEW.tenant_id AND r.name='Employee' AND NOT EXISTS(SELECT 1 FROM json_each(r.permissions) WHERE value<>'report.view'))) BEGIN SELECT RAISE(ABORT,'unsafe onboarding invitation'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_case_insert_guard_3 BEFORE INSERT ON onboarding_cases WHEN (1) AND ((SELECT count(*) FROM employees WHERE tenant_id=NEW.tenant_id AND status='active')+(SELECT count(*) FROM onboarding_cases WHERE tenant_id=NEW.tenant_id AND status NOT IN('approved','rejected','revoked')) >= (SELECT p.employee_limit FROM plans p JOIN subscriptions s ON s.plan_id=p.id WHERE s.tenant_id=NEW.tenant_id)) BEGIN SELECT RAISE(ABORT,'onboarding employee quota'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_case_identity_guard BEFORE UPDATE OF tenant_id,employee_id,candidate_id,offer_id,template_id,template_snapshot,creator_id ON onboarding_cases BEGIN SELECT RAISE(ABORT,'onboarding identity and policy snapshot are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_approval_guard_1 BEFORE UPDATE OF status ON onboarding_cases WHEN (NEW.status='approved' AND OLD.status<>'approved') AND (OLD.status<>'submitted' OR NEW.user_id IS NULL OR NEW.form_consent_at IS NULL OR NEW.form_ciphertext IS NULL) BEGIN SELECT RAISE(ABORT,'onboarding submission required'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_approval_guard_2 BEFORE UPDATE OF status ON onboarding_cases WHEN (NEW.status='approved' AND OLD.status<>'approved') AND (NEW.reviewer_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'self onboarding review forbidden'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_approval_guard_3 BEFORE UPDATE OF status ON onboarding_cases WHEN (NEW.status='approved' AND OLD.status<>'approved') AND (NOT EXISTS(SELECT 1 FROM invitations i WHERE i.id=NEW.invitation_id AND i.tenant_id=NEW.tenant_id AND i.revoked_at IS NULL AND i.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) BEGIN SELECT RAISE(ABORT,'onboarding invitation expired'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_approval_guard_4 BEFORE UPDATE OF status ON onboarding_cases WHEN (NEW.status='approved' AND OLD.status<>'approved') AND ((json_extract(NEW.template_snapshot,'$.panRequired')=1 OR EXISTS(SELECT 1 FROM employee_verification_policy WHERE tenant_id=NEW.tenant_id AND enabled=1 AND pan_required=1)) AND NOT EXISTS(SELECT 1 FROM employee_verification_checks v JOIN onboarding_case_checks m ON m.check_id=v.id AND m.tenant_id=v.tenant_id AND m.employee_id=v.employee_id WHERE m.case_id=NEW.id AND v.id=NEW.current_check_id AND v.employee_id=NEW.employee_id AND v.tenant_id=NEW.tenant_id AND v.product='pan_lite' AND v.user_id=NEW.user_id AND v.status='verified' AND v.subject_name_hash IS NOT NULL AND v.retain_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND v.review_status IN('approved','not_required') AND ((json_extract(NEW.template_snapshot,'$.hrReviewRequired')<>1 AND NOT EXISTS(SELECT 1 FROM employee_verification_policy WHERE tenant_id=NEW.tenant_id AND hr_review_required=1)) OR v.review_status='approved'))) BEGIN SELECT RAISE(ABORT,'mandatory verification incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_approval_guard_5 BEFORE UPDATE OF status ON onboarding_cases WHEN (NEW.status='approved' AND OLD.status<>'approved') AND (EXISTS(SELECT 1 FROM json_each(NEW.template_snapshot,'$.documents') req WHERE json_extract(req.value,'$.required')=1 AND NOT EXISTS(SELECT 1 FROM document_slots s JOIN private_employee_documents d ON d.id=s.current_id AND d.employee_id=s.employee_id AND d.tenant_id=s.tenant_id WHERE s.tenant_id=NEW.tenant_id AND s.employee_id=NEW.employee_id AND s.category=json_extract(req.value,'$.category') AND d.user_id=NEW.user_id AND d.scan_status='clean' AND d.review_status='approved' AND d.deleted_at IS NULL AND d.retain_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')))) BEGIN SELECT RAISE(ABORT,'required documents incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_approval_guard_6 BEFORE UPDATE OF status ON onboarding_cases WHEN (NEW.status='approved' AND OLD.status<>'approved') AND (EXISTS(SELECT 1 FROM json_each(NEW.template_snapshot,'$.tasks') task WHERE json_extract(task.value,'$.required')=1 AND NOT EXISTS(SELECT 1 FROM onboarding_task_completions WHERE tenant_id=NEW.tenant_id AND case_id=NEW.id AND task_key=json_extract(task.value,'$.key')))) BEGIN SELECT RAISE(ABORT,'joining checklist incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER onboarding_approval_guard_7 BEFORE UPDATE OF status ON onboarding_cases WHEN (NEW.status='approved' AND OLD.status<>'approved') AND (NEW.candidate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM recruitment_offers WHERE id=NEW.offer_id AND tenant_id=NEW.tenant_id AND candidate_id=NEW.candidate_id AND status='accepted' AND accepted_by=NEW.user_id AND accepted_at<=expires_at)) BEGIN SELECT RAISE(ABORT,'offer acceptance required'); END;
--> statement-breakpoint
CREATE TRIGGER document_version_insert_guard_1 BEFORE INSERT ON private_employee_documents WHEN (EXISTS(SELECT 1 FROM document_slots WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND category=NEW.category)) AND (NOT EXISTS(SELECT 1 FROM document_slots WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND category=NEW.category AND current_id=NEW.parent_id AND NEW.document_version=version+1)) BEGIN SELECT RAISE(ABORT,'document version changed'); END;
--> statement-breakpoint
CREATE TRIGGER private_document_identity_guard BEFORE UPDATE OF tenant_id,employee_id,user_id,object_key,digest,mime,size,category,parent_id,document_version ON private_employee_documents BEGIN SELECT RAISE(ABORT,'document identity and bytes are immutable'); END;
