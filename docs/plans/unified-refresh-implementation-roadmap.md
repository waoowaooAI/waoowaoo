# GUI / API / Agent 统一执行与刷新：落地变更量估算与路线图

## 1. 结论摘要

建议不要直接做“大一统重构”。按风险和收益拆成四个阶段：

| 阶段 | 目标 | 规模 | 建议优先级 |
| --- | --- | --- | --- |
| Phase 1 | 稳定现有 `MutationBatch -> mutation.batch SSE -> invalidateByTarget` | S | 立即 |
| Phase 2 | 引入 `emitDomainChange()` 语义层，但先不建新表 | M | 推荐 |
| Phase 3 | Durable outbox / replay / response hint 完整化 | L | 后续 |
| Phase 4 | 全量收敛 GUI hook 手写刷新与 Run/Task 边界 | XL | 渐进 |

当前项目最适合先做 **Phase 2**：新增 `emitDomainChange()`，让 `MutationBatch`、Task worker 输出、Undo 等都走同一套 change 语义，但先复用现有 SSE/TaskEvent/MutationBatch 设施，避免一次性迁移过大。

## 2. 当前代码触点粗略扫描

基于当前仓库扫描：

| 类型 | 粗略数量 | 说明 |
| --- | ---: | --- |
| `createMutationBatch()` 调用点 | 21 | 主要集中在 storyboard / media / voice / asset |
| task event publish 调用点 | 约 10 | submitter、worker shared、reconcile、task ops、LLM stream |
| 前端 invalidate / setQueryData 相关点 | 约 200+ | 包含 optimistic、回滚、业务刷新、任务状态刷新 |
| 新增/已存在统一 invalidation 模块 | 1 | `src/lib/query/invalidation/invalidate-by-target.ts` |

这说明真正风险不是新增一个事件类型，而是“刷新规则分散”。落地时必须避免把新逻辑再散到每个 hook。

## 3. Phase 1：稳定当前最小闭环

### 目标

解决当前 GUI/API/Agent 同步写入后 GUI 不一致的问题。

### 做法

```text
所有同步写 operation 创建 MutationBatch
MutationBatch 发布 mutation.batch
useSSE 处理 mutation.batch
invalidateByTarget 集中刷新
补 replay 和 episodeId 精度
```

### 变更范围

| 模块 | 文件量估计 | 说明 |
| --- | ---: | --- |
| mutation batch service | 1–2 | 发布事件、构造 event、replay |
| task/types / SSE route | 2–3 | 事件类型、SSE 校验、非数字 id |
| useSSE / invalidation | 2–3 | 前端监听、去重、统一映射 |
| operation 调用点 | 5–10 | 补 episodeId / targets |
| tests | 4–8 | service、SSE、invalidation、删除分镜回归 |

### 总量估算

```text
8–15 个文件
300–800 行变更
风险：低到中
```

### 验收标准

- Agent 删除分镜后，Storyboard 页面无需刷新自动更新。
- GUI 删除分镜与 Agent 删除分镜刷新路径一致。
- `mutation.batch` 断线后可 replay 或至少能通过恢复查询补齐。
- `invalidateByTarget()` 有单测覆盖。

## 4. Phase 2：引入 `emitDomainChange()` 语义层

### 目标

把“变更事实”从 `MutationBatch` 和 `TaskEvent` 中抽象出来：

```text
MutationBatch 负责 undo
TaskEvent 负责 task 生命周期
DomainChangeEvent 负责业务数据变更语义
```

### 建议新增模块

```text
src/lib/domain-change/types.ts
src/lib/domain-change/emit.ts
src/lib/domain-change/publisher.ts
src/lib/domain-change/replay.ts   // 可先薄封装现有 mutation/task replay
```

### 建议类型

```ts
export type DomainChangeReason =
  | 'sync-mutation'
  | 'task-output'
  | 'workflow-output'
  | 'undo'

export type DomainChangeTarget = {
  targetType: string
  targetId: string
}

export type DomainChangeEvent = {
  id: string
  type: 'domain.changed'
  projectId: string
  userId: string
  source: string
  operationId: string | null
  episodeId: string | null
  reason: DomainChangeReason
  targets: DomainChangeTarget[]
  ts: string
}
```

### Phase 2 不建议做的事

暂时不要新增数据库 outbox 表，避免迁移和 worker 投递机制一次性扩大。

Phase 2 先做薄抽象：

```text
createMutationBatch()
  -> emitDomainChange(reason='sync-mutation')
  -> 现有 mutation.batch SSE 或 domain.changed SSE

worker persist output
  -> emitDomainChange(reason='task-output')
  -> 现有 task completed invalidation 或 domain.changed SSE

undo success
  -> emitDomainChange(reason='undo')
```

### 变更范围

| 模块 | 文件量估计 | 说明 |
| --- | ---: | --- |
| 新增 domain-change lib | 3–5 | types、emit、publisher、event builder |
| MutationBatch service | 1–2 | 改为调用 emitDomainChange |
| Task worker / shared | 2–5 | 在持久化结果后补 change event，先选关键 task |
| Undo/revert | 1–2 | undo 后发 change event |
| useSSE | 1–2 | 支持 `domain.changed` |
| invalidation tests | 2–4 | domain.changed -> invalidateByTarget |
| operation tests | 4–8 | 删除分镜、更新 prompt、资产更新、task output |

### 总量估算

```text
20–35 个文件
800–1800 行变更
风险：中
```

### 验收标准

