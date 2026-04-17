# Agent 模式开发调整方案

基于 `exp/assistant` 分支截至 2026-04-16 的实现状态，对原有 `agent_task` 计划进行重写。

目标不是重新发明一套新的 agent 平台，而是在已经落地的 `project-agent + command-center + project-workflow + workspace assistant UI` 基础上，尽量少加新抽象，尽量直接复用现有代码、现有开源方案和现有任务链路，把当前实现从“会解释和审批 workflow 的聊天面板”推进成“真正能帮助推进项目的双模式 Agent”。

---

## 1. 已有实现现状的理解

### 1.1 当前已经落地的部分

当前分支已经不是一个空的 agent 草案，而是已经落地了一套可运行的 Workspace Assistant MVP，核心包括：

- 项目级聊天入口
  - `src/app/api/projects/[projectId]/assistant/chat/route.ts`
- Agent runtime
  - `src/lib/project-agent/runtime.ts`
  - 已使用 AI SDK 的 `streamText + tool + UIMessage stream`
- 持久化的 command / plan / approval 链路
  - `src/lib/command-center/*`
  - 已有 `ProjectCommand / ExecutionPlan / ExecutionPlanStep / PlanApproval`
- 固定 workflow package 体系
  - `src/lib/skill-system/project-workflow-machine.ts`
  - `skills/project-workflow/*`
  - 已覆盖 `story-to-script` 与 `script-to-storyboard`
- 项目上下文装配
  - `src/lib/project-context/*`
  - 当前通过 `assembleProjectContext()` 聚合 project、episode、clips、panels、approvals、runs、artifacts
- 前端常驻 assistant 面板
  - `src/features/project-workspace/components/WorkspaceAssistantPanel.tsx`
  - `src/features/project-workspace/components/workspace-assistant/*`
- 对话持久化
  - `src/lib/project-agent/persistence.ts`
  - `src/lib/query/hooks/useProjectAssistantThread.ts`
- workspace 与 assistant 的前端联动
  - `useWorkspaceExecution` 通过浏览器事件把 workflow 运行状态同步到 assistant 面板

### 1.2 当前 assistant 的能力边界

当前 runtime 已支持的工具，主要是“解释、规划、审批、查询、预览”：

- `get_project_phase`
- `get_project_context`
- `list_workflow_packages`
- `create_workflow_plan`
- `approve_plan`
- `reject_plan`
- `list_recent_commands`
- `fetch_workflow_preview`
- `get_task_status`
- `generate_character_image`（Act Mode，需 confirmed=true 二次确认）
- `generate_location_image`（Act Mode，需 confirmed=true 二次确认）
- `regenerate_panel_image`（Act Mode，需 confirmed=true 二次确认）
- `voice_generate`（Act Mode，需 confirmed=true 二次确认；支持单条或批量）

这意味着当前 assistant 的本质能力是：

- 读取项目上下文
- 解释当前 workflow 能做什么
- 为固定 workflow 创建执行计划
- 触发审批与批准
- 查看最近命令与产物预览

它还不具备以下能力：

- 除 `generate_character_image` 之外的大多数 Act Mode 写操作（场景图生成、分镜重生、配音生成、视频生成等）
- 基于任务状态做持续推进
- 根据项目阶段自动判断“该走直接操作还是走计划审批”
- 进行更通用的多步 tool 编排

### 1.3 当前架构的真实定位

当前实现更接近：

- `workflow command assistant`
- `workspace-side orchestration shell`

而不是：

- `全流程 studio agent`
- `通用项目智能助手`

也就是说，当前实现已经做出了很有价值的第一层骨架，但还停留在“围绕两条固定主流程进行聊天化包装”的阶段。

### 1.4 当前主要问题

当前主要问题不是“没有架构”，而是“架构已经有了，但能力面和工程健康度都还不够”。

主要问题有：

- 编译健康度仍未恢复
  - 分支当前依然存在大量 TypeScript 错误
  - 包括 `.next/types` 对旧路由的残留引用
  - 也包括 Prisma schema 重构后 worker / tests / route handler 的真实断裂
- 抽象层较多
  - `project-agent`
  - `command-center`
  - `project-context`
  - `skill-system`
  - `artifact-system`
  - `policy-system`
- 当前 prompt 偏轻
  - 没有 phase / progress / stale artifacts / available actions 的显式注入
- 当前 context 偏重
  - system prompt 实际只需要轻量摘要
  - 但当前 `assembleProjectContext()` 查询的是较完整的 episode / clip / panel / approval 数据
- workspace 与 assistant 联动仍是前端事件桥接
  - 适合作为过渡方案
  - 但还不是统一的、服务端权威的状态源

### 1.5 对现状的结论

现有实现不应该推倒重来。

原因很明确：

- plan / approval / run / thread persistence 这些最难补的基础设施已经有了
- workflow package 与 skill package 的组织方式已经搭起来了
- workspace assistant 的 UI、消息渲染、状态同步已经能工作

真正缺的是：

- 项目阶段推导
- 直接操作类 act-mode tools
- 更好的 prompt / context 组织
- 编译恢复与适度收敛抽象

---

## 2. 已有实现与我原本计划的优缺点

### 2.1 已有实现的优点

#### 1. 安全性和可追踪性强

现有实现没有直接把所有操作交给 LLM 自由决定，而是把重操作放进：

- `command`
- `plan`
- `approval`
- `run`

这让系统具备：

- 可审核
- 可追溯
- 可恢复
- 可做权限与确认控制

这是一个成熟工程方案的方向。

#### 2. 先把最核心的两条主流程标准化了

`story-to-script` 和 `script-to-storyboard` 已经被固定 workflow package 化。

这比一开始就做成“无限自由工具编排”更稳，也更适合当前项目这种强业务流程场景。

#### 3. 前端体验已经具备较好的基础

当前已经有：

- 常驻 assistant 面板
- workflow 状态卡片
- approval 卡片
- preview 卡片
- thread 恢复

这意味着后续补能力时，前端大部分不需要重做，只需要扩展渲染能力。

#### 4. 已经大量复用了现有任务链路

现有实现本质上还是在复用：

- 现有 run stream
- 现有 submitTask
- 现有 workflow task type
- 现有 Prisma 数据
- 现有 workspace hooks

这符合“先复用，后增强”的工程方向。

### 2.2 已有实现的缺点

#### 1. 当前 assistant 的能力过窄

现在的 assistant 更像：

- workflow 操作台
- 审批说明器

而不是：

- 可以直接帮用户推进角色、场景、分镜、配音、视频工作的 agent

#### 2. 抽象层有些偏多

当前为了把 command / workflow / context / policy / artifact 都纳入统一结构，引入了较多模块。

问题不在于这些模块概念错误，而在于：

- 当前真实能力范围还比较窄
- 编译都还没恢复
- 过早引入较多层次，增加了维护成本

#### 3. 当前 prompt 还不够“agent”

目前 prompt 更像“操作规约”，还不是“携带项目阶段、可选动作、上下游失效关系”的项目执行助手 prompt。

#### 4. 当前联动方案仍偏前端补丁化

workspace 与 assistant 的联动现在主要靠浏览器事件，这对 MVP 很有效，但不是最终理想形态。

