export type DefaultModelEmptyStateType =
  | 'llm'
  | 'image'
  | 'video'
  | 'audio'
  | 'lipsync'
  | 'voicedesign'

type Translator = (key: string) => string

const EMPTY_STATE_TRANSLATION_KEYS: Record<
  DefaultModelEmptyStateType,
  { title: string; description: string }
> = {
  llm: {
    title: 'defaultModelEmptyState.llmTitle',
    description: 'defaultModelEmptyState.llmDescription',
  },
  image: {
    title: 'defaultModelEmptyState.imageTitle',
    description: 'defaultModelEmptyState.imageDescription',
  },
  video: {
    title: 'defaultModelEmptyState.videoTitle',
    description: 'defaultModelEmptyState.videoDescription',
  },
  audio: {
    title: 'defaultModelEmptyState.audioTitle',
    description: 'defaultModelEmptyState.audioDescription',
  },
  lipsync: {
    title: 'defaultModelEmptyState.lipsyncTitle',
    description: 'defaultModelEmptyState.lipsyncDescription',
  },
  voicedesign: {
    title: 'defaultModelEmptyState.voiceDesignTitle',
    description: 'defaultModelEmptyState.voiceDesignDescription',
  },
}

export function getDefaultModelEmptyStateText(
  modelType: DefaultModelEmptyStateType,
  t: Translator,
): { title: string; description: string } {
  const keys = EMPTY_STATE_TRANSLATION_KEYS[modelType]
  return {
    title: t(keys.title),
    description: t(keys.description),
  }
}
