CREATE TABLE `saved_skills` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `summary` TEXT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `data` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `saved_skills_userId_name_key` ON `saved_skills`(`userId`, `name`);
CREATE INDEX `saved_skills_userId_createdAt_idx` ON `saved_skills`(`userId`, `createdAt`);
CREATE INDEX `saved_skills_projectId_createdAt_idx` ON `saved_skills`(`projectId`, `createdAt`);

ALTER TABLE `saved_skills` ADD CONSTRAINT `saved_skills_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `saved_skills` ADD CONSTRAINT `saved_skills_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

