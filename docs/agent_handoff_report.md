# Agent 实现现状交接报告

> 生成时间：2026-04-19 | 基于代码实际审查

---

## 一、总体评估

当前 Agent 处于 **"可用 MVP → 功能型项目助手"** 的过渡阶段。

- **已完成**：runtime 骨架、71 个 tool/operation、plan/approval/run lifecycle、mutation batch、前端 assistant 面板
- **主要差距**：agentic 成熟度（错误自愈、step 上限、prompt 质量）、operation 覆盖面（62% API 写入口未接入）、projection 信息完整度

---

## 二、架构全景

```
用户 → Frontend (WorkspaceAssistantPanel)
         │
         ▼
  POST /api/projects/[id]/assistant/chat
         │
         ▼
  runtime.ts: createProjectAgentChatResponse()
    ├── resolveProjectPhase() → phase/progress/failedItems/staleArtifacts
    ├── resolveProjectAgentLanguageModel() → AI SDK model
    ├── createProjectAgentOperationRegistry() → 71 operations
    ├── 自动组装 71 个 tools (operationId → tool)
    └── streamText(model, prompt, tools, maxSteps=120)
              │
              ├── tool call → executeProjectAgentOperationFromTool()
              │                  ├── inputSchema 校验
              │                  ├── shouldRequireAssistantConfirmation()
              │                  │     └── confirmed gate (data-confirmation-request 卡片)
              │                  └── operation.execute(context, input)
              │                        └── 直连 prisma / submitTask
              │
              └── LLM 观察 tool result → 决定下一步 (最多 120 步)

  GUI 操作 → API route ─┬─ 38% → executeProjectAgentOperationFromApi() → operation.execute
                        └─ 62% → 直连 prisma/submitTask（旁路 operation）
```

**两套写入链路并存（有意设计）：**

```
交互式编辑（tool/GUI）→ operation.execute → 直接 prisma（简单、快速）
Workflow 批量写入      → worker handler → domain/service → domain/repository → prisma
                         （需要 idempotency / approval guard / 跨实体事务 validation）
```

