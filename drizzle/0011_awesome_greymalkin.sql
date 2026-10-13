ALTER TABLE `employee_verification_policy` ADD `digilocker_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `secure_id_platform` ADD `digilocker_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `hosted_verification_inflight` ON `hosted_verification_flows` (`tenant_id`,`employee_id`,`product`) WHERE "hosted_verification_flows"."status" IN ('pending','needs_reconciliation');--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_case_tenant_scope` ON `onboarding_cases` (`tenant_id`,`id`);