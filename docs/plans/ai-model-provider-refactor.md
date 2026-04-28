# AI 模型/平台接入统一化重构（目标态 + 物理迁移映射 + 4 步自下而上落地）

> 本文是 **设计契约**，不是状态板。任何"已完成 / 进行中 / 时间戳"信息一律放在 [`./ai-model-provider-refactor-status.md`](./ai-model-provider-refactor-status.md)。
>
> 本文每一条规则都视为**硬约束**：违反必须先来改本文。

---

## 0. 目标与非目标

### 0.1 唯一目标

仓库里所有"AI 模型 / 平台 / 调用方式 / 能力 / 价格 / 选择 / 校验"相关代码，**仅允许**存在于 `src/lib/` 下的 **3 个** `ai-*` 目录：

```
src/lib/ai-providers/   ← 各 provider 的所有实现（按 provider 一切到底）
src/lib/ai-registry/    ← 类型 / 合同 / 选择 / catalog fan-out（元数据层）
src/lib/ai-exec/        ← 唯一执行入口 + 治理（动作层）
```

**任何其他 `src/lib/*` 路径都不允许出现 AI 调用、AI 模型常量、AI 能力 / 价格定义、provider 切换逻辑。** 由 guard 脚本固化（见 §6）。

### 0.2 非目标

- 不接入 `gpt-image-2`（地基稳定后再说）
- 不重做并发 gate / 跨进程 limiter（独立工单，与本重构正交）
- 不重做前端 Profile/API Config UI 拆分（独立工单，前端只负责消费 `ai-registry/catalog.ts` 输出）

---

## 1. 抽象核心：单一 `AiProviderAdapter`

### 1.1 唯一 adapter 接口

`AiMediaAdapter` 这种"按 modality 切的 adapter"是错误抽象。**统一为 `AiProviderAdapter`，按 modality 暴露可选子接口**：

```ts
// src/lib/ai-registry/types.ts

export type AiModality =
  | 'llm' | 'vision' | 'image' | 'video' | 'audio' | 'lipsync'

export type AiExecutionMode = 'sync' | 'async' | 'stream' | 'batch'

export interface AiVariantDescriptor {
  modelKey: string                  // providerId::modelId
  providerKey: string
  providerId: string
  modelId: string
  modality: AiModality

  display: { name: string; sourceLabel: string; label: string }
  execution: { mode: AiExecutionMode; externalIdPrefix?: string }

  capabilities: AiCapabilities      // 强类型，禁止 Record<string, unknown>
  pricing?: AiPricing               // 强类型
  optionSchema: AiOptionSchema      // request options 白名单 + 校验
}

export interface AiProviderAdapter {
  readonly providerKey: string

  llm?:     AiModalityAdapter<'llm'>
  vision?:  AiModalityAdapter<'vision'>
  image?:   AiModalityAdapter<'image'>
  video?:   AiModalityAdapter<'video'>
  audio?:   AiModalityAdapter<'audio'>
  lipsync?: AiModalityAdapter<'lipsync'>
}

export interface AiModalityAdapter<M extends AiModality> {
  describe(modelId: string): AiVariantDescriptor
  execute(input: AiExecuteInput<M>): Promise<AiExecuteResult<M>>
  stream?(input: AiExecuteInput<M>, cb: AiStreamCallbacks<M>): Promise<AiExecuteResult<M>>
  poll?(externalId: string): Promise<AiPollResult<M>>          // 仅 async
}
```

### 1.2 强约束

- adapter 内部**禁止** `if (providerKey === ...)` —— 一旦出现，说明抽象漏了。
- adapter 内部**禁止** 自己跑重试循环（重试由 BullMQ + worker + `ai-exec/governance` 唯一治理）。
- adapter 内部**禁止** 自己读取用户配置 / DB / catalog —— `ai-exec/engine` 把 selection + providerConfig 注入进来。
- `AiVariantDescriptor` 是**该 (provider, modelId, modality) 的完整真相** —— `capabilities`、`pricing`、`optionSchema` 三件套必须在这里产出，不允许再从别处拼装。

### 1.3 OpenAI-compat 用户自定义模板的归位

用户自定义的 OpenAI-compat 模板**不是跨 provider 的概念**，是 `openai-compatible` adapter 的内部变体：

