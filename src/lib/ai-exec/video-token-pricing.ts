import { resolveVideoTokenPricingContract } from '@/lib/ai-providers'
export type {
  VideoTokenPricingContract,
  VideoTokenPricingFailure,
} from '@/lib/ai-providers/shared/video-token-pricing'

export function resolveAiVideoTokenPricingContract(model: string) {
  return resolveVideoTokenPricingContract(model)
}
