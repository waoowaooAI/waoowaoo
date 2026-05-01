'use client'

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { ProjectCanvasFlowNode } from '../flow-types'
import CanvasNodeShell from './CanvasNodeShell'

export default function PanelImageNode({ data }: NodeProps<ProjectCanvasFlowNode>) {
  const t = useTranslations('projectWorkflow.canvas')
  const panelNumber = data.panelNumber ?? (typeof data.panelIndex === 'number' ? data.panelIndex + 1 : 0)
  return (
    <CanvasNodeShell
      data={data}
      title={t('nodeTitles.panelImage', { index: panelNumber })}
    >
      {data.previewImageUrl ? (
        <div className="mb-3 aspect-video overflow-hidden rounded-md bg-[var(--glass-bg-muted)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.previewImageUrl}
            alt={t('previewAlt.panelImage', { index: panelNumber })}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <p className="line-clamp-3">{data.description || t('nodeDescriptions.panelImage')}</p>
    </CanvasNodeShell>
  )
}
