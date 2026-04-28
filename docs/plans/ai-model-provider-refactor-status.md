# AI 模型重构 — 状态追踪

> 设计契约见 [`./ai-model-provider-refactor.md`](./ai-model-provider-refactor.md)。本文件**只**记录进度，不放设计决策。
>
> 任何 `[x] / [~] / [ ]` 与时间戳一律放这里，不允许污染设计文档。

## 当前阶段

- **进行中**：Step 2 — `AiProviderAdapter` 抽象升级 + 拆 switch

## Step 进度

### Step 1 — 合并 6 套 catalog 为 `ai-providers/<x>/models.ts`

- [x] 各 provider `models.ts` 起点文件
- [x] `ai-providers/openrouter/{adapter,llm,models}.ts` 落地
- [x] `model-capabilities/catalog.ts` 数据按 provider 搬迁
- [x] `model-pricing/catalog.ts` 数据按 provider 搬迁
- [x] `ai-providers/adapters/models/*.ts` 数据合并
- [x] `ai-providers/adapters/media-option-schema.ts` 各 provider override 合并
- [x] guard：`no-cross-provider-model-data.mjs`
- [x] 单测：每 provider `models.ts` 三件套覆盖

### Step 2 — `AiProviderAdapter` 抽象升级 + 拆 switch

- [x] `ai-registry/types.ts` 新类型上线，删除 `AiMediaAdapter` / `AiResolvedMediaSelection`
- [x] 每 provider `adapter.ts` 落地
- [x] `adapters/llm/{execution,stream-execution}.ts` switch 拆光
- [x] `adapters/media/execution.ts` switch 拆光
- [x] `adapters/media-option-schema.ts` 删除（数据已在 Step 1 搬走）
- [x] `ai-exec/engine.ts` 路由改为 `adapter[modality]`
- [x] guard：`no-cross-provider-switch.mjs`
- [x] `adapters/{llm,media}/{execution,stream-execution}.ts` 清空（仅 re-export）

### Step 3 — 删散文件 + 取消 `adapters/` 中间层

- [ ] `ark-api.ts` + `ark-llm.ts` → `ai-providers/ark/{llm,image,video}.ts`
- [ ] `openai-compat-template-runtime.ts` + `openai-compat-media-template.ts` → `ai-providers/openai-compatible/user-template.ts`
- [ ] `gemini-batch-utils.ts` → `ai-providers/google/llm.ts` + `ai-providers/shared/helpers.ts`
- [ ] `llm-client.ts` → `ai-exec/llm-helpers.ts`
- [ ] `model-config-contract.ts` 拆分到 `ai-registry/{types,selection}.ts` + 各 `models.ts`
- [ ] `api-config.ts` 选择/解析部分 → `ai-registry/selection.ts`
- [ ] `ai-runtime/**` 折叠进 `ai-exec/engine.ts`，目录删除
- [ ] `src/lib/llm/**` 合并到 `ai-exec/llm-helpers.ts`，目录删除
- [ ] `ai-providers/adapters/**` 中间层物理删除
- [ ] `ai-providers/llm/**` 删除（数据进各 `<x>/llm.ts`）
- [ ] `ai-providers/official/model-registry.ts` 删除
- [ ] guard：`no-ai-outside-ai-dirs.mjs`
- [ ] 终态校验：`rg` 全 0

### Step 4 — `ai-registry/catalog.ts` 取代 `user-api` catalog

- [ ] `ai-registry/catalog.ts` 实现 fan-out
- [ ] `user-api/api-config-catalog.ts` 删除
- [ ] `user-api/api-config.ts` catalog/enrichment 部分清理
- [ ] `user-api/api-config.ts` 行数 ≤ 300
- [ ] `/api/user/api-config` 契约测试
- [ ] 前端 hook 数据结构兼容性测试

## 验收（gpt-image-2 接入）

- [ ] 仅修改 `ai-providers/openai-compatible/models.ts` + 必要时 `image.ts`
- [ ] 不动任何其他文件，CI 全绿
