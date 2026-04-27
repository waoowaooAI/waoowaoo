import { AiRegistry } from '@/lib/ai-registry/registry'
import type { AiResolvedSelection } from '@/lib/ai-registry/types'
import { arkMediaAdapter } from '@/lib/ai-providers/ark/adapter'
import { bailianMediaAdapter } from '@/lib/ai-providers/bailian/adapter'
import { falMediaAdapter } from '@/lib/ai-providers/fal/adapter'
import { geminiCompatibleMediaAdapter, googleMediaAdapter } from '@/lib/ai-providers/google/adapter'
import { minimaxMediaAdapter } from '@/lib/ai-providers/minimax/adapter'
import { openAiCompatibleMediaAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import { siliconFlowMediaAdapter } from '@/lib/ai-providers/siliconflow/adapter'
import { viduMediaAdapter } from '@/lib/ai-providers/vidu/adapter'
import type { DescribeOnlyMediaAdapter } from './types'

const mediaAdapters: DescribeOnlyMediaAdapter[] = [
  bailianMediaAdapter,
  siliconFlowMediaAdapter,
  openAiCompatibleMediaAdapter,
  googleMediaAdapter,
  geminiCompatibleMediaAdapter,
  arkMediaAdapter,
  falMediaAdapter,
  minimaxMediaAdapter,
  viduMediaAdapter,
]

const mediaRegistry = new AiRegistry<DescribeOnlyMediaAdapter>(mediaAdapters)

export function resolveMediaAdapter(selection: AiResolvedSelection): DescribeOnlyMediaAdapter {
  return mediaRegistry.getAdapterByProviderId(selection.provider) as DescribeOnlyMediaAdapter
}
