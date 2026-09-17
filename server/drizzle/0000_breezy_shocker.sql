CREATE TABLE `Answer` (
	`id` text PRIMARY KEY NOT NULL,
	`sessionId` text NOT NULL,
	`questionId` text NOT NULL,
	`selectedOption` integer,
	`isCorrect` integer,
	`timeSpentMs` integer DEFAULT 0 NOT NULL,
	`answeredAt` integer NOT NULL,
	FOREIGN KEY (`sessionId`) REFERENCES `ExamSession`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Answer_sessionId_idx` ON `Answer` (`sessionId`);--> statement-breakpoint
CREATE INDEX `Answer_answeredAt_idx` ON `Answer` (`answeredAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `Answer_sessionId_questionId_key` ON `Answer` (`sessionId`,`questionId`);--> statement-breakpoint
CREATE TABLE `ArchiveFile` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`field` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer,
	`fileUrl` text,
	`answerUrl` text,
	`questionPath` text,
	`answerPath` text,
	`institutionId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ArchiveFile_field_year_idx` ON `ArchiveFile` (`field`,`year`);--> statement-breakpoint
CREATE INDEX `ArchiveFile_institutionId_idx` ON `ArchiveFile` (`institutionId`);--> statement-breakpoint
CREATE TABLE `Book` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`field` text,
	`order` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `Book_field_idx` ON `Book` (`field`);--> statement-breakpoint
CREATE TABLE `ChatMessage` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`sender` text NOT NULL,
	`text` text NOT NULL,
	`createdAt` integer NOT NULL,
	`readAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ChatMessage_userId_createdAt_idx` ON `ChatMessage` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `ExamSession` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`moduleId` text NOT NULL,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`startedAt` integer NOT NULL,
	`finishedAt` integer,
	`durationSec` integer NOT NULL,
	`totalQuestions` integer NOT NULL,
	`correctCount` integer DEFAULT 0 NOT NULL,
	`wrongCount` integer DEFAULT 0 NOT NULL,
	`skippedCount` integer DEFAULT 0 NOT NULL,
	`scorePercent` integer DEFAULT 0 NOT NULL,
	`negativeMarking` integer DEFAULT true NOT NULL,
	`isPractice` integer DEFAULT false NOT NULL,
	`questionOrder` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moduleId`) REFERENCES `Module`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ExamSession_userId_status_idx` ON `ExamSession` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `ExamSession_status_isPractice_idx` ON `ExamSession` (`status`,`isPractice`);--> statement-breakpoint
CREATE TABLE `Institution` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Institution_name_unique` ON `Institution` (`name`);--> statement-breakpoint
CREATE TABLE `Module` (
	`id` text PRIMARY KEY NOT NULL,
	`bookId` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`order` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Module_bookId_idx` ON `Module` (`bookId`);--> statement-breakpoint
CREATE TABLE `Question` (
	`id` text PRIMARY KEY NOT NULL,
	`moduleId` text NOT NULL,
	`text` text NOT NULL,
	`imageBase64` text,
	`options` text NOT NULL,
	`correctOption` integer NOT NULL,
	`explanation` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`moduleId`) REFERENCES `Module`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Question_moduleId_idx` ON `Question` (`moduleId`);--> statement-breakpoint
CREATE TABLE `RefreshToken` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`tokenHash` text NOT NULL,
	`family` text NOT NULL,
	`userAgent` text,
	`ip` text,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`revokedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `RefreshToken_tokenHash_unique` ON `RefreshToken` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `RefreshToken_userId_idx` ON `RefreshToken` (`userId`);--> statement-breakpoint
CREATE INDEX `RefreshToken_family_idx` ON `RefreshToken` (`family`);--> statement-breakpoint
CREATE TABLE `RemoteConfig` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`siteLocked` integer DEFAULT false NOT NULL,
	`lockMessage` text DEFAULT '' NOT NULL,
	`bannerText` text DEFAULT '' NOT NULL,
	`bannerLink` text DEFAULT '' NOT NULL,
	`bannerActive` integer DEFAULT false NOT NULL,
	`defaultTimerMin` integer DEFAULT 20 NOT NULL,
	`negativeMarking` integer DEFAULT true NOT NULL,
	`registrationOpen` integer DEFAULT true NOT NULL,
	`registrationMessage` text DEFAULT '' NOT NULL,
	`externalApiKeyHash` text,
	`externalApiKeyPrefix` text DEFAULT '' NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`passwordHash` text NOT NULL,
	`field` text NOT NULL,
	`role` text DEFAULT 'STUDENT' NOT NULL,
	`prefs` text DEFAULT '{}' NOT NULL,
	`totalTests` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_username_unique` ON `User` (`username`);