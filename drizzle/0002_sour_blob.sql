CREATE TABLE `workspace_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_audit_owner_created_idx` ON `workspace_audit_log` (`workspace_owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workspace_audit_actor_idx` ON `workspace_audit_log` (`actor_user_id`);