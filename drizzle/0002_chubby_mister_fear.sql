CREATE TABLE `otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`token_hash` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`request_id` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `otp_challenges_mobile_unique` ON `otp_challenges` (`mobile`);--> statement-breakpoint
CREATE UNIQUE INDEX `otp_challenges_token_hash_unique` ON `otp_challenges` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `session_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `support_access` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`reason` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `support_session` ON `support_access` (`session_id`,`tenant_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`verified_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_mobile_unique` ON `users` (`mobile`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `mobile` text;--> statement-breakpoint
ALTER TABLE `tenants` ADD `dashboard_config` text DEFAULT '{"title":"Your people. Your workspace.","subtitle":"Everything you need to move your team forward.","widgets":["metrics","recruitment","actions","people"],"density":"comfortable","hero":"gradient"}' NOT NULL;