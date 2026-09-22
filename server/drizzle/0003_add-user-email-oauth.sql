CREATE TABLE `OauthTicket` (
	`id` text PRIMARY KEY NOT NULL,
	`ticketHash` text NOT NULL,
	`userId` text,
	`pendingProfile` text,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `OauthTicket_ticketHash_unique` ON `OauthTicket` (`ticketHash`);--> statement-breakpoint
CREATE INDEX `OauthTicket_userId_idx` ON `OauthTicket` (`userId`);--> statement-breakpoint
ALTER TABLE `User` ADD `email` text;--> statement-breakpoint
ALTER TABLE `User` ADD `googleSub` text;--> statement-breakpoint
ALTER TABLE `User` ADD `githubId` text;--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_unique` ON `User` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `User_googleSub_unique` ON `User` (`googleSub`);--> statement-breakpoint
CREATE UNIQUE INDEX `User_githubId_unique` ON `User` (`githubId`);