import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseProviderCardStateResult } from '@/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState'
import { ProviderCardShell } from '@/app/[locale]/profile/components/api-config/provider-card/ProviderCardShell'
import type { ProviderTutorial } from '@/app/[locale]/profile/components/api-config/types'

const portalMocks = vi.hoisted(() => {
  return {
    currentPortalTarget: null as unknown,
    createPortalMock: vi.fn((node: React.ReactNode, target: unknown) => {
      const targetLabel = target === portalMocks.currentPortalTarget ? 'body' : 'unknown'
      return createElement('div', { 'data-portal-target': targetLabel }, node)
    }),
  }
})

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    createPortal: portalMocks.createPortalMock,
  }
})

function createState(tutorial: ProviderTutorial): UseProviderCardStateResult {
  return {
    providerKey: 'ark',
    isPresetProvider: true,
    showBaseUrlEdit: false,
    tutorial,
    groupedModels: {},
    hasModels: false,
    isEditing: false,
    isEditingUrl: false,
    showKey: false,
    tempKey: '',
    tempUrl: '',
    showTutorial: true,
    showAddForm: null,
    newModel: {
      name: '',
      modelId: '',
      enableCustomPricing: false,
      priceInput: '',
      priceOutput: '',
      basePrice: '',
      optionPricesJson: '',
    },
    batchMode: false,
    editingModelId: null,
    editModel: {
      name: '',
      modelId: '',
      enableCustomPricing: false,
      priceInput: '',
      priceOutput: '',
      basePrice: '',
      optionPricesJson: '',
    },
    maskedKey: '',
    isPresetModel: () => false,
    isDefaultModel: () => false,
    setShowKey: () => undefined,
    setShowTutorial: () => undefined,
    setShowAddForm: () => undefined,
    setBatchMode: () => undefined,
    setNewModel: () => undefined,
    setEditModel: () => undefined,
    setTempKey: () => undefined,
    setTempUrl: () => undefined,
    startEditKey: () => undefined,
    startEditUrl: () => undefined,
    handleSaveKey: () => Promise.resolve(),
    handleCancelEdit: () => undefined,
    handleSaveUrl: () => undefined,
    handleCancelUrlEdit: () => undefined,
    handleEditModel: () => undefined,
    handleCancelEditModel: () => undefined,
    handleSaveModel: () => Promise.resolve(),
    handleAddModel: () => Promise.resolve(),
    handleCancelAdd: () => undefined,
    needsCustomPricing: false,
    keyTestStatus: 'idle',
    keyTestSteps: [],
    handleForceSaveKey: () => undefined,
    handleTestOnly: () => undefined,
    handleDismissTest: () => undefined,
    isModelSavePending: false,
  }
}

function ProviderCardShellWithBody(
  props: Omit<React.ComponentProps<typeof ProviderCardShell>, 'children'>,
): React.ReactElement {
  const ProviderCardShellComponent =
    ProviderCardShell as unknown as React.ComponentType<
      React.PropsWithChildren<Omit<React.ComponentProps<typeof ProviderCardShell>, 'children'>>
    >
  return createElement(
    ProviderCardShellComponent,
    props,
    createElement('div', null, 'provider-body'),
  )
}

describe('ProviderCardShell tutorial modal', () => {
  afterEach(() => {
    vi.clearAllMocks()
    portalMocks.currentPortalTarget = null
    Reflect.deleteProperty(globalThis, 'React')
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('mounts the tutorial modal through a portal to document.body', () => {
    const fakeDocument = {
      body: { nodeName: 'BODY' },
    }
    Reflect.set(globalThis, 'React', React)
    portalMocks.currentPortalTarget = fakeDocument.body
    Reflect.set(globalThis, 'document', fakeDocument)

    const tutorial: ProviderTutorial = {
      providerId: 'ark',
      steps: [
        {
          text: 'ark_step1',
          url: 'https://example.com/ark-key',
        },
      ],
    }
    const state = createState(tutorial)
    const t = (key: string): string => {
      if (key === 'tutorial.button') return '开通教程'
      if (key === 'tutorial.title') return '开通教程'
      if (key === 'tutorial.subtitle') return '按照以下步骤完成配置'
      if (key === 'tutorial.steps.ark_step1') return '进入控制台创建 API Key'
      if (key === 'tutorial.openLink') return '点击打开'
      if (key === 'tutorial.close') return '关闭'
      return key
    }

    const html = renderToStaticMarkup(
      createElement(
        ProviderCardShellWithBody,
        {
          provider: {
            id: 'ark',
            name: '阿里云百炼',
            hasApiKey: true,
          },
          onDeleteProvider: () => undefined,
          t,
          state,
        },
      ),
    )

    expect(portalMocks.createPortalMock).toHaveBeenCalledTimes(1)
    expect(portalMocks.createPortalMock.mock.calls[0]?.[1]).toBe(fakeDocument.body)
    expect(html).toContain('data-portal-target="body"')
    expect(html).toContain('进入控制台创建 API Key')
    expect(html).toContain('href="https://example.com/ark-key"')
  })
})
