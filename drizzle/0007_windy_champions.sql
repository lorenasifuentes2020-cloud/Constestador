CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`store_id` text NOT NULL,
	`position` integer NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_chunks_document_position_unique` ON `knowledge_chunks` (`document_id`,`position`);--> statement-breakpoint
CREATE INDEX `knowledge_chunks_owner_store_idx` ON `knowledge_chunks` (`workspace_owner_id`,`store_id`);--> statement-breakpoint
CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_id` text NOT NULL,
	`store_id` text NOT NULL,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_owner_id`) REFERENCES `workspaces`(`owner_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_documents_object_key_unique` ON `knowledge_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_owner_store_idx` ON `knowledge_documents` (`workspace_owner_id`,`store_id`,`created_at`);