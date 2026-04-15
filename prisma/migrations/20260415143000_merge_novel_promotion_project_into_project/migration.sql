ALTER TABLE `projects`
  ADD COLUMN `analysisModel` VARCHAR(191) NULL,
  ADD COLUMN `imageModel` VARCHAR(191) NULL,
  ADD COLUMN `videoModel` VARCHAR(191) NULL,
  ADD COLUMN `audioModel` VARCHAR(191) NULL,
  ADD COLUMN `videoRatio` VARCHAR(191) NOT NULL DEFAULT '9:16',
  ADD COLUMN `globalAssetText` LONGTEXT NULL,
  ADD COLUMN `artStyle` VARCHAR(191) NOT NULL DEFAULT 'american-comic',
  ADD COLUMN `artStylePrompt` LONGTEXT NULL,
  ADD COLUMN `characterModel` VARCHAR(191) NULL,
  ADD COLUMN `locationModel` VARCHAR(191) NULL,
  ADD COLUMN `storyboardModel` VARCHAR(191) NULL,
  ADD COLUMN `editModel` VARCHAR(191) NULL,
  ADD COLUMN `videoResolution` VARCHAR(191) NOT NULL DEFAULT '720p',
  ADD COLUMN `capabilityOverrides` LONGTEXT NULL,
  ADD COLUMN `lastEpisodeId` VARCHAR(191) NULL,
  ADD COLUMN `imageResolution` VARCHAR(191) NOT NULL DEFAULT '2K',
  ADD COLUMN `importStatus` VARCHAR(191) NULL;

UPDATE `projects` AS `p`
JOIN `novel_promotion_projects` AS `npp`
  ON `npp`.`projectId` = `p`.`id`
SET
  `p`.`analysisModel` = `npp`.`analysisModel`,
  `p`.`imageModel` = `npp`.`imageModel`,
  `p`.`videoModel` = `npp`.`videoModel`,
  `p`.`audioModel` = `npp`.`audioModel`,
  `p`.`videoRatio` = `npp`.`videoRatio`,
  `p`.`globalAssetText` = `npp`.`globalAssetText`,
  `p`.`artStyle` = `npp`.`artStyle`,
  `p`.`artStylePrompt` = `npp`.`artStylePrompt`,
  `p`.`characterModel` = `npp`.`characterModel`,
  `p`.`locationModel` = `npp`.`locationModel`,
  `p`.`storyboardModel` = `npp`.`storyboardModel`,
  `p`.`editModel` = `npp`.`editModel`,
  `p`.`videoResolution` = `npp`.`videoResolution`,
  `p`.`capabilityOverrides` = `npp`.`capabilityOverrides`,
  `p`.`lastEpisodeId` = `npp`.`lastEpisodeId`,
  `p`.`imageResolution` = `npp`.`imageResolution`,
  `p`.`importStatus` = `npp`.`importStatus`;

DROP TABLE `novel_promotion_projects`;
