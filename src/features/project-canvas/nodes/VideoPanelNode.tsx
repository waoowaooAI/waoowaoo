'use client'

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { ProjectCanvasFlowNode } from '../flow-types'
import CanvasNodeShell from './CanvasNodeShell'

export default function VideoPanelNode({ data }: NodeProps<ProjectCanvasFlowNode>) {
  const t = useTranslations('projectWorkflow.canvas')
  const panelNumber = data.panelNumber ?? (typeof data.panelIndex === 'number' ? data.panelIndex + 1 : 0)
  return (
    <CanvasNodeShell
      data={data}
      title={t('nodeTitles.videoPanel', { index: panelNumber })}
    >
      <p className="line-clamp-4">{data.description || t('nodeDescriptions.videoPanel')}</p>
    </CanvasNodeShell>
  )
}