```ts
// src/lib/ai-registry/types.ts
export type AiVariantSubKind = 'official' | 'user-template'

export interface AiResolvedSelection {
  provider: string
  modelId: string
  modelKey: string
  variantSubKind: AiVariantSubKind
  variantData?: Record<string, unknown>   // 仅本 provider 自己解读
}
```

**禁止**在 `AiResolvedSelection` 里塞 `compatMediaTemplate`、`llmProtocol` 等 provider-specific 字段（当前 `ai-registry/types.ts` 的 `AiResolvedMediaSelection` 必须删除）。

---

## 2. 最终目录结构

### 2.1 物理树（**唯一允许形态**）

```
src/lib/ai-providers/
  index.ts                           ← 注册所有 adapter，导出 registry
  shared/                            ← 跨 provider 复用工具（错误归一/HTTP/类型 helpers）
    http.ts
    errors.ts
    helpers.ts

  openai-compatible/                 ← 一切到底：
    adapter.ts                       ← export const openAiCompatibleAdapter: AiProviderAdapter
    models.ts                        ← 该 provider 全模型真相（capabilities + pricing + optionSchema）
    llm.ts                           ← chat/responses/stream
    image.ts
    video.ts
    user-template.ts                 ← 取代 src/lib/openai-compat-template-runtime.ts
    errors.ts

  ark/
    adapter.ts
    models.ts                        ← 取代 ark/image/video/audio 的所有规格常量
    llm.ts                           ← 取代 src/lib/ark-llm.ts
    image.ts                         ← 取代 src/lib/ark-api.ts 中 image 部分
    video.ts                         ← 取代 src/lib/ark-api.ts 中 video 部分
    errors.ts

  google/
    adapter.ts
    models.ts
    llm.ts                           ← 取代 src/lib/gemini-batch-utils.ts 中 LLM 部分
    image.ts
    video.ts

  openrouter/
    adapter.ts
    models.ts
    llm.ts

  fal/
    adapter.ts
    models.ts
    image.ts
    video.ts
    audio.ts
    lipsync.ts

  minimax/
    adapter.ts
    models.ts
    llm.ts
    video.ts

  vidu/
    adapter.ts
    models.ts
    video.ts
    lipsync.ts

  bailian/
    adapter.ts
    models.ts                        ← 取代 bailian/catalog.ts
    llm.ts
    image.ts
    video.ts
    audio.ts                         ← TTS / voice-design / voice-clone 全归此
    voice-management.ts              ← 仅当 voice 资源 CRUD 不属于"调用模型"时才单列
    probe.ts

  siliconflow/
    adapter.ts
    models.ts
    llm.ts
    image.ts
    video.ts
    audio.ts
    probe.ts

src/lib/ai-registry/
  types.ts          ← AiModality / AiProviderAdapter / AiVariantDescriptor / AiOptionSchema / 等所有合同
  selection.ts      ← parseModelKey / resolveSelection / getProviderKey（取代 src/lib/api-config.ts 中模型解析部分）
  catalog.ts        ← fan-out 各 adapter.describe → 给前端的 catalog（取代 user-api/api-config-catalog.ts）
  guards.ts         ← 严格 modelKey、ProviderKey 校验工具

src/lib/ai-exec/
  engine.ts         ← 唯一执行入口：路由到 adapter[modality] → normalize → 调用
  normalize.ts      ← optionSchema 校验
  governance.ts     ← retry / 并发 gate（仅接口，实现保留在 workers）/ poll 协议
  llm-helpers.ts    ← runtime-shared / stream-helpers / stream-timeout 合并而来
```

### 2.2 命名与边界硬规则

- 目录名一律 **小写 kebab**；provider 目录名 = `providerKey`，**严禁**别名。
- 每个 provider 目录**必须**有 `adapter.ts` + `models.ts`，其余 modality 文件按需。
- `ai-providers/<x>/models.ts` 是**该 provider 所有 model 真相的唯一来源**。任何能力 / 价格 / 选项规格不允许写在 `models.ts` 之外。
- `openrouter` 视为真实 provider，必须落在 `ai-providers/openrouter/`。
- `legacy` / `system` **不是 provider**。旧 pricing 数据必须在迁移时归并到真实 provider 或物理删除，**禁止**保留 `legacy/`、`system/` 伪 provider 目录或兼容层。
- `ai-providers/shared/` **只放跨 provider 的纯工具**（无 provider 名）。出现任何 `if (providerKey === ...)` 立刻拒收。
- 不再有 `src/lib/ai-providers/adapters/` 这一层中间目录。
- 不再有 `src/lib/ai-providers/llm/`、`ai-providers/official/`、`ai-providers/fal/base-url.ts` 这种"按 modality 跨 provider 切"的目录。

