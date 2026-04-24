# 模型/平台接入统一化重构设计（Factory + Adapter + Execution Governance）

> 2026-04-23 阶段性状态（本次停留点）
> - 已完成：`src/lib/providers/** -> src/lib/ai-providers/**` 迁移；删除 `src/lib/generator-api.ts`；新增 `src/lib/ai-exec/**` 与 `src/lib/ai-registry/**` 骨架；media 入口开始通过 adapter descriptor 做 execution mode / optionSchema 收敛；worker 并发 gate 与 LLM/Vision retry delay 开始复用 `src/lib/ai-exec/governance.ts`。
> - 2026-04-24 进展：API Config 预设模型/厂商清单已从前端 `types.ts` 提升到 `src/lib/user-api/api-config-catalog.ts`；`GET /api/user/api-config` 返回 `catalog`；前端 `useProviders` 优先使用服务端 catalog，仅保留同源 re-export 作为空态/兼容入口。
> - 2026-04-24 代码核对补记：`src/lib/llm/chat-completion.ts` 与 `src/lib/llm/vision.ts` 已改为 re-export 到 `src/lib/ai-exec/llm/*`；`src/lib/llm/chat-stream.ts` 后续已迁为 re-export；`src/lib/ai-runtime/client.ts` 后续已统一到 `ai-exec/engine`。
> - 2026-04-24 迁移执行补记：LLM sync 与 Vision provider 分支已从 `src/lib/ai-exec/llm/chat-completion.ts` / `src/lib/ai-exec/llm/vision.ts` 下沉到 `src/lib/ai-providers/adapters/llm/execution.ts`；stream 实现已从 `src/lib/ai-exec/llm/chat-stream.ts` 下沉到 `src/lib/ai-providers/adapters/llm/stream-execution.ts`，旧 `src/lib/llm/chat-stream.ts` 与 `ai-exec` stream facade 均仅保留 re-export；`src/lib/ai-runtime/client.ts` 已改为调用 `src/lib/ai-exec/engine`；media 分流逻辑已从 `src/lib/ai-exec/media/generator-api.ts` 抽到 `src/lib/ai-providers/adapters/media/execution.ts`。
> - 2026-04-24 物理迁移补记：`src/lib/model-gateway/openai-compat/**` 真实实现已迁入 `src/lib/ai-providers/adapters/openai-compatible/**`，旧 compat 目录已删除；`src/lib/model-gateway/llm.ts` 已删除，相关测试迁到 `ai-runtime -> ai-exec` 入口；`src/lib/model-gateway/router.ts` / `types.ts` 真实定义已迁到 `src/lib/ai-registry/gateway-route.ts` 与 OpenAI-compatible adapter types，旧 `src/lib/model-gateway/**` 目录已删除；`src/lib/generators/**` 真实实现已迁入 `src/lib/ai-providers/adapters/media/generators/**`，旧路径保留 re-export。
> - 2026-04-24 Phase 2 追加：media option schema 已支持 required / oneOf / conflict / field validator / object validator；关键 image/video provider 规则已前置到 adapter descriptor；模型规格常量已按 provider 拆到 `src/lib/ai-providers/adapters/models/{ark,fal,minimax,openai-compatible,vidu}.ts`，作为 capability/inputContracts 合并前的 adapter models 真相源。
> - 2026-04-24 Phase 1 补齐：`src/lib/ai-exec/engine.ts` 已不再只是 re-export facade；media 的 resolve selection → adapter descriptor → option validation → provider execution 流程已上收到 engine；LLM / LLM stream / Vision 也已提供 request-object engine 入口并由旧函数签名 wrapper 转发；`src/lib/ai-exec/media/generator-api.ts` 与 `src/lib/ai-exec/llm/*` 旧入口降级为兼容 re-export。
> - 未完成：`src/lib/ai-providers/**` 仍是迁移中间态，还没完全整理成 3.2 的最终目录；provider `models/*` 还不是 capability / inputContracts 的唯一真相源；旧 AI 执行入口已物理删除并由 guard 禁止恢复；并发 gate 仍是进程内实现，尚未升级为跨进程 limiter。
> - 因此当前仓库状态应视为“Phase 1 入口/engine 层已补齐 + Phase 2 optionSchema 收敛完成/能力合同待统一 + Phase 5 旧入口清理完成 + Phase 3/4 继续推进”，不是全文档目标结构已完全落地。

> 本文是设计文档，用于指导后续分阶段迁移与清理旧逻辑。
> 目标：解决“模型定义与调用散乱、能力(特性)定义不闭环、同一模型多平台能力差异难表达、执行治理多层叠加、前端设置硬编码与后端漂移”等问题。
>
> 关键约束（来自仓库 AGENTS 规范与既有架构）：
>
> - 模型唯一键：`providerId::modelId`（严格模式；禁止猜测/降级；providerId 允许多实例如 `openai-compatible:uuid`，但分隔符固定 `::`）
> - route 只负责鉴权/参数校验/提交任务/返回；业务逻辑必须下沉 `src/lib/**`
> - 所有可能导致“吞错/回退/隐式默认”的逻辑禁止出现；非预期必须显式失败
> - 涉及生成/修改/重生成图片的输入必须走 `src/lib/media/outbound-image.ts` 统一归一化（禁止绕过链路直传原始 URL/`/_next/image`/storage key/base64）
> - 禁止 `any`（类型必须明确）

