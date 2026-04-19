# Project Agent（Workspace Assistant）当前设计文档

> 本文档描述 **project-agent（项目级 workspace assistant）** 的当前实现与确定的升级方向。  
> 适用范围：`src/lib/project-agent/**`、`src/lib/operations/**`、`src/lib/adapters/**` 以及对应的 project assistant API routes。

---

[TOC]

---

## 0. 文档目的（为什么要有这份）

这份文档的目标不是“设想一套新平台”，而是：

1. 把当前代码的 **事实基线** 固化成可交付的设计说明（便于把任务一次性交付给 coding agent）。
2. 把已确认的关键决策写清楚，避免 docs 之间互相打架。
3. 明确“哪些改动必须写哪些测试”，并能直接对齐 `docs/testing.md` 的要求。

---

## 1. 两套 assistant 的边界（不要混）

仓库内存在两套 assistant，职责不同：

### 1.1 Project Agent（本文重点）

- API：`src/app/api/projects/[projectId]/assistant/chat/route.ts`
- Runtime：`src/lib/project-agent/runtime.ts`
- 工具面：`src/lib/operations/**`（operation registry 自动暴露为 tools）
- 目标：在项目上下文里完成 **解释/规划/审批/查询 + 可控 act-mode 写操作**（并形成可撤回记录）。

### 1.2 Assistant Platform（user-level）

- API：`src/app/api/user/assistant/chat/route.ts`
- Runtime：`src/lib/assistant-platform/runtime.ts`
- Skills：`api-config-template` / `tutorial`
- 目标：提供与项目无关或弱项目绑定的通用助手能力（例如配置教程）。

原则：**不要把 assistant-platform 的“skill registry”思路搬到 project-agent 上重做一套**；project-agent 已经以 operation registry 为 truth source。

---

## 2. 高层架构（当前实现）

```
用户 → WorkspaceAssistantPanel（前端）
  │
  ▼
POST /api/projects/[projectId]/assistant/chat
  │  (apiHandler + requireProjectAuth)
  ▼
createProjectAgentChatResponse()
  │
  ├─ resolveProjectPhase() → phase/progress/failedItems/staleArtifacts/actions
  ├─ resolveProjectAgentLanguageModel() → AI SDK model
  ├─ createProjectAgentOperationRegistry() → operation map
  ├─ operations → tools（自动组装）
  └─ streamText(model, system, messages, tools, stopWhen=stepCountIs(N))
        │
        └─ tool call → executeProjectAgentOperationFromTool()
              ├─ inputSchema 校验
              ├─ confirmed gate（由 operation.sideEffects 决定）
              ├─ operation.execute()
              │    ├─ 直连 prisma（交互式编辑/轻写入，允许）
              │    └─ submitTask（异步图/音/视频生成）
              └─ writer.write(data parts) → 前端渲染卡片
```

关键点：

- operation registry 是 **单一 truth**：tool 名称 == operationId。
- confirmed gate 在 tool adapter 统一处理，避免每个 operation 手写分散确认逻辑。
- 异步任务使用 Fire-and-Report：提交任务后返回 `taskId/status/runId/deduped`，再通过 `get_task_status` 查询。

---

## 3. 关键代码索引（必须以代码为准）

- Project assistant route：`src/app/api/projects/[projectId]/assistant/chat/route.ts`
- Agent runtime：`src/lib/project-agent/runtime.ts`
- Phase 推导：`src/lib/project-agent/project-phase.ts`
- Operation registry：`src/lib/operations/registry.ts` → `src/lib/operations/*.ts`
- Tool adapter（confirmed gate / schema 校验）：`src/lib/adapters/tools/execute-project-agent-operation.ts`
- API adapter（GUI 入口复用 operation）：`src/lib/adapters/api/execute-project-agent-operation.ts`
- UI data parts 类型：`src/lib/project-agent/types.ts`

---

## 4. 执行模型（已确认方向）

### 4.1 事实基线（当前代码）

当前 runtime 使用 AI SDK `streamText` 的 step 预算上限（固定数字）。

### 4.2 确定目标：自适应停止 + cap=999

已确认的目标约束：

- 需要 **自适应停止**：让 agent 自己判断任务完成，不再依赖“12/120 这类固定阈值”来决定是否停止。
- 仍保留一个 **硬上限 999**：避免 runaway loop。

落地建议（实现细节可由 coding agent 选择最小改动方案）：

