export type ImageSlotLike = {
  imageUrl: string | null
}

export type ImageSlotPhase =
  | 'idle-empty'
  | 'idle-filled'
  | 'generating'
  | 'regenerating'

export function countGeneratedImageSlots<T extends ImageSlotLike>(slots: readonly T[]): number {
  return slots.reduce((count, slot) => (slot.imageUrl ? count + 1 : count), 0)
}

export function resolveImageSlotPhase(slot: ImageSlotLike, isRunning: boolean): ImageSlotPhase {
  if (isRunning) {
    return slot.imageUrl ? 'regenerating' : 'generating'
  }
  return slot.imageUrl ? 'idle-filled' : 'idle-empty'
}

interface ShowSlotGridInput {
  totalSlotCount: number
  generatedCount: number
  hasRunningTask: boolean
  hasAnyError: boolean
}

export function shouldShowImageSlotGrid(input: ShowSlotGridInput): boolean {
  if (input.totalSlotCount <= 1) return false
  if (input.hasRunningTask) return true
  if (input.generatedCount > 0) return true
  if (input.hasAnyError) return true
  return false
}
