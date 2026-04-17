CREATE TABLE `mutation_batches` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `operationId` VARCHAR(191) NULL,
  `summary` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `revertError` TEXT NULL,
  `revertedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `mutation_entries` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `payload` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `mutation_batches_projectId_createdAt_idx` ON `mutation_batches`(`projectId`, `createdAt`);
CREATE INDEX `mutation_batches_userId_createdAt_idx` ON `mutation_batches`(`userId`, `createdAt`);
CREATE INDEX `mutation_entries_batchId_idx` ON `mutation_entries`(`batchId`);
CREATE INDEX `mutation_entries_targetType_targetId_idx` ON `mutation_entries`(`targetType`, `targetId`);

ALTER TABLE `mutation_batches` ADD CONSTRAINT `mutation_batches_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mutation_batches` ADD CONSTRAINT `mutation_batches_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mutation_entries` ADD CONSTRAINT `mutation_entries_batchId_fkey`
  FOREIGN KEY (`batchId`) REFERENCES `mutation_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