### 2.3 我原本计划的优点

#### 1. 更接近真正的项目 agent 终态

原计划强调：

- 按领域分组的高层 tools
- 直接复用 service 层
- 异步任务桥接
- phase / progress 注入
- 多步编排

这套思路更接近“真正能帮你从小说推进到视频”的 agent。

#### 2. 对异步任务桥接的判断是对的

`Fire-and-Report` 是非常适合当前项目的路径：

- 简单
- 易复用现有 task infra
- 不需要在 tool 内部写复杂阻塞等待逻辑

#### 3. 强调轻量实现、复用现有 service

原计划的核心价值之一是：

- 不要每个 API route 都变成 tool
- 不要新造 agent 中台
- 直接在现有 service / task submitter 之上做薄封装

这个方向是对的。

### 2.4 我原本计划的缺点

#### 1. 起点过于理想化

原计划默认仓库已经处于较稳定状态，可以直接进入 agent 扩展阶段。

但当前真实情况是：

- schema cutover 还没收口
- worker 与测试仍有断裂
- 编译状态不健康

所以如果直接按原计划往前冲，容易在不稳定基线上继续叠能力。

#### 2. 低估了现有 command-center 的价值

原计划更偏向“tool 直接调 service / submitter”，这对于轻操作是好的，但对：

- 重建式 workflow
- 需要审批
- 需要持久化计划
- 需要解释副作用

这些场景，现有 command-center 其实已经提供了不错的骨架，不应该绕开重做。

#### 3. 容易和现有实现形成两套并行路线

如果完全回到原始设想，很容易变成：

- 一套 `assistant-platform / studio-agent`
- 一套 `project-agent / workspace-command`

这会造成重复建设。

### 2.5 综合判断

应该采用的不是“现有实现”或“原计划”二选一，而是：

- 保留现有实现中真正不可替代、且已经和业务深度绑定的部分
- 对过度抽象、重复建模、维护成本高的自实现模块保持开放态度，必要时删除、并回或改用成熟外部方案
- 吸收原计划中关于 act-mode tools、phase 推导、轻量复用和异步任务桥接的思路

最终形成：

- 一个 runtime
- 两种模式
- 一套 UI
- 一套任务基础设施
- 尽量少的新增抽象
- 尽量少的仓库内自实现代码

---

## 3. 新增内容、可复用内容、可替换内容、可利用的成熟开源方案分析

### 3.1 总体决策原则

这一部分的核心原则不再是“尽量保留已有实现”，而是：

1. 优先使用成熟、维护良好、已经被项目验证可接入的开源方案
2. 如果已有自实现只是对成熟能力做了一层薄薄包装，但又引入了明显额外复杂度，则优先删除包装层
3. 只有当业务模型强绑定、无法直接替换时，才保留仓库内自实现
4. 删除和并回代码，本身就是一种实现优化

可以接受的演进方向包括：

- 复用已有实现
- 精简已有实现
- 删除已有实现
- 用成熟开源方案替换已有实现

### 3.2 当前代码库已经在用、且应优先利用的成熟开源能力

#### 1. Agent Loop：优先使用 `Vercel AI SDK`

当前仓库已经在用 AI SDK 作为核心 runtime 基础，包括：

- `streamText`
- `tool`
- `useChat`
- transport 机制

这部分不建议再自实现新的 agent runtime。

原因：

- 已有 `streamText`
- 已有 `tool`
- 已有 `stopWhen` 多步工具循环
- 已有 `useChat` 和 transport 机制

这已经覆盖当前项目 80% 以上的 agent 基础需求。

结论：

- 保留 AI SDK 作为唯一 agent loop
- 不引入新的 agent runtime 框架
- 不再自建第二套 tool-calling / message-stream 协议

#### 2. 聊天前端：当前已接入 `assistant-ui`，但建议向 `AI SDK useChat` 收敛

这里需要明确区分“已经接入”和“是否值得继续保留”：

- `assistant-ui` 是成熟开源方案
- 但它本身也是一层 runtime / state / component abstraction
- 当前项目的聊天面板已经高度自定义，并没有大量使用其 cloud、thread list、multi-thread 等高级能力

因此前端聊天层的推荐顺序应为：

1. 最轻方案：直接使用 `@ai-sdk/react` 的 `useChat` + 当前自定义消息卡片
2. 次优方案：保留 `assistant-ui`，但只作为薄 UI 外壳，不继续加深对其 runtime 的依赖

结论：

- 如果后续重构 assistant 面板，优先考虑移除 `assistant-ui runtime`，直接落到 `useChat`
- 如果短期内不想动前端骨架，也可以暂时保留 `assistant-ui`
- 但不建议继续围绕 `assistant-ui` 增加更多仓库内封装层

#### 3. 异步任务与编排：优先使用 `BullMQ`

这部分不应重做。

原因：

- 当前项目已经依赖 BullMQ
- 它已经承担异步任务、队列、worker 的核心职责
- 若未来需要父子任务依赖或 map/join 类结构，BullMQ 自带 `FlowProducer`

结论：

- 继续用 BullMQ 做异步任务基础设施
- 不新造仓库内任务编排中台
- 如果后续 workflow 需要更强的任务依赖关系，优先考虑用 BullMQ Flow，而不是新增自定义 DAG 执行器

#### 4. 持久化：继续使用 `Prisma`

线程、命令、审批、计划这类与业务强绑定的数据，继续放在当前库内是合理的。

不建议用第三方云线程服务替换：

- 因为项目已有自己的认证、项目、剧集、scope 模型
- 外部线程服务会引入新的数据边界和同步问题

结论：

- 保留 Prisma 持久化
- 保留自己的 `ProjectAssistantThread`
- 不引入 assistant-ui cloud 或外部 thread 平台

#### 5. 查询缓存与前端同步：继续使用 `React Query`

当前仓库已经大量依赖 React Query。

这层的价值很明确：

- 统一 query/mutation 模式
- 统一缓存失效
- 对话线程、project context、commands 都可沿用同一套客户端状态模型

建议：

- 不新增新的前端状态中台
- assistant 相关 query 继续走 React Query
- 但减少 event bridge 这类额外同步层

### 3.3 可以考虑删除、并回、替换的已有自实现

这一部分是本次调整里最重要的内容。

#### 1. `policy-system`：建议删除并内联

目前它承载的信息非常少：

- `analysisModel`
- `artStyle`
- `videoRatio`

这些更像 project config snapshot，而不是一个独立 policy system。

建议：

- 将 `PolicySnapshot` 并回 `ProjectContextSnapshot`
- 删除 `src/lib/policy-system/*`

#### 2. `command-center/approval.ts` 与 `command-center/normalize.ts`：建议并回

这两个文件当前都偏薄：

- `approval.ts`
- `normalize.ts`

如果未来不会快速扩展成复杂领域规则，继续单独拆文件收益很低。

建议：

- 合并到 `executor.ts`
- 保留测试，不保留额外目录层级

#### 3. `project-context/assembler.ts`：建议缩成轻重两层，甚至移除无意义中转

当前 `assembleProjectContext()` 只是一个很薄的转发层。

建议：

