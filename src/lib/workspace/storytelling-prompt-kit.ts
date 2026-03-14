export const STORYTELLING_PROMPT_KIT_PHASE_ORDER = [
  'opening',
  'setup',
  'continuity',
  'action',
  'dialogue',
  'transition',
  'conflict',
  'payoff',
  'cliffhanger',
] as const

export type StorytellingPromptKitPhase = (typeof STORYTELLING_PROMPT_KIT_PHASE_ORDER)[number]

export type StorytellingPromptKitLite<TId extends string = string> = {
  id: TId
}

const ORDER_INDEX = new Map<string, number>(STORYTELLING_PROMPT_KIT_PHASE_ORDER.map((id, index) => [id, index]))

export function orderStorytellingPromptKits<T extends StorytellingPromptKitLite>(kits: readonly T[]): T[] {
  return [...kits].sort((a, b) => {
    const aIndex = ORDER_INDEX.get(a.id)
    const bIndex = ORDER_INDEX.get(b.id)

    if (aIndex == null && bIndex == null) return 0
    if (aIndex == null) return 1
    if (bIndex == null) return -1
    return aIndex - bIndex
  })
}

export function getStorytellingPromptKitById<T extends StorytellingPromptKitLite>(kits: readonly T[], id: string): T | null {
  return kits.find((kit) => kit.id === id) ?? null
}
