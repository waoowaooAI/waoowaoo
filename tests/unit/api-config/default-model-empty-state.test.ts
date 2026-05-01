import { describe, expect, it } from 'vitest'
import {
  getDefaultModelEmptyStateText,
  type DefaultModelEmptyStateType,
} from '@/app/[locale]/profile/components/api-config-tab/default-model-empty-state'

const translations: Record<string, string> = {
  'defaultModelEmptyState.genericTitle': '暂无可选模型',
  'defaultModelEmptyState.llmTitle': '暂无可选文本模型',
  'defaultModelEmptyState.llmDescription': '请先去下方厂商资源池配置文本模型并开启模型。',
  'defaultModelEmptyState.imageTitle': '暂无可选图像模型',
  'defaultModelEmptyState.imageDescription': '请先去下方厂商资源池配置图像模型并开启模型。',
  'defaultModelEmptyState.videoTitle': '暂无可选视频模型',
  'defaultModelEmptyState.videoDescription': '请先去下方厂商资源池配置视频模型并开启模型。',
}

function t(key: string): string {
  return translations[key] ?? key
}

describe('default model empty state copy', () => {
  it('returns provider-pool guidance for llm, image, and video selectors', () => {
    const modelTypes: DefaultModelEmptyStateType[] = ['llm', 'image', 'video']

    for (const modelType of modelTypes) {
      const content = getDefaultModelEmptyStateText(modelType, t)

      expect(content.title).toBe('暂无可选模型')
      expect(content.description).toContain('厂商资源池')
      expect(content.description).toContain('开启模型')
      expect(content.description).not.toContain('只显示已启用模型')
    }
  })

  it('returns the exact llm guidance requested by the product flow', () => {
    expect(getDefaultModelEmptyStateText('llm', t)).toEqual({
      title: '暂无可选模型',
      description: '请先去下方厂商资源池配置文本模型并开启模型。',
    })
  })
})
