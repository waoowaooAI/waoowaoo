'use client'

import { AppIcon } from '@/components/ui/icons'

interface ImageGenerationSlotOverlayProps {
  label: string
}

export default function ImageGenerationSlotOverlay({ label }: ImageGenerationSlotOverlayProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--glass-overlay)]">
      <AppIcon name="loader" className="h-7 w-7 animate-spin text-white" />
      <span className="mt-2 text-xs text-white">{label}</span>
    </div>
  )
}
