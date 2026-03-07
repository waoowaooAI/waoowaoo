export { isCompatibleProvider, resolveModelGatewayRoute } from './router'
export type {
  ModelGatewayRoute,
  CompatibleProviderKey,
  OpenAICompatImageProfile,
  OpenAICompatVideoProfile,
  OpenAICompatClientConfig,
  OpenAICompatImageRequest,
  OpenAICompatVideoRequest,
  OpenAICompatChatRequest,
} from './types'
export {
  generateImageViaOpenAICompat,
  generateVideoViaOpenAICompat,
  generateImageViaOpenAICompatTemplate,
  generateVideoViaOpenAICompatTemplate,
  runOpenAICompatChatCompletion,
  runOpenAICompatChatCompletionStream,
  runOpenAICompatResponsesCompletion,
} from './openai-compat'
