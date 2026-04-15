ALTER TABLE `novel_promotion_characters`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

UPDATE `novel_promotion_characters` AS `character`
INNER JOIN `novel_promotion_projects` AS `workflow`
  ON `workflow`.`id` = `character`.`novelPromotionProjectId`
SET `character`.`projectId` = `workflow`.`projectId`;

ALTER TABLE `novel_promotion_characters`
  MODIFY COLUMN `projectId` VARCHAR(191) NOT NULL;

ALTER TABLE `novel_promotion_characters`
  DROP FOREIGN KEY `novel_promotion_characters_novelPromotionProjectId_fkey`;

DROP INDEX `novel_promotion_characters_novelPromotionProjectId_idx` ON `novel_promotion_characters`;

ALTER TABLE `novel_promotion_characters`
  DROP COLUMN `novelPromotionProjectId`;

ALTER TABLE `novel_promotion_characters`
  ADD CONSTRAINT `novel_promotion_characters_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `novel_promotion_characters_projectId_idx` ON `novel_promotion_characters`(`projectId`);

ALTER TABLE `novel_promotion_locations`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

UPDATE `novel_promotion_locations` AS `location`
INNER JOIN `novel_promotion_projects` AS `workflow`
  ON `workflow`.`id` = `location`.`novelPromotionProjectId`
SET `location`.`projectId` = `workflow`.`projectId`;

ALTER TABLE `novel_promotion_locations`
  MODIFY COLUMN `projectId` VARCHAR(191) NOT NULL;

ALTER TABLE `novel_promotion_locations`
  DROP FOREIGN KEY `novel_promotion_locations_novelPromotionProjectId_fkey`;

DROP INDEX `novel_promotion_locations_novelPromotionProjectId_idx` ON `novel_promotion_locations`;

ALTER TABLE `novel_promotion_locations`
  DROP COLUMN `novelPromotionProjectId`;

ALTER TABLE `novel_promotion_locations`
  ADD CONSTRAINT `novel_promotion_locations_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `novel_promotion_locations_projectId_idx` ON `novel_promotion_locations`(`projectId`);
