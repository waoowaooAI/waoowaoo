# AI 模型重构 — 状态追踪

> 设计契约见 [`./ai-model-provider-refactor.md`](./ai-model-provider-refactor.md)。本文件**只**记录进度，不放设计决策。
>
> 任何 `[x] / [~] / [ ]` 与时间戳一律放这里，不允许污染设计文档。

## 当前阶段

- **当前状态**：Step 5 已完成 lipsync、voice、assistant/project-agent LanguageModel、provider probe、async poll provider HTTP 实现下沉、单 runtime provider 注册表收敛、billing token-pricing provider contract 下沉，以及 `api-config-service.ts` 瘦身；旧散入口与兼容层已删除。
- **下一阶段**：继续 Step 5 — 复审剩余非 `ai-*` 目录中的模型调用/配置边界。

## 2026-04-28 复审事实

- [x] 旧散文件 import guard：`no-legacy-ai-entry-imports` 通过。
- [x] 跨 provider model data guard：`no-cross-provider-model-data` 通过，snapshot 已清空。
- [x] 跨 provider switch guard：`no-cross-provider-switch` 通过，allowlist 为 0。
- [x] AI outside ai dirs guard：`no-ai-outside-ai-dirs` 通过，snapshot 已清空。
- [x] `AiProviderAdapter` 注册已收敛：独立 `mediaAdapterRegistry` 删除，media descriptor 由 `RegisteredAiProvider` runtime registry 承担。
- [x] `user-api/api-config.ts` 已变薄；`api-config-service.ts` 已拆出 provider/model/pricing/default/capability helper，service 只保留读写编排。
- [x] `src/lib/lipsync/**` 已移除，provider 实现迁入 `ai-providers/{fal,vidu,bailian}/lipsync.ts`，业务入口改为 `ai-exec/engine`。
- [x] `src/lib/constants.ts` 中旧 AI 模型常量已删除；`ModelCapabilityDropdown` 与 `lipsync-ops` 不再持有 provider 模型事实。
- [x] `src/lib/voice/generate-voice-line.ts` 已移除直接 SDK/TTS 调用与 providerKey 分流，Fal/Bailian voice-line 绑定/缺失错误/执行迁入 provider adapter。
- [x] `src/lib/user-api/*probe*/*test*` 已迁入 `src/lib/ai-exec`，`user-api` 不再承载 provider probe 逻辑。
- [x] `src/lib/async-poll.ts` 已迁入 `src/lib/ai-exec/async-poll.ts`，旧入口删除；provider 具体 HTTP poll/query 实现已下沉到各 provider。
- [x] Ark Seedance 2 token 估算/模型判断已从 `billing/cost.ts` 下沉到 `ai-providers/ark/video-token-pricing.ts`，billing 只依赖 provider token-pricing contract。
- [x] provider builtin catalog 聚合已从 `ai-registry/builtin-catalog.ts` 移到 `ai-providers/builtin-catalog.ts`，旧路径物理删除且不留 re-export。
- [x] `ai-providers/index.ts` 已删除独立 media adapter 注册表，只保留 runtime provider registry。
- [x] `assistant-platform/runtime.ts` 与 `project-agent/model.ts` 已移除 Google/OpenAI SDK 分支，LanguageModel 创建迁入 provider runtime registry。

## Step 进度

### Step 1 — 合并 6 套 catalog 为 `ai-providers/<x>/models.ts`

- [x] 各 provider `models.ts` 起点文件
- [x] `ai-providers/openrouter/{adapter,llm,models}.ts` 落地
- [x] `model-capabilities/catalog.ts` 数据按 provider 搬迁
- [x] `model-pricing/catalog.ts` 数据按 provider 搬迁
- [x] `ai-providers/adapters/models/*.ts` 数据合并
- [x] `ai-providers/adapters/media-option-schema.ts` 各 provider override 合并
- [x] guard：`no-cross-provider-model-data.mjs`
- [x] 单测：每 provider `models.ts` 三件套覆盖（含 `openai-compatible` / `siliconflow`）

### Step 2 — `AiProviderAdapter` 抽象升级 + 拆 switch

- [x] `ai-registry/types.ts` 新类型上线，删除 `AiMediaAdapter` / `AiResolvedMediaSelection`
- [x] 每 provider `adapter.ts` 落地
- [x] `adapters/llm/{execution,stream-execution}.ts` switch 拆光
- [x] `adapters/media/execution.ts` switch 拆光
- [x] `adapters/media-option-schema.ts` 删除（数据已在 Step 1 搬走）
- [x] `ai-exec/engine.ts` 路由改为 `adapter[modality]`
- [x] guard：`no-cross-provider-switch.mjs`
- [x] `adapters/{llm,media}/{execution,stream-execution}.ts` 清空（仅 re-export）
- [x] `ai-providers/google/image.ts` 删除 `providerKey === 'gemini-compatible'` 分流（改由 `ai-providers/index.ts` 绑定执行函数）

