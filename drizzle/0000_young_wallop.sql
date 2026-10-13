CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_id` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_scope` ON `audit_logs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_scope` ON `branches` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `branch_name` ON `branches` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `candidate_history` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`from_stage` text NOT NULL,
	`to_stage` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`candidate_id`) REFERENCES `candidates`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`job_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`source` text NOT NULL,
	`stage` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`job_id`) REFERENCES `jobs`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_scope` ON `candidates` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_application` ON `candidates` (`tenant_id`,`job_id`,`email`);--> statement-breakpoint
CREATE INDEX `candidate_pipeline` ON `candidates` (`tenant_id`,`stage`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `department_scope` ON `departments` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `department_name` ON `departments` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_code` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`designation` text NOT NULL,
	`department_id` text,
	`branch_id` text,
	`joining_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`department_id`) REFERENCES `departments`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`branch_id`) REFERENCES `branches`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_code` ON `employees` (`tenant_id`,`employee_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `employee_email` ON `employees` (`tenant_id`,`email`);--> statement-breakpoint
CREATE INDEX `employee_search` ON `employees` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`role_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`role_id`) REFERENCES `roles`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`location` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_scope` ON `jobs` (`tenant_id`,`id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`role_id`) REFERENCES `roles`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user` ON `memberships` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`employee_limit` integer NOT NULL,
	`modules` text NOT NULL,
	`price_paise` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_scope` ON `roles` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name` ON `roles` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`brand_color` text DEFAULT '#2563eb' NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`locale` text DEFAULT 'en-IN' NOT NULL,
	`employee_prefix` text DEFAULT 'EMP' NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`stages` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);