- 保留真正的实现函数
- 去掉无意义 wrapper
- 同时拆为 lite / full 两类上下文

#### 4. `project-workflow-machine.ts`：建议去重、降级为配置

当前 machine 里既有：

- workflow 元数据
- skill 元数据
- displayLabel
- approvalSummary
- 旧 step id 映射

问题是它很像第二份 source of truth。

建议：

- workflow step 结构尽量直接来自 workflow package manifest
- 展示文案移到 presentation / i18n
- 只保留必要映射，例如 legacy id 映射

如果做到这一点，可以把它从“系统层 machine”降级成“静态配置文件”。

#### 5. `workspace-assistant-events`：建议只作为过渡层

前端浏览器事件桥接可以先保留，但不应继续扩展成正式总线。

建议：

- 新能力优先接入权威状态源，如 query / run stream / task status
- 前端 event bridge 仅保留为临时同步机制

#### 6. `assistant-ui runtime`：建议重新评估，必要时移除

这是最值得重新审视的一项。

它不是“坏实现”，但有可能不是当前项目的最简方案。

如果你希望更轻量、简洁、优雅，当前最可能被移除的不是 AI SDK，而是这层额外 runtime 包装。

建议判断标准：

- 如果未来确实要大量使用 assistant-ui 的现成线程体系、富交互生态、runtime registry，就保留
- 如果只是保留一个固定 workspace sidebar，并且消息卡片都是自定义的，那么直接回到 `useChat` 往往更简单

### 3.4 应保留但要薄化的自实现

#### 1. `project-agent/runtime.ts`

应保留，但必须保持为：

- 单一入口
- 薄运行时
- 工具组合层

不应继续膨胀成新的平台层。

#### 2. `command-center`

应保留，但只服务于：

- 需要审批的重操作
- 需要持久化计划的 workflow 级操作

不应该扩展为所有操作的统一入口。

换句话说：

- Plan Mode 走它
- Act Mode 不走它

#### 3. `skills/project-workflow/*`

应保留。

这是当前项目里最贴近业务知识的部分，也是固定 workflow 的实际资产。

但其上层 registry / machine / display metadata 需要尽量减薄。

### 3.5 对成熟外部框架的取舍建议

#### 1. LangGraph

LangGraph 是成熟方案，适合：

- 长运行
- 强状态图
- durable execution
- human-in-the-loop

但当前项目不建议立即引入，原因是：

- 当前主流程仍然是两条固定 workflow
- 项目已有 AI SDK + BullMQ + run stream
- 当前的复杂度主要来自仓库内抽象过多，而不是缺少图执行框架

结论：

- 现在不引入
- 如果未来真的要做复杂 DAG / 多 agent / 可恢复图执行，再优先考虑 LangGraph，而不是继续扩张自定义 command-center

#### 2. Mastra

Mastra 也提供 agent / workflow 能力，但对当前项目的价值和 LangGraph 类似：

- 不是当前阶段的最小方案
- 会引入新心智模型和新集成面

结论：

- 当前不引入

#### 3. assistant-ui Cloud

它提供线程和持久化能力，但当前项目已有自己的：

- 项目上下文
- 权限体系
- 数据库
- thread 表

结论：

- 当前不引入

#### 4. Mem0

Mem0 更适合解决：

- 长期记忆
- 用户偏好
- 跨 session recall

它适合作为“memory 增强层”，而不是主 runtime。

适合的未来接入方式：

- 继续保留 Prisma 作为 thread/session 权威存储
- 仅将用户偏好、风格偏好、长期上下文摘要接入 Mem0

不适合的使用方式：

- 用 Mem0 取代 project/episode/artifact 等业务状态
- 用 Mem0 取代线程持久化

结论：

- 如果后续要增强长期记忆，Mem0 是最值得优先研究的增量方案
- 当前不是前置依赖

#### 5. Letta

Letta 更像完整的 stateful agent/memory runtime。

它的能力更强，但对当前项目来说：

- 接入成本偏高
- 会和现有业务状态、线程持久化、任务系统产生较大重叠

结论：

- 当前不引入
- 只有当项目未来转向“通用 stateful assistant platform”时才值得重新评估

### 3.6 最简实现的技术选型结论

综合考虑后，推荐的最简技术选型是：

- Agent Loop：`Vercel AI SDK`
- Chat State：优先 `useChat`
- UI：继续复用现有卡片组件，必要时保留少量 assistant-ui 组件，但不加深依赖
- Async Jobs：`BullMQ`
- Persistence：`Prisma`
- Heavy Workflow Approval：保留精简版 `command-center`
- Workflow Definition：保留 `skills/project-workflow/*`，削薄 registry / machine / metadata 层

### 3.7 简化实现原则

后续所有设计都应遵守以下原则：

- 能删就删，先删再想怎么补
- 能并回就并回，不为了“看起来分层”而分层
- 能用成熟开源能力就不用仓库内重新实现
- 能复用现有 task / stream / DB / hook 就不新开中台
- 一个 runtime，不开第二套 agent runtime
- 一个权威状态源，避免前端事件和后端状态双轨扩张

### 3.8 结合当前代码库的量化分析：agent 部分有多少代码，哪里最该简化

基于当前仓库实际统计，agent 相关部分大致可以分成两层体量：

#### 1. 全量 agent 相关资产

包含代码、skills 文本、workflow 文档、prompt 模板，共约：

- `9474` 行

这个数字不能简单理解为“都需要重构”，因为其中大量是：

- prompt 模板
- workflow 文档
- 技能说明文本

它们属于内容资产，不等同于运行时代码。

#### 2. agent 相关代码体量（`ts/tsx`）

只统计 agent 相关代码文件，约：

- `6455` 行

进一步拆分：

- `project-agent`：`762` 行
- `command-center`：`986` 行
- `skill-system(core)`：`716` 行
- `project-context`：`270` 行
- `workspace-assistant-ui`：`1116` 行
- `skills code(ts/tsx)`：`2605` 行
- `skills docs/prompts(md/txt)`：`3019` 行

#### 3. 最大的代码热点

当前最大的 agent 相关代码文件包括：

- `src/lib/command-center/executor.ts`：`674` 行
- `src/lib/project-agent/runtime.ts`：`365` 行
- `src/lib/skill-system/project-workflow-machine.ts`：`330` 行
- `skills/project-workflow/_shared/story-to-script-runtime.ts`：`330` 行
- `skills/project-workflow/_shared/script-to-storyboard-runtime.ts`：`324` 行
- `src/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers.tsx`：`319` 行
- `src/features/project-workspace/components/WorkspaceAssistantPanel.tsx`：`183` 行
- `src/features/project-workspace/components/workspace-assistant/useWorkspaceAssistantRuntime.ts`：`172` 行
- `src/lib/context/project-workflow-context.ts`：`190` 行
- `src/lib/query/hooks/useProjectCommandCenter.ts`：`121` 行

#### 4. 代码简化的核心判断

从当前代码分布看，复杂度主要不是集中在某一个巨型 runtime，而是分散在以下几层：

- Plan Mode 持久化与执行链路
- skill-system 元数据与重复映射
- workspace assistant 前端 runtime 包装层
- workflow shared runtime / shared skills 代码

