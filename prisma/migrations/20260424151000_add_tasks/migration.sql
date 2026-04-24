CREATE TABLE `tasks` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `progress` INTEGER NOT NULL DEFAULT 0,
  `attempt` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 5,
  `priority` INTEGER NOT NULL DEFAULT 0,
  `dedupeKey` VARCHAR(191) NULL,
  `externalId` VARCHAR(191) NULL,
  `payload` JSON NULL,
  `result` JSON NULL,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `billingInfo` JSON NULL,
  `billedAt` DATETIME(3) NULL,
  `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `enqueuedAt` DATETIME(3) NULL,
  `enqueueAttempts` INTEGER NOT NULL DEFAULT 0,
  `lastEnqueueError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `taskId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `payload` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `tasks_dedupeKey_key` ON `tasks`(`dedupeKey`);
CREATE INDEX `tasks_status_idx` ON `tasks`(`status`);
CREATE INDEX `tasks_type_idx` ON `tasks`(`type`);
CREATE INDEX `tasks_targetType_targetId_idx` ON `tasks`(`targetType`, `targetId`);
CREATE INDEX `tasks_projectId_idx` ON `tasks`(`projectId`);
CREATE INDEX `tasks_userId_idx` ON `tasks`(`userId`);
CREATE INDEX `tasks_heartbeatAt_idx` ON `tasks`(`heartbeatAt`);
CREATE INDEX `task_events_projectId_id_idx` ON `task_events`(`projectId`, `id`);
CREATE INDEX `task_events_taskId_idx` ON `task_events`(`taskId`);
CREATE INDEX `task_events_userId_idx` ON `task_events`(`userId`);

ALTER TABLE `tasks` ADD CONSTRAINT `tasks_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_events` ADD CONSTRAINT `task_events_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_events` ADD CONSTRAINT `task_events_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
