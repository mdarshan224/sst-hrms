CREATE TABLE `employee_verification_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`mode` text NOT NULL,
	`product` text DEFAULT 'pan_lite' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`masked_identifier` text NOT NULL,
	`provider_reference` text,
	`name_matched` integer,
	`dob_matched` integer,
	`pan_status` text,
	`consent_version` text NOT NULL,
	`consent_at` text NOT NULL,
	`policy_version` integer NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`reviewer_id` text,
	`review_reason` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	`retain_until` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_request_unique` ON `employee_verification_checks` (`tenant_id`,`employee_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `verification_inflight_unique` ON `employee_verification_checks` (`tenant_id`,`employee_id`,`product`) WHERE "employee_verification_checks"."status" IN ('pending','needs_reconciliation');--> statement-breakpoint
CREATE INDEX `verification_queue` ON `employee_verification_checks` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `employee_verification_policy` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`pan_required` integer DEFAULT 0 NOT NULL,
	`hr_review_required` integer DEFAULT 1 NOT NULL,
	`retention_days` integer DEFAULT 90 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `secure_id_platform` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'sandbox' NOT NULL,
	`pan_enabled` integer DEFAULT 0 NOT NULL,
	`last_test_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secure_id_webhook_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`body_hash` text NOT NULL,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secure_id_webhook_unique` ON `secure_id_webhook_receipts` (`mode`,`body_hash`);--> statement-breakpoint
CREATE TABLE `verification_role_grants` (
	`role_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`can_view` integer DEFAULT 0 NOT NULL,
	`can_review` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`,`role_id`) REFERENCES `roles`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `tenant_domains` ADD `provider_deployment_version` text;