这意味着真正有效的简化不是“只重写一个文件”，而是要减少重复层级。

#### 5. 哪些部分最值得优先简化

优先级建议如下：

##### 第一优先级：删除薄包装层

- `policy-system`
- `command-center/approval.ts`
- `command-center/normalize.ts`
- 无意义的 project-context wrapper

这类代码删除后，能直接减少认知层级，且风险较低。

##### 第二优先级：收缩前端 assistant runtime 包装

目标文件：

- `useWorkspaceAssistantRuntime.ts`
- `WorkspaceAssistantPanel.tsx`
- `workspace-assistant-events.ts`

如果改为：

- `useChat + React Query + 薄 renderer`

则可以明显减少：

- runtime 包装层
- event bridge
- assistant-ui 依赖面

##### 第三优先级：削薄 skill-system 元数据层

目标文件：

- `project-workflow-machine.ts`
- `catalog.ts`
- workflow/skill metadata 之间的重复映射

方向：

- workflow 结构直接从 `skills/project-workflow/*` 读
- 显示文案移到 presentation
- 只保留必要注册信息

##### 第四优先级：将 workflow skill 代码收敛为 operation 编排

当前 `skills/project-workflow/_shared/*` 和对应 workflow 执行代码占比不小。

后续应减少：

- 每个 skill 自带独立执行胶水
- 每个 workflow 自带重复 runtime/shared skills

改为：

- `service`
- `operation`
- `skills/preset/*` 只编排 `operation`

这会是中期最大的减法来源。

#### 6. 哪些部分不要优先砍

不建议优先删这些：

- `ProjectAssistantThread` 持久化
- BullMQ 任务体系
- `project-agent/runtime.ts` 本体
- 业务强绑定的 workflow 内容资产

因为这些不是当前代码行数膨胀的主要浪费点，且业务价值较高。

---

## 4. 综合考虑后的新设计方案

### 4.1 设计目标

新的目标不是“做一个很炫的 Agent 系统”，而是做一个：

- 够用
- 可维护
- 尽量删除不必要代码
- 尽量复用成熟开源能力
- 尽量少新增抽象
- 能从当前分支平滑演进

的 `project agent`。

### 4.1.1 不可妥协的架构约束（从长期目标继承）

为了避免系统在后续演进中滑向“prompt/skill/UI 变成业务真相源”的方向，本方案在保持轻量实现的同时，明确继承以下不可妥协约束，并将其落实到后续任务拆分与验收标准中：

- 两层执行面必须分开：Assistant/Tool-Use Plane 负责理解、选 tool/workflow、做计划与审批、解释状态；Analysis Execution Plane 只在固定 workflow 下执行固定 step
- GUI 与 assistant 只是两个入口：两者背后必须共用同一套 tool/runtime/domain mutation，不允许发展成两套底层实现
- 固定长流程必须是 workflow packages：像 `story-to-script`、`script-to-storyboard` 的内部执行不能退化为 assistant 自由串 skill/工具
- 业务真相必须确定性：所有写操作最终必须落到 typed mutation（含校验、幂等、审计、并发控制），而不是写在 prompt/skill 里
- Tool Use 是系统手脚：tool 负责执行明确动作与返回结构化结果，不承担隐藏业务规则，也不是写入真相源
- Skills 是方法层：skill 负责教 assistant 如何行动、如何组合 tools、如何解释结果，不承载最终 mutation 语义
- UI 只是视图：assistant thread、tool cards、timeline 都只能渲染 canonical state，不成为审批权威或真相源
- 显式失败，零隐式兜底：禁止静默跳过、静默降级、默认值掩盖缺失状态、吞掉 mutation 冲突
- AI 能改动一切人工能改动的内容：所有 GUI 可编辑能力最终都应可被 tool 化并由 AI 调用完成

### 4.2 全局重构方案：以 `operation` 为中心收敛现有 agent 架构

这一节不是单独解释某个抽象，而是整个 agent 重构的主设计。

目标不是在现有实现外再叠一层新架构，而是把当前已经存在的：

- `project-agent`
- `command-center`
- `skill-system`
- `project-context`
- `workspace assistant UI`

收敛成一套更薄、更清晰、更容易维护的结构。

核心原则是：

- 业务能力只定义一次
- API / tool / skill 不再各自维护一份能力契约
- 重操作与轻操作分流
- 固定 workflow 保留，但只做编排
- 删除无意义包装层与重复 source of truth

#### 4.2.1 目标结构

重构后的目标关系应为：

- `service`
- `operation`
- `adapter`
- `runtime`
- `skills`
- `plan mode`

它们之间的关系如下：

##### `service`

真正业务逻辑实现。

例如：

- 生成角色图
- 查询任务状态
- 读取项目阶段
- 提交 workflow 任务

这里的 `service` 应承载 domain truth 语义，包括：

- typed mutation + validation + policy enforcement
- 幂等与并发控制
- 审计记录（后续的 mutation batch 也应落在这一层或紧邻这一层）

##### `operation`

唯一能力注册层，是这次重构的中心。

每个 operation 统一定义：

- `id`
- `inputSchema`
- `outputSchema`
- `execute`
- `sideEffects`
- `scope`

以后“某个能力长什么样”只在这里定义一次。

##### `adapter`

不同入口只做薄适配，不拥有业务真相。

包括：

- `api` adapter
- `tool` adapter

##### `runtime`

只保留一个项目级 runtime：

- `src/lib/project-agent/runtime.ts`

它负责：

- AI SDK tool loop
- 组装当前可用 tools
- 注入上下文
- 处理对话消息流

它不再负责承载大量业务定义。

##### `skills`

skill 统一收敛为“编排层”，而不是业务实现层。

建议分类为：

- `skills/preset/project-workflow/*`
- `skills/preset/dev-maintenance/*`
- `saved skills` 存数据库，不直接生成代码文件

其中：

- `Preset Skill`：人工维护、稳定内置
- `Saved Skill`：对话 / plan mode 沉淀的可复用模板

skill 只做：

- 编排 operation
- 描述步骤
- 承载 workflow 说明

skill 不再做：

- 底层业务执行
- 重复 schema 定义
- 自己维护独立业务胶水

##### `plan mode`

只服务于：

- 需要审批的重操作
- 需要持久化计划的 workflow 级操作

它不应该继续膨胀成“所有能力的统一入口”。

#### 4.2.2 与现有代码的映射关系

这次重构不是从零开始，而是要明确把当前代码映射到目标结构中。

##### 现有模块中应保留的部分

- `src/lib/project-agent/runtime.ts`
- `src/lib/project-agent/persistence.ts`
- `src/lib/command-center/executor.ts`
- `skills/project-workflow/*`
- `src/lib/context/project-workflow-context.ts`
- `src/features/project-workspace/components/WorkspaceAssistantPanel.tsx`
- `src/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers.tsx`

##### 现有模块中应删除或并回的部分

- `src/lib/policy-system/*`
- `src/lib/command-center/approval.ts`
- `src/lib/command-center/normalize.ts`
- `src/lib/project-context/assembler.ts` 这类无意义转发层

##### 现有模块中应削薄的部分