- `mutation.batch` 不再是唯一变更事件概念。
- 同步写入、部分 worker 输出、undo 都能产生统一 `domain.changed` 语义。
- 前端通过同一 handler 调用 `invalidateByTarget()`。
- 旧 `mutation.batch` 可兼容一段时间，避免一次性切换风险。

## 5. Phase 3：Durable Outbox / Replay / Response Hint

### 目标

让 `DomainChangeEvent` 成为可 replay 的持久事件源，解决 SSE 丢失、断线重连、同 tab 立即刷新、多 tab 同步等问题。

### 需要新增 Prisma 表

候选表：`domain_change_events`

```prisma
model DomainChangeEvent {
  id          String   @id @default(uuid())
  projectId   String
  userId      String
  source      String
  operationId String?
  episodeId   String?
  reason      String
  targetsJson Json
  payloadJson Json?
  createdAt   DateTime @default(now())

  @@index([projectId, createdAt])
  @@index([userId, createdAt])
  @@index([projectId, episodeId, createdAt])
  @@map("domain_change_events")
}
```

### 后端变更

```text
emitDomainChange()
  -> DB insert domain_change_events
  -> Redis publish workspace channel
  -> 返回 event 给 caller 作为 response hint

/api/sse bootstrap
  -> replay domain_change_events after cursor
```

### 前端变更

```text
useSSE 支持 domain.changed
mutation response 可读取 change hint 并立即 invalidate
recovery API 可补漏
```

### 变更范围

| 模块 | 文件量估计 | 说明 |
| --- | ---: | --- |
| Prisma schema + migration | 2–3 | 新表和生成 client |
| domain-change service | 4–8 | persist、publish、replay、cursor |
| SSE bootstrap/route | 2–4 | replay 新事件源 |
| API adapter / response hint | 2–5 | 让 mutation response 可返回 changes |
| 前端 useSSE / mutation shared | 3–8 | SSE + response hint 同一映射 |
| tests | 8–15 | unit、integration、replay、response hint |

### 总量估算

```text
40–70 个文件
1800–4000 行变更
风险：中到高
```

### 验收标准

- SSE 断线期间的 domain change 可通过 cursor replay。
- 当前发起 mutation 的客户端不用等 SSE 也可立即触发统一 invalidate。
- 所有 change event 有持久记录可审计。
- publish 失败不会导致事件丢失，最多导致实时投递延迟。

## 6. Phase 4：全量收敛和去复杂度

### 目标

清理历史分散刷新和边界模糊，让架构长期可维护。

### 工作项

```text
审计所有 effects.writes=true operation
审计所有 route 是否只做鉴权/参数/调用 operation
审计所有 worker 写 DB 是否 emitDomainChange
弱化 GUI hook 手写业务 invalidation
限制 GraphRun 只用于多步骤 workflow
限制 TaskEvent mirror 到 RunEvent 只用于 workflow task
补系统测试覆盖 GUI/API/Agent 一致刷新
```

### 变更范围

```text
80+ 文件
4000+ 行变更
风险：高
适合分多个 PR / 多轮完成
```

## 7. 推荐落地顺序

### Step 1：冻结目标接口

先定义但不大规模使用：

```text
DomainChangeEvent type
emitDomainChange(params)
handleDomainChangeEventOnClient(event)
```

验收：类型稳定，单测通过。

### Step 2：让 MutationBatch 走 emitDomainChange

```text
createMutationBatch()
  -> build mutation batch
  -> emitDomainChange(reason='sync-mutation')
```

验收：删除分镜、更新 prompt、资产更新依然刷新。

### Step 3：前端统一 handler

```text
useSSE mutation.batch handler
useSSE domain.changed handler
response hint handler
都调用同一个 invalidateByTarget adapter
```

验收：新增 targetType 只需要改一处映射和测试。

### Step 4：选 2–3 个 worker 输出接入

优先选择：

```text
image_panel
video_panel
voice_line
```

验收：worker output 落库后有明确 domain change，而不是只隐含在 task completed。

### Step 5：决定是否上 outbox 表

只有当这些问题明显存在时再上：

```text
SSE 丢事件导致状态长期不一致
需要审计所有业务变更
需要跨 tab/断线严格 replay
需要后台 subscriber 派生处理
```

## 8. 风险与取舍

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 重复刷新 | task completed 和 domain.changed 都 invalidate | 前端按 event id/targetType 去重，逐步拆分职责 |
| 事件过多 | 批量操作大量 targets | batch targets，按 targetType/queryKey 去重 |
| 语义漂移 | targetType 命名不统一 | 建立 targetType 常量或测试清单 |
| outbox 过早引入 | 增加 DB/migration/replay复杂度 | Phase 2 先不建表 |
| GUI hook 清理过猛 | optimistic 体验倒退 | 只移除业务刷新，不移除临时 UI 态 |

## 9. 建议当前决策

建议当前采用：

```text
Phase 1 完成当前不刷新问题
Phase 2 引入 emitDomainChange 语义层
暂缓 Phase 3 outbox 表
```

原因：

- 当前核心痛点是 GUI/API/Agent 刷新不一致，不是事件审计系统缺失。
- `MutationBatch` 已经覆盖很多同步写入，可作为过渡来源。
- 直接上 outbox 会引入迁移、replay、cursor、投递一致性等额外复杂度。
- 先抽象 `emitDomainChange()` 可以减少未来迁移成本。

## 10. 一句话路线

> 先用最小改动把同步写入刷新统一，再抽象 `emitDomainChange()` 解耦 MutationBatch/TaskEvent/SSE，最后在确有需要时上 durable outbox 和全量前端刷新收敛。
