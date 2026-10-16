CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`member_user_id` text,
	`member_email` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`workspace_label` text NOT NULL,
	`owner_email` text NOT NULL,
	`invited_by` text NOT NULL,
	`invited_at` text NOT NULL,
	`joined_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_owner_email_unique` ON `workspace_members` (`workspace_owner_id`,`member_email`);--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`member_user_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_email_idx` ON `workspace_members` (`member_email`);