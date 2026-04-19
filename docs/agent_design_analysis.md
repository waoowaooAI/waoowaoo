# Agent 设计范式对比分析

基于当前项目 agent 实现与成熟编程 agent（Claude Code / Amp / Codex）的对比，从设计范式、执行模型、上下文管理、tool 设计、错误处理、交互模式六个维度分析升级方向。

---

[TOC]

---

## 0. 对比总览

| 维度 | 成熟 Agent（Claude Code / Amp / Codex） | 当前 Project Agent |
|------|----------------------------------------|-------------------|
| 执行模型 | 无限步数 + 自适应停止 | 固定 6 步 `stepCountIs(6)` |
| 环境感知 | 实时读取文件/终端/浏览器 | 请求时一次装配 phase 快照 |
| Tool 结果反馈 | 观察→思考→行动 | Fire-and-Report，提交后无 observe |
| 错误恢复 | tool 失败 → LLM 自动重试/换策略 | tool 抛错即终止 |
| 上下文管理 | 动态压缩/摘要/裁剪 | 全量消息透传，无压缩 |
| Tool 调用 | 支持并行 tool 调用 | 串行单步单 tool |
| 人机交互 | 仅高风险操作需确认 | 所有写操作均需 confirmed gate |

---

## 1. 执行模型：固定步数 vs 自适应 Agentic Loop

### 成熟 agent 做法

Claude Code / Amp 的核心是一个**开放式 agentic loop** —— 没有硬编码步数上限，agent 持续 `观察→思考→行动→观察` 直到任务完成或模型自行判断停止。Codex 也用的是 `while(!done)` 的循环模型。

### 当前实现

```typescript
// runtime.ts:194
stopWhen: stepCountIs(6),
```

硬编码 6 步。一个典型的"帮我给全部角色生成形象图"任务流程是：`get_project_phase` → `get_project_snapshot` → 确认请求 → 用户确认 → `generate_character_image (confirmed)` → 返回结果，已经用完 6 步。如果涉及多个角色或者需要先查询任务状态再决定下一步，直接截断。

### 升级建议

- **方案 A（最小改动）**：`stepCountIs(6)` → `stepCountIs(15)`，同时在 system prompt 加入 `"当你确认所有用户请求都已处理完毕时，停止调用 tool 并给出最终总结"` 的停止指令
- **方案 B（接近成熟 agent）**：用 AI SDK 的 `stopWhen` 自定义谓词，检测最后一步的 tool result 是否满足"任务完成"条件，实现**自适应停止**而非硬编码

---

## 2. 上下文管理：静态一次装配 vs 动态分层

### 成熟 agent 做法

Amp/Claude Code 的 system prompt 是**轻量稳定**的（角色定义 + 工具说明 + 约束规则），**可变状态**通过 tool 调用实时获取，不塞进 system prompt。它们还有上下文窗口管理机制——当对话过长时自动摘要压缩历史。

### 当前实现

```typescript
// runtime.ts:84-99  —— system prompt 中硬编码了 phase/progress/actions 等可变状态
`projectPhase=${params.phaseSummary}`
```

每次请求都在 system prompt 里塞入项目状态快照。问题：

1. **静态过时**：prompt 在请求开始时装配一次，如果 agent 在多步循环中执行了写操作（如生成了图片），快照不会更新
2. **无历史压缩**：`persistence.ts` 把全部 `UIMessage[]` 序列化存储，长对话会撑爆 context window
3. **prompt 中列出全部 22 个 tool 名称**（runtime.ts:93），成熟 agent 不需要这样做——tool 定义本身就是 LLM 可见的

### 升级建议

- system prompt 只保留**不变的角色定义 + 约束规则**，删除 tool 列表枚举和可变状态
- phase/progress 作为"第一步自动 tool 调用"注入（或用 AI SDK 的 `initialMessages` 注入一条 tool result），让 agent 在执行过程中随时可以 re-read
- 增加**对话摘要压缩**：当 `messages.length > N` 或 token 超阈值时，用 LLM 对历史做一轮摘要替换

---

## 3. Tool 设计：全量暴露 vs 动态 + 组合

### 成熟 agent 做法

- Claude Code / Amp 的 tool 数量控制在 10-15 个左右，但每个 tool 具备**组合性**（如一个 `Bash` tool 可以执行任意命令）
- Tool 的 description 非常精确，包含何时使用、何时不使用
- 支持 **parallel tool calls**（一次回复中同时调用多个独立 tool）

### 当前实现

- 22 个 tool 全量暴露给每次请求，无论当前阶段是否用得到
- 已有 `availableActions` 的概念（project-phase.ts:32-66），但**没有真正用它来过滤 tool 暴露面**
- 不支持 parallel tool calls（AI SDK 本身支持，但当前架构未利用）
- tool description 偏简，缺少使用场景和约束说明

### 升级建议

- **动态 tool 暴露**：利用 `resolveAvailableActions()` 的结果，在 `createProjectAgentOperationRegistry()` 之后过滤掉当前阶段不可用的 tool，减少 LLM 的选择噪音和误调用
- **tool description 丰富化**：每个 tool 增加 "When to use / When NOT to use" 段，参考 Amp 的 tool description 风格
- **考虑合并低频 tool**：如 `generate_character_image` 和 `generate_location_image` 可合并为 `generate_asset_image(type: 'character' | 'location')`

---

## 4. 错误处理与自愈：抛错终止 vs 观察-重试

