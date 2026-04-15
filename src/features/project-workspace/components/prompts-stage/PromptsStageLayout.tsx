'use client'

import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import PromptListPanel from './PromptListPanel'
import PromptEditorPanel from './PromptEditorPanel'
import { usePromptStageActions, type PromptsStageShellProps } from './hooks/usePromptStageActions'

export type { PromptsStageShellProps }

export default function PromptsStageLayout(props: PromptsStageShellProps) {
  const runtime = usePromptStageActions(props)

  return (
    <div className="space-y-6">
      {runtime.previewImage && (
        <ImagePreviewModal
          imageUrl={runtime.previewImage}
          onClose={() => runtime.setPreviewImage(null)}
        />
      )}

      <PromptListPanel runtime={runtime} />
      <PromptEditorPanel runtime={runtime} />
    </div>
  )
}