---

## 0. 范围与非目标

### 0.1 范围（modality）

- LLM 文本（sync + stream）
- Vision（图片输入的 LLM）
- Image generation（生图/改图）
- Video generation（图生视频/文本生视频/首尾帧等）
- Audio/TTS
- LipSync

### 0.2 非目标（本阶段不做）

- 接入 `gpt-image-2`（你已明确：先打地基再做；本文只预留插槽）

---

## 1. 现状快照：代码地图与主要痛点

### 1.1 现有关键模块（事实依据）

- 模型键与合同（严格 key + capabilities schema）：`src/lib/model-config-contract.ts`
- 运行时 provider/model 解析与选择（严格从配置中心读）：`src/lib/api-config.ts`
- Profile/API Config 读写与校验（服务端单一入口）：`src/lib/user-api/api-config.ts`
- API Config operations（route 下沉）：`src/lib/operations/user-api-config-ops.ts`
- 项目/用户默认模型 + capability defaults/overrides + 并发配置：`src/lib/config-service.ts`
- 媒体生成入口：`src/lib/ai-exec/media/generator-api.ts`
- 生成器实现：`src/lib/generators/*`
- OpenAI-compatible adapter：`src/lib/ai-providers/adapters/openai-compatible/*`
- LLM：`src/lib/llm/chat-completion.ts`、`src/lib/llm/vision.ts`
- 任务队列与 worker：`src/lib/task/*`、`src/lib/workers/*`
- 异步轮询：`src/lib/async-poll.ts`（externalId 标准化）
- 官方 provider 模型注册白名单：`src/lib/ai-providers/official/model-registry.ts` + `src/lib/ai-providers/*/catalog.ts`
- 前端 API Config 设置：`src/app/[locale]/profile/components/api-config/*`
- 后端 API Config route（薄转发）：`src/app/api/user/api-config/route.ts`

### 1.2 主要痛点（归因到“缺少统一抽象层”）

1) **多源真相**

- 前端硬编码 `PRESET_MODELS/PRESET_PROVIDERS`：`src/app/[locale]/profile/components/api-config/types.ts`
- 后端还有 capabilities/pricing catalog：`standards/capabilities/*` + `src/lib/model-capabilities/*` + `src/lib/model-pricing/*`
- runtime 分流还散落在：`src/lib/ai-exec/media/generator-api.ts`、`src/lib/generators/factory.ts`、`src/lib/llm/*`

2) **能力(特性)不闭环**

- capability catalog 覆盖有限，真实约束/映射写死在 generator/gateway 内
- 容易出现“UI 能选、worker/调用拒绝”或“route/worker/billing 语义不一致”

3) **执行治理多层叠加**

- BullMQ attempts/backoff（`src/lib/task/queues.ts`）
- worker lifecycle 的 retry/rollback（`src/lib/workers/shared.ts`）
- BaseGenerator 内部重试（`src/lib/generators/base.ts`）
- LLM 自己循环重试（`src/lib/llm/chat-completion.ts`）

结果：重试次数不透明、成本不可控、错误链路难追踪。

4) **“严格失败原则”在少数地方被弱化（需要在迁移中收敛）**

- image capability 的 `resolution` 自动补全（`src/lib/model-capabilities/lookup.ts`）
- provider alias fallback（capabilities: `src/lib/model-capabilities/catalog.ts`；pricing: `src/lib/user-api/api-config.ts`）如果不受控，会演变为“隐式替换”
- `src/lib/ai-exec/media/generator-api.ts` 中仍存在 `gemini-compatible` 的 DEPRECATED runtime 分支（为历史数据绕迁移），需要在后续阶段明确迁移与删除路径
- 已有 guard 脚本在固化约束（如 `scripts/guards/no-model-key-downgrade.mjs`、`scripts/guards/no-provider-guessing.mjs`、`scripts/guards/no-media-provider-bypass.mjs`），迁移计划应把它们当作硬护栏而不是“额外检查”

---

## 2. “同一模型多平台”的表达：派生 / 引用

你提出的“显示为不同模型，例如 `gpt-xx（openrouter源）`”非常合理；关键是不要用 OOP 继承树去承载运行时分流，而用**数据模型的引用/派生（overlay）**来承载差异，再由 Adapter 组合（composition）承载实现。

### 2.1 术语（建议统一命名）

