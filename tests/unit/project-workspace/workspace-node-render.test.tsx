import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NodeProps } from '@xyflow/react'
import WorkspaceNode from '@/features/project-workspace/canvas/nodes/WorkspaceNode'
import type { WorkspaceCanvasFlowNode, WorkspaceCanvasNodeData } from '@/features/project-workspace/canvas/node-canvas-types'

vi.mock('@xyflow/react', () => ({
  Handle: () => <span data-testid="handle" />,
  Position: { Left: 'left', Right: 'right' },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) return key
    return `${key}:${JSON.stringify(values)}`
  },
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { readonly name: string }) => <span data-icon={name} />,
}))

function renderNode(data: WorkspaceCanvasNodeData): string {
  const props = { data } as NodeProps<WorkspaceCanvasFlowNode>
  return renderToStaticMarkup(<WorkspaceNode {...props} />)
}

describe('workspace node rendering', () => {
  it('renders script clip structure instead of only the summary body', () => {
    const html = renderNode({
      kind: 'scriptClip',
      layoutNodeType: 'scriptClip',
      targetType: 'clip',
      targetId: 'clip-1',
      title: 'Script node',
      eyebrow: 'Script',
      body: 'screenplay raw',
      meta: 'clip #1',
      statusLabel: 'Ready',
      width: 320,
      height: 360,
      indexLabel: 'C1',
      scriptDetails: {
        originalText: 'original source text',
        screenplayText: 'screenplay raw',
        scenes: [{
          sceneNumber: 1,
          heading: 'EXT · Street · Night',
          description: 'rain street',
          characters: ['Robot'],
          lines: [{ kind: 'dialogue', speaker: 'Girl', text: 'hello' }],
        }],
        characters: [{ name: 'Robot', appearance: 'Default' }],
        locations: ['Street'],
        props: ['Lamp'],
        timeRange: '1s - 3s',
        duration: 2,
        shotCount: 1,
      },
    })

    expect(html).toContain('Robot / Default')
    expect(html).toContain('EXT · Street · Night')
    expect(html).toContain('original source text')
    expect(html).toContain('hello')
  })

  it('renders shot, image, video, and final details without stage containers', () => {
    const shotHtml = renderNode({
      kind: 'shot',
      layoutNodeType: 'shot',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Shot node',
      eyebrow: 'Shot',
      body: 'shot description',
      meta: 'location',
      statusLabel: 'Ready',
      width: 320,
      height: 380,
      shotDetails: {
        shotType: 'wide',
        cameraMove: 'push in',
        characters: [{ name: 'Girl' }],
        location: 'Street',
        props: ['Lamp'],
        srtSegment: 'dialogue text',
        imagePrompt: 'image prompt',
        videoPrompt: 'video prompt',
        photographyRules: 'photo rules',
        actingNotes: 'acting notes',
        promptShot: {
          plot: 'prompt plot',
        },
      },
    })
    const imageHtml = renderNode({
      kind: 'imageAsset',
      layoutNodeType: 'imageAsset',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Image node',
      eyebrow: 'Image',
      body: 'image body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 390,
      imageDetails: {
        imagePrompt: 'image prompt',
        candidateImages: ['https://example.com/a.png'],
        imageHistory: 'history',
        sketchImageUrl: 'https://example.com/sketch.png',
        previousImageUrl: 'https://example.com/previous.png',
      },
    })
    const videoHtml = renderNode({
      kind: 'videoClip',
      layoutNodeType: 'videoClip',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Video node',
      eyebrow: 'Video',
      body: 'video body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 410,
      videoDetails: {
        videoPrompt: 'video prompt',
        firstLastFramePrompt: 'first last prompt',
        videoGenerationMode: 'firstlastframe',
        videoUrl: 'https://example.com/video.mp4',
        lipSyncVideoUrl: 'https://example.com/lip.mp4',
      },
    })
    const finalHtml = renderNode({
      kind: 'finalTimeline',
      layoutNodeType: 'finalTimeline',
      targetType: 'episode',
      targetId: 'episode-1',
      title: 'Final node',
      eyebrow: 'Final',
      body: 'final body',
      meta: 'order',
      statusLabel: 'Ready',
      width: 340,
      height: 280,
      finalDetails: {
        totalShots: 1,
        totalImages: 1,
        totalVideos: 1,
        totalDuration: 2,
        orderedVideoLabels: ['panel-1'],
      },
    })

    expect(shotHtml).toContain('photo rules')
    expect(shotHtml).toContain('acting notes')
    expect(imageHtml).toContain('history')
    expect(imageHtml).toContain('https://example.com/sketch.png')
    expect(videoHtml).toContain('first last prompt')
    expect(videoHtml).toContain('https://example.com/lip.mp4')
    expect(finalHtml).toContain('panel-1')
    expect(`${shotHtml}${imageHtml}${videoHtml}${finalHtml}`).not.toContain('StoryboardStage')
  })
})
