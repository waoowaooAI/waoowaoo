# Agent 功能与预期的差距

> 这份文档只保留差距项和补齐规划，不再重复设计与现状描述。
> 最近审计日期：2026-04-21

## 1. 结论先行

与 `agent_design.md` 目标态和成熟 agent 范式相比，当前 Project Agent **核心 P0 架构已全部落地**，主链路完整可运行。

具体进展：
- **LLM-first 路由**（P0）：已完成。`router.ts` 使用 `generateObject` 做独立模型路由调用，输出结构化 intent/domains/toolCategories/confidence/needsClarification，低置信度或歧义场景直接追问用户，无规则兜底。
- **消息压缩与窗口化**（P0）：已完成。`message-compression.ts` 实现了完整的消息窗口策略（超过 50 条或 token > 80% 阈值触发 LLM 汇总），runtime 层已集成调用。对应单元测试和集成测试均已补齐。
- **动态工具选择**（P0）：已完成。`tool-policy.ts` 按 route/phase/scope/risk/visibility 多维评分动态裁剪工具集，不再全量暴露。
- **状态注入收敛**（P1）：已完成。system prompt 不再拼接 `phaseSummary/toolSummary`，改为在规则中要求模型先调用 `get_project_phase` / `get_project_snapshot` 读取状态。
- **结构化错误与 confirmed gate**（P0）：已完成。`tool adapter` 统一封装确认门控和错误返回。
- **operation registry 统一**（P0）：已完成。tool 和 API 两条入口共用同一个 registry。
- **interactionMode 三态化**（P1）：已大部分完成。当前已从二态升级为 `auto/plan/fast` 三态，并通过 execution-mode 统一解析显式 mode 与 router intent。`plan` 模式下 `act intent` 会降级为 planning handling，`fast` 模式保留直接 act，`auto` 跟随 router。前端已补模式说明、待处理动作区、审批/确认前置入口；剩余缺口主要是 richer workflow UI 与对比卡片。

当前差距主要集中在 **P1/P2 级别的体验优化和工程收敛**，不再涉及架构重做。

## 2. 与成熟 Agent 范式的对比

### 2.1 已达到成熟范式的能力

| 能力 | 成熟范式要求 | 当前状态 |
| --- | --- | --- |
| 意图路由 | LLM-first 分类，结构化输出 | ✅ `router.ts` 使用 `generateObject` + zod schema，输出 intent/domains/toolCategories/confidence |
| 动态工具选择 | 按场景裁剪工具集，不全量暴露 | ✅ `tool-policy.ts` 多维评分 + 最大工具数限制 |
| 结构化上下文 | lite/full 分层投影，按需读取 | ✅ `project-projection/lite.ts` + `full.ts` 两层，含 progress/activeRuns/staleArtifacts |
| 项目阶段感知 | 自动判断项目所处阶段并调整行为 | ✅ `project-phase.ts` 输出完整 PhaseSnapshot（phase/progress/failedItems/staleArtifacts/availableActions） |
| 消息压缩 | 长对话不爆炸，token 可控 | ✅ `message-compression.ts` 实现窗口化 + LLM 汇总 |
| 确认门控 | 高风险操作需用户确认 | ✅ `confirmation.ts` + tool adapter 统一拦截 |
| 结构化错误返回 | 失败返回结构化结果，支持模型自愈 | ✅ tool adapter 返回 `ProjectAgentToolResult<T>` |
| 异步任务 | Fire-and-Report，返回 taskId | ✅ 支持 taskId/runId/batchId 回传 |
| 执行上限 | stop condition 防止无限循环 | ✅ `stop-conditions.ts` 硬上限 999 步 |
| 持久化 | 会话可保存/恢复 | ✅ `persistence.ts` 基于 Prisma |
| operation 统一 | tool 和 API 共用同一执行层 | ✅ registry.ts 统一校验 |
| 测试覆盖 | 关键链路有单元/集成测试 | ✅ 10 个 test 文件覆盖 runtime/router/tool-policy/tool-catalog/message-compression/persistence/adapter/stop-conditions |

### 2.2 与成熟范式仍有差距的能力

