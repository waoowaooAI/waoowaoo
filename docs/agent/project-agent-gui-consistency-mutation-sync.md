# Agent / GUI 变更不同步（需手动刷新）问题记录与解决方案

## 背景与现象

在工作区（Workspace）中，用户既可以通过 GUI 按钮触发写操作（例如删除分镜格），也可以通过 Project Agent（assistant tools）触发同一类写操作。

当前出现的典型问题是：

- 通过 agent 执行写操作后，GUI 上对应元素不一定立即更新；
- 例如执行 `delete_storyboard_panel` 删除分镜格后，页面上仍显示旧分镜，需要手动刷新才会同步。

这类“写入已生效但 UI 未更新”的问题会显著降低对 agent 的信任，并造成二次误操作风险。

## 复现路径（示例：删除分镜格）

1. 打开某个 episode 的 Storyboard 页面（依赖 `react-query` 的缓存与渲染）。
2. 在 Workspace Assistant 面板中调用 tool：`delete_storyboard_panel`（或经由其它 workflow/agent route 间接调用）。
3. 后端写入成功（DB 已删除/重排），但 UI 列表不刷新，直到用户手动刷新页面或触发其它刷新动作。

## 根因分析（为什么 GUI 按钮能刷新，而 agent 不一定）

### 1) GUI 写操作通常自带 query invalidation

很多 GUI 交互走 `react-query` mutation hooks（例如 `src/lib/query/hooks/useStoryboards.ts` 中的若干 mutation），在 `onSuccess/onSettled` 主动执行：

- `queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })`
- 以及其它关联 key（project/episode/context 等）

因此 GUI 按钮路径天然会刷新 UI。

### 2) Agent tool 调用路径没有统一的 invalidation

agent 工具调用由服务端执行 operation（见 `src/lib/adapters/tools/execute-project-agent-operation.ts`），成功后主要返回 tool result / 写入 message parts（如 `data-task-submitted`）用于“聊天流展示”。

但对于 **同步 DB mutation**（例如删分镜、改 prompt、重排等）：

- 不会触发 GUI 侧的 `react-query` mutation hooks；
- 也缺少一个“统一的、权威的变更信号”来告诉前端该刷新哪些 query keys。

### 3) 现有 SSE 机制是 task-centric，无法覆盖同步 mutation

Workspace 中已存在 SSE 管道（`/api/sse` + `src/lib/query/hooks/useSSE.ts`），其事件模型（`src/lib/task/types.ts` 的 `SSEEvent`）聚焦于：

- task lifecycle / stream（`task.lifecycle`、`task.stream`）
- 并据 `targetType/targetId` 做 query invalidation（`useSSE.ts` 内的 `invalidateByTarget`）

但“删除分镜格”这类同步 mutation 并不是 task，因此不会产生 task SSE event，也就不会触发上述 invalidation。

## 目标（统一 agent / GUI / API 的页面变更同步）

我们希望达到：

1. **单一事实源**：同一个写操作不论由 agent 还是 GUI 触发，都会产生同一种“变更信号”。
2. **单一刷新规则源**：哪些 query keys 需要刷新，集中由一套映射维护，避免在每个 operation / route / hook 里复制粘贴。
3. **强一致 + 可审计**：写操作产生的变更可追踪、可回放、可撤销；避免“写入成功但 UI 静默不更新”。
4. **无启发式推断**：不依赖“result 形状看起来像写入”的规则，避免 schema 漂移导致误判。

## 解决方案（推荐）：以 MutationBatch 作为统一变更日志，并发布为 SSE 事件

### 为什么选 MutationBatch

本仓库已在多类写操作中使用 `mutationBatch` 记录可撤销变更（见 `src/lib/mutation-batch/service.ts`），其 `entries` 天然包含：

- `targetType`
- `targetId`

这正是前端做 query invalidation 所需的关键信息（`useSSE.ts` 也基于 targetType 做映射）。

因此可以把 `mutationBatch` 视作“写操作已发生”的权威信号，并且 **agent 与 GUI 都会复用它**（只要 operation 内部走 `createMutationBatch()`）。

### 方案概要

1. 在 `createMutationBatch()` 成功创建 batch 后，发布一条 SSE 事件（建议命名为 `mutation.batch`）。
2. SSE payload 至少包含：
   - `projectId`
   - `userId`（用于 SSE route 做同用户过滤，避免跨用户泄漏）
   - `ts`
   - `mutationBatchId`
   - `operationId`（可选但建议）
   - `targets: Array<{ targetType: string; targetId: string }>`（由 batch entries 得到）
   - `episodeId?: string | null`（可选，用于 episode scoped invalidation）
3. 前端 `useSSE` 扩展支持处理 `mutation.batch`：
   - 对每个 target 调用现有的 `invalidateByTarget()`（建议将其抽成共享纯函数，避免重复逻辑）
   - 必要时做 debounce/throttle（避免一次 batch 多 entry 导致频繁 invalidate）

这样无论 mutation 来自：

- agent tools（`executeProjectAgentOperationFromTool`）
- GUI route 调用 operation（`executeProjectAgentOperationFromApi`）
- 其它内部调用链

只要写操作创建了 mutationBatch，就会通过 SSE 统一触发 GUI 刷新。

## 实施要点与注意事项

### 1) SSE 类型需要从“仅 task”扩展为“通用域事件”

当前 `src/app/api/sse/route.ts` 中的 `isSSEEventLike` 假设所有事件都含 `taskId` 等字段。

引入 `mutation.batch` 后，应当：

- 扩展校验逻辑（例如允许 `mutationBatchId` + `targets` 的事件形态）
- 或定义新的通用事件类型（例如 `WorkspaceSSEEvent`，包含 `task.*` 与 `mutation.*` 两类）

### 2) 复用 invalidation 映射，避免新逻辑分叉

`src/lib/query/hooks/useSSE.ts` 已实现一套 `targetType -> invalidateQueries` 映射（如 `ProjectPanel`/`ProjectStoryboard` -> invalidate episode/storyboards/voice-lines）。

建议把这段映射抽取为共享模块（例如 `src/lib/query/invalidation/invalidate-by-target.ts`），供：

- task SSE
- mutation SSE
- 未来其它事件来源（例如 run events）

共同复用，确保一致性。

### 3) 不把“刷新策略”塞进每个 operation 或 GUI hook

虽然可以让每个 GUI mutation hook 在 `onSettled` 手动 invalidate，但这会导致：

- agent 路径仍需额外补丁；
- invalidation 规则分散、难维护；
- 容易出现“GUI 刷新了但 agent 没刷新”的再次分叉。

统一管道（mutationBatch -> SSE -> invalidateByTarget）能显著降低长期维护成本。

### 4) 轮询仅作为兜底

可以在 SSE 不可用或断线时做短周期兜底轮询，但不应作为主路径（成本高、延迟大、后端压力不可控）。

## 验收标准

- 通过 agent 执行 `delete_storyboard_panel` 后，Storyboard 列表无需刷新即可正确更新。
- 通过 GUI 调用同一 operation（例如 `DELETE /api/projects/[projectId]/panel`）与 agent 路径表现一致。
- query invalidation 规则集中维护，新增写操作时不需要在多个 UI 组件里“补刷新逻辑”。