- **ProviderKey**：平台类型（`openai`、`openrouter`、`ark`、`google`、`openai-compatible`…）
- **ProviderId**：平台实例（允许多实例，如 `openai-compatible:uuid`）
- **ModelKey**：运行时唯一键（严格）：`providerId::modelId`（注意：`providerId` 允许包含 `:`，但分隔符固定为 `::`，与 `parseModelKeyStrict` 语义一致）
- **ModelFamilyRef**：语义同一模型的“家族引用”（用于 UI 分组/展示/能力基线；不参与运行时唯一键）
- **ModelVariant**：某个平台上的某个模型实现（运行时 = ModelKey），带来源信息与能力差异

### 2.2 推荐的数据关系（引用 + overlay）

- `ModelFamily`：统一 displayName、基线能力声明（capabilities baseline）、官方文档链接等
- `ModelVariant`：引用 `ModelFamilyRef`，并通过 overlay 显式覆盖差异：
  - 禁用字段（某平台不支持）
  - 枚举缩小（某平台只开放部分分辨率/时长）
  - 执行模式差异（sync vs async vs stream/batch）
  - 参数映射差异（同一“统一字段”映射到平台 API 的不同字段）

> 关键约束：Variant 之间不允许隐式互换（不做自动降级/替代），用户必须显式选择具体 ModelKey。

### 2.3 UI 显示策略（你要的“不同模型”体验）

由服务端生成 `displayLabel`，前端只渲染，避免多处拼接漂移：

- `displayName`：`GPT-5.4`
- `sourceLabel`：`OpenRouter` / `OpenAI` / `Ark` / …
- `displayLabel`：`GPT-5.4（OpenRouter）`

---

## 3. 目标架构：Factory + Adapter + Execution Governance（单一真相）

### 3.1 总览图

```
   ┌──────────────────────────────┐
   │  API Config (server)         │  ← 生成 catalog + 校验 user config
   └─────────────┬────────────────┘
                 │
                 ▼
   ┌──────────────────────────────┐
   │  AI Registry (Factory)       │  ← 解析 ModelKey → ProviderAdapter
   └─────────────┬────────────────┘
                 │
                 ▼
   ┌──────────────────────────────┐
   │  AI Execution Engine         │  ← 统一参数归一化/校验/治理
   └───────────┬───────────┬──────┘
               │           │
               ▼           ▼
   ProviderAdapters     Task/Workers(BullMQ)
   (openai/ark/...)     (retry/rollback/poll/events)
```

### 3.2 模块边界（建议新增/调整）

> 目录名仅建议；关键是边界与职责。

```
src/lib/ai-registry/
  types.ts
  registry.ts
  catalog.ts
  display.ts

src/lib/ai-providers/
  adapters/
    openai-compatible/
      index.ts
      modalities/
        llm.ts
        image.ts
        video.ts
        audio.ts
        lipsync.ts
      models/
        index.ts
        *.ts
      errors.ts
    openrouter/
      index.ts
      modalities/
        llm.ts
      models/
        index.ts
        *.ts
      errors.ts
    google/
      index.ts
      modalities/
        llm.ts
        image.ts
        video.ts
      models/
        index.ts
        *.ts
      errors.ts
    ark/
      index.ts
      modalities/
        llm.ts
        image.ts
        video.ts
      models/
        index.ts
        *.ts
      errors.ts
    fal/
      index.ts
      modalities/
        image.ts
        video.ts
        audio.ts
        lipsync.ts
      models/
        index.ts
        *.ts
      errors.ts
    minimax/
      index.ts
      modalities/
        llm.ts
        video.ts
      models/
        index.ts
        *.ts
      errors.ts
    vidu/
      index.ts
      modalities/
        video.ts
        lipsync.ts
      models/
        index.ts
        *.ts
      errors.ts
    bailian/
      index.ts
      modalities/
        llm.ts
        video.ts
        audio.ts
      models/
        index.ts
        *.ts
      errors.ts
    siliconflow/
      index.ts
      modalities/
        llm.ts
        video.ts
        audio.ts
      models/
        index.ts
        *.ts
      errors.ts
  shared/
    (no copy)          # 直接复用 src/lib/media/outbound-image.ts，禁止新建“镜像版”能力模块

src/lib/ai-exec/
  engine.ts
  governance.ts
  normalize.ts
```

### 3.3 显式对应关系：平台 / 模型 / 文件夹如何一一映射

目标是把“模型定义与调用散乱”变成**可导航的目录边界**：看到一个 `modelKey`，就能快速定位到它的平台 adapter、它的模型定义（capabilities/optionSchema/inputContracts）、以及对应模态的执行实现位置。

#### 3.3.1 平台（providerKey）→ adapter 文件（唯一归属）

- **每个 `providerKey` 必须只有一个 adapter 入口**：`src/lib/ai-providers/adapters/<providerKey>/index.ts`
- 该目录下可以按 `modality` 拆分多个执行实现文件（例如 `modalities/image.ts`/`modalities/audio.ts`），但对外暴露的 adapter 只能由 `index.ts` 统一导出/注册。
- 任何“该平台怎么调 API / 怎么映射参数 / 怎么解析响应 / 怎么归一化错误”的逻辑，只能在对应 provider 目录中出现。
- `src/lib/ai-exec/engine.ts` 只能做编排：解析 `providerId` → `providerKey` → 找 adapter，不允许写平台 if/switch。

