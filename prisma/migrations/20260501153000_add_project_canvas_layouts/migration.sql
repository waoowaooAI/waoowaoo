CREATE TABLE `project_canvas_layouts` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NOT NULL,
  `schemaVersion` INTEGER NOT NULL DEFAULT 1,
  `viewportX` DOUBLE NOT NULL DEFAULT 0,
  `viewportY` DOUBLE NOT NULL DEFAULT 0,
  `zoom` DOUBLE NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `project_canvas_layouts_episodeId_key`(`episodeId`),
  UNIQUE INDEX `project_canvas_layouts_projectId_episodeId_key`(`projectId`, `episodeId`),
  INDEX `project_canvas_layouts_projectId_idx`(`projectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_canvas_node_layouts` (
  `id` VARCHAR(191) NOT NULL,
  `layoutId` VARCHAR(191) NOT NULL,
  `nodeKey` VARCHAR(191) NOT NULL,
  `nodeType` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `x` DOUBLE NOT NULL,
  `y` DOUBLE NOT NULL,
  `width` DOUBLE NOT NULL,
  `height` DOUBLE NOT NULL,
  `zIndex` INTEGER NOT NULL DEFAULT 0,
  `locked` BOOLEAN NOT NULL DEFAULT false,
  `collapsed` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `project_canvas_node_layouts_layoutId_nodeKey_key`(`layoutId`, `nodeKey`),
  INDEX `project_canvas_node_layouts_layoutId_idx`(`layoutId`),
  INDEX `project_canvas_node_layouts_targetType_targetId_idx`(`targetType`, `targetId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_canvas_layouts`
  ADD CONSTRAINT `project_canvas_layouts_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_canvas_layouts`
  ADD CONSTRAINT `project_canvas_layouts_episodeId_fkey`
  FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_canvas_node_layouts`
  ADD CONSTRAINT `project_canvas_node_layouts_layoutId_fkey`
  FOREIGN KEY (`layoutId`) REFERENCES `project_canvas_layouts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
