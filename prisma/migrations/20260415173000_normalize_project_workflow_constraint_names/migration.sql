ALTER TABLE `project_characters`
  RENAME INDEX `novel_promotion_characters_customVoiceMediaId_idx` TO `project_characters_customVoiceMediaId_idx`,
  RENAME INDEX `novel_promotion_characters_projectId_idx` TO `project_characters_projectId_idx`;

ALTER TABLE `project_characters`
  DROP FOREIGN KEY `novel_promotion_characters_customVoiceMediaId_fkey`,
  DROP FOREIGN KEY `novel_promotion_characters_projectId_fkey`,
  ADD CONSTRAINT `project_characters_customVoiceMediaId_fkey`
    FOREIGN KEY (`customVoiceMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_characters_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_clips`
  RENAME INDEX `novel_promotion_clips_episodeId_idx` TO `project_clips_episodeId_idx`;

ALTER TABLE `project_clips`
  DROP FOREIGN KEY `novel_promotion_clips_episodeId_fkey`,
  ADD CONSTRAINT `project_clips_episodeId_fkey`
    FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_episodes`
  RENAME INDEX `novel_promotion_episodes_audioMediaId_idx` TO `project_episodes_audioMediaId_idx`,
  RENAME INDEX `novel_promotion_episodes_projectId_episodeNumber_key` TO `project_episodes_projectId_episodeNumber_key`,
  RENAME INDEX `novel_promotion_episodes_projectId_idx` TO `project_episodes_projectId_idx`;

ALTER TABLE `project_episodes`
  DROP FOREIGN KEY `novel_promotion_episodes_audioMediaId_fkey`,
  DROP FOREIGN KEY `novel_promotion_episodes_projectId_fkey`,
  ADD CONSTRAINT `project_episodes_audioMediaId_fkey`
    FOREIGN KEY (`audioMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_episodes_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_locations`
  RENAME INDEX `novel_promotion_locations_projectId_idx` TO `project_locations_projectId_idx`;

ALTER TABLE `project_locations`
  DROP FOREIGN KEY `novel_promotion_locations_projectId_fkey`,
  DROP FOREIGN KEY `novel_promotion_locations_selectedImageId_fkey`,
  ADD CONSTRAINT `project_locations_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_locations_selectedImageId_fkey`
    FOREIGN KEY (`selectedImageId`) REFERENCES `location_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_panels`
  RENAME INDEX `novel_promotion_panels_imageMediaId_idx` TO `project_panels_imageMediaId_idx`,
  RENAME INDEX `novel_promotion_panels_lipSyncVideoMediaId_idx` TO `project_panels_lipSyncVideoMediaId_idx`,
  RENAME INDEX `novel_promotion_panels_previousImageMediaId_idx` TO `project_panels_previousImageMediaId_idx`,
  RENAME INDEX `novel_promotion_panels_sketchImageMediaId_idx` TO `project_panels_sketchImageMediaId_idx`,
  RENAME INDEX `novel_promotion_panels_storyboardId_idx` TO `project_panels_storyboardId_idx`,
  RENAME INDEX `novel_promotion_panels_storyboardId_panelIndex_key` TO `project_panels_storyboardId_panelIndex_key`,
  RENAME INDEX `novel_promotion_panels_videoMediaId_idx` TO `project_panels_videoMediaId_idx`;

ALTER TABLE `project_panels`
  DROP FOREIGN KEY `novel_promotion_panels_imageMediaId_fkey`,
  DROP FOREIGN KEY `novel_promotion_panels_lipSyncVideoMediaId_fkey`,
  DROP FOREIGN KEY `novel_promotion_panels_previousImageMediaId_fkey`,
  DROP FOREIGN KEY `novel_promotion_panels_sketchImageMediaId_fkey`,
  DROP FOREIGN KEY `novel_promotion_panels_storyboardId_fkey`,
  DROP FOREIGN KEY `novel_promotion_panels_videoMediaId_fkey`,
  ADD CONSTRAINT `project_panels_imageMediaId_fkey`
    FOREIGN KEY (`imageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_panels_lipSyncVideoMediaId_fkey`
    FOREIGN KEY (`lipSyncVideoMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_panels_previousImageMediaId_fkey`
    FOREIGN KEY (`previousImageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_panels_sketchImageMediaId_fkey`
    FOREIGN KEY (`sketchImageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_panels_storyboardId_fkey`
    FOREIGN KEY (`storyboardId`) REFERENCES `project_storyboards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_panels_videoMediaId_fkey`
    FOREIGN KEY (`videoMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_shots`
  RENAME INDEX `novel_promotion_shots_clipId_idx` TO `project_shots_clipId_idx`,
  RENAME INDEX `novel_promotion_shots_episodeId_idx` TO `project_shots_episodeId_idx`,
  RENAME INDEX `novel_promotion_shots_imageMediaId_idx` TO `project_shots_imageMediaId_idx`,
  RENAME INDEX `novel_promotion_shots_shotId_idx` TO `project_shots_shotId_idx`;

ALTER TABLE `project_shots`
  DROP FOREIGN KEY `novel_promotion_shots_clipId_fkey`,
  DROP FOREIGN KEY `novel_promotion_shots_episodeId_fkey`,
  DROP FOREIGN KEY `novel_promotion_shots_imageMediaId_fkey`,
  ADD CONSTRAINT `project_shots_clipId_fkey`
    FOREIGN KEY (`clipId`) REFERENCES `project_clips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_shots_episodeId_fkey`
    FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_shots_imageMediaId_fkey`
    FOREIGN KEY (`imageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_storyboards`
  RENAME INDEX `novel_promotion_storyboards_clipId_idx` TO `project_storyboards_clipId_idx`,
  RENAME INDEX `novel_promotion_storyboards_clipId_key` TO `project_storyboards_clipId_key`,
  RENAME INDEX `novel_promotion_storyboards_episodeId_idx` TO `project_storyboards_episodeId_idx`;

ALTER TABLE `project_storyboards`
  DROP FOREIGN KEY `novel_promotion_storyboards_clipId_fkey`,
  DROP FOREIGN KEY `novel_promotion_storyboards_episodeId_fkey`,
  ADD CONSTRAINT `project_storyboards_clipId_fkey`
    FOREIGN KEY (`clipId`) REFERENCES `project_clips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_storyboards_episodeId_fkey`
    FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_voice_lines`
  RENAME INDEX `novel_promotion_voice_lines_audioMediaId_idx` TO `project_voice_lines_audioMediaId_idx`,
  RENAME INDEX `novel_promotion_voice_lines_episodeId_idx` TO `project_voice_lines_episodeId_idx`,
  RENAME INDEX `novel_promotion_voice_lines_episodeId_lineIndex_key` TO `project_voice_lines_episodeId_lineIndex_key`,
  RENAME INDEX `novel_promotion_voice_lines_matchedPanelId_idx` TO `project_voice_lines_matchedPanelId_idx`;

ALTER TABLE `project_voice_lines`
  DROP FOREIGN KEY `novel_promotion_voice_lines_audioMediaId_fkey`,
  DROP FOREIGN KEY `novel_promotion_voice_lines_episodeId_fkey`,
  DROP FOREIGN KEY `novel_promotion_voice_lines_matchedPanelId_fkey`,
  ADD CONSTRAINT `project_voice_lines_audioMediaId_fkey`
    FOREIGN KEY (`audioMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `project_voice_lines_episodeId_fkey`
    FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_voice_lines_matchedPanelId_fkey`
    FOREIGN KEY (`matchedPanelId`) REFERENCES `project_panels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