> 说明：执行实现**允许**全部直接写在 `index.ts`（TypeScript 没有限制），但推荐按 `modalities/*` 拆分以控制文件体积、隔离依赖、便于测试与显式不支持某些模态。小 provider/单模态可以不拆，复杂 provider/多模态建议拆。

#### 3.3.2 能力与参数（capabilities/options）→ models 定义（唯一归属）

在本设计中不引入单独的 `ai-capabilities` 模块：能力与参数合同直接随**模型定义（catalog）**收敛，避免出现“第三份 schema/能力真相源”。

约定：

- 每个模型定义必须显式声明它支持的 `modalities`，并在同一处（`src/lib/ai-providers/adapters/<providerKey>/models/*.ts`）提供：
  - UI 可选项（capabilities）口径（按 modality 分组）
  - runtime options 白名单/互斥/值域（optionSchema，按 modality 分组）
  - inputContracts（如 vision 引用图数量、image edit 是否支持 mask 等）
- 严禁在 worker/gateway/generator/engine 中散落 “allowedKeys/字段校验/默认值补全” 的平台分支；必须回收到对应 provider 的 `models/*` 内。

> 多模态模型的处理：一个 `modelKey` 可以在 catalog 中同时声明多个 modality 的能力/optionSchema，但在运行时解析与执行仍以 `(modelKey, modality)` 为最小单元（避免把“同模型不同模态”混成一次调用接口）。

#### 3.3.3 模型（ModelVariant / Family）→ catalog/descriptor（数据化归属）

- “一个可选模型”最终应落为一个 **ModelVariant（一个 `modelKey = providerId::modelId`）**。
- 模型展示名、来源标签、能力差异（overlay）应以结构化数据进入 `src/lib/ai-providers/adapters/<providerKey>/models/*.ts`，并由 `models/index.ts` 汇总导出（便于检索与测试）。
- adapter 的 `describeVariant()` 只负责把 model definition（capabilities + optionSchema + inputContracts）与 overlay 组合成 `ModelVariantDescriptor`，而不是临时拼装一堆 hardcode；不允许在 describe 中临时维护第二份模型列表。

#### 3.3.4 业务入口（LLM / Media / Voice）→ 统一执行引擎（禁止平台分支外溢）

- 任何业务代码（如 `ai-exec/*`、`llm/*`、`voice/*`）在重构完成后应只做：
  - 选择 `modelKey`
  - 调用 `src/lib/ai-exec/engine.ts` 的相应方法
- 业务入口中不应再出现 `providerKey === 'xxx'` 的分支（平台差异一律由 adapter 承接）。

---

## 4. 核心合同（Types / Schema）——保证可扩展与一致性

### 4.1 ModelVariantDescriptor：把“散乱逻辑”收敛为结构化声明

每个 `(providerKey, modality, modelId)` 都应能得到 descriptor：

- `display`: `{ name, sourceLabel, label }`
- `execution`: `{ mode: 'sync'|'async'|'stream'|'batch', externalIdPrefix? }`
- `capabilities`: UI 用的可选项（枚举/范围；与计费维度对齐）
- `optionSchema`: runtime options 的严格白名单与值域（比 capabilities 更严格）
- `inputContracts`: 引用图数量、是否必须 base64、是否支持 mask、视频首尾帧等

示意（禁止 any；这里用 `unknown` 作为过渡，最终应强类型化）：

```ts
export type Modality = 'llm' | 'vision' | 'image' | 'video' | 'audio' | 'lipsync'
export type ExecutionMode = 'sync' | 'async' | 'stream' | 'batch'

export type OptionSchema = {
  allowedKeys: ReadonlySet<string>
  required?: readonly string[]
  conflicts?: ReadonlyArray<{ keys: readonly string[]; message: string }>
  validators: Readonly<Record<string, (value: unknown) => { ok: true } | { ok: false; reason: string }>>
}

export type ModelVariantDescriptor = {
  modelKey: string
  providerKey: string
  providerId: string
  modelId: string
  modality: Modality

  familyRef?: string

  display: {
    name: string
    sourceLabel: string
    label: string
  }

  execution: {
    mode: ExecutionMode
    externalIdPrefix?: string
  }

  capabilities: Record<string, unknown>
  optionSchema: OptionSchema
  inputContracts?: Record<string, unknown>
}
```

---

## 5. Factory + Adapter：职责拆分（更细的设计）

### 5.1 ProviderAdapter（按 providerKey 注册）

每个平台一个 adapter，内部**先薄封装复用现有逻辑**：

