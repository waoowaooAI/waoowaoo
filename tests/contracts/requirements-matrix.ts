export type RequirementPriority = 'P0' | 'P1' | 'P2'

export type RequirementCoverageEntry = {
  id: string
  feature: string
  userValue: string
  risk: string
  priority: RequirementPriority
  tests: ReadonlyArray<string>
}

export const REQUIREMENTS_MATRIX: ReadonlyArray<RequirementCoverageEntry> = [
  {
    id: 'REQ-ASSETHUB-CHARACTER-EDIT',
    feature: 'Asset Hub character edit',
    userValue: '角色信息编辑后立即可见并正确保存',
    risk: '字段映射漂移导致保存失败或误写',
    priority: 'P0',
    tests: [
      'tests/integration/api/contract/crud-routes.test.ts',
      'tests/integration/chain/text.chain.test.ts',
    ],
  },
  {
    id: 'REQ-ASSETHUB-REFERENCE-TO-CHARACTER',
    feature: 'Asset Hub reference-to-character',
    userValue: '上传参考图后生成角色形象且使用参考图',
    risk: 'referenceImages 丢失或分支走错',
    priority: 'P0',
    tests: [
      'tests/unit/helpers/reference-to-character-helpers.test.ts',
      'tests/unit/worker/reference-to-character.test.ts',
      'tests/integration/chain/text.chain.test.ts',
    ],
  },
  {
    id: 'REQ-NP-GENERATE-IMAGE',
    feature: 'Novel promotion image generation',
    userValue: '角色/场景/分镜图可稳定生成并回写',
    risk: '任务 payload 漂移、worker 写回错误实体',
    priority: 'P0',
    tests: [
      'tests/integration/api/contract/direct-submit-routes.test.ts',
      'tests/unit/worker/image-task-handlers-core.test.ts',
      'tests/integration/chain/image.chain.test.ts',
    ],
  },
  {
    id: 'REQ-NP-GENERATE-VIDEO',
    feature: 'Novel promotion video generation',
    userValue: '面板视频可生成并可追踪状态',
    risk: 'panel 定位错误、model 能力判断错误、状态错乱',
    priority: 'P0',
    tests: [
      'tests/integration/api/contract/direct-submit-routes.test.ts',
      'tests/unit/worker/video-worker.test.ts',
      'tests/integration/chain/video.chain.test.ts',
    ],
  },
  {
    id: 'REQ-NP-TEXT-ANALYSIS',
    feature: 'Text analysis and storyboard orchestration',
    userValue: '文本分析链路稳定并可回放结果',
    risk: 'step 编排变化导致结果结构损坏',
    priority: 'P1',
    tests: [
      'tests/integration/api/contract/llm-observe-routes.test.ts',
      'tests/unit/worker/script-to-storyboard.test.ts',
      'tests/integration/chain/text.chain.test.ts',
    ],
  },
  {
    id: 'REQ-TASK-STATE-CONSISTENCY',
    feature: 'Task state and SSE consistency',
    userValue: '前端状态与任务真实状态一致',
    risk: 'target-state 与 SSE 失配导致误提示',
    priority: 'P0',
    tests: [
      'tests/unit/helpers/task-state-service.test.ts',
      'tests/integration/api/contract/task-infra-routes.test.ts',
      'tests/unit/optimistic/sse-invalidation.test.ts',
    ],
  },
]
