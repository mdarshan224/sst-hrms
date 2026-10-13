CREATE TABLE `employee_history` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`snapshot` text NOT NULL,
	`effective_date` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employee_history_lookup` ON `employee_history` (`tenant_id`,`employee_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `job_organization` (
	`job_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`branch_id` text,
	`department_id` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`job_id`) REFERENCES `jobs`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`branch_id`) REFERENCES `branches`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`department_id`) REFERENCES `departments`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `membership_revocations` (
	`membership_id` text PRIMARY KEY NOT NULL,
	`revoked_at` text NOT NULL,
	`restored_at` text,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `role_scopes` (
	`role_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`branch_id` text,
	`department_id` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`role_id`) REFERENCES `roles`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`branch_id`) REFERENCES `branches`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`department_id`) REFERENCES `departments`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `updated_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `employee_scope` ON `employees` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `employee_org` ON `employees` (`tenant_id`,`branch_id`,`department_id`,`status`);