- `openai-compatible` adapter：使用 `src/lib/ai-providers/adapters/openai-compatible/*`
- `ark` adapter：复用 `src/lib/generators/ark.ts` / `src/lib/ai-providers/llm/ark.ts`
- `google` adapter：复用 `src/lib/generators/image/google.ts` / `src/lib/generators/video/google.ts`
- `bailian/siliconflow` adapter：复用 `src/lib/ai-providers/*`

建议接口（核心点：describe + execute）：

```ts
export type ProviderAdapter = {
  providerKey: string
  supports: ReadonlySet<Modality>

  describeVariant: (input: {
    userId: string
    providerId: string
    modelId: string
    modality: Modality
  }) => Promise<ModelVariantDescriptor>

  execute: (input: {
    userId: string
    providerId: string
    modelId: string
    modelKey: string
    modality: Modality
    request: NormalizedRequest
    governance: ExecutionGovernanceSnapshot
  }) => Promise<ExecutionResult>
}
```

### 5.2 AI Registry（Factory）只负责“解析与路由”，不做业务

- `registerProviderAdapter(adapter)`
- `resolveProviderAdapter(providerId)`：通过 `getProviderKey(providerId)`（沿用 `src/lib/api-config.ts#getProviderKey` 语义）
- `resolveDescriptor(modelKey, modality)`：定位 adapter → adapter.describeVariant

### 5.3 用“引用 + overlay”表达同一模型多平台差异

推荐做法：

- `ModelFamily` 提供基线能力与显示名
- `ModelVariant` 引用 family，并通过 overlay 显式声明差异：
  - `disabledKeys: [...]`
  - `capabilityOverrides: {...}`
  - `executionOverrides: {...}`

严禁隐式兜底：缺关键字段必须报错，不允许“自动补第一个选项”。

---

## 6. 统一执行治理（Execution Governance）

### 6.1 单一治理层原则（去叠加）

- **长任务（image/video/audio/lipsync）**：以 BullMQ 为主治理（attempts/backoff/并发）
- adapter/generator 内部避免再做多层重试（最多一次幂等网络抖动重试且可观测）
- 统一错误：归一化为 `AiRuntimeError`（可复用 `src/lib/ai-runtime/errors.ts` 思路）

当前 `src/lib/generators/base.ts` 与 `src/lib/llm/*` 仍在做重试循环；迁移阶段应把重试“上收”到单一层，并用测试锁住 attempts/backoff 的总上限。

### 6.2 并发：从进程内 gate 升级为跨进程 gate

现状：`src/lib/workers/user-concurrency-gate.ts` 为内存 Map，多实例不一致。

建议：

- 抽象 `ConcurrencyGate` 接口
- Redis semaphore / BullMQ limiter 实现跨进程一致限制
- `workflowConcurrency`（`src/lib/config-service.ts`）作为唯一数据源

---

## 7. 能力与参数：capabilities vs request options（明确边界）

### 7.1 两条输入链路（必须统一）

1) **可配置能力（capability selections）**

- 设置页保存：`capabilityDefaults`（前端 `src/app/[locale]/profile/components/api-config/hooks.ts`）→ 后端 `src/lib/user-api/api-config.ts` 校验 → DB
- worker 执行时注入 generationOptions（后端 `src/lib/config-service.ts`）

2) **运行时 request options**

- 来自任务 payload、交互输入
- 必须通过 descriptor.optionSchema 严格白名单 + 值域校验；未知字段直接报错

当前能力校验主要通过 `src/lib/model-config-contract.ts` + `src/lib/model-capabilities/*` 实现，且存在 provider alias 与 image resolution autofill。后续阶段应把 “alias/默认值”显式化为数据层规则（可审计、可测试），避免散落在 lookup/runtime 分支中。

### 7.2 解决“同模型多平台能力不一致”

同一 family 的不同 variant：

- capabilities 可以不同（例如某渠道不支持 `generateAudio`）
- optionSchema 可以不同（例如某渠道不允许 `reasoningEffort`）

差异必须由 descriptor 显式声明，不允许在调用代码里散落 if/else。

---

## 8. 前端 Profile/设置：现状分析与优化/重构方案

### 8.1 现状问题

- 前端硬编码预设：`src/app/[locale]/profile/components/api-config/types.ts`
- 本地合并/启用/保存逻辑复杂：`src/app/[locale]/profile/components/api-config/hooks.ts`
- 服务端也做校验/alias/capability/pricing enrichment：`src/lib/user-api/api-config.ts`（route 已下沉为 operation 转发）

结果：新增平台/模型需要改前端大文件；catalog 与 runtime 漂移；“来源(openrouter源)”显示逻辑容易散落。

服务端 `src/lib/user-api/api-config.ts` 已经在 GET 响应中做了 pricingDisplay、capabilities enrichment 等“catalog 化”工作，但前端仍保留 `PRESET_MODELS/PRESET_PROVIDERS` 作为第二真相源。下一步应把前端 preset 收敛为“仅用于空态 skeleton/引导”的最小集合，或完全移除。

