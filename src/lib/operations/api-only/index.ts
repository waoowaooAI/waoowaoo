import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import { withOperationPack } from '@/lib/operations/pack'
import { createAssetHubApiOperations } from './asset-hub-api-ops'
import { createAssetsApiOperations } from './assets-api-ops'
import { createUserApiConfigConnectionDiagnosticOperations } from './user-api-config-connection-ops'
import { createUserApiConfigLlmProtocolOperations } from './user-api-config-llm-protocol-ops'

export function createApiOnlyOperationRegistry(): ProjectAgentOperationRegistry {
  return withOperationPack({
    ...createAssetsApiOperations(),
    ...createAssetHubApiOperations(),
    ...createUserApiConfigLlmProtocolOperations(),
    ...createUserApiConfigConnectionDiagnosticOperations(),
  }, {
    groupPath: ['api-only'],
    channels: { tool: false, api: true },
    prerequisites: { episodeId: 'optional' },
    confirmation: { required: false, summary: null, budget: null },
  })
}
