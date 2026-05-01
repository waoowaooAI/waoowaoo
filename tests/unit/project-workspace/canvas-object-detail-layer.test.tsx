import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CanvasObjectDetailLayer from '@/features/project-workspace/canvas/details/CanvasObjectDetailLayer'
import type { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import type { WorkspaceCanvasFlowNode } from '@/features/project-workspace/canvas/node-canvas-types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) return key
    return `${key}:${JSON.stringify(values)}`
  },
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { readonly name: string }) => <span data-icon={name} />,
}))

vi.mock('@/features/project-workspace/WorkspaceProvider', () => ({
  useWorkspaceProvider: () => ({ projectId: 'project-1', episodeId: 'episode-1' }),
}))

vi.mock('@/features/project-workspace/WorkspaceStageRuntimeContext', () => ({
  useWorkspaceStageRuntime: () => ({
    videoModel: 'video-model-default',
    userVideoModels: [{ value: 'video-model-default', label: 'Video Default' }],
    onRunScriptToStoryboard: vi.fn(),
    onOpenAssetLibraryForCharacter: vi.fn(),
    onUpdateVideoPrompt: vi.fn(),
    onUpdatePanelVideoModel: vi.fn(),
    onGenerateVideo: vi.fn(),
    onGenerateAllVideos: vi.fn(),
  }),
}))

vi.mock('@/lib/query/hooks', () => {
  const mutation = () => ({ mutateAsync: vi.fn() })
  const refresh = () => vi.fn(async () => undefined)
  return {
    useCopyProjectPanel: mutation,
    useCreateProjectPanelVariant: mutation,
    useDeleteProjectPanel: mutation,
    useDownloadProjectImages: mutation,
    useDownloadRemoteBlob: mutation,
    useInsertProjectPanel: mutation,
    useListProjectEpisodeVideoUrls: mutation,
    useModifyProjectStoryboardImage: mutation,
    useRefreshEpisodeData: refresh,
    useRefreshProjectAssets: refresh,
    useRefreshStoryboards: refresh,
    useRegenerateProjectPanelImage: mutation,
    useUpdateProjectClip: mutation,
    useUpdateProjectPanel: mutation,
    useUpdateProjectPanelLink: mutation,
    useProjectAssets: () => ({
      data: {
        characters: [{
          id: 'character-1',
          name: '小机器人',
          aliases: null,
          introduction: null,
          appearances: [{
            id: 'appearance-1',
            appearanceIndex: 0,
            changeReason: '初始形象',
            description: '银色小机器人',
            descriptions: null,
            imageUrl: null,
            imageUrls: [],
            previousImageUrl: null,
            previousImageUrls: [],
            previousDescription: null,
            previousDescriptions: null,
            selectedIndex: null,
          }],
        }],
        locations: [{
          id: 'location-1',
          name: '城市街道_雨夜',
          summary: '雨夜街道',
          selectedImageId: null,
          images: [],
        }],
        props: [],
      },
    }),
  }
})

vi.mock('@/lib/query/mutations/storyboard-prompt-mutations', () => ({
  useSelectProjectPanelCandidate: () => ({ mutateAsync: vi.fn() }),
}))

function createPanel(): ProjectPanel {
  return {
    id: 'panel-1',
    storyboardId: 'storyboard-1',
    panelIndex: 0,
    panelNumber: 1,
    shotType: '全景',
    cameraMove: '缓慢推进',
    description: '小机器人举起发光路灯。',
    location: '城市街道_雨夜',
    characters: JSON.stringify([{ name: '小机器人', appearance: '初始形象' }]),
    props: '["发光路灯"]',
    srtSegment: '我们回家吧',
    srtStart: 1,
    srtEnd: 3,
    duration: 2,
    imagePrompt: '雨夜街道里的发光路灯',
    imageUrl: 'https://example.com/image.png',
    candidateImages: JSON.stringify(['https://example.com/candidate.png']),
    media: null,
    imageHistory: 'image history',
    videoPrompt: '镜头缓慢推进到发光路灯',
    firstLastFramePrompt: '首帧路灯，尾帧小女孩回家',
    videoUrl: 'https://example.com/video.mp4',
    videoModel: 'video-model-default',
    videoErrorCode: null,
    videoErrorMessage: null,
    videoGenerationMode: 'firstlastframe',
    lastVideoGenerationOptions: { duration: 5 },
    videoMedia: null,
    lipSyncVideoUrl: 'https://example.com/lip.mp4',
    lipSyncVideoMedia: null,
    lipSyncErrorCode: null,
    lipSyncErrorMessage: null,
    linkedToNextPanel: true,
    sketchImageUrl: 'https://example.com/sketch.png',
    sketchImageMedia: null,
    previousImageUrl: 'https://example.com/previous.png',
    previousImageMedia: null,
    photographyRules: '摄影规则',
    actingNotes: '表演指导',
    imageTaskRunning: false,
    videoTaskRunning: false,
    imageErrorMessage: null,
  }
}