### 8.2 Server-driven Catalog（推荐：前端移除巨大 preset 列表）

让服务端返回 catalog（单一真相），前端只渲染 + 编辑用户选择：

- `catalog.providers[]`：可配置字段、校验规则、显示名
- `catalog.modelVariants[]`：每个 variant = 一个 `modelKey`，带 `displayLabel/sourceLabel/capabilities`
- `userConfig`：用户启用集合、默认模型字段、capability defaults、并发配置

### 8.3 前端 hooks 拆分（从“巨型 hooks.ts”变成可维护模块）

把 `src/app/[locale]/profile/components/api-config/hooks.ts` 拆分为：

- `useApiConfigQuery()`：只负责拉取/缓存
- `useApiConfigEditor(catalog, userConfig)`：只负责编辑状态、dirty tracking、提交
- `selectors.ts`：纯函数派生（分组、label、排序、comingSoon 过滤等）

并显式区分 DTO：

- `CatalogModelVariant`（只读）
- `UserEnabledModelKeys`（可写）
- `UserDefaultModels`（可写）
- `UserCapabilityDefaults`（可写）

### 8.4 模型显示：把“来源”变成一等字段（满足你的展示诉求）

在 catalog 中增加字段：

- `sourceKind`: `'official' | 'aggregator' | 'compatible' | 'self_hosted'`
- `sourceLabel`: `'OpenAI' | 'OpenRouter' | 'Volc Ark' | ...`

UI 展示策略：

- 主标题：familyName 或 model short name
- 后缀/副标题：`sourceLabel`（例如 `GPT-5.4（OpenRouter）`）
- tooltip：解释差异（例如某 aggregator 对 reasoning/stream/vision 支持与官方不同）

---

## 9. 迁移计划（分阶段收敛，最终清理旧逻辑）

> 原则：每阶段都可独立上线/回滚；每一步都要补齐或更新测试；不做自动回退/降级。

### Phase 0：准备（不改变行为）

- [ ] 增加/固化术语与 contract（本文件 + types 草案）
- [ ] 统一 `ModelKey/ProviderKey` 工具函数位置（先 re-export，不改行为）
- [ ] 在 tests 增加“displayLabel 拼接与分组”的纯函数测试（为 UI 迁移保驾护航）
- [ ] 把 guard 作为迁移护栏纳入阶段定义（例如：modelKey 严格、禁止 provider guessing、禁止 media provider bypass）

### Phase 1：建立地基（Registry + Adapter 骨架；复用旧实现）

产物：

- [x] `src/lib/ai-registry/types.ts`：已定义 `AiModality` / `AiExecutionMode` / `AiModelVariantDescriptor` / `AiMediaAdapter` 等骨架类型
- [x] `src/lib/ai-registry/registry.ts`：已提供按 providerKey 注册与按 providerId 解析 adapter 的基础能力
- [x] `src/lib/ai-exec/engine.ts`：已提供 media / LLM / LLM stream / Vision 的 request-object execution engine；旧函数签名保留为 wrapper，便于渐进迁移调用点

迁移（保持行为不变）：

- [x] 删除 `src/lib/generator-api.ts`，由 `src/lib/ai-exec/engine.ts` / `src/lib/ai-exec/media/generator-api.ts` 直接承接 media 入口
- [x] `src/lib/llm/chat-completion.ts` / `src/lib/llm/vision.ts`：旧路径已 re-export 到 `src/lib/ai-exec/llm/*`；LLM sync 与 Vision provider 分支已下沉到 `src/lib/ai-providers/adapters/llm/execution.ts`
- [x] `src/lib/llm/chat-stream.ts`：已迁移到 `src/lib/ai-providers/adapters/llm/stream-execution.ts`；旧路径与 `src/lib/ai-exec/llm/chat-stream.ts` 均仅保留 re-export
- [x] `src/lib/ai-runtime/client.ts`：已从 `model-gateway/llm` 改为调用 `ai-exec/engine`，避免形成第二套 runtime 外观

测试：

- [ ] 更新/补齐 `tests/unit/generator-api.test.ts`、`tests/unit/llm/*`，锁住分流行为

### Phase 2：收敛 options/schema（去掉散落的 key 白名单与值校验）

产物：

- [x] 各 provider 的 media option/model 规格已按 provider 拆入 `src/lib/ai-providers/adapters/models/{ark,fal,minimax,openai-compatible,vidu}.ts`，作为 optionSchema 单一真相源
- [~] adapter.describeVariant 从 models 输出 `ModelVariantDescriptor`：media descriptor 已读取 provider models 规格生成 optionSchema；capabilities 仍来自 `model-capabilities` catalog，inputContracts 仍待后续统一
- [x] 已建立 `src/lib/ai-providers/adapters/*` 的 descriptor 起点，media 入口会读取 `execution.mode` 与 `optionSchema`
- [x] 已建立 `src/lib/ai-exec/normalize.ts`，未知 options / required / oneOf / conflict / field validator / object validator 会在 media 入口直接失败
- [x] media 实际执行分流已从 `src/lib/ai-exec/media/generator-api.ts` 抽到 `src/lib/ai-providers/adapters/media/execution.ts`；selection、descriptor 校验与执行转发已上收到 `src/lib/ai-exec/engine.ts`，media facade 仅保留兼容 re-export