- `src/lib/skill-system/project-workflow-machine.ts`
- `src/lib/skill-system/catalog.ts`
- `src/features/project-workspace/components/workspace-assistant/useWorkspaceAssistantRuntime.ts`
- `src/features/project-workspace/components/workspace-assistant/workspace-assistant-events.ts`

#### 4.2.3 具体代码改动设计

##### 1. 新增 `operation registry`

建议新增：

- `src/lib/operations/registry.ts`
- `src/lib/operations/*.ts`

每个 operation 文件负责一项原子能力。

示例方向：

- `get-project-phase.ts`
- `get-task-status.ts`
- `generate-character-image.ts`
- `generate-location-image.ts`
- `voice-generate.ts`
- `generate-video.ts`

这些 operation 应直接调用：

- 现有 service
- 或 `submitTask`
- 或已有 domain 层函数

##### 2. 让 API 与 tool 通过 operation 暴露能力

以后新增一个能力时，代码路径应变成：

1. 写 `service`
2. 写 `operation`
3. 决定是否暴露为 `api`
4. 决定是否暴露为 `tool`
5. 决定是否被某个 skill/workflow 编排

而不是：

1. 在 API 写一份契约
2. 在 tool 再写一份契约
3. 在 skill 再写一份能力定义

##### 3. 将现有 skill 执行逻辑向 operation 编排迁移

当前 `skills/project-workflow/_shared/*` 中有较多 shared runtime/shared skills 代码。

后续应逐步将这些代码改为：

- workflow 负责列出步骤
- 每一步引用某个 `operationId`
- workflow 执行器只负责编排，不再复制底层执行逻辑

##### 4. 将 `command-center` 缩回到 Plan Mode

保留：

- `executeProjectCommand`
- `approveProjectPlan`
- `rejectProjectPlan`
- 必要的 plan persistence

缩减：

- 所有不属于重操作审批的职责
- 与轻操作重复的能力入口

##### 5. 将 `project-context` 拆为 lite/full

建议最终结构是：

- `resolveProjectPhase`
- `assembleProjectContextLite`
- `assembleProjectContextFull`

其中：

- lite 给 system prompt
- full 给 tool/debug/detail

##### 6. 收缩前端 assistant runtime

如果目标是减少代码与层级，前端的目标实现应逐步收敛为：

- `useChat`
- `React Query`
- 薄 message renderer

而不是继续在：

- `assistant-ui runtime`
- `event bridge`
- 本地消息同步胶水

之上叠更多逻辑。

#### 4.2.4 重构后目录建议

推荐最终向如下结构收敛：

- `src/lib/project-agent/runtime.ts`
- `src/lib/project-agent/persistence.ts`
- `src/lib/services/*`
- `src/lib/operations/registry.ts`
- `src/lib/operations/*`
- `src/lib/adapters/api/*`
- `src/lib/adapters/tools/*`
- `src/lib/command-center/executor.ts`
- `skills/preset/project-workflow/*`
- `skills/preset/dev-maintenance/*`
- `saved_skills` 存 DB

注意：

- 这里不是要求一次性搬完所有目录
- 而是要求在概念上先统一，然后按阶段迁移

#### 4.2.5 这次重构真正要解决的问题

这一全局重构方案主要解决以下问题：

##### 1. 降低维护成本

新增/修改一个能力时，不再需要同时维护多份业务契约。

##### 2. 降低代码量

减少：

- 重复 schema
- 重复 metadata
- 重复 workflow 胶水
- 重复前端 runtime 包装

##### 3. 降低认知成本

让工程视角从：

- `api + tool + skill + plan + context + policy`

收敛成：

- `service + operation + runtime + skills + plan mode`

##### 4. 提高扩展性

以后接入：

- 新 API
- 新 tool
- 新 skill
- 新 saved skill

都建立在 operation 之上，而不是继续复制能力定义。

### 4.3 运行时设计：一个 Runtime，两种模式

在上述全局重构方案之下，运行时层继续保持：

- 一个 runtime
- 两种模式

保留现有 `src/lib/project-agent/runtime.ts` 作为唯一后端入口，但对前后端栈做如下收敛：

- 后端 loop：AI SDK
- 聊天状态：优先 `useChat`
- 任务：BullMQ
- 持久化：Prisma
- 重 workflow 审批：精简版 command-center

在这个前提下，同一个 runtime 中同时支持：

#### 4.3.1 入口语义与审批规则（必须显式化）

审批规则必须按“入口语义 + 风险等级”分开，而不是按“是不是 AI 做的”粗分：

- GUI 明确点击：默认直接执行，不走 assistant 审批模型（点击本身就是确认）
- assistant 对话发起：
  - 读操作：不审批
  - 低风险小编辑：可直接执行或轻确认（取决于 sideEffects）
  - 高影响批量修改、覆盖/重生成、长流程重建：必须走 Plan Mode，形成 plan + approval + durable run

这里的“风险”不应写死在 prompt 文案里，而应来自 operation 的 `sideEffects` 元数据与少量明确规则（例如 `overwrite`、`bulk`、`destructive`、`longRunning`）。

#### 4.3.2 “workflow 非自由 skill 链”的工程化定义

本方案允许“把固定 workflow 作为可稳定调用的 skill 入口”，但不允许“workflow 的内部执行退化为 assistant 自由串 skill 链”。

- 允许：assistant 调用 `run_story_to_script` 或创建 workflow plan，本质是触发固定 workflow runtime 去跑 steps
- 禁止：assistant 在一次对话中自由规划并执行“读状态 -> 调模型 -> parse -> 写库”的 step-by-step 链路，把执行语义放进 prompt/skill 文本里

从实现上约束为：

- 固定长流程的执行必须由 workflow package 驱动（ordered steps + retry/approval boundaries + durable run lifecycle）
- step 内 prompt 必须由模板文件与结构化输入组成，不注入 `SKILL.md` 正文作为运行时 prompt 的一部分
- assistant/plan 只能选择与触发 workflow，不能替代 workflow 的 step 执行器

#### 1. Act Mode

适合：

- 查询当前阶段
- 查询任务状态
- 直接提交角色图 / 场景图 / 单图 / 配音 / 视频等任务
- 轻量修改类操作

特点：

- 不经过 command-center plan 草稿
- 直接调用 operation
- operation 再调用现有 service 或 `submitTask`
- 返回 taskId / pending 状态 / 产物结果

#### 2. Plan Mode

适合：

- `story-to-script`
- `script-to-storyboard`
- 需要解释副作用与审批的重建式操作

特点：

- 继续走现有 command-center
- 继续保留审批
- workflow skill 只做 operation 编排

结论：

- 不做代码层面的 mode 切换入口
- 只在 prompt 和 tool 设计层面引导 LLM 在同一个 runtime 内选择合适路径

### 4.4 核心新增能力

#### 1. `resolveProjectPhase`

新增 `project phase` 推导能力，用作：

- system prompt 摘要注入
- assistant 顶部阶段卡片
- act / plan 可选动作推荐
- stale artifact 说明

最小返回结构建议包括：

- `phase`
- `progress`
- `activeRuns`
- `failedItems`
- `staleArtifacts`
- `availableActions`

