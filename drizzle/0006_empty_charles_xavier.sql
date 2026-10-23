CREATE TABLE `payment_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attachments_object_key_unique` ON `payment_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `payment_attachments_owner_order_idx` ON `payment_attachments` (`workspace_owner_id`,`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_attachments_payment_idx` ON `payment_attachments` (`payment_id`);