迁移：

- [~] 将 `openai-compat`、`ark/minimax/vidu/fal` 的 option keys 与值校验迁移到各自 provider 的 catalog（或 model definition）：已把 `openai-compatible` image/video、`ark` image/video、`fal` image/video、`bailian` video、`minimax` video、`vidu` video 的关键字段和值/组合校验收敛到 adapter descriptor，并把规格常量按 provider 拆到 adapter models；capabilities/inputContracts 合并仍待后续推进
- [x] engine 统一 `normalizeAndValidate(requestOptions, optionSchema)`：media engine 已统一读取 descriptor optionSchema 并显式失败；LLM/Vision 已新增 descriptor optionSchema 校验（unknown key/值域校验），由 runner 在 resolved selection 后统一验证

清理（逐步）：

- [x] 下线 `Base*Generator` 内部重试（避免与 BullMQ/worker 重试叠加）：`BaseImageGenerator` / `BaseVideoGenerator` 已改为单次执行失败返回，由 worker/BullMQ 负责重试治理，并补 `tests/unit/ai-providers/media-base-generator.test.ts`
- [~] 精简 gateway/generator 内部重复校验（保留最底层安全校验）：入口层已由 descriptor optionSchema 前置失败，底层 provider 仍保留安全校验
- [x] 移除/替换 `image resolution autofill`：image capability 不再强制要求 resolution；前端切换默认模型时不再自动写入 capabilityDefaults（避免隐式“选第一个”），resolution 作为 request option 仍可显式传入并由 optionSchema 校验

### Phase 3：并发治理升级（跨进程 gate）

- [~] Redis semaphore/BullMQ limiter 替换 `src/lib/workers/user-concurrency-gate.ts` 的内存 gate：已落地可显式开启的 Redis gate 模式（`AI_CONCURRENCY_GATE_MODE=redis`），默认仍保持 memory gate；后续需结合基础设施与 system 测试验证
- [x] `src/lib/workers/user-concurrency-gate.ts` 已改为复用 `src/lib/ai-exec/governance.ts`
- [~] 系统测试覆盖“多任务并发 + 限流”边界：已补 unit 边界覆盖同用户同 scope 串行、不同用户/scope 独立运行、非法 limit 显式失败；跨进程 limiter 落地后仍需补 system/integration 覆盖

### Phase 4：Server-driven Catalog（前端设置重构）

产物：

- [x] `/api/user/api-config` GET 返回 `catalog + userConfig`
- [x] 前端移除巨大 `PRESET_MODELS/PRESET_PROVIDERS` 内联列表，改为同源 catalog re-export；`useProviders` 优先使用 server catalog

迁移：

- [x] `src/app/[locale]/profile/components/api-config/hooks.ts` 拆分为 query/editor/selectors：新增 `query.ts`（拉取 + reload）与 `editor.ts`（保存），纯派生已下沉 `selectors.ts`；并移除客户端内联 preset 列表（不再把 server catalog 常量打进 client bundle）
- [~] ProviderCard/DefaultModelSection 基于 catalog 渲染（当前主列表已由 catalog 驱动；来源/label 统一仍待 descriptor 化）

测试：

- [x] 补 `GET /api/user/api-config` 返回 catalog 的契约覆盖，并复跑 api-config preset 相关测试
- [~] 继续补 provider alias、label、排序、pricing display、capability defaults 的细粒度单测：已新增 selector 单测覆盖 server catalog model 排序/启用状态、provider alias pricing、默认模型清理；capability defaults 仍待补更细覆盖

### Phase 5：清理旧入口（完成收敛）

当前清理状态：

- [x] `scripts/guards/no-legacy-ai-entry-imports.mjs` 禁止业务/测试新增 `@/lib/generators/**`、`@/lib/model-gateway/**`、`@/lib/llm/{chat-completion,chat-stream,vision}` 与 `@/lib/ai-exec` 兼容入口 import；现有相关测试已改为新 adapter/engine 路径。
- [x] `src/lib/generators/**`、`src/lib/llm/{chat-completion,chat-stream,vision}.ts`、`src/lib/ai-exec/{media/generator-api,llm/chat-completion,llm/chat-stream,llm/vision}.ts` 兼容入口已物理删除。

原则：旧执行入口已经物理删除，新业务代码只能依赖 `src/lib/ai-exec/**` 与必要的 `src/lib/ai-registry/**`。后续只保留非执行型公共纯函数目录（如 `src/lib/llm/*helpers`），禁止恢复旧 facade。

目标依赖方向：