---

## 3. 物理迁移映射表（旧 → 新；这是合同，不是建议）

### 3.1 散落顶层文件

| 旧路径 | 新路径 | 处理方式 |
|---|---|---|
| `src/lib/ark-api.ts` | `ai-providers/ark/{image.ts, video.ts}` | 拆分按 modality 搬迁，删除原文件 |
| `src/lib/ark-llm.ts` | `ai-providers/ark/llm.ts` | 整体搬迁，删除原文件 |
| `src/lib/openai-compat-template-runtime.ts` | `ai-providers/openai-compatible/user-template.ts` | 整体搬迁，删除原文件 |
| `src/lib/openai-compat-media-template.ts` | `ai-providers/openai-compatible/user-template.ts` 内部函数 | 合并，删除原文件 |
| `src/lib/gemini-batch-utils.ts` | `ai-providers/google/llm.ts`（batch 工具）+ `ai-providers/shared/helpers.ts`（通用部分） | 拆分搬迁，删除原文件 |
| `src/lib/llm-client.ts` | `ai-exec/llm-helpers.ts` | 9 行合并，删除原文件 |
| `src/lib/model-config-contract.ts` | schema 类型 → `ai-registry/types.ts`；ModelKey 工具 → `ai-registry/selection.ts`；常量 → 各 `ai-providers/<x>/models.ts` | 拆分搬迁，删除原文件 |
| `src/lib/api-config.ts` | `resolveSelection`/`parseModelKey`/`getProviderKey` → `ai-registry/selection.ts`；其余 user-config 部分 → `user-api/`（与本重构无关） | 拆分搬迁，**删除**原文件（大小目标 0） |

### 3.2 "伪 adapter" 中间层

| 旧路径 | 新路径 |
|---|---|
| `src/lib/ai-providers/adapters/{ark,bailian,google,openai-compatible,siliconflow}.ts` | 删除（10–30 行 facade 全部融入新的 `ai-providers/<x>/adapter.ts`） |
| `src/lib/ai-providers/adapters/index.ts` | 改名为 `src/lib/ai-providers/index.ts` |
| `src/lib/ai-providers/adapters/shared.ts` | `src/lib/ai-providers/shared/helpers.ts` |
| `src/lib/ai-providers/adapters/llm/{descriptor,execution,stream-execution,option-schema}.ts` | **拆光**：每条 `if (providerKey === ...)` 分支搬到对应 `ai-providers/<x>/llm.ts`；descriptor / option-schema 进各 `models.ts`；engine 路由由 `ai-exec/engine.ts` 承担 |
| `src/lib/ai-providers/adapters/media/execution.ts` | **拆光**：同上，各 modality 分支进 `ai-providers/<x>/{image,video,audio}.ts` |
| `src/lib/ai-providers/adapters/media/generators/{ark,fal,minimax,vidu,official}.ts` | 搬入对应 `ai-providers/<x>/{image,video,audio}.ts` |
| `src/lib/ai-providers/adapters/media/generators/{base,factory,resolution-adapter}.ts` | base 抽象删除（adapter 接口取代）；factory 删除（registry 取代）；resolution-adapter 进 `ai-providers/shared/helpers.ts` |
| `src/lib/ai-providers/adapters/media-option-schema.ts` (**410 行 god file**) | **拆光**：每个 `if (providerKey === ...)` 分支搬入对应 `ai-providers/<x>/models.ts`，源文件删除 |
| `src/lib/ai-providers/adapters/models/{ark,fal,minimax,openai-compatible,vidu,media-option-models}.ts` | 各搬入对应 `ai-providers/<x>/models.ts`，删除整个 `models/` 目录 |
| `src/lib/ai-providers/adapters/openai-compatible/{chat,responses,image,video,template-image,template-video,common,types}.ts` | 合并到 `ai-providers/openai-compatible/{llm,image,video,user-template,errors}.ts`，删除整个 `adapters/openai-compatible/` 子目录 |
| `src/lib/ai-providers/llm/{ark,google,openai-compat}.ts` | 搬入对应 `ai-providers/<x>/llm.ts`，删除 `ai-providers/llm/` 目录 |
| `src/lib/ai-providers/official/model-registry.ts` | 数据按 provider 拆入各 `ai-providers/<x>/models.ts`，注册逻辑由 `ai-providers/index.ts` 取代 |
| `src/lib/ai-providers/{bailian,siliconflow,fal}/**` | 已经是按 provider 切，**保留并补齐 `adapter.ts` + `models.ts`**；其余 modality 文件按 §2.1 命名 |

