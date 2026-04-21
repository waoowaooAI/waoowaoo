# Agent 功能完成现状

> 这份文档只描述当前事实，不重复设计构想。
> 最新评估基于代码扫描，审计日期：2026-04-21

## 1. 总体判断

当前 Project Agent 已经是一套 **功能完整、架构收敛、测试覆盖的项目助手主链路**。

所有 P0 设计目标已落地：

- ✅ LLM-first 路由（`router.ts` 使用 `generateObject` + zod schema）
- ✅ 消息压缩与窗口化（`message-compression.ts`）
- ✅ 动态工具选择（`tool-policy.ts` 多维评分）
- ✅ 结构化上下文投影（`project-projection/lite.ts` + `full.ts`）
- ✅ 项目阶段感知（`project-phase.ts`）
- ✅ Operation registry 统一（tool 和 API 共用）
- ✅ Confirmed gate 与结构化错误返回
- ✅ 异步任务 Fire-and-Report
- ✅ 会话持久化
- ✅ 关键链路测试覆盖（10 个 test 文件）
- ✅ system prompt 去状态化（改为 tool 按需读取）
- ✅ `auto/plan/fast` 显式切换（切换会重建 chat session，真实影响后续请求）
- ✅ execution-mode 解析（显式 mode 与 router intent 统一收敛）

综合判断：

- 核心 P0 能力 **100% 完成**。
- P1 能力完成约 88%，剩余主要是交互完善和生产验证。
- 现阶段主要剩余工作是 **工程收敛、状态注入极简化和前端交互丰富**，不需要架构重做。

## 2. 当前实现主链路

```text
UI / API route
  -> createProjectAgentChatResponse (runtime.ts)
  -> compressMessages (message-compression.ts)        ← 消息窗口化
  -> resolveProjectPhase (project-phase.ts)            ← 项目阶段快照
  -> routeProjectAgentRequest (router.ts)              ← LLM-first 路由
    -> generateObject → intent/domains/toolCategories/confidence
    -> 低置信度/歧义 → clarifyingQuestion 直接返回
  -> resolveProjectAgentExecutionMode                  ← mode + intent 统一解析
  -> selectProjectAgentTools (tool-policy.ts)           ← 动态裁剪工具
  -> buildProjectAgentSystemPrompt (copy.ts)
  -> streamText (AI SDK)
  -> executeProjectAgentOperationFromTool (tool adapter)
    -> confirmed gate / input validation
    -> operation.execute / submit task / write ui data parts
    -> structured error / structured result
```

## 3. 已落地能力详细

### 3.1 Runtime

`src/lib/project-agent/runtime.ts`（191 行）

已实现：
- 消息校验（`safeValidateUIMessages`）和模型消息转换
- **消息压缩**：runtime 层调用 `compressMessages`，在进入模型前完成窗口化
- 按用户模型配置选择语言模型（`resolveProjectAgentLanguageModel`）
- **LLM-first 路由**：先执行 `routeProjectAgentRequest`，若需澄清直接返回 clarifyingQuestion
- system prompt 已去掉 phase/tool 文本摘要，改为纯规则 + tool 读取约束
- interactionMode 已升级为 `auto/plan/fast`
- `interactionMode + routedIntent` 会在 runtime 层统一解析成 `effectiveIntent`
- 基于路由结果动态装配 tools
- 流式输出到 UIMessage stream
- stop controller 触顶显式输出 `data-agent-stop`

### 3.2 LLM Router

`src/lib/project-agent/router.ts`（293 行）

已实现：
- 使用 `generateObject` 做独立模型路由调用
- 输出结构化 schema：`intent / domains / toolCategories / confidence / needsClarification / clarifyingQuestion / reasoning`
- 置信度阈值 0.8，低于阈值自动要求用户澄清
- 支持中英文双语路由 prompt
- 空用户输入直接返回澄清，不调用模型
- **无规则兜底**：路由输出完全由模型决定

### 3.3 消息压缩

`src/lib/project-agent/message-compression.ts`（129 行）

已实现：
- 阈值触发：消息数 > 50 或 token 估算 > 80%（9600 tokens）
- 保留最近 20 条消息，更早消息通过 LLM 汇总为摘要
- 摘要消息带 `projectAgentConversationSummary: true` 元数据标记
- 汇总失败显式报错（`PROJECT_AGENT_MESSAGE_SUMMARY_EMPTY`）

### 3.4 Project Phase

`src/lib/project-agent/project-phase.ts`（217 行）

已实现：
- phase 判断（draft / script_analyzing / script_ready / storyboard_generating / storyboard_ready / voice_ready）
- progress 计数（clipCount / screenplayClipCount / storyboardCount / panelCount / voiceLineCount）
- active runs 查询
- failed items 查询（最近 3 条失败 run 及原因）
- stale artifacts 检测（screenplay / storyboard / voice 的过期判断）
- available actions（按 phase 推导 planMode / actMode 可用操作）

### 3.5 Projection / Context