```txt
业务 / worker / route
        ↓
src/lib/ai-exec
        ↓
src/lib/ai-registry
        ↓
src/lib/ai-providers/adapters/<providerKey>
        ↓
具体 SDK / HTTP / gateway 细节
```

目录迁移策略：

- `src/lib/llm/{chat-completion,chat-stream,vision}.ts`：已删除；公共纯函数暂保留在 `src/lib/llm/**` 支撑 runtime-shared / stream helpers，执行入口统一走 `src/lib/ai-exec/engine`。
- `src/lib/generators/**`：已删除；真实实现位于 `src/lib/ai-providers/adapters/media/generators/**`，测试与业务均应走 adapter/engine 路径。
- `src/lib/model-gateway/**`：已删除；OpenAI-compatible 实现位于 `src/lib/ai-providers/adapters/openai-compatible/**`，路由类型位于 `src/lib/ai-registry/gateway-route.ts`。
- `src/lib/ai-runtime/**`：若保留，只作为业务 step runtime，内部必须调用 `src/lib/ai-exec/engine`；不得再形成第二入口。
- `src/lib/ai-exec/media/generator-api.ts`：已删除；selection、descriptor 校验与执行转发归属 `src/lib/ai-exec/engine.ts`。

候选清理项（按阶段删，不一次性删光）：

- 已完成：`src/lib/generators/factory.ts` 所在旧目录已删除；真实 factory 位于 `src/lib/ai-providers/adapters/media/generators/factory.ts`，后续再由 registry/adapter 替代内部 switch/case。
- 已完成：`src/lib/ai-exec/media/generator-api.ts` 已删除；media providerKey 分支位于 adapter execution，入口编排归属 engine。
- `src/app/[locale]/profile/components/api-config/types.ts` 的巨大 preset 列表（由 catalog 替代）
- 后续：清理 adapter execution 中仍保留的 `gemini-compatible` DEPRECATED runtime 语义（通过数据迁移或 config 标准化清理）。

推荐落地顺序：

1) 先给 `AiProviderAdapter` 增加统一执行接口（`executeLlm` / `executeVision` / `executeImage` / `executeVideo` / `executeAudio`，可按 provider 支持度逐步实现）。
2) 已完成：LLM sync / stream / vision 旧执行入口已删除或下沉，engine 提供 request-object 入口。
3) 已完成：media facade 已删除，入口编排在 engine，provider 分支在 adapter execution。
4) 后续：把 adapter execution 内部 switch/case 继续替换为 provider adapter execute 接口。
5) 最后合并模型真相源：由 provider `models/*` 生成 API Config catalog / capabilities / pricing display 所需数据，避免 catalog 与 runtime descriptor 双写。

当前物理迁移状态：

- [x] `src/lib/model-gateway/openai-compat/**` 已迁入 `src/lib/ai-providers/adapters/openai-compatible/**`；旧 compat 目录已删除。
- [x] `src/lib/generators/**` 已迁入 `src/lib/ai-providers/adapters/media/generators/**`；旧目录已删除。
- [x] `src/lib/model-gateway/llm.ts` 已删除；旧 `model-gateway` LLM wrapper 测试已迁到 `ai-runtime -> ai-exec` 入口。
- [x] `src/lib/model-gateway/router.ts` / `types.ts` 已删除；真实定义迁到 `src/lib/ai-registry/gateway-route.ts` 与 `src/lib/ai-providers/adapters/openai-compatible/types.ts`。

---

## 10. 与 image gpt-image-2 的关系（按你的要求：地基后再接入）

Phase 1/2 完成后再接入 `gpt-image-2`：

- 只需新增/更新 `openai` adapter 的 image variant descriptor（flexible sizes）
- UI 先保持“常见尺寸下拉”；后期增加 `flexible-image-sizes` 时，在下拉末尾增加“自定义尺寸”选项即可

---

## 11. 附：新增平台/新视频模型的接入“完成定义”

当架构落地后，新增平台/视频模型的定义应满足：

- 有 `ProviderAdapter`（平台级）
- 有 `ModelVariantDescriptor`（模型变体级：capabilities + optionSchema + execution mode）
- 有 route→task→worker 的 payload contract（字段语义一致）
- async 模型必须有 externalId + poll 映射（复用/扩展 `src/lib/async-poll.ts`）
- 有测试：provider contract + unit + regression（新特性字段边界必须覆盖）

---

## 12. 附：新增平台/新视频模型的“实现配方”（开发 checklist）

1) 定义 providerKey 与 provider config 字段（严格校验缺失即报错）
2) 实现 `ProviderAdapter.describeVariant`（能力声明与 schema）
3) 实现 `ProviderAdapter.execute`（只做翻译与调用，不做复杂回退/多层重试）
4) 若为 async：定义 externalId 格式，并在 `async-poll` 增加状态映射
5) 保持 route 薄：鉴权/校验/创建 task/enqueue/响应；worker 执行业务与落库
6) 补测试：contract + regression（覆盖新特性字段、互斥字段、范围校验、失败场景）