#### 1.1 `project snapshot / projection`（Phase 的上位能力）

仅靠 `resolveProjectPhase` 容易把“项目最新状态”简化成“阶段”，后续会反复遇到“AI 需要知道最新相关状态但又不能塞全量上下文”的问题。

建议将 Phase 1 的上下文分层升级为 projection 服务，并提供两类视图：

- `ProjectProjectionLite`：给 system prompt 与高频渲染使用（当前 selection/scope + phase/progress + activeRuns + unresolvedApprovals + 关键 artifacts 摘要）
- `ProjectProjectionFull`：给 tool/debug/detail 使用（按 scope 分页或按需加载，避免一次性组装全量数据）

tool 侧应优先新增 `get_project_snapshot`（或等价命名）并在 prompt 中要求“先读 projection 再行动”，而不是让 assistant 依赖记忆或 UI 事件桥接。

#### 2. 最小 Act Mode tools

第一批只做最需要的，不追求一次铺满全部领域：

- `get_project_phase`
- `get_task_status`
- `generate_character_image`
- `generate_location_image`
- `regenerate_panel_image`
- `voice_generate`
- `generate_video`
- `modify_appearance`

这些工具已经足够让 assistant 从“会解释流程”变成“真的能推进工作”。

#### 2.1 Tool 公开面设计（数量控制 vs 功能完备）

本项目需要同时满足：

- 功能完备性：最终覆盖“所有人工可编辑动作”（长尾非常多）
- Tool 数量可控：给 LLM 的公开 tool 面必须稳定、精简、可解释，避免“每个 API 一个 tool”

核心策略是把“完备性”下沉到 `service/domain + operation`，把“可控性”收敛到 `tool surface`：

- `operation` 可以很多（几十到上百），用于覆盖所有原子能力与 typed mutation
- `tool` 必须少（建议 v1 控制在 15–25），每个 tool 是一个稳定的、语义清晰的入口
- `api` 与 `tool` 都只是 adapter：两者都应调用 `operation -> service/domain`，而不是 tool 去包一堆 API route

Tool 数量控制的具体做法：

- 正交原语 + 参数化：用少量“可组合”的原语覆盖大量具体动作
- Patch 模型：编辑类能力优先收敛为 `update_*({ id, patch })` 或带 `fieldMask` 的更新，而不是为每个字段单独建 tool
- 动态暴露：根据 `ProjectProjectionLite`（phase/scope/availableActions）只暴露当前阶段需要的子集 tools，降低误用与上下文噪音
- 入口分流：高影响/覆盖式操作强制走 Plan Mode；轻操作走 Act Mode（由 `operation.sideEffects` 驱动）

#### 2.2 Tool/Operation/API 映射表（建议 v1，目标 ≤25 tools）

说明：

- “Tool”是对 LLM 的公开入口（稳定、少）
- “Operation”是内部能力契约（可多、typed、带 `sideEffects`）
- “API route（参考）”列的是当前仓库中已有的实现入口，便于复用现有 service/submitTask 能力；目标是逐步让 API 也变成对 operation 的薄适配

| Tool（公开面） | 类别 | 建议 Operation（内部） | API route（参考/复用） | 默认 Mode | `sideEffects`（建议） |
| --- | --- | --- | --- | --- | --- |
| `get_project_snapshot` | Read | `get_project_snapshot` | （新增） | Act | `read` |
| `get_project_phase` | Read | `get_project_phase`（已存在） | （已在 assistant runtime 内） | Act | `read` |
| `get_task_status` | Read | `get_task_status`（已存在） | `src/app/api/task-target-states/route.ts` | Act | `read` |
| `list_workflow_packages` | Read | `list_workflow_packages`（已存在） | （skill-system catalog） | Act | `read` |
| `create_workflow_plan` | Plan | `create_workflow_plan`（已存在） | `src/app/api/runs/route.ts`（间接） | Plan | `longRunning` `bulk` |
| `approve_plan` | Plan | `approve_plan`（已存在） | （command-center） | Plan | `requiresApproval` |
| `reject_plan` | Plan | `reject_plan`（已存在） | （command-center） | Plan | `requiresApproval` |
| `fetch_workflow_preview` | Read | `fetch_workflow_preview`（已存在） | `src/app/api/runs/route.ts`（间接） | Act | `read` |
| `list_recent_commands` | Read | `list_recent_commands`（已存在） | `src/app/api/runs/route.ts`（间接） | Act | `read` |
| `generate_character_image` | Generate | `generate_character_image` | `src/app/api/projects/[projectId]/generate-character-image/route.ts` | Act | `longRunning` |
| `generate_location_image` | Generate | `generate_location_image` | `src/app/api/projects/[projectId]/generate-image/route.ts` 或 `src/app/api/projects/[projectId]/regenerate-single-image/route.ts` | Act | `longRunning` |
| `regenerate_panel_image` | Generate | `regenerate_panel_image` | `src/app/api/projects/[projectId]/regenerate-panel-image/route.ts` | Act | `overwrite` `longRunning` |
| `panel_variant` | Generate | `panel_variant` | `src/app/api/projects/[projectId]/panel-variant/route.ts` | Act | `bulk` `longRunning` |
| `modify_asset_image` | Edit/Generate | `modify_asset_image` | `src/app/api/projects/[projectId]/modify-asset-image/route.ts` 或 `src/app/api/projects/[projectId]/modify-storyboard-image/route.ts` | Act | `overwrite` `longRunning` |
| `modify_appearance` | Edit | `modify_appearance` | `src/app/api/projects/[projectId]/character/appearance/route.ts` | Act | `overwrite` |
| `voice_design` | Generate | `voice_design` | `src/app/api/projects/[projectId]/voice-design/route.ts` | Act | `longRunning` |
| `voice_generate` | Generate | `voice_generate` | `src/app/api/projects/[projectId]/voice-generate/route.ts` | Act | `longRunning` `bulk` |
| `generate_video` | Generate | `generate_video` | `src/app/api/projects/[projectId]/generate-video/route.ts` | Act | `longRunning` `bulk` |
| `lip_sync` | Generate | `lip_sync` | `src/app/api/projects/[projectId]/lip-sync/route.ts` | Act | `longRunning` |
| `update_project_config` | Edit | `update_project_config` | `src/app/api/projects/[projectId]/config/route.ts` | Act/Plan* | `overwrite` |
| `create_entity` | Edit | `create_character`/`create_location`/… | `src/app/api/projects/[projectId]/ai-create-character/route.ts` `src/app/api/projects/[projectId]/ai-create-location/route.ts` 或 `src/app/api/projects/[projectId]/character/route.ts` `src/app/api/projects/[projectId]/location/route.ts` | Act/Plan* | `overwrite` |
| `update_entity` | Edit | `update_character`/`update_location`/…（patch） | `src/app/api/projects/[projectId]/character/route.ts` `src/app/api/projects/[projectId]/location/route.ts` | Act/Plan* | `overwrite` |
| `mutate_storyboard` | Edit | `insert_panel`/`reorder_panels`/`update_panel_prompt`（ops） | `src/app/api/projects/[projectId]/insert-panel/route.ts` `src/app/api/projects/[projectId]/panel/route.ts` | Act/Plan* | `bulk` `destructive` |
| `list_recent_mutation_batches` | Governance | `list_recent_mutation_batches` | （新增） | Act | `read` |
| `revert_mutation_batch` | Governance | `revert_mutation_batch` | （新增） | Plan | `destructive` `requiresApproval` |

