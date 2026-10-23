CREATE TABLE `whatsapp_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`store_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`business_account_id` text DEFAULT '' NOT NULL,
	`display_phone_number` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_channels_phone_number_unique` ON `whatsapp_channels` (`phone_number_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_channels_workspace_store_unique` ON `whatsapp_channels` (`workspace_owner_id`,`store_id`);--> statement-breakpoint
CREATE INDEX `whatsapp_channels_owner_idx` ON `whatsapp_channels` (`workspace_owner_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`phone_number_id` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`error` text,
	`received_at` text NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE INDEX `whatsapp_events_received_idx` ON `whatsapp_events` (`received_at`);