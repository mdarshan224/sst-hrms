CREATE TABLE `tenant_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`hostname` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ownership_status` text DEFAULT 'pending' NOT NULL,
	`challenge` text NOT NULL,
	`challenge_expires_at` text NOT NULL,
	`ownership_checked_at` text,
	`provider_id` text,
	`provider_status` text DEFAULT 'unconfigured' NOT NULL,
	`tls_status` text DEFAULT 'unknown' NOT NULL,
	`provider_checked_at` text,
	`cname_target` text,
	`provider_records` text DEFAULT '[]' NOT NULL,
	`routing_status` text DEFAULT 'pending' NOT NULL,
	`routing_checked_at` text,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`session_epoch` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`activated_at` text,
	`verified_until` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_domains_hostname_unique` ON `tenant_domains` (`hostname`);--> statement-breakpoint
CREATE INDEX `tenant_domains_tenant` ON `tenant_domains` (`tenant_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_domains_primary` ON `tenant_domains` (`tenant_id`) WHERE "tenant_domains"."is_primary"=1 AND "tenant_domains"."status"='active';--> statement-breakpoint
ALTER TABLE `otp_challenges` ADD `realm` text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `realm` text DEFAULT 'platform' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER tenant_domain_identity BEFORE UPDATE OF hostname,tenant_id ON tenant_domains
WHEN NEW.hostname<>OLD.hostname OR NEW.tenant_id<>OLD.tenant_id
BEGIN SELECT RAISE(ABORT,'Domain ownership cannot be reassigned'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_domain_active_insert BEFORE INSERT ON tenant_domains
WHEN NEW.status='active' AND (NEW.ownership_status<>'verified' OR NEW.provider_status<>'active' OR NEW.tls_status<>'active' OR NEW.routing_status<>'verified' OR NEW.verified_until IS NULL OR NEW.ownership_checked_at IS NULL OR NEW.provider_checked_at IS NULL OR NEW.routing_checked_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Domain verification incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_domain_active_update BEFORE UPDATE ON tenant_domains
WHEN NEW.status='active' AND (NEW.ownership_status<>'verified' OR NEW.provider_status<>'active' OR NEW.tls_status<>'active' OR NEW.routing_status<>'verified' OR NEW.verified_until IS NULL OR NEW.ownership_checked_at IS NULL OR NEW.provider_checked_at IS NULL OR NEW.routing_checked_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Domain verification incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_domain_removed BEFORE UPDATE ON tenant_domains
WHEN OLD.status='removed'
BEGIN SELECT RAISE(ABORT,'Removed domain is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_domain_no_delete BEFORE DELETE ON tenant_domains
BEGIN SELECT RAISE(ABORT,'Retain domain history; remove the mapping instead'); END;

--> statement-breakpoint
CREATE TRIGGER tenant_domain_valid_insert BEFORE INSERT ON tenant_domains
WHEN NEW.hostname<>lower(NEW.hostname) OR NEW.hostname GLOB '*[^a-z0-9.-]*' OR NEW.status NOT IN('pending','active','disabled','removed') OR NEW.is_primary NOT IN(0,1) OR NEW.version<1 OR NEW.session_epoch<1
BEGIN SELECT RAISE(ABORT,'Invalid normalized domain record'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_domain_valid_update BEFORE UPDATE ON tenant_domains
WHEN NEW.status NOT IN('pending','active','disabled','removed') OR NEW.is_primary NOT IN(0,1) OR NEW.version<1 OR NEW.session_epoch<1
BEGIN SELECT RAISE(ABORT,'Invalid domain state'); END;
