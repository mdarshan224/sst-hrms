CREATE TABLE `private_employee_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`object_key` text NOT NULL,
	`digest` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`category` text NOT NULL,
	`scan_status` text DEFAULT 'quarantined' NOT NULL,
	`uploaded_at` text,
	`scan_at` text,
	`scan_receipt_hash` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`retain_until` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`employee_id`) REFERENCES `employees`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_employee_documents_object_key_unique` ON `private_employee_documents` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `private_document_request` ON `private_employee_documents` (`tenant_id`,`employee_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `private_document_employee` ON `private_employee_documents` (`tenant_id`,`employee_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `verification_role_grants` ADD `can_view_documents` integer DEFAULT 0 NOT NULL;