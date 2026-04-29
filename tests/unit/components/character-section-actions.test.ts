import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import CharacterSection from '@/features/project-workspace/components/assets/CharacterSection'

const useProjectAssetsMock = vi.hoisted(() => vi.fn())
const characterCardMock = vi.hoisted(() => vi.fn((_props: unknown) => null))

vi.mock('@/lib/query/hooks/useProjectAssets', () => ({
  useProjectAssets: (projectId: string | null) => useProjectAssetsMock(projectId),
}))

vi.mock('@/features/project-workspace/components/assets/CharacterCard', () => ({
  __esModule: true,
  default: (props: unknown) => characterCardMock(props),
}))

vi.mock('@/features/project-workspace/components/assets/CharacterProfileCard', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('@/types/character-profile', () => ({
  parseProfileData: () => null,
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('@/lib/task/presentation', () => ({
  resolveTaskPresentationState: () => null,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: (props: { name?: string; className?: string }) =>
    createElement('span', { 'data-icon': props.name, className: props.className }),
}))

const messages = {
  assets: {
    stage: {
      characterAssets: '角色资产',
      counts: '{characterCount} 个角色，{appearanceCount} 个形象',
      pendingProfilesBanner: '待确认角色',
      pendingProfilesHint: '确认角色设定',
      confirmAll: '全部确认',
    },
    character: {
      add: '新建角色',
      assetCount: '{count} 个形象',
      copyFromGlobal: '从资产中心导入',
      delete: '删除角色',
    },
  },
} as const

function renderWithIntl(node: ReactElement) {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps),
  )
}

describe('CharacterSection actions', () => {
  it('renders import and delete actions stacked vertically with the import icon', () => {
    Reflect.set(globalThis, 'React', React)
    useProjectAssetsMock.mockReturnValue({
      data: {
        characters: [
          {
            id: 'character-1',
            name: '西装男',
            introduction: null,
            appearances: [
              {
                id: 'appearance-1',
                appearanceIndex: 0,
                changeReason: '初始形象',
                imageUrl: null,
                imageUrls: [],
                selectedIndex: null,
              },
            ],
          },
        ],
      },
    })

    const html = renderWithIntl(
      createElement(CharacterSection, {
        projectId: 'project-1',
        activeTaskKeys: new Set<string>(),
        onClearTaskKey: () => undefined,
        onRegisterTransientTaskKey: () => undefined,
        isAnalyzingAssets: false,
        onAddCharacter: () => undefined,
        onDeleteCharacter: () => undefined,
        onDeleteAppearance: () => undefined,
        onEditAppearance: () => undefined,
        handleGenerateImage: async () => undefined,
        onSelectImage: () => undefined,
        onConfirmSelection: () => undefined,
        onRegenerateSingle: async () => undefined,
        onRegenerateGroup: async () => undefined,
        onUndo: () => undefined,
        onImageClick: () => undefined,
        onImageEdit: () => undefined,
        onVoiceChange: () => undefined,
        onVoiceDesign: () => undefined,
        onVoiceSelectFromHub: () => undefined,
        onCopyFromGlobal: () => undefined,
        getAppearances: (character) => character.appearances,
        unconfirmedCharacters: [],
        isConfirmingCharacter: () => false,
        deletingCharacterId: null,
        batchConfirming: false,
        batchConfirmingState: null,
        onBatchConfirm: () => undefined,
        onEditProfile: () => undefined,
        onConfirmProfile: () => undefined,
        onUseExistingProfile: () => undefined,
        onDeleteProfile: () => undefined,
      }),
    )

    expect(html).toContain('从资产中心导入')
    expect(html).toContain('删除角色')
    expect(html).toContain('data-icon="arrowDownCircle"')
    expect(html).toContain('flex flex-col items-end gap-1.5')
  })
})
