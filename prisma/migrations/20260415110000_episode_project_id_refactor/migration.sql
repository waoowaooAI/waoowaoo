ALTER TABLE `novel_promotion_episodes`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

UPDATE `novel_promotion_episodes` episode
JOIN `novel_promotion_projects` workflow
  ON workflow.id = episode.novelPromotionProjectId
SET episode.projectId = workflow.projectId;

ALTER TABLE `novel_promotion_episodes`
  MODIFY COLUMN `projectId` VARCHAR(191) NOT NULL;

ALTER TABLE `novel_promotion_episodes`
  DROP FOREIGN KEY `novel_promotion_episodes_novelPromotionProjectId_fkey`;

DROP INDEX `novel_promotion_episodes_novelPromotionProjectId_episodeNumb_key` ON `novel_promotion_episodes`;
DROP INDEX `novel_promotion_episodes_novelPromotionProjectId_idx` ON `novel_promotion_episodes`;

ALTER TABLE `novel_promotion_episodes`
  DROP COLUMN `novelPromotionProjectId`;

ALTER TABLE `novel_promotion_episodes`
  ADD CONSTRAINT `novel_promotion_episodes_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX `novel_promotion_episodes_projectId_episodeNumber_key`
  ON `novel_promotion_episodes`(`projectId`, `episodeNumber`);

CREATE INDEX `novel_promotion_episodes_projectId_idx`
  ON `novel_promotion_episodes`(`projectId`);