### 3.3 第二/第三/第四套 catalog

| 旧路径 | 新路径 |
|---|---|
| `src/lib/model-capabilities/catalog.ts` | 数据按 provider 拆入各 `ai-providers/<x>/models.ts` |
| `src/lib/model-capabilities/lookup.ts` | `ai-registry/catalog.ts` 内的纯函数（fan-out `registry.list() → adapter.describe(...)`）；**禁止**在 `ai-registry/` 内 import `@/lib/ai-providers/<x>/*`，provider 注册与数据注入仅由 `ai-providers/index.ts` 承担（composition root）。 |
| `src/lib/model-capabilities/{video-effective,video-model-options}.ts` | 进对应 video adapter（`ark/video.ts` 等） |
| `src/lib/model-pricing/catalog.ts` | 数据按 provider 拆入各 `ai-providers/<x>/models.ts` |
| `src/lib/model-pricing/lookup.ts` | `ai-registry/catalog.ts` |
| `src/lib/model-pricing/{version,video-tier}.ts` | `ai-registry/catalog.ts` 内部 helper |
| `src/lib/user-api/api-config-catalog.ts` | `ai-registry/catalog.ts`（user-api 改为 re-export 一行） |
| `src/lib/user-api/api-config.ts`（1905 行） | 仅保留**用户配置 CRUD 与校验入口**；catalog 生成、能力 enrichment、pricing display 全部下沉到 `ai-registry/catalog.ts`（目标 ≤ 300 行） |

### 3.4 冗余的第四个 ai-\* 目录

| 旧路径 | 新路径 |
|---|---|
| `src/lib/ai-runtime/client.ts` | 入参折叠进 `ai-exec/engine.ts` 的 `executeAiTextStep` / `executeAiVisionStep`（直接归并） |
| `src/lib/ai-runtime/{errors,types,index}.ts` | errors → `ai-exec/governance.ts`；types → `ai-registry/types.ts`；目录删除 |

### 3.5 `src/lib/llm/**` 整体搬迁

| 旧路径 | 新路径 |
|---|---|
| `src/lib/llm/{runtime-shared,runtime,stream-helpers,stream-timeout,utils,completion-parts,reasoning-capability}.ts` | 合并为 `ai-exec/llm-helpers.ts`（必要时拆 2 个文件，禁止超 5 个） |
| `src/lib/llm/types.ts` | `ai-registry/types.ts` |
| `src/lib/llm/index.ts` | 删除 |

### 3.6 仍可保留但**不属于本重构**

- `src/lib/llm-observe/**`：日志/观测，不是 AI 调用，不动。
- `src/lib/async-poll.ts` / `src/lib/async-submit.ts` / `src/lib/async-task-utils.ts`：异步任务基础设施，不属 AI 模型层，不动；但 adapter `poll()` 必须使用其协议。
- `src/lib/workers/**`、`src/lib/task/**`：执行治理基础设施，不动；但只能通过 `ai-exec/engine` 调用 adapter。
- `src/lib/billing/**`：通过 `ai-registry/catalog.ts` 读 pricing，不再直接 import `model-pricing/`。
- `src/lib/model-template/**`（在 `user-api` 下）：用户自定义模板的 schema/validator/probe/save，这是用户配置，不动；但 `probe.ts` 调用 LLM 必须经 `ai-exec/engine`。

---

## 4. 4 步自下而上落地

> 原则：**先合真相源，再合实现，再删散文件，最后替 catalog**。每一步独立可上线、可回滚、由 guard 锁定不可逆。

### Step 1 — 合并 catalog 数据为 `ai-providers/<x>/models.ts`

**只动数据**，不改任何运行时调用路径，行为零变化。

- 在每个 `ai-providers/<x>/` 下新建 `models.ts`，把以下 4 处数据合并搬入：
  - `model-capabilities/catalog.ts`
  - `model-pricing/catalog.ts`
  - `ai-providers/adapters/models/<x>.ts`
  - `ai-providers/adapters/media-option-schema.ts` 中该 provider 的 override
