# Agent 功能设计构想

> 这份文档只描述目标态和设计边界，不记录过期时间线。
> 适用范围：`src/lib/project-agent/**`、`src/lib/project-projection/**`、`src/lib/project-context/**`、`src/lib/operations/**`、`src/lib/adapters/**` 以及项目级 assistant routes。

## 1. 设计目标

Project Agent 的定位不是通用聊天助手，而是项目级执行助手。它需要在项目上下文里完成三类事情：

1. 解释现状：告诉用户项目当前在哪个阶段、哪些产物已完成、哪些任务仍在运行、哪些结果已经过时。
2. 协助决策：把复杂流程拆成可理解的计划、审批与执行步骤。
3. 安全执行：在低风险场景直接 act，在高风险或计费场景要求确认，并保留可审计、可撤回的记录。

核心原则很简单：

- operation registry 是 truth source，tool 只是暴露层。
- 显式失败，不做隐式兜底。
- 小写入可以直连数据库，复杂批量写入交给 workflow / domain 层。
- 所有可变状态尽量通过 projection/context 读取，不把系统搞成一个越来越大的 prompt。

## 2. 角色边界

仓库里至少有两类 assistant，不能混用设计：

- Project Agent：项目级 assistant，负责项目推进、资产/分镜/配音/视频相关的解释、计划和执行。
- Assistant Platform：用户级 assistant，负责通用配置、教程和非项目绑定能力。

Project Agent 不应该重造一套 skill registry。它的事实来源已经是 operation registry、projection 和 context，而不是通用 skill 系统。

## 3. 目标架构

```text
UI / 路由 / 外部调用
  -> project assistant route
  -> runtime
  -> project phase + projection/context
  -> route policy + tool policy
  -> operation registry
  -> tool adapter / api adapter
  -> operation.execute
  -> DB / task / workflow / mutation batch
```

设计上需要保留的几个关键层：

- runtime：负责模型选择、消息转换、工具装配、stop 规则和流式输出。
- projection/context：负责从数据库和运行时状态中提取项目事实。
- route policy：负责把当前会话路由到 query / plan / act 的不同处理路径。
- tool policy：负责按阶段、意图、风险和作用域裁剪可见工具。
- operation adapters：统一执行和统一校验，避免 route 和 tool 两边重复实现。

## 4. 行为模式

### 4.1 Query 模式

用于读取项目状态、查看运行结果、解释当前进度和失败原因。

要求：

- 只读优先。
- 输出要面向用户，而不是把内部结构原样抛给用户。
- 当发现 stale artifacts 或 failed items 时，要先解释，再建议下一步动作。

### 4.2 交互模式

Project Agent 的模式语义应拆成两层：

- **显式 interactionMode**：用户施加的交互约束
- **隐式 routed intent**：router 对当前请求语义的判断

推荐三态 interactionMode：

- `auto`：默认模式。跟随 router 判定，可在安全规则允许时直接 act。
- `plan`：显式执行冻结。允许 query / plan 和确认准备，但不直接执行 act。
- `fast`：显式快速执行。尽量直接 act，但不绕过 confirmation gate。

这意味着：

- `interactionMode` 决定用户施加的执行边界
- `intent` 决定当前请求语义
- 两者需要通过一层统一解析得到最终执行模式，不能互相替代

用于固定 workflow 的编排，例如 story-to-script、script-to-storyboard。

要求：

- 先 create_workflow_plan，再审批，再执行。
- workflow 内部 skill 顺序不能被 agent 改写、跳过或合并。
- 计划结果必须可回放、可审计。

额外约束：

- 当 `interactionMode=plan` 且 router 判定 `intent=act` 时，应降级为 planning/confirmation-preparation handling，而不是直接执行 act。
- 真正的 approve / revert / execute 属于 commit 动作，不应因为处于 `plan` 语义就自动获得执行权。

### 4.3 Act 模式

用于资产生成、分镜修复、配音生成、视频生成、轻量编辑等直接操作。

要求：

- 低风险、低成本、局部修改可以直接 act。
- 中高风险、计费、覆盖、批量、长耗时操作必须先确认。
- 能返回结构化错误，就不要把错误变成静默失败。

### 4.4 模式组合规则

推荐矩阵：

- `auto + query` -> query
- `auto + plan` -> plan
- `auto + act` -> act
- `plan + query` -> query
- `plan + plan` -> plan
- `plan + act` -> plan
- `fast + query` -> query
- `fast + plan` -> plan
- `fast + act` -> act

## 5. 结构化上下文

当前设计里，项目状态不应该只靠 prompt 中的一段文本快照，而应该拆成两层：

- Lite projection：用于 agent 在大多数场景下判断项目大局、阶段、运行状态和最新产物。
- Full projection / context：用于需要 panel、clip、storyboard、voice line 细节的精确操作。

建议的上下文分工：

- phase：判断当前处于 draft / script / storyboard / voice / generation 的哪一类阶段。
- progress：展示 clip、screenplay、storyboard、panel、voice line 的完成度。
- active runs：展示当前仍在运行的 workflow 或任务。
- failed items：展示最近失败的任务或步骤，供 agent 诊断。
- stale artifacts：展示哪些已生成内容已经落后于最新输入。

