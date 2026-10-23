CREATE TABLE `public_store_channels` (
	`slug` text PRIMARY KEY NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`store_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_store_channels_workspace_store_unique` ON `public_store_channels` (`workspace_owner_id`,`store_id`);--> statement-breakpoint
CREATE INDEX `public_store_channels_enabled_idx` ON `public_store_channels` (`enabled`);