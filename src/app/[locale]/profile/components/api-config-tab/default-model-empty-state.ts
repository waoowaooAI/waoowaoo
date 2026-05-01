export type DefaultModelEmptyStateType =
  | 'llm'
  | 'image'
  | 'video'
  | 'audio'
  | 'music'
  | 'lipsync'
  | 'voicedesign'

type Translator = (key: string) => string

const EMPTY_STATE_TRANSLATION_KEYS: Record<
  DefaultModelEmptyStateType,
  { description: string }
> = {
  llm: {
    description: 'defaultModelEmptyState.llmDescription',
  },
  image: {
    description: 'defaultModelEmptyState.imageDescription',
  },
  video: {
    description: 'defaultModelEmptyState.videoDescription',
  },
  audio: {
    description: 'defaultModelEmptyState.audioDescription',
  },
  music: {
    description: 'defaultModelEmptyState.musicDescription',
  },
  lipsync: {
    description: 'defaultModelEmptyState.lipsyncDescription',
  },
  voicedesign: {
    description: 'defaultModelEmptyState.voiceDesignDescription',
  },
}

export function getDefaultModelEmptyStateText(
  modelType: DefaultModelEmptyStateType,
  t: Translator,
): { title: string; description: string } {
  const keys = EMPTY_STATE_TRANSLATION_KEYS[modelType]
  return {
    title: t('defaultModelEmptyState.genericTitle'),
    description: t(keys.description),
  }
}
