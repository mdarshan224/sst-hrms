CREATE TABLE `tenant_slug_aliases` (
	`slug` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tenant_slug_aliases_tenant` ON `tenant_slug_aliases` (`tenant_id`);
--> statement-breakpoint
CREATE TRIGGER tenants_slug_alias_insert BEFORE INSERT ON tenants
WHEN EXISTS(SELECT 1 FROM tenant_slug_aliases WHERE slug=NEW.slug AND tenant_id<>NEW.id)
BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: reserved workspace slug'); END;
--> statement-breakpoint
CREATE TRIGGER tenants_slug_alias_update BEFORE UPDATE OF slug ON tenants
WHEN EXISTS(SELECT 1 FROM tenant_slug_aliases WHERE slug=NEW.slug AND tenant_id<>NEW.id)
BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: reserved workspace slug'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_slug_alias_current BEFORE INSERT ON tenant_slug_aliases
WHEN EXISTS(SELECT 1 FROM tenants WHERE slug=NEW.slug AND id<>NEW.tenant_id)
BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: reserved workspace slug'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_slug_alias_immutable_update BEFORE UPDATE ON tenant_slug_aliases
BEGIN SELECT RAISE(ABORT, 'Workspace redirects are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_slug_alias_immutable_delete BEFORE DELETE ON tenant_slug_aliases
BEGIN SELECT RAISE(ABORT, 'Workspace redirects are immutable'); END;
