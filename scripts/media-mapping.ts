export type MediaFieldMapping = {
  legacyField: string
  mediaIdField: string
}

export type MediaModelMapping = {
  model: string
  tableName: string
  fields: MediaFieldMapping[]
}

export const MEDIA_MODEL_MAPPINGS: MediaModelMapping[] = [
  {
    model: 'characterAppearance',
    tableName: 'character_appearances',
    fields: [{ legacyField: 'imageUrl', mediaIdField: 'imageMediaId' }],
  },
  {
    model: 'locationImage',
    tableName: 'location_images',
    fields: [{ legacyField: 'imageUrl', mediaIdField: 'imageMediaId' }],
  },
  {
    model: 'projectCharacter',
    tableName: 'project_characters',
    fields: [{ legacyField: 'customVoiceUrl', mediaIdField: 'customVoiceMediaId' }],
  },
  {
    model: 'projectEpisode',
    tableName: 'project_episodes',
    fields: [{ legacyField: 'audioUrl', mediaIdField: 'audioMediaId' }],
  },
  {
    model: 'projectPanel',
    tableName: 'project_panels',
    fields: [
      { legacyField: 'imageUrl', mediaIdField: 'imageMediaId' },
      { legacyField: 'videoUrl', mediaIdField: 'videoMediaId' },
      { legacyField: 'lipSyncVideoUrl', mediaIdField: 'lipSyncVideoMediaId' },
      { legacyField: 'sketchImageUrl', mediaIdField: 'sketchImageMediaId' },
      { legacyField: 'previousImageUrl', mediaIdField: 'previousImageMediaId' },
    ],
  },
  {
    model: 'projectShot',
    tableName: 'project_shots',
    fields: [{ legacyField: 'imageUrl', mediaIdField: 'imageMediaId' }],
  },
  {
    model: 'supplementaryPanel',
    tableName: 'supplementary_panels',
    fields: [{ legacyField: 'imageUrl', mediaIdField: 'imageMediaId' }],
  },
  {
    model: 'projectVoiceLine',
    tableName: 'project_voice_lines',
    fields: [{ legacyField: 'audioUrl', mediaIdField: 'audioMediaId' }],
  },
  {
    model: 'voicePreset',
    tableName: 'voice_presets',
    fields: [{ legacyField: 'audioUrl', mediaIdField: 'audioMediaId' }],
  },
  {
    model: 'globalCharacter',
    tableName: 'global_characters',
    fields: [{ legacyField: 'customVoiceUrl', mediaIdField: 'customVoiceMediaId' }],
  },
  {
    model: 'globalCharacterAppearance',
    tableName: 'global_character_appearances',
    fields: [
      { legacyField: 'imageUrl', mediaIdField: 'imageMediaId' },
      { legacyField: 'previousImageUrl', mediaIdField: 'previousImageMediaId' },
    ],
  },
  {
    model: 'globalLocationImage',
    tableName: 'global_location_images',
    fields: [
      { legacyField: 'imageUrl', mediaIdField: 'imageMediaId' },
      { legacyField: 'previousImageUrl', mediaIdField: 'previousImageMediaId' },
    ],
  },
  {
    model: 'globalVoice',
    tableName: 'global_voices',
    fields: [{ legacyField: 'customVoiceUrl', mediaIdField: 'customVoiceMediaId' }],
  },
]
