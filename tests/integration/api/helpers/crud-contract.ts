import { vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'

export type RouteMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type RouteContext = {
  params: Promise<Record<string, string>>
}

export const authState = {
  authenticated: false,
}

export const prismaMock = {
  globalCharacter: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  globalAssetFolder: {
    findUnique: vi.fn(),
  },
  characterAppearance: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  projectLocation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  locationImage: {
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  projectClip: {
    update: vi.fn(),
  },
  projectStoryboard: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  projectPanel: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
}

export function resetCrudMocks() {
  vi.clearAllMocks()
  authState.authenticated = false

  prismaMock.globalCharacter.findUnique.mockResolvedValue({
    id: 'character-1',
    userId: 'user-1',
  })
  prismaMock.globalAssetFolder.findUnique.mockResolvedValue({
    id: 'folder-1',
    userId: 'user-1',
  })
  prismaMock.globalCharacter.update.mockResolvedValue({
    id: 'character-1',
    name: 'Alice',
    userId: 'user-1',
    appearances: [],
  })
  prismaMock.globalCharacter.delete.mockResolvedValue({ id: 'character-1' })
  prismaMock.characterAppearance.findUnique.mockResolvedValue({
    id: 'appearance-1',
    characterId: 'character-1',
    imageUrls: JSON.stringify(['cos/char-0.png', 'cos/char-1.png']),
    imageUrl: null,
    selectedIndex: null,
    character: { id: 'character-1', name: 'Alice' },
  })
  prismaMock.characterAppearance.update.mockResolvedValue({
    id: 'appearance-1',
    selectedIndex: 1,
    imageUrl: 'cos/char-1.png',
  })
  prismaMock.projectLocation.findUnique.mockResolvedValue({
    id: 'location-1',
    name: 'Old Town',
    images: [
      { id: 'img-0', imageIndex: 0, imageUrl: 'cos/loc-0.png' },
      { id: 'img-1', imageIndex: 1, imageUrl: 'cos/loc-1.png' },
    ],
  })
  prismaMock.locationImage.updateMany.mockResolvedValue({ count: 2 })
  prismaMock.locationImage.update.mockResolvedValue({
    id: 'img-1',
    imageIndex: 1,
    imageUrl: 'cos/loc-1.png',
    isSelected: true,
  })
  prismaMock.projectLocation.update.mockResolvedValue({
    id: 'location-1',
    selectedImageId: 'img-1',
  })
  prismaMock.projectClip.update.mockResolvedValue({
    id: 'clip-1',
    characters: JSON.stringify(['Alice']),
    location: 'Old Town',
    props: JSON.stringify(['Bronze Dagger']),
    content: 'clip content',
    screenplay: JSON.stringify({ scenes: [{ id: 1 }] }),
  })
  prismaMock.projectStoryboard.findUnique.mockResolvedValue({
    id: 'storyboard-1',
    projectId: 'project-1',
  })
  prismaMock.projectStoryboard.update.mockResolvedValue({
    id: 'storyboard-1',
    panelCount: 1,
  })
  prismaMock.projectPanel.findUnique.mockResolvedValue({
    id: 'panel-1',
    storyboardId: 'storyboard-1',
    panelIndex: 0,
  })
  prismaMock.projectPanel.update.mockResolvedValue({
    id: 'panel-1',
    storyboardId: 'storyboard-1',
    panelIndex: 0,
    props: JSON.stringify(['Bronze Dagger']),
  })
  prismaMock.projectPanel.create.mockResolvedValue({
    id: 'panel-2',
    storyboardId: 'storyboard-1',
    panelIndex: 1,
    props: JSON.stringify(['Bronze Dagger']),
  })
  prismaMock.projectPanel.count.mockResolvedValue(1)
}

export const crudRoutes = ROUTE_CATALOG.filter(
  (entry) => (
    entry.contractGroup === 'crud-assets-routes'
    || entry.contractGroup === 'crud-asset-hub-routes'
    || entry.contractGroup === 'user-project-routes'
  ),
)

function toModuleImportPath(routeFile: string): string {
  return `@/${routeFile.replace(/^src\//, '').replace(/\.ts$/, '')}`
}

function resolveParamValue(paramName: string): string {
  const key = paramName.toLowerCase()
  if (key.includes('project')) return 'project-1'
  if (key.includes('character')) return 'character-1'
  if (key.includes('location')) return 'location-1'
  if (key.includes('appearance')) return '0'
  if (key.includes('episode')) return 'episode-1'
  if (key.includes('storyboard')) return 'storyboard-1'
  if (key.includes('panel')) return 'panel-1'
  if (key.includes('clip')) return 'clip-1'
  if (key.includes('folder')) return 'folder-1'
  if (key === 'id') return 'id-1'
  return `${paramName}-1`
}

function toApiPath(routeFile: string): { path: string; params: Record<string, string> } {
  const withoutPrefix = routeFile
    .replace(/^src\/app/, '')
    .replace(/\/route\.ts$/, '')

  const params: Record<string, string> = {}
  const path = withoutPrefix.replace(/\[([^\]]+)\]/g, (_full, paramName: string) => {
    const value = resolveParamValue(paramName)
    params[paramName] = value
    return value
  })
  return { path, params }
}

function buildGenericBody() {
  return {
    id: 'id-1',
    name: 'Name',
    type: 'character',
    userInstruction: 'instruction',
    characterId: 'character-1',
    locationId: 'location-1',
    appearanceId: 'appearance-1',
    modifyPrompt: 'modify prompt',
    storyboardId: 'storyboard-1',
    panelId: 'panel-1',
    panelIndex: 0,
    episodeId: 'episode-1',
    content: 'x'.repeat(140),
    voicePrompt: 'voice prompt',
    previewText: 'preview text',
    referenceImageUrl: 'https://example.com/ref.png',
    referenceImageUrls: ['https://example.com/ref.png'],
    lineId: 'line-1',
    audioModel: 'fal::audio-model',
    videoModel: 'fal::video-model',
    insertAfterPanelId: 'panel-1',
    sourcePanelId: 'panel-2',
    variant: { video_prompt: 'variant prompt' },
    currentDescription: 'description',
    modifyInstruction: 'instruction',
    currentPrompt: 'prompt',
    all: false,
  }
}

export async function invokeRouteMethod(
  routeFile: string,
  method: RouteMethod,
): Promise<Response> {
  const { path, params } = toApiPath(routeFile)
  const modulePath = toModuleImportPath(routeFile)
  const mod = await import(modulePath)
  const handler = mod[method] as ((req: Request, ctx?: RouteContext) => Promise<Response>) | undefined
  if (!handler) {
    throw new Error(`Route ${routeFile} missing method ${method}`)
  }
  const req = buildMockRequest({
    path,
    method,
    ...(method === 'GET' ? {} : { body: buildGenericBody() }),
  })
  return await handler(req, { params: Promise.resolve(params) })
}