## 6. Skills 设计

Skills 不是业务真相源，而是“可复用的行动/编排模板层”。当前建议把 skill 明确分成三个类别：

### 6.1 Developer-maintained skills：project-workflow

这类 skill 由开发者维护，属于项目主流程的固定能力包。

特征：

- 代码仓库中可版本化、可测试、可回放。
- 对应稳定的 workflow package，例如 story-to-script、script-to-storyboard。
- 适合承载明确的业务步骤、审批边界和固定顺序，不依赖用户临时创建。
- 不能被 agent 自由改写内部步骤，只能按定义编排或调用。

### 6.2 Agent-saved skills：执行过程中沉淀的工作流

这类 skill 由 agent 在 plan 模式或 act 推进过程中产生，之后可沉淀为可复用模板。

特征：

- 来源于一次真实执行，而不是先验设计。
- 适合把“用户刚跑过的一套有效工作流”保存为可再次调用的模板。
- 存储在 `skills/saved/` 这类子目录中，和 project-workflow 平级，但语义不同。
- 允许带有项目上下文约束，例如适用于某类剧集、某类分镜风格或某个资产组合。

### 6.3 User-installed skills：外部导入 / 分享安装

这类 skill 由用户手动安装，来源可能是别人分享的模板、导出的技能包或外部仓库。

特征：

- 用户显式安装、显式启用。
- 需要清晰的来源标记、版本标记和兼容性说明。
- 默认应处于隔离或受限状态，避免和 project-workflow 混淆。
- 安装后只作为可选能力，不应自动覆盖开发者维护的核心 workflow。

### 6.4 Skills 和 operations 的关系

- skills 负责“如何组织一串动作”。
- operations 负责“一个动作具体怎么执行”。
- workflow skill 可以编排 operation，但不应该重新定义 operation 的业务语义。
- 可沉淀的 skill 应优先保存为模板，而不是复制底层执行逻辑。

### 6.5 Skills 的 UI / 生命周期目标

skills 体系最终应支持：

- 显式的 skills / workflow 调用入口。
- 保存、安装、启用、禁用、导入、导出。
- 分类浏览和来源标识。
- 对 project-workflow、saved skill、installed skill 做明确区分。

## 7. 工具设计

工具的目标不是“尽可能多”，而是“尽可能少但足够组合”。

需要遵守的规则：

- tool 名称和 operationId 一一对应。
- tool 描述要明确用途、风险和适用场景。
- 动态裁剪可见工具，避免一次把所有能力都暴露给模型。
- 工具选取要同时考虑阶段、意图、作用域和风险预算。

### 7.1 confirmed gate

confirmed gate 仍然必须存在，因为项目里存在写入、覆盖、批量和计费类动作。

设计目标不是取消确认，而是让确认更精确：

- 低风险 query 不需要确认。
- 中风险 act 可以保留确认，但应尽量减少无意义的重复确认。
- 高风险、覆盖、批量、长耗时操作必须确认。

### 7.2 budget 预留

未来如果系统给 agent 分配预算，应支持基于预算的自主决策，但前提是：

- 可审计。
- 可撤回。
- 预算不足时必须显式失败或要求确认。

## 8. 错误模型

系统必须显式失败，但在 tool loop 里尽量把失败变成结构化结果返回给模型。

推荐原则：

- 参数错误、资源不存在、状态冲突等，返回结构化错误，允许模型自愈。
- 基础设施故障、配置缺失、不可恢复异常，才中断流并显式报错。
- 禁止吞错、默认值兜底和悄悄跳过。

## 9. 写入策略

当前建议保留两条写入路径：

- 交互式轻写入：operation.execute 可以直接落库，保持简单和可维护。
- workflow / 批量写入：保留 domain / repository 的显式层，负责事务、幂等和跨实体约束。

硬约束：

- 不允许绕开 mutation batch / undo 体系做不可撤回写入。
- 创建记录后再提交任务时，必须先做前置校验，失败时要有补偿或回滚。

## 10. 异步任务

图、音、视频等耗时任务采用 Fire-and-Report：

- 先提交任务。
- 返回 task id / run id / batch id 等结构化信息。
- 前端展示任务卡片。
- 后续由用户或 agent 再查状态，不默认阻塞等待长任务完成。

## 11. 测试要求

只要改动以下任意部分，就必须补测试：

- runtime 的 stop 条件。
- tool adapter 的确认、输入输出校验和结构化错误。
- projection/context 的字段变更。
- route 与 operation 的对齐。
- 新增或修改的工作流、任务类型、批量撤回和恢复逻辑。

优先测试的对象是：

- `src/lib/project-agent/runtime.ts`
- `src/lib/adapters/tools/execute-project-agent-operation.ts`
- `src/lib/adapters/api/execute-project-agent-operation.ts`
- `src/lib/project-projection/**`
- `src/lib/project-context/**`

## 12. 设计结论

这套 agent 的终态不是“更长的 prompt”，而是：

- 更稳定的状态投影。
- 更严格的 operation 边界。
- 更少但更好的工具暴露。
- 更清晰的确认与预算语义。
- 更可靠的错误自愈闭环。

换句话说，agent 的智能来自于状态、工具和反馈循环，而不是把所有知识硬塞进 system prompt。
