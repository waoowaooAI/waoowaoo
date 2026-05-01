'use client'

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { ProjectCanvasFlowNode } from '../flow-types'
import CanvasNodeShell from './CanvasNodeShell'

export default function StoryNode({ data }: NodeProps<ProjectCanvasFlowNode>) {
  const t = useTranslations('projectWorkflow.canvas')
  return (
    <CanvasNodeShell data={data} title={t('nodeTitles.story')}>
      <p className="line-clamp-4">{data.description || t('nodeDescriptions.story')}</p>
    </CanvasNodeShell>
  )
}