\* 说明：`Act/Plan` 取决于 `operation.sideEffects`（例如是否 `bulk`/`overwrite`/`destructive`/`longRunning`）与入口语义；默认原则是“能安全直改就 Act，高影响就 Plan”。

工具数量的收敛验收标准（建议写死）：

- 不允许为每个 API route 直接新增对应 tool
- 新增 tool 之前必须证明：它是高频、正交、稳定契约的“公开入口”
- 长尾能力优先做成 operation（可多），由少量 tool/plan/workflow 来编排调用

#### 3. Prompt 升级

system prompt 需要从当前的轻量规则，升级为包含：

- 当前项目 / 当前剧集
- phase / progress / active failures
- Act Mode / Plan Mode 的选择规则
- 审批规则
- artifact invalidation 的简化说明
- 长任务的处理规则

同时：

- `maxSteps` 从 6 提升到 12-15

#### 4. Context 分层

将当前 project context 拆成：

- `lite context`
  - 给 prompt
- `full context`
  - 给 tool
  - 给 debug
  - 给详情查看

这样既能减少 prompt 噪音，也能保留完整信息能力。

#### 5. mutation batch 与撤回（Undo）能力（需要进入核心路线）

当前阶段不追求“任意时间点全局回滚”，但必须尽早补齐“单次 AI 操作整体撤回”的最小模型，否则后续 Act Mode 写操作越多，治理债越大。

最小目标：

- 单次 GUI 明确动作：默认形成一个 mutation batch
- 单次 assistant 回复导致的所有写操作：形成一个 mutation batch
- 撤回单位：按 batch 撤回，而不是要求用户逐条撤回

需要新增或补齐的能力方向：

- mutation batch record（batch id、actor、source、mutation entries、必要的 before/after 或 inverse payload）
- `list_recent_mutation_batches`
- `revert_mutation_batch`

以及在 operation 元数据里明确标注 `sideEffects`，用于驱动“是否需要 plan/approval”与“撤回粒度”。

### 4.5 异步任务策略

默认采用：

- `Fire-and-Report`

即：

- tool 提交任务
- 立即返回 `taskId`
- assistant 告知当前状态
- 后续通过 `get_task_status` 查询

只在确实非常快、非常稳定的任务上，再考虑少量 `await-with-timeout`。

原因：

- 最符合当前任务系统
- 最容易复用现有代码
- 不会把 tool 实现变得复杂

### 4.6 前端方案

前端目标是“尽量简单地保留当前视觉与交互成果”，不是保留所有现有抽象。

推荐顺序：

#### 方案 A：最简前端方案

- 使用 `@ai-sdk/react` 的 `useChat`
- 保留当前 sidebar 布局
- 保留当前卡片组件
- 自己维护一个很薄的 message renderer

这是更符合“轻量简洁优雅”的方案。

#### 方案 B：过渡方案

- 暂时保留 `assistant-ui`
- 但不再围绕它增加更多 runtime 封装
- 后续如果发现维护成本偏高，再平滑切到 `useChat`

无论选哪种方案，都继续保留：

- thread 持久化
- workflow status / approval / preview cards
- 新增的 phase / task / media cards

### 4.7 对现有抽象的处理原则

#### 直接计划移除或并回

- `policy-system`
- `command-center/approval.ts`
- `command-center/normalize.ts`
- 无意义的 project-context wrapper

#### 计划削薄

- `project-workflow-machine.ts`
- `workspace-assistant-events`
- `assistant-ui runtime` 依赖

#### 明确保留

- `project-agent` 单一 runtime
- 精简版 `command-center`
- `skills/project-workflow/*`
- `artifact-system` 中真正有业务价值的 invalidation 关系

原则是：

- 先修 compile
- 然后先删最容易删的抽象
- 再补 phase 和 act-mode
- 避免“先补新能力，再想怎么收拾旧层”的路径

### 4.8 推荐目录收敛方案

推荐最终向如下结构收敛：

- `src/lib/agent/runtime.ts`
- `src/lib/operations/*`
- `src/lib/operations/registry.ts`
- `src/lib/services/*`
- `src/lib/adapters/api/*`
- `src/lib/adapters/tools/*`
- `skills/preset/project-workflow/*`
- `skills/preset/dev-maintenance/*`
- `saved_skills` 存 DB

如果短期内不想大搬目录，至少应先在概念上收敛到这套关系，再逐步迁移文件。

### 4.9 明确不做的事情

当前阶段明确不做：

- 新开一套 `assistant-platform` 项目内 agent 架构
- 引入新的通用 agent orchestration 框架
- 用自由 DAG 取代现有固定 workflow package
- 设计过于复杂的 memory / policy / tool-router 中台
- 为每个 API route 单独生成 tool

### 4.10 新的实施阶段

#### Phase 0：恢复工程基线

- 修复 `.next/types` 残留影响
- 修复 Prisma schema cutover 带来的真实 TS 错误
- 至少让当前分支恢复到可稳定编译、核心测试可运行
- 同时删除最明显的薄抽象，例如 `policy-system`、`approval.ts`、`normalize.ts`
- 统计并确认哪些文件将被并回、删除、保留

#### Phase 1：补齐项目阶段与轻量上下文

- 新增 `resolveProjectPhase`
- 新增 `ProjectProjectionLite/Full`（或等价结构）并让 tool/prompt 以 projection 为权威状态输入
- 新增 `get_project_snapshot`（或等价 tool/operation），替代前端事件桥接作为“权威状态读取入口”
- 拆分 `assembleProjectContextLite / Full`
- 将阶段摘要注入 runtime system prompt
- 收缩 project context 相关中转层
- 设计并落地 `operation registry`
- 明确 `operation.sideEffects` 规范，并在 runtime 中落地“入口语义 + 风险等级”的分流规则（Act vs Plan）

#### Phase 2：补齐 Act Mode tools

- 增加第一批直接操作类 tools
- 统一其输入 schema、输出结构、side effect 信息
- 接入现有 task submitter / service
- 若 command-center 仍阻碍轻操作路径，则继续缩小其职责边界
- 让 api/tool 通过 operation 暴露能力，而不是各自维护独立业务定义
- 为 Act Mode 写操作接入 mutation batch 记录（至少在内部链路可追踪、可撤回）
- 补齐最小 undo 工具链路：`list_recent_mutation_batches` + `revert_mutation_batch`（先满足“撤回刚才那次修改”）

#### Phase 3：补齐前端富渲染

- 增加 act-mode cards
- 在 sidebar 中展示 phase / task / media 结果
- 评估是否移除 `assistant-ui runtime`，回到 `useChat`
- 视情况将前端 chat 层收敛到 `useChat + React Query + 薄 renderer`
- 增加 mutation batch 的 UI 呈现与 `revert` 入口（不要求完整历史，只要求单次撤回可用）

#### Phase 4：收敛交互体验