- 通过 `stopWhen` 自定义谓词（或等价机制）实现自适应停止；
- 必须保证：达到 cap 时显式停止并向用户报告“因步数上限停止”，禁止静默截断。

---

## 5. 错误模型（显式失败，但返回给 agent 自愈）

已确认的决策（与 `docs/ai-assistant-domain-architecture-goals.md` 的“显式失败”不矛盾）：

- 系统必须 **显式失败**：不允许吞错、不允许隐式回退、不允许用默认值掩盖缺失状态。
- 但在 tool-use loop 内，失败应尽量作为 **结构化 tool result** 返回给 LLM，让 LLM 能观察错误并选择下一步策略（重试/补参数/先查询再执行/向用户提问）。

推荐的统一返回形态（示例，不是强制字段名）：

```ts
{ ok: true, data: ... }
{ ok: false, error: { code: 'PANEL_NOT_FOUND', message: '...', details: {...} } }
```

仅在不可恢复的基础设施级错误（例如 DB 连接失败、系统配置缺失且无法继续）时抛出异常终止流；并要求错误信息可诊断。

---

## 6. confirmed gate（必须保留）与“预算授权”预留

### 6.1 现行规则：需要 confirmed

在 assistant 对话入口中，所有可能带来写入/覆盖/删除/批量/长耗时/计费等副作用的 operation，必须通过 confirmed gate。

依据：`operation.sideEffects`（mode/risk/billable/destructive/overwrite/bulk/longRunning/requiresConfirmation）。

### 6.2 未来方向：为 agent 分配额度后可自主决定

已确认要为未来预留基础：

- 当系统为 agent 分配了明确额度/预算（例如项目级额度、线程级额度、用户一次性授权额度）时，可以允许 agent 在预算范围内自主决定是否执行，而不是每次都要求人工 confirmed。

预留建议（可择一实现）：

- 在 runtime context 中注入 `assistantBudget`（包含额度、已用、有效期、scope）；
- 或在 `operation.sideEffects` 中补充可选元信息（例如 `estimatedCostUnits` / `budgetKey`）。

无论哪种方式，必须满足：

- 可审计（记录授权来源、预算变化、每次消耗的依据）
- 可撤回（mutation batch/undo）
- 显式失败（预算不足时必须明确报错/请求确认）

---

## 7. 写入路径策略（允许 operation 直连 prisma）

已确认的“有意简化”策略：

- 交互式编辑/轻写入：允许 `operation.execute` 直连 prisma（简单、快速、可维护）。
- workflow 批量写入：仍建议通过 domain/service/repository 层，承担更强的验证、幂等、跨实体约束与可恢复性。

硬约束：

- 不允许绕开 mutation batch/undo 体系去做不可撤回的隐式写入。
- 对于“创建记录后再提交任务”的流程：必须先完成前置校验；若任务提交可能失败，必须有显式补偿/回滚，禁止僵尸数据。

---

## 8. 异步任务（Fire-and-Report）

对于图片/配音/视频等生成任务：

- operation 负责提交任务（`submitTask` / `submitAssetGenerateTask` 等）并返回结构化结果；
- 前端渲染 `data-task-submitted` / `data-task-batch-submitted` 卡片；
- 后续通过 `get_task_status` 观察状态（必要时可提供“短轮询”仅用于 quick task，但默认不等待长任务完成）。

---

## 9. 测试要求（必须按 docs/testing.md）

只要改动了下列任意一项，必须同步补测试：

- worker/handler 行为、bug 修复、新 route、新 task type、新 provider 协议、dedupe/enqueue/rollback/orphan、P0 主链路语义。

尤其建议补齐/新增的关键测试面：

- `src/lib/adapters/tools/execute-project-agent-operation.ts`：confirmed gate 判定、input schema 报错、output schema 报错、结构化错误返回（不 throw）的行为测试。
- `src/lib/project-agent/runtime.ts`：自适应停止策略（cap=999）与“达到上限要显式报告”的行为测试。

分层与命名必须遵守 `docs/testing.md`。

---

## 10. 近期优先级（对齐已确认决策）

1. tool adapter：错误结构化返回（显式失败 + 允许自愈）
2. runtime：自适应停止 + cap=999
3. confirmed gate：保持强制 confirmed，同时为未来预算授权预留接口/元信息
4. projection 补全与 operation 覆盖面提升（按收益推进）