| 能力 | 成熟范式要求 | 当前状态 | 差距级别 |
| --- | --- | --- | --- |
| 状态注入方式 | prompt 只保留规则，状态通过 tool 读取 | ✅ 已完成，system prompt 仅保留行为规则与 tool 调用约束 | - |
| 多轮规划与审批 UI | 显式 mode 与隐式 intent 边界清晰，规划/审批/执行语义可见 | 已有 `auto/plan/fast` 显式切换、execution-mode 解析、模式说明、待处理动作区；但 richer UI 和对比视图仍不足 | P1 |
| 预算语义 | 确认可升级为预算授权 | confirmed gate 只有布尔确认，无预算字段 | P2 |
| Skills 三类分层 | project-workflow / saved / installed 清晰区分 | `skill-system/` 和 `saved-skills/` 已存在，但 UI 无统一的 skills 浏览/安装/启用入口 | P2 |
| 富渲染卡片 | 对比渲染、diff 视图、任务状态卡片 | 基础任务状态和确认卡片已有，对比/diff 等高级卡片不足 | P2 |
| 多模态审查 | 分镜一致性检查（角色衣着、场景连续性） | 未实现 | P3 |
| 沙盒环境 | Agent 可在隔离环境试运行 | 未实现 | P3 |

## 3. 补齐规划表

| 优先级 | 差距项 | 目标状态 | 建议动作 | 验收方式 |
| --- | --- | --- | --- | --- |
| P1 | 工具选择持续精调 | 不漏掉低频必要工具，不暴露无关工具 | 工具选择日志已落地；继续补真实对话覆盖度验证与日志消费视图 | tool selection 单测 + 日志分析 |
| P1 | interactionMode 交互完善 | `auto/plan/fast` 语义、审批边界、执行结果在 UI 中清晰可见 | 模式说明、待处理动作区已落地；继续补 richer workflow UI | component 测试 |
| P1 | 富渲染能力补齐 | 复杂 act-mode 有前后对比、diff、结果回看卡片 | 增加 preview/compare/diff 型卡片组件 | component / integration 测试 |
| P2 | budget 语义预留 | 确认语义可升级为预算语义 | 在 sideEffects / context 中保留预算字段 | 协议测试 |
| P2 | Skills 调用入口 | skills 可显式浏览/安装/调用 | 统一 `skill-system`/`saved-skills` 的 UI 入口 | component / integration 测试 |
| P2 | 状态桥接继续收敛 | assistant 与 workspace 使用更统一的数据源 | 减少前端事件桥接，逐步统一服务端状态源 | integration 测试 |
| P2 | 文档稳定化 | docs/agent/ 下文档保持一致 | 只维护这组文档，不再新增并行稿 | 文档审查 |
| P3 | 多模态一致性审查 | 分镜角色衣着、场景连续性自动检查 | 需要新 skill + 视觉模型能力 | 集成测试 |

## 4. 接下来的重点

### 4.1 短期重点（下一迭代）

1. **工具选择策略的真实场景验证**：`tool-policy.ts` 的评分体系已经完整，并已有 scenario/runtime 单测和运行时日志；仍缺少日志消费与真实对话回放验证，需确保边缘场景（如多 domain 混合请求）不漏工具。

2. **interactionMode 交互补齐**：
   - 当前已有 `auto/plan/fast` 显式切换
   - 已加入 execution-mode 解析，显式 mode 与 router intent 不再直接冲突
   - 已补模式说明、待审批/待确认动作区和 workflow 计划选择入口
   - 剩余工作是 richer workflow UI、对比视图和更清晰的执行后反馈

3. **对话体验完善**：
   - markdown 基础渲染已落地，但视觉一致性和复杂内容排版仍可继续优化
   - 确认框/方案选择组件继续前置到 UI 层，减少 confirmed gate 消耗 agent step
   - 音视频图的前后方案并排对比卡片

### 4.2 中期重点

1. **interactionMode 完善化**：在已有 `auto/plan/fast` 切换基础上，补充更明确的模式文案、审批提示和 richer workflow UI。
2. **Skills 统一入口**：`skill-system/` 和 `saved-skills/` 已有代码基础，需要在前端增加统一的 skills 浏览、安装、启用、调用入口。
3. **Projection 成为更多读取场景的默认入口**：减少 project-agent 直接查 DB 的场景，统一走 projection/context。

### 4.3 长期方向

1. **预算授权**：把 confirmed gate 升级为"确认 + 预算"双语义。
2. **多模态一致性检查**：角色衣着、场景连续性等自动审查。
3. **Agent 沙盒**：隔离环境试运行能力。

## 5. 总结

当前 Project Agent **已经完成了从"原型"到"可交付项目助手"的跨越**。核心 P0 差距项（LLM 路由、消息压缩、动态工具选择、结构化错误、confirmed gate）已全部落地并有测试覆盖。

接下来的工作性质已从"架构补全"转变为"体验打磨与工程收敛"：
- 最重要的一件事已经从“去状态 prompt”转移为**工具选择的生产验证**和**前端交互体验**的丰富。
- 其次是**interactionMode 交互边界**和**skills 统一入口**的补齐。
- Skills 和预算等中长期能力已有代码基础，按需推进即可。