function createStoryboard(panel: ProjectPanel): ProjectStoryboard {
  return {
    id: 'storyboard-1',
    episodeId: 'episode-1',
    clipId: 'clip-1',
    storyboardTextJson: null,
    panelCount: 1,
    storyboardImageUrl: null,
    candidateImages: null,
    lastError: null,
    photographyPlan: null,
    panels: [panel],
  }
}

function createClip(): ProjectClip {
  return {
    id: 'clip-1',
    summary: '小机器人照亮回家的路',
    location: '["城市街道_雨夜"]',
    characters: JSON.stringify([{ name: '小机器人', appearance: '初始形象' }]),
    props: '["发光路灯"]',
    content: '原始故事片段',
    screenplay: JSON.stringify({ scenes: [{ scene_number: 1, description: '剧本场景' }] }),
  }
}

function createNode(
  kind: 'scriptClip' | 'shot' | 'imageAsset' | 'videoClip' | 'finalTimeline',
  targetType: WorkspaceCanvasFlowNode['data']['targetType'],
  targetId: string,
): WorkspaceCanvasFlowNode {
  return {
    id: `${kind}:${targetId}`,
    type: 'workspaceNode',
    position: { x: 0, y: 0 },
    data: {
      kind,
      layoutNodeType: kind,
      targetType,
      targetId,
      title: `${kind} title`,
      eyebrow: `${kind} eyebrow`,
      body: `${kind} body`,
      meta: `${kind} meta`,
      statusLabel: 'ready',
      width: 320,
      height: 240,
    },
  }
}

function renderDetail(selectedNode: WorkspaceCanvasFlowNode): string {
  const panel = createPanel()
  return renderToStaticMarkup(
    <CanvasObjectDetailLayer
      selectedNode={selectedNode}
      clips={[createClip()]}
      storyboards={[createStoryboard(panel)]}
      onClose={() => undefined}
    />,
  )
}

describe('canvas object detail layer', () => {
  it('renders script details with editable screenplay, raw clip, and asset fields', () => {
    const html = renderDetail(createNode('scriptClip', 'clip', 'clip-1'))

    expect(html).toContain('原始故事片段')
    expect(html).toContain('剧本场景')
    expect(html).toContain('小机器人')
    expect(html).toContain('城市街道_雨夜')
    expect(html).toContain('actions.generateStoryboard')
  })

  it('renders shot details with panel edit fields and object operations', () => {
    const html = renderDetail(createNode('shot', 'panel', 'panel-1'))

    expect(html).toContain('全景')
    expect(html).toContain('缓慢推进')
    expect(html).toContain('我们回家吧')
    expect(html).toContain('摄影规则')
    expect(html).toContain('表演指导')
    expect(html).toContain('actions.copyPanel')
    expect(html).toContain('actions.createVariant')
  })

  it('renders image, video, and final details without voice nodes', () => {
    const imageHtml = renderDetail(createNode('imageAsset', 'panel', 'panel-1'))
    const videoHtml = renderDetail(createNode('videoClip', 'panel', 'panel-1'))
    const finalHtml = renderDetail(createNode('finalTimeline', 'episode', 'episode-1'))

    expect(imageHtml).toContain('雨夜街道里的发光路灯')
    expect(imageHtml).toContain('https://example.com/candidate.png')
    expect(imageHtml).toContain('actions.modifyImage')
    expect(videoHtml).toContain('镜头缓慢推进到发光路灯')
    expect(videoHtml).toContain('首帧路灯，尾帧小女孩回家')
    expect(videoHtml).toContain('Video Default')
    expect(finalHtml).toContain('status.videoReady')
    expect(`${imageHtml}${videoHtml}${finalHtml}`).not.toContain('voice:')
  })
})