详见 [§五 关于 Domain 层的设计决策](#五关于-domain-层的设计决策有意简化非遗漏)。

---

## 三、已具备的能力

### 3.1 基础设施（✅ 全部就位）

| 能力                                 | 实现位置                                                    |
| ------------------------------------ | ----------------------------------------------------------- |
| 项目级聊天入口                       | `src/app/api/projects/[projectId]/assistant/chat/route.ts`  |
| AI SDK runtime（streamText + tool）  | `src/lib/project-agent/runtime.ts` (192行)                  |
| 对话持久化                           | `src/lib/project-agent/persistence.ts`                      |
| 前端常驻 Assistant 面板              | `WorkspaceAssistantPanel.tsx` + 子组件                      |
| Operation Registry（单一 truth）     | `src/lib/operations/registry.ts` → 71 个 operation          |
| Tool Adapter（统一执行 + 确认 gate） | `src/lib/adapters/tools/execute-project-agent-operation.ts` |
| API Adapter（统一执行）              | `src/lib/adapters/api/execute-project-agent-operation.ts`   |
| Mutation Batch 创建 & 撤回           | `src/lib/mutation-batch/service.ts` + operation             |

### 3.2 Tool / Operation 矩阵（71 个，全部自动暴露为 tool）

```
Tool ──100%──→ Operation（71 个 operation = 71 个 tool，由 registry 自动生成，完全对齐）
```

| 领域           | 文件                | 行数 | 数量 | 代表性 operation                                                                                                 |
| -------------- | ------------------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| 读取查询       | `read-ops.ts`       | 234  | 10   | `get_project_phase`, `get_project_snapshot`, `get_project_context`, `get_task_status`, `list_saved_skills`       |
| 计划审批       | `plan-ops.ts`       | 309  | 15   | `create_workflow_plan`, `approve_plan`, `reject_plan`, `save_workflow_plan_as_skill`                             |
| 治理           | `governance-ops.ts` | 65   | 2    | `list_recent_mutation_batches`, `revert_mutation_batch`                                                          |
| 编辑           | `edit-ops.ts`       | 279  | 6    | `select_asset_render`, `update_character_appearance_description`, `update_shot_prompt`                           |
| GUI CRUD       | `gui-ops.ts`        | 1515 | 28   | 角色/场景/分集/台词/分镜组/编辑器等增删改查                                                                      |
| 图/音/视频生成 | `project-agent.ts`  | 2383 | 10   | `generate_character_image`, `voice_generate`, `generate_video`, `lip_sync`, `panel_variant`, `mutate_storyboard` |
| 扩展任务       | `extra-ops.ts`      | 464  | 8    | `ai_create_character`, `clips_build`, `episode_split_llm`, `upload_asset_image`                                  |

所有 operation 定义在 `src/lib/operations/` 下，由 `registry.ts` 统一校验后暴露。

### 3.3 Agent 运行特性

| 特性              | 现状                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| maxSteps          | **120**（硬编码上限）                                                                          |
| 项目阶段感知      | ✅ `resolveProjectPhase` → 6 种 phase + progress + failedItems + staleArtifacts                |
| Act/Plan 分流     | ✅ 基于 `sideEffects` 元数据自动判断                                                           |
| 确认 gate         | ✅ `shouldRequireAssistantConfirmation()` 自动对 billable/destructive/bulk 要求 confirmed=true |
| 异步任务桥接      | ✅ Fire-and-Report 模式，返回 taskId + undoBatchId                                             |
| 前端卡片渲染      | ✅ phase / confirmation-request / task-submitted / task-batch-submitted / undo 卡片            |
| Workflow 固定流程 | ✅ `story-to-script` / `script-to-storyboard` 通过 plan mode 执行                              |

---

## 四、问题清单与能力缺口

### 🔴 P0 – 高优先级

#### 1. Tool 内 throw 导致 LLM 无法自愈（影响最大）

```typescript
// runtime.ts:188
onError: (error) => (error instanceof Error ? error.message : String(error)),
```

Tool 内 `throw new Error(...)` → 错误被 stream 捕获 → **LLM 看不到错误原因** → 无法重试/换参数。应改为 tool 返回结构化错误对象。

#### 2. Operation 覆盖面不足（62% API 写入口未接入）

123 个 mutation API route 中仅 47 个（38%）走 operation adapter。**Agent 无法执行**以下操作：

| 未覆盖域                | 旁路 route 数 | 典型操作                                                                 |
| ----------------------- | ------------- | ------------------------------------------------------------------------ |
| Asset Hub（全局素材库） | 26            | 全局角色/场景/音色/文件夹 CRUD、AI 设计                                  |
| 项目管理                | 3             | 项目创建/更新/删除、配置更新                                             |
| 分镜重生                | 4             | regenerate-group、single-image、storyboard-text、modify-storyboard-image |
| 任务/运行管理           | 3             | 任务取消、步骤重试                                                       |
| 用户配置                | 8             | API 配置、模型测试                                                       |

#### 3. 同能力双轨实现（3 条 route 已有 operation 但不使用）

| route                                        | 已有 operation          | 修复方式                                     |
| -------------------------------------------- | ----------------------- | -------------------------------------------- |
| `plans/[planId]/approve/route.ts`            | `approve_plan`          | 改为调 `executeProjectAgentOperationFromApi` |
| `plans/[planId]/reject/route.ts`             | `reject_plan`           | 同上                                         |
| `mutation-batches/[batchId]/revert/route.ts` | `revert_mutation_batch` | 同上                                         |

#### 4. Projection 信息严重不足

`get_project_context` 返回的 panel 只有 `id / panelIndex / description` 三个字段。Agent **看不到** panel 的 imageUrl / videoPrompt / imagePrompt / characters / location / shotType，无法处理"参考第 3 号分镜重新生成第 7 号"这类场景。

### 🟡 P1 – 中优先级

#### 5. System Prompt 仍为平铺文本

约 15 行，缺少结构化分段（角色/约束/决策流程/错误处理/完成判断）、长任务处理策略、多步编排指引。

#### 6. 71 个 tool 全量暴露，无动态过滤

`resolveAvailableActions()` 返回了可用动作列表但未用于裁剪 tool 暴露面。增加 LLM 选择噪音和 token 消耗。

#### 7. sideEffects 确认语义在 API path 不生效

Tool adapter 根据 `sideEffects` 自动要求 `confirmed=true`；API adapter 完全不做确认 gate。已走 operation 的 47 条 route 中 31 个 `requiresConfirmation=true` 的 operation 在 API 调用时无拦截。

#### 8. 无对话历史压缩

全量 `UIMessage[]` 透传，长对话会撑爆 context window。

### 🟢 P2 – 低优先级（工程收敛）

| 问题                                      | 现状                                             |
| ----------------------------------------- | ------------------------------------------------ |
| `project-agent.ts` 仍 2383 行             | image/voice/video/storyboard 逻辑全在一个文件    |
| mutation batch 粒度                       | 每次 tool 调用各自创建独立 batch，非单轮回复整合 |
| GUI 操作未接入 mutation batch             | 仅 assistant 写操作创建 batch                    |
| 前端 runtime 仍依赖 `@assistant-ui/react` | 未向 `useChat` 收敛                              |
| workspace-assistant 事件桥接              | 仍用浏览器事件而非服务端权威状态                 |

---

## 五、关于 Domain 层的设计决策（有意简化，非遗漏）

目标文档（`ai-assistant-domain-architecture-goals.md`）原本要求所有写操作经过独立 domain mutation service。实际开发中**有意不采用**：

1. **~70% 写操作是简单 CRUD**，加一层 domain service 纯属传话
2. **调用方最多 2 个**（operation + 少量 GUI route），不足以需要独立抽象
3. **过早建 domain 层**意味着每个 CRUD 要维护 operation + domain + repository 三层文件

**当前方案：operation.execute 直接包含写逻辑（直连 prisma）。**

`src/lib/domain/` 目录保留，但仅服务 workflow executor 的批量写入（有真实复杂度）：

```
src/lib/domain/
├── approvals/guard.ts              (60行)  ← 审批守卫
├── repositories/project-workflow.ts (309行) ← workflow 事务内的 typed repository
├── screenplay/service.ts           (374行) ← story-to-script 产物持久化
├── storyboard/service.ts           (230行) ← script-to-storyboard 产物持久化
└── shared.ts                       (57行)  ← DomainMutationContext / ValidationError
```

调用关系：`workers/handlers/story-to-script.ts` → `domain/screenplay/service.ts`，与 operation 体系完全独立。

**未来引入更多 domain service 的触发条件**：同一写操作被 3+ 调用方复用、出现跨实体不变量、需要 version check。当前推荐做法：operation 内复杂事务超 50 行时抽成同目录 service 函数。

---

## 六、Skill 系统现状

项目中有 **三套独立的 Skill 概念**：

### 6.1 Workflow Skill（项目主流程固定技能包）

10 个 skill package 编排为 2 条固定 workflow：

```
skills/project-workflow/
  ├── analyze-characters/    ┐
  ├── analyze-locations/     │ story-to-script（5 步串行）
  ├── analyze-props/         │
  ├── split-clips/           │
  ├── generate-screenplay/   ┘
  ├── plan-storyboard-phase1/ ┐
  ├── refine-cinematography/  │ script-to-storyboard（5 步 map/join）
  ├── refine-acting/          │
  ├── refine-storyboard-detail/│
  ├── generate-voice-lines/   ┘
  └── workflows/
        ├── story-to-script/
        └── script-to-storyboard/
```

运行时注册在 `src/lib/skill-system/`（catalog.ts + project-workflow-machine.ts + executors/）。

Agent 通过 `create_workflow_plan` → 用户审批 → `approve_plan` 触发执行。**Agent 不能跳过或重排 workflow 内部 skill 顺序。**

### 6.2 Saved Skills（用户沉淀的可复用模板）

- 存储：**DB**（`prisma.savedSkill` / `saved_skills` 表），期望未来迁移到 `skills/saved/` 磁盘目录
- 服务层：`src/lib/saved-skills/service.ts` (160行)
- Agent Tool：`list_saved_skills` / `save_workflow_plan_as_skill` / `create_workflow_plan_from_saved_skill`
- 限制：只支持 `workflow_plan_template` 一种 kind，不支持 act-mode recipes 和跨项目共享

### 6.3 Assistant Platform Skills（与 Project Agent 无关）

`src/lib/assistant-platform/skills/` 下 2 个独立技能（tutorial / api-config-template），属于另一套 assistant-platform 体系，有独立 runtime 和 registry。

### 6.4 Skill 系统待改进

| 问题                                           | 说明                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `project-workflow-machine.ts` 是"第二真相源"   | 330行，与 `skills/` 磁盘文件重复定义元数据/步骤/displayLabel   |
| 中文 displayLabel 硬编码                       | 应迁移到 i18n / presentation 层                                |
| **Saved Skills 存 DB 而非磁盘**                | 期望迁移到 `skills/saved/`，与 `skills/project-workflow/` 平级 |
| `skill-system/` 与 `operations/` 边界模糊      | skill `effects` 与 operation `sideEffects` 语义重叠            |
| `artifact-system/` invalidation 关系未实际使用 | phase 推导用的是时间戳比较，不是 artifact 依赖图               |

---

## 七、与目标架构对照（ai-assistant-domain-architecture-goals.md）

### 7.1 六层架构完成度

| 架构层                   | 完成度                | 说明                                                                           |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------ |
| 1. Domain Capability     | 🟡 有意简化           | 交互式编辑由 operation 直连 prisma；domain 层仅服务 workflow 批量写入（见§五） |
| 2. Tool Use              | 🟡 结构完成，覆盖不足 | 71 个 tool 已通过 registry 统一暴露，但 62% API 写入口无 operation             |
| 3. Skills                | 🟡 部分完成           | 10 个 workflow skill + 2 条 workflow 已 package 化；无 act-mode skill          |
| 4. Workflow / Run        | ✅ 基本完成           | story-to-script / script-to-storyboard 有 plan/approval/run lifecycle          |
| 5. Snapshot / Projection | 🟡 部分完成           | `ProjectProjectionLite` 已实现，但 panel 级细节严重缺失                        |
| 6. Event / UI            | 🟡 基本可用           | 卡片渲染已有，仍用浏览器事件桥接                                               |

### 7.2 成功标准达标情况

| #   | 成功标准                                  | 达标？                               |
| --- | ----------------------------------------- | ------------------------------------ |
| 1   | 每个人工可编辑动作都有 deterministic tool | ❌ 62% API 写入口无 operation/tool   |
| 2   | 每个 AI 可编辑动作复用同一 mutation layer | ⚠️ 有意简化（见§五）                 |
| 3   | skills 是 assistant 方法层，不是业务真相  | ✅                                   |
| 4   | fixed workflows 是 durable 且 replay-safe | ⚠️ durable 满足，replay-safe 未验证  |
| 5   | assistant 能通过 projections 拿到最新状态 | ⚠️ 有 projection 但 panel 信息不完整 |
| 6   | analysis 执行层只运行固定 step            | ✅                                   |
| 7   | GUI 与 assistant 共用同一底层执行链       | ⚠️ 38% 已共用                        |
| 8   | 每次 AI 写操作形成 mutation batch         | ⚠️ assistant 路径有，GUI 路径无      |
| 9   | 单次 AI 回复可整批撤回                    | ❌ 粒度是每次 tool 调用              |

---

## 八、建议的下一步优先级

| 序号 | 工作项                                                               | 投入 | 收益    |
| ---- | -------------------------------------------------------------------- | ---- | ------- |
| 1    | **Tool 错误不 throw，返回结构化错误**（显式失败 + 解锁自愈闭环）      | 低   | 🔥 极高 |
| 2    | **自适应停止 + 硬上限 999**（避免 step 上限阻塞复杂编排）             | 低   | 🔥 高   |
| 3    | **System Prompt 结构化重写**                                         | 低   | 高      |
| 4    | **收敛双轨：approve/reject/revert route 改走 operation**             | 低   | 高      |
| 5    | **补全 Projection（panel 的 imageUrl/prompt/characters 等）**        | 低   | 高      |
| 6    | **补齐缺失 operation（regenerate-group/single/text、project CRUD）** | 中   | 高      |
| 7    | **confirmed gate 预算预留**（未来：在明确额度内允许 agent 自主决定）   | 低   | 中      |
| 8    | **动态 tool 过滤（按 phase/scope 裁剪）**                            | 中   | 中      |
| 9    | **project-agent.ts 拆文件（抽出 image/voice/video service 函数）**   | 低   | 中      |
| 10   | **API adapter 补 confirmation gate**                                 | 中   | 中      |

---

## 九、关键文件索引

| 用途                   | 路径                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| Agent Runtime          | `src/lib/project-agent/runtime.ts` (192行)                              |
| 阶段推导               | `src/lib/project-agent/project-phase.ts` (217行)                        |
| Operation 注册         | `src/lib/operations/registry.ts` → `project-agent.ts` + 6 个领域文件    |
| Operation 类型         | `src/lib/operations/types.ts`                                           |
| Tool Adapter           | `src/lib/adapters/tools/execute-project-agent-operation.ts`             |
| API Adapter            | `src/lib/adapters/api/execute-project-agent-operation.ts`               |
| Domain (workflow 写入) | `src/lib/domain/` (973行，仅服务 workflow executor)                     |
| 前端面板               | `src/features/project-workspace/components/WorkspaceAssistantPanel.tsx` |
| 持久化                 | `src/lib/project-agent/persistence.ts`                                  |
| Workflow Skills        | `skills/project-workflow/`                                              |
| Skill System 运行时    | `src/lib/skill-system/`                                                 |
| Saved Skills           | `src/lib/saved-skills/service.ts`                                       |
| Mutation Batch         | `src/lib/mutation-batch/service.ts`                                     |
| API 对齐报告           | `docs/operation_tool_api_alignment_report.md`（若当前分支缺失，以实际分支内容为准） |

---

## 十、待探索方向（idea）

1. Assistant 面板的 markdown 渲染质量优化
2. 显式的确认框 / 方案选择组件（替代 confirmed gate 消耗 agent step）
3. 显式的 skills / workflow 调用 UI 入口
4. 问答能力：agent 功能问答 + 项目状态问答
5. 是否需要显式的 plan mode UI
6. 多模态能力：自动审查分镜一致性（角色衣着/场景连续性），可能需要新 skill
7. 音视频图的富渲染能力（对比框、前后方案对比等）
8. 是否为 agent 配备沙盒环境作为兜底能力
9. 分镜重生时支持参考其他分镜（需补全 panel 详情读取 + regenerate 参数扩展等内容）
