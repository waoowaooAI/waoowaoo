'use client'

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { ProjectCanvasFlowNode } from '../flow-types'
import CanvasNodeShell from './CanvasNodeShell'

export default function StoryboardGroupNode({ data }: NodeProps<ProjectCanvasFlowNode>) {
  const t = useTranslations('projectWorkflow.canvas')
  return (
    <CanvasNodeShell
      data={data}
      title={t('nodeTitles.storyboardGroup', { index: data.orderIndex ?? 0 })}
    >
      <p>{t('nodeDescriptions.storyboardGroup')}</p>
    </CanvasNodeShell>
  )
}
