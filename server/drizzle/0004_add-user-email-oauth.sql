CREATE TABLE `OauthState` (
	`id` text PRIMARY KEY NOT NULL,
	`stateHash` text NOT NULL,
	`verifier` text NOT NULL,
	`mode` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `OauthState_stateHash_unique` ON `OauthState` (`stateHash`);