- `model-pricing/catalog.ts` 中 `openrouter` 价格数据并入 `ai-providers/openrouter/models.ts`。
- `model-pricing/catalog.ts` 中 `legacy` / `system` 条目必须在本步完成归并或删除，**禁止**以伪 provider 形式保留。
- 老的 4 处文件改为**纯 re-export**（一次性，仅用于本步骤上线，Step 3 全部删除）。
- 新增 guard：`scripts/guards/no-cross-provider-model-data.mjs` —— 禁止 provider X 的 model 常量出现在 provider Y 的目录或 `model-*` 顶层目录。

**完成判据**：catalog 文件均无原始数据，仅 re-export；`models.ts` 单测覆盖每个 provider 的 capabilities/pricing/optionSchema 三件套；`legacy` / `system` pricing 条目清零。

### Step 2 — 抽象升级：`AiMediaAdapter` → `AiProviderAdapter`，拆 switch

- 在 `ai-registry/types.ts` 引入 §1 的新类型；删除 `AiMediaAdapter` / `AiResolvedMediaSelection`。
- 每个 `ai-providers/<x>/` 新建 `adapter.ts`，按 §1.1 实现可选 modality 子接口。
- **拆 switch**（这一步最关键）：
  - `adapters/llm/execution.ts` (497 行) + `adapters/llm/stream-execution.ts` (883 行) → 每条 `if (providerKey === ...)` 搬入对应 `ai-providers/<x>/llm.ts`。
  - `adapters/media/execution.ts` (306 行) → 搬入各 `ai-providers/<x>/{image,video,audio}.ts`。
  - `adapters/media-option-schema.ts` (410 行) → 已在 Step 1 数据搬完，本步把 validator builder 留下的"路由 switch"删除，每个 provider 自己 export 完整 `optionSchema`。
- `ai-exec/engine.ts` 改为：
  ```ts
  const adapter = registry.get(selection.providerKey)
  const m = adapter[modality]
  if (!m) throw new Error(`AI_PROVIDER_MODALITY_UNSUPPORTED:${selection.providerKey}:${modality}`)
  validateAiOptions(m.describe(selection.modelId).optionSchema, options)
  return m.execute(input)
  ```
- 新增 guard：`scripts/guards/no-cross-provider-switch.mjs` —— 禁止 `ai-providers/` 与 `ai-exec/` 内出现 `providerKey === '<具体值>'`（白名单：`ai-providers/index.ts` 注册表）。

**完成判据**：`adapters/{llm,media}/{execution,stream-execution,media-option-schema}.ts` 全部为空（或仅剩 re-export），单测全绿，guard 通过。

### Step 3 — 删散文件 + 取消 `adapters/` 中间层

按 §3.1、§3.2、§3.4、§3.5 映射表逐个 PR 搬迁，每个 PR ≤ 1 个 provider 或 ≤ 1 个文件家族。每个 PR 的合并条件：

1. 旧文件**物理删除**（不留 re-export shim，不留兼容入口）。
2. 新增/扩展 guard 拒绝任何对旧路径的 import。
3. 测试覆盖该 provider 的 modality 单测 + 至少一条 `tests/integration/provider/<x>.test.ts`。

最终 `src/lib/` 顶层与 `src/lib/ai-providers/` 直接子项**必须只剩**：

```
src/lib/
  ai-providers/
  ai-registry/
  ai-exec/
  llm-observe/        ← 不动
  ...（与 AI 模型无关的目录）
src/lib/ai-providers/
  index.ts
  shared/
  openai-compatible/
  ark/
  google/
  fal/
  minimax/
  vidu/
  bailian/
  siliconflow/
```

**完成判据**：`rg -l 'ark-api|ark-llm|llm-client|openai-compat-template-runtime|openai-compat-media-template|gemini-batch-utils|model-config-contract|api-config\.ts|model-capabilities|model-pricing|ai-runtime|src/lib/llm/' src tests` 返回 0 行。

### Step 4 — `ai-registry/catalog.ts` 取代 `user-api/api-config-catalog.ts` 与 `user-api/api-config.ts` 的 catalog 部分

- `ai-registry/catalog.ts` 通过 `registry.list()` fan-out 各 adapter 的 `describe()`，产出前端所需 catalog（providers + modelVariants + displayLabel + pricingDisplay + capabilityDefaults shape）。
- `user-api/api-config-catalog.ts` → 一行 `export * from '@/lib/ai-registry/catalog'`，下个 PR 删除。
- `user-api/api-config.ts`（1905 行）保留：
  - 用户启用集合、默认模型字段、capability defaults、并发配置的**读写与校验**。
  - 全部 catalog 生成、capabilities/pricing enrichment 删除（改为读 `ai-registry/catalog`）。