两层结构已稳定：

- **lite projection**（`project-projection/lite.ts`，185 行）：project/episode 基本信息、progress 计数、active runs、latest artifacts、approvals、policy
- **full projection**（`project-projection/full.ts`）：在 lite 基础上增加 panel 级别详细信息（description / imagePrompt / imageUrl / candidateImages / videoPrompt / videoUrl）
- **context assembler**（`project-context/assembler.ts`）和 **policy**（`project-context/policy.ts`）已分层

### 3.6 Tool Policy

`src/lib/project-agent/tool-policy.ts`（274 行）

已实现：
- 17 个 toolCategory 各有独立 policy（desiredTags / desiredScopes / riskBudget / allowGuardedTools）
- 多维评分：visibility + scope match + tag match + category match + phase action match + intent match + risk penalty + episode requirement
- 风险预算三级：low-only / allow-medium / allow-high-with-confirm
- `plan` 模式下会阻止 `act` 工具，但保留 `plan` 工具进入确认流
- `auto` 模式跟随 router intent，`fast` 模式保留 act，`plan` 模式会把 `act intent` 降级为 planning handling
- `interactionMode` 已进入 chat session id，切换模式会重建会话实例并影响下一条请求
- 最大工具数限制（默认 45）
- 工具为 0 时显式报错

### 3.7 Operation / Adapter

- **Operation registry**（`operations/registry.ts`）：统一创建和校验，tool 和 API 共用
- **Tool adapter**（`adapters/tools/execute-project-agent-operation.ts`）：统一处理 confirmed gate、输入校验、执行错误、结构化结果返回
- **API adapter**（`adapters/api/execute-project-agent-operation.ts`）：GUI/route 调用落到 operation
- **40+ operation 文件**：覆盖 read/edit/plan/run/task/governance/config/billing/asset-hub/media/voice/download 等领域

### 3.8 Mutation Batch

`src/lib/mutation-batch/`：
- `service.ts`：mutation batch 记录服务
- `revert.ts`：批量撤回实现

### 3.9 Skills 体系

- `src/lib/skill-system/`：catalog / registry / presets / project-workflow-machine / executors/
- `src/lib/saved-skills/service.ts`：agent 沉淀的 saved skill 服务
- 代码层面三类分层（project-workflow / saved / installed）雏形已有

## 4. 测试覆盖

`tests/unit/project-agent/` 下 11 个测试文件：

| 测试文件 | 覆盖模块 |
| --- | --- |
| `runtime-routing.test.ts` | runtime + router 集成 |
| `router.test.ts` | LLM 路由（schema 校验、置信度、澄清） |
| `tool-policy.test.ts` | 动态工具选择评分 |
| `tool-policy-scenarios.test.ts` | 多场景工具选择回归 |
| `tool-catalog.test.ts` | 工具目录构建 |
| `message-compression.test.ts` | 消息压缩逻辑 |
| `persistence.test.ts` | 会话持久化 |
| `tool-adapter.test.ts` | tool adapter 确认/错误 |
| `api-adapter.test.ts` | API adapter |
| `presentation.test.ts` | 展示层 |
| `stop-conditions.test.ts` | stop controller |

另有 `tests/integration/api/contract/project-assistant-chat.route.test.ts` 覆盖 route 层集成。

## 5. 当前完成度

### 5.1 已完成（P0，全部）

- ✅ 项目级 assistant 入口
- ✅ LLM-first 路由（无规则兜底）
- ✅ 消息压缩与窗口化
- ✅ runtime / stop 机制
- ✅ dynamic tool selection（多维评分）
- ✅ confirmed gate
- ✅ structured tool result / structured error
- ✅ projection / context 两层
- ✅ operation registry 统一收口
- ✅ API adapter 统一收口
- ✅ 主要 route 的 operation 化
- ✅ mutation batch / undo
- ✅ 关键测试覆盖

### 5.2 部分完成（P1）

- ⬜ 工具选择策略的生产场景验证 → 需要日志和真实会话回归样本
- ⬜ `auto/plan/fast` 已有显式切换和 execution-mode 解析，但审批前置和 richer workflow UI 仍不足
- ⬜ 富渲染卡片（对比/diff/预览）仍偏弱
- ⬜ markdown 基础渲染已完成，但视觉一致性和复杂内容排版仍可继续增强

### 5.3 未开始（P2/P3）

- ⬜ 预算语义
- ⬜ Skills 统一 UI 入口
- ⬜ 多模态一致性审查
- ⬜ Agent 沙盒

## 6. 结论

Project Agent 已经完成从"可用原型"到"可交付项目助手"的全面升级。LLM 路由、消息压缩、动态工具选择三个 P0 架构能力在上次审计（2026-04-20）后已全部落地，对应测试已补齐。

当前阶段的工作性质是 **"打磨"而非"补全"**。下一步最该做的事情是：验证工具选择的生产覆盖度、完善 `interactionMode` 交互边界、丰富前端交互体验。