- 提升 `maxSteps`
- 优化 prompt
- 优化 workspace 与 assistant 状态同步
- 必要时将前端事件桥接逐步替换为更权威的服务端状态驱动

#### Phase 5：再做适度抽象收口

- 根据实际使用情况，决定哪些抽象要保留、哪些该内联
- 如果未来确实出现复杂 DAG / durable graph 需求，再评估 LangGraph，而不是继续扩张仓库内自实现

---

## 5. 基于已有计划调整后的实现进度记录表

以下进度表基于“新设计方案”重新整理。

| 编号 | 工作项 | 当前状态 | 进度判断 | 说明 |
| --- | --- | --- | --- | --- |
| P0 | 工程基线恢复与编译修复 | 已完成 | 高 | 已移除 `.next/types` 对全局基线的阻塞，补跑 `prisma generate` 和依赖安装后，全局 `tsc --noEmit` 通过 |
| P1 | 项目级 assistant 聊天入口 | 已完成 | 高 | `/api/projects/[projectId]/assistant/chat` 已落地 |
| P2 | Assistant 基础 runtime | 已完成 | 高 | 已有 AI SDK runtime，且现已改为从 operation registry 组装 tools |
| P3 | Workspace Assistant 常驻面板 | 已完成 | 中高 | 面板、消息、审批区、输入区均已存在 |
| P4 | 对话持久化 | 已完成 | 高 | `ProjectAssistantThread` 与对应 query hook 已实现 |
| P5 | Workflow Plan Mode | 已完成 | 中高 | 已有 create / approve / reject / list 命令链路 |
| P6 | 固定 workflow package 体系 | 已完成 | 中高 | `story-to-script` 与 `script-to-storyboard` 已 package 化 |
| P7 | 项目完整上下文查询 | 已完成 | 中高 | 已将 `project-context` 吸收原 `policy-system` 逻辑，现有 full context 继续可用 |
| P8 | 项目阶段推导 `resolveProjectPhase` | 部分完成 | 中 | 已实现最小 phase 解析与 `get_project_phase`，后续还需补失败项/stale artifacts/更细粒度阶段 |
| P9 | Act Mode 直接操作 tools | 部分完成 | 低 | 已接入 `generate_character_image` / `generate_location_image` / `regenerate_panel_image` / `voice_generate`（提交异步 task，需确认）；其他写操作仍未接入 |
| P10 | Task 查询桥接能力 | 已完成 | 中 | 已接入最小 `get_task_status` operation，复用现有 `queryTaskTargetStates()` |
| P11 | Prompt 升级与双模式选择规则 | 部分完成 | 中 | 已注入 `phase + progress + available actions` 摘要，并落地 `operation.sideEffects` + confirmed 二次确认卡片；Act/Plan 分流与更系统的规范仍需补完 |
| P12 | Lite / Full Context 拆分 | 未开始 | 低 | 当前已去掉无意义 wrapper，但仍未拆成明确 lite/full 两套上下文（建议升级为 projection lite/full） |
| P13 | Act Mode 富渲染组件 | 部分完成 | 低中 | 已新增 `project phase` + `confirmation request` + `task submitted` 卡片，其他 act-mode 结果卡仍未实现 |
| P14 | Workspace 与 Assistant 状态统一 | 部分完成 | 中 | 当前有前端事件桥接，但仍是过渡形态 |
| P15 | 抽象收口与精简 | 进行中 | 中 | `policy-system`、`approval.ts`、`normalize.ts` 已实质并回/降级为 shim，后续可继续物理移除 |
| P16 | operation registry 收敛 | 进行中 | 中 | 已建立 `src/lib/operations/*` 并让现有 assistant tools 通过 operation 暴露 |
| P17 | agent 代码量削减与目录收敛 | 进行中 | 中 | 已完成第一轮后端减法和运行时收敛，前端 runtime 收缩与 skill 目录重组仍在后续阶段 |
| P18 | Project Projection（snapshot/projection） | 部分完成 | 低 | 已实现 `ProjectProjectionLite` 与 `get_project_snapshot`，后续再补 full projection 与更明确的 snapshot schema |
| P19 | mutation batch 与撤回（undo） | 未开始 | 低 | 需要补齐 batch record、`list_recent_mutation_batches`、`revert_mutation_batch`，并接入 Act Mode 写操作 |
| P20 | sideEffects 驱动的审批分流 | 部分完成 | 低 | 已落地 `operation.sideEffects` 与 runtime confirmed gate；但尚未按入口语义与风险等级做完整 Act/Plan 分流 |

### 当前阶段判断

如果按新的优先级来看，当前状态可以概括为：

- `基础骨架：已完成`
- `Plan Mode：已完成 MVP`
- `Act Mode：仅完成查询型底座，写操作未开始`
- `系统状态建模：已起步，但仍是最小版本`
- `工程健康度：已恢复到全局 typecheck 通过`
- `代码层级：已做第一轮收缩，但仍有明显可删减空间`

### 下一阶段最优先事项

新的优先级建议固定为：

1. 修复编译基线
2. 继续删除和物理移除仍保留为 shim 的旧抽象
3. 补齐 `ProjectProjectionLite/Full` 与 `get_project_snapshot`（权威状态读取）
4. 统一 `operation.sideEffects` 并落地 Act/Plan 分流与审批语义
5. 扩展 `resolveProjectPhase` 到可用于真实流程引导的阶段模型
6. 实现第一批 Act Mode 写操作 tools，并接入 mutation batch
7. 再决定哪些抽象继续精简

### 2026-04-17 完成清单（本轮落地）

- [x] 梳理当前改动与边界：限制 `docs/` 只允许提交 `docs/agent_task.md`，避免无关内部文档进入版本库
- [x] 补齐 operation sideEffects 框架：新增 `operation.sideEffects` 元信息，并在 runtime 落地 confirmed 二次确认机制（输出 confirmation request 卡片）
- [x] 实现 Act Mode 资产生图闭环：`generate_character_image` / `generate_location_image` 接入现有 `submitAssetGenerateTask()`，并输出 task submitted 卡片（taskId/status/runId/deduped）
- [x] 实现 `regenerate_panel_image`：复用现有 `IMAGE_PANEL` 任务链路提交面板重生图任务（同样走 confirmed gate + task submitted 卡片）
- [x] 实现 `voice_generate`：复用现有 `VOICE_LINE` 任务链路提交配音任务；支持批量提交并新增 batch submitted 卡片
- [x] 前端新增 task 提交卡片：assistant 面板支持渲染 confirmation / task submitted 数据卡
- [x] 补齐 `get_project_snapshot`：新增 `ProjectProjectionLite` 作为轻量状态读取入口，并让 `resolveProjectPhase` 使用 projection 而非 full context
- [x] Prompt 注入增强：system prompt 增加 `progress` 与 `available actions` 摘要，便于模型做下一步建议与 Act/Plan 选择
- [x] 最小校验：`npm run typecheck` + `npm run test:unit:all` 均通过

这条路径的核心目标是：

- 不重做
- 不并行造第二套架构
- 优先把当前已有实现补成“真正可用的双模式 Agent”
- 同时持续减少 agent 相关代码体量与层级复杂度