### 成熟 agent 做法

Claude Code / Amp 的 tool 执行失败后，错误信息会作为 tool result 返回给 LLM，LLM 根据错误自行决定重试、换参数、或向用户请求更多信息。这是 agentic loop 最核心的价值。

### 当前实现

```typescript
// runtime.ts:202
onError: (error) => (error instanceof Error ? error.message : String(error)),
```

tool 内部直接 `throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')`，错误被 `onError` 回调捕获后作为流错误返回，**不会进入 LLM 的 observe-react 循环**。LLM 看不到 tool 的失败原因，无法自愈。

### 升级建议

- **tool execute 内部不 throw**，而是返回结构化的错误对象：

  ```typescript
  return { error: 'PANEL_NOT_FOUND', message: '面板 xxx 不存在，请确认 panelId 是否正确' }
  ```

  这样 LLM 能看到错误并决策下一步（比如先 `get_project_snapshot` 查正确的 panelId 再重试）

- 只在**不可恢复的系统错误**（如 DB 连接失败）时 throw

---

## 5. 观察-反应闭环：Fire-and-Forget vs 任务追踪

### 成熟 agent 做法

编程 agent 执行 `Bash` 后会拿到完整输出，然后根据输出决定下一步（编译报错 → 修代码 → 重新编译）。这是**闭环执行**。

### 当前实现

所有写操作都是 Fire-and-Report —— 提交 task 后返回 `taskId`，然后告诉用户"已提交"。agent 不会自动轮询任务状态并在完成后继续推进。

对于当前业务场景这实际上是合理的（图片/视频生成耗时长，不适合同步等待），但可以增加一个中间能力。

### 升级建议

- 增加 **"poll-and-summarize" 模式**：对于快速任务（< 10s），agent 可在一个 step 内轮询 `get_task_status` 直到完成，然后自动总结结果
- 在 system prompt 中增加指令：`"提交异步任务后，如果用户没有新指令，主动调用 get_task_status 检查最近任务状态并汇报结果"`

---

## 6. Human-in-the-Loop 设计：全量确认 vs 分级信任

### 成熟 agent 做法

- Claude Code 的 `--dangerously-skip-permissions` 可一次授权所有操作
- Amp 默认直接执行 Read/Grep/Bash，只在创建/修改文件时需要确认
- 核心思路是**信任读操作、低风险操作自动执行，只拦截高风险操作**

### 当前实现

所有写操作（包括生成单张角色图）都必须经过 confirmed gate 两次调用：

```
步骤1: agent 调 generate_character_image → 返回 confirmationRequired
步骤2: 用户说"确认" → agent 重新调 generate_character_image(confirmed=true)
```

这**消耗了 2 个 step（在仅有 6 步的预算中占 33%）**，且用户体验冗长。

### 升级建议

- **分级确认**：
  - `risk=medium`（单次生图）→ agent 说明后直接执行，不需要 confirmed gate
  - `risk=high`（批量操作/覆盖/删除/workflow 审批）→ 保留 confirmed gate
  - `risk=none/low`（读操作）→ 完全自动
- **前端确认 UI 替代 confirmed gate**：不通过"agent 再次调用"来确认，而是前端渲染一个确认按钮，用户点击后直接触发 API，不消耗 agent step

---

## 7. Prompt Engineering 质量

### 成熟 agent 做法

Claude Code / Amp 的 system prompt 结构化且详尽，包含：

- 明确的角色定义与能力边界
- 工具使用的决策树（什么情况用什么工具）
- 输出格式约束
- 错误处理策略
- 分步推理指导（先理解 → 再计划 → 再执行）

### 当前实现

```
你是 novel promotion workspace 的项目级 AI agent。
你的职责是解释、规划、审批驱动和状态汇报...
回答简洁，用中文。
```

约 14 行纯文字，缺少：

- 分步推理引导
- 错误场景处理策略
- 多任务编排策略
- 任务完成判断标准

### 升级建议

构建结构化 prompt，参考：

```
## 角色
## 核心约束（不可违反）
## 决策流程（先读状态 → 判断阶段 → 选择模式 → 执行）
## Act Mode 规则
## Plan Mode 规则
## 错误处理
## 任务完成判断
```

---

## 8. 优先级排序

| 优先级 | 升级方向 | 投入 | 收益 |
|--------|---------|------|------|
| **P0** | `stepCountIs(6)` → 15+ 或自适应停止 | 1行代码 | 解锁多步编排能力 |
| **P1** | tool 内不 throw，返回结构化错误 | 中等 | 解锁错误自愈闭环 |
| **P2** | system prompt 结构化重写 | 低 | 显著提升决策质量 |
| **P3** | 分级确认，medium risk 不需 confirmed gate | 低 | 减少 step 浪费 + 体验提升 |
| **P4** | 可变状态从 prompt 移到 tool 读取 | 低 | prompt 更稳定、状态更实时 |
| **P5** | 动态 tool 暴露（按 phase 过滤） | 中 | 减少误调用、降低 token 消耗 |
| **P6** | 对话历史压缩/摘要 | 中高 | 支撑长会话 |
| **P7** | 前端确认 UI 替代 confirmed gate | 中高 | 不消耗 agent step |

其中 **P0 + P1 + P2 + P3 合起来可能只需要半天工作量，但能让 agent 从"有限步数的 tool dispatcher"跨越到"可自适应、可自愈的 agentic loop"**，这是与成熟编程 agent 之间最根本的范式差距。
