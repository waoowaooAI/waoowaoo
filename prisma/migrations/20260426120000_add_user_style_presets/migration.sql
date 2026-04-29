ALTER TABLE `projects`
  ADD COLUMN `visualStylePresetSource` VARCHAR(191) NOT NULL DEFAULT 'system',
  ADD COLUMN `visualStylePresetId` VARCHAR(191) NOT NULL DEFAULT 'american-comic',
  ADD COLUMN `directorStylePresetSource` VARCHAR(191) NULL;

UPDATE `projects`
SET `visualStylePresetSource` = 'system',
    `visualStylePresetId` = `artStyle`
WHERE `artStyle` IS NOT NULL AND TRIM(`artStyle`) <> '';

UPDATE `projects`
SET `directorStylePresetSource` = 'system'
WHERE `directorStylePresetId` IS NOT NULL AND TRIM(`directorStylePresetId`) <> '';

CREATE TABLE `user_style_presets` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `summary` TEXT NULL,
  `config` LONGTEXT NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `user_style_presets_userId_kind_idx` ON `user_style_presets`(`userId`, `kind`);

ALTER TABLE `user_style_presets`
  ADD CONSTRAINT `user_style_presets_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
