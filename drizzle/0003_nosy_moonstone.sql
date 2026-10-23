CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`sender` text NOT NULL,
	`actor_user_id` text,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_conversation_created_idx` ON `conversation_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `conversation_messages_workspace_idx` ON `conversation_messages` (`workspace_owner_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`store_id` text NOT NULL,
	`channel` text NOT NULL,
	`external_id` text,
	`customer_name` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`mode` text DEFAULT 'ai' NOT NULL,
	`assigned_user_id` text,
	`last_message_preview` text DEFAULT '' NOT NULL,
	`last_message_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_workspace_updated_idx` ON `conversations` (`workspace_owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `conversations_store_status_idx` ON `conversations` (`store_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_external_unique` ON `conversations` (`workspace_owner_id`,`channel`,`external_id`);