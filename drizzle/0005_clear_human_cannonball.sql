CREATE TABLE `employee_accounts` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`revoked_at` text,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`user_id`) REFERENCES `memberships`(`tenant_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_account_active_user` ON `employee_accounts` (`tenant_id`,`user_id`) WHERE "employee_accounts"."revoked_at" IS NULL;--> statement-breakpoint
CREATE TABLE `employee_activations` (
	`invitation_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`claim_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activation_employee` ON `employee_activations` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `employee_reporting` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`manager_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`manager_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reporting_manager` ON `employee_reporting` (`tenant_id`,`manager_id`);--> statement-breakpoint
CREATE TABLE `profile_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`reason` text NOT NULL,
	`employee_version` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_id` text,
	`reviewer_id` text,
	`review_reason` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_request_pending` ON `profile_requests` (`tenant_id`,`employee_id`) WHERE "profile_requests"."status"='pending';--> statement-breakpoint
CREATE INDEX `profile_request_queue` ON `profile_requests` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_branding` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`accent_color` text DEFAULT '#D9A441' NOT NULL,
	`logo_data` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER activation_tenant_guard BEFORE INSERT ON employee_activations WHEN NOT EXISTS(SELECT 1 FROM invitations i WHERE i.id=NEW.invitation_id AND i.tenant_id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'Activation tenant mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER profile_final_no_update BEFORE UPDATE ON profile_requests WHEN OLD.status!='pending' BEGIN SELECT RAISE(ABORT,'Profile decisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER profile_no_delete BEFORE DELETE ON profile_requests BEGIN SELECT RAISE(ABORT,'Profile history is immutable'); END;
