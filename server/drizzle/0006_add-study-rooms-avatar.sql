CREATE TABLE `StudyMember` (
	`id` text PRIMARY KEY NOT NULL,
	`roomId` text NOT NULL,
	`userId` text NOT NULL,
	`joinedAt` integer NOT NULL,
	FOREIGN KEY (`roomId`) REFERENCES `StudyRoom`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `StudyMember_roomId_idx` ON `StudyMember` (`roomId`);--> statement-breakpoint
CREATE INDEX `StudyMember_userId_idx` ON `StudyMember` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `StudyMember_roomId_userId_key` ON `StudyMember` (`roomId`,`userId`);--> statement-breakpoint
CREATE TABLE `StudyRoom` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'COMPETITIVE' NOT NULL,
	`capacity` integer DEFAULT 20 NOT NULL,
	`inviteCode` text NOT NULL,
	`requireInvite` integer DEFAULT true NOT NULL,
	`ownerId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `StudyRoom_inviteCode_unique` ON `StudyRoom` (`inviteCode`);--> statement-breakpoint
CREATE INDEX `StudyRoom_createdAt_idx` ON `StudyRoom` (`createdAt`);--> statement-breakpoint
CREATE TABLE `StudySession` (
	`id` text PRIMARY KEY NOT NULL,
	`roomId` text NOT NULL,
	`userId` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`startedAt` integer NOT NULL,
	`accumulatedMs` integer DEFAULT 0 NOT NULL,
	`pausedAt` integer,
	`endedAt` integer,
	`subject` text,
	FOREIGN KEY (`roomId`) REFERENCES `StudyRoom`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `StudySession_roomId_status_idx` ON `StudySession` (`roomId`,`status`);--> statement-breakpoint
CREATE INDEX `StudySession_userId_startedAt_idx` ON `StudySession` (`userId`,`startedAt`);--> statement-breakpoint
ALTER TABLE `RemoteConfig` ADD `konkurDate` text;--> statement-breakpoint
ALTER TABLE `RemoteConfig` ADD `studyDailyGoalMin` integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE `User` ADD `avatarBase64` text;