- 行数目标：`user-api/api-config.ts` ≤ 300 行。

**完成判据**：`/api/user/api-config` GET 契约测试通过；前端 `useApiConfigQuery` 数据结构不变；`user-api/api-config.ts` 行数不超标。

---

## 5. 严格失败原则（贯穿四步）

以下行为**禁止以任何理由出现**，违反 = 阻塞合并：

- 静默跳过失败、隐式默认值、自动 provider/model 降级、自动补全（如 image resolution autofill）。
- adapter 内自跑重试循环。
- 任何 `as any` / `Record<string, unknown>` 兜底（descriptor 字段必须强类型）。
- 跨 provider 的 `if/switch (providerKey)`（白名单见 Step 2 guard）。
- catalog 数据与运行时 descriptor 双写。
- 在非 `ai-*` 目录内出现 AI 模型常量、能力/价格定义、provider 调用。

---

## 6. Guard 清单（硬护栏）

新建或扩展：

| Guard 脚本 | 作用 |
|---|---|
| `scripts/guards/no-legacy-ai-entry-imports.mjs` | 已有，扩展拒绝 `@/lib/{ark-api,ark-llm,llm-client,openai-compat-*,gemini-batch-utils,model-config-contract,model-capabilities,model-pricing,ai-runtime,llm}/**` |
| `scripts/guards/no-cross-provider-model-data.mjs` | 新增（Step 1）：provider X 的 modelId 常量不得出现在 provider Y 的目录或顶层 `model-*` 目录 |
| `scripts/guards/no-cross-provider-switch.mjs` | 新增（Step 2）：`ai-providers/` 与 `ai-exec/` 中禁止 `providerKey === '<literal>'`（白名单 `ai-providers/index.ts`） |
| `scripts/guards/no-ai-outside-ai-dirs.mjs` | 新增（Step 3 终态）：`src/lib/` 内除 `ai-providers/`、`ai-registry/`、`ai-exec/`、`llm-observe/` 外，禁止出现 OpenAI / Anthropic / Ark / Google AI / Vidu / Fal / Minimax / Bailian SDK 调用与 `provider`/`modelKey` 常量 |
| `scripts/guards/no-model-key-downgrade.mjs` | 已有，保持 |
| `scripts/guards/no-provider-guessing.mjs` | 已有，保持 |
| `scripts/guards/no-media-provider-bypass.mjs` | 已有，保持 |

每一步上线前，**先把 guard 写好并跑通**，再做迁移。guard 是落地合同，不是事后清单。

---

## 7. 依赖方向（最终态）

```
业务 / route / worker / billing
        ↓
src/lib/ai-exec
        ↓
src/lib/ai-registry
        ↓
src/lib/ai-providers/<providerKey>
        ↓
具体 SDK / HTTP
```

**禁止**反向 import：`ai-registry` 不得 import `ai-providers/<x>/*`（仅 `ai-providers/index.ts` 在注册时反向引用，且只导出 adapter 实例，不导出实现细节）。

---

## 8. 接入新 provider / 新 model 的"完成定义"

新增 provider：

1. 在 `ai-providers/<providerKey>/` 下创建 `adapter.ts` + `models.ts` + 至少一个 modality 文件。
2. 在 `ai-providers/index.ts` 注册 adapter。
3. `models.ts` 输出该 provider 全部 `(modelId, modality)` 的 `AiVariantDescriptor`（capabilities + pricing + optionSchema 三件套）。
4. async modality 必须实现 `poll()` 并定义 `externalIdPrefix`。
5. 至少一条 `tests/integration/provider/<providerKey>.test.ts` 覆盖每个 modality 的成功路径 + 一条互斥/范围错误路径。

新增 model：

1. 仅修改对应 `ai-providers/<x>/models.ts`，不改任何其他文件。
2. 单测覆盖新 modelId 的 capabilities / pricing / optionSchema 边界。

---

## 9. 与 `gpt-image-2` 的关系

四步落地全部完成后，新增 `gpt-image-2`：仅修改 `ai-providers/openai-compatible/models.ts`（增加 variant + flexible-image-sizes optionSchema）+ 必要时扩展 `image.ts`。**不允许动其他文件**。这是本重构是否成功的最终验收题。
