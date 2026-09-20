CREATE TABLE `Notification` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `Notification_createdAt_idx` ON `Notification` (`createdAt`);