### Step 3 — 删散文件 + 取消 `adapters/` 中间层

- [x] `ark-api.ts` + `ark-llm.ts` → `ai-providers/ark/{llm,image,video}.ts`
- [x] `openai-compat-template-runtime.ts` + `openai-compat-media-template.ts` → `ai-providers/openai-compatible/user-template.ts`
- [x] `gemini-batch-utils.ts` → `ai-providers/google/llm.ts` + `ai-providers/shared/helpers.ts`
- [x] `llm-client.ts` → `ai-exec/llm-helpers.ts`
- [x] `model-config-contract.ts` 拆分到 `ai-registry/{types,selection}.ts` + 各 `models.ts`
- [x] `api-config.ts` 选择/解析部分 → `ai-registry/selection.ts`
- [x] `ai-runtime/**` 折叠进 `ai-exec/engine.ts`，目录删除
- [x] `src/lib/llm/**` 合并到 `ai-exec/llm-helpers.ts`，目录删除
- [x] `ai-providers/adapters/**` 中间层物理删除
- [x] `ai-providers/llm/**` 删除（数据进各 `<x>/llm.ts`）
- [x] `ai-providers/official/model-registry.ts` 删除
- [x] guard：`no-ai-outside-ai-dirs.mjs`
- [x] 终态校验：`rg` 全 0
- [x] 清理空目录壳：`src/lib/model-capabilities/`、`src/lib/model-pricing/`

### Step 4 — `ai-registry/catalog.ts` 取代 `user-api` catalog

- [x] `ai-registry/catalog.ts` 实现 fan-out
- [x] `user-api/api-config-catalog.ts` 删除
- [x] `user-api/api-config.ts` catalog/enrichment 部分清理
- [x] `user-api/api-config.ts` 行数 ≤ 300
- [x] `/api/user/api-config` 契约测试
- [x] 前端 hook 数据结构兼容性测试

## 验收（gpt-image-2 接入）

- [ ] 仅修改 `ai-providers/openai-compatible/models.ts` + 必要时 `image.ts`
- [ ] 不动任何其他文件，CI 全绿

## Step 5 — 执行入口与残留调用收敛

- [x] lipsync provider 实现迁入 `ai-providers/{fal,vidu,bailian}/lipsync.ts`
- [x] lipsync 业务调用改走 `ai-exec/engine`
- [x] lipsync 默认模型改由 `ai-registry/api-config-catalog.ts` 提供，operation 层不再硬编码 provider modelId
- [x] voice/audio provider 实现迁入对应 provider adapter，移除 `src/lib/voice/generate-voice-line.ts` 内直接 SDK 调用
- [x] voice-line 音色绑定解析与缺失错误迁入 provider adapter，`src/lib/voice/generate-voice-line.ts` 不再包含 Fal/Bailian 分支
- [x] async poll 旧散文件已删除，provider 字面量 switch 与非 index 路由表已移除；Fal/Ark/Google/MiniMax/Vidu/Bailian 具体 HTTP poll/query 已下沉到各 provider 文件，注册只在 `ai-providers/index.ts`
- [x] provider test / protocol probe / media template probe 下沉到 provider adapter 或 `ai-exec` probe 入口
- [x] `ai-registry/catalog.ts` 已删除；调用方直接使用 `capabilities-catalog`、`pricing-catalog`、`api-config-catalog`、`pricing-resolution`、`video-capabilities`
- [x] `api-config-service.ts` 只保留用户配置 CRUD 编排；严格校验拆入 `api-config-{provider,model,custom-pricing,defaults,capability}-*.ts`
- [x] billing 中 Ark Seedance 2 token 定价专用逻辑下沉到 `ai-providers/ark/video-token-pricing.ts`
- [x] `ai-registry/builtin-catalog.ts` 已删除，provider catalog 聚合迁入 `ai-providers/builtin-catalog.ts`
- [x] `mediaAdapterRegistry` 已删除，`image/video/audio` descriptor 与 execute 同属 `RegisteredAiProvider`
- [x] assistant/project-agent AI SDK LanguageModel 创建迁入 provider adapter，业务层不再按 Google/OpenAI 分流
- [x] guard snapshot 已清空：`no-cross-provider-model-data=0`、`no-cross-provider-switch=0`、`no-ai-outside-ai-dirs=0`
