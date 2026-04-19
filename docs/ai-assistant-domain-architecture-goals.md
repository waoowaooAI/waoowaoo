# AI 助手主导系统设计目标

## 文档目的

本文档定义当前系统的长期架构目标与当前已经确认的设计方向。

它是未来重构、扩展、技能化、工具化、可撤回化的总纲，不是迁移补丁说明，也不是兼容策略文档。

本文件的作用只有一个：

- 为后续所有 AI 能力、工作流、工具、编辑功能提供统一目标真相源

系统当前目标已经不再是旧的 `novel-promotion` 模式扩展，而是：

- 以 `project-workflow` 为核心主系统
- 让 AI 可以操控整个系统
- 保持人工与 AI 在编辑能力上的对等
- 保持工作流可恢复、可审计、可撤回
- 避免 prompt 重新变成业务真相源

---

## 核心结论

系统未来方向不是“全系统都做成 skills”。

正确方向是：

- `Domain` 负责业务真相
- `Tool Use` 负责系统真实操作能力
- `Skills` 负责 assistant 的高层行为方法
- `Workflow` 负责固定长流程
- `Snapshot / Projection` 负责最新状态读取
- `Undo / Mutation Batch` 负责撤回与安全修改

也就是说：

- skill 不是最终业务内核
- workflow 不是最终写入真相
- UI 不是系统真相源
- prompt 不是业务规则载体
- tool 也不是业务真相源

系统真正的真相必须落在：

- deterministic domain capabilities
- typed mutation services
- validators
- repositories
- policy enforcement
- versioned state transitions
- mutation batch records

---

## 当前已经确认的关键事实

### 1. 系统分成两层，不要再混

当前必须明确区分两层：

#### A. Assistant / Tool-Use Plane

负责：

- 理解用户意图
- 决定调用哪个 tool / workflow
- 创建计划
- 进行审批
- 解释系统当前状态
- 在 Assistant 面板展示系统事件、计划和结果

#### B. Analysis Execution Plane

负责：

- 在固定 workflow 下执行固定 step
- 为每个 step 组装输入
- 调用模型
- 解析输出
- 写 artifact
- 调用 domain mutation 落库

这一层不是 agent 自由规划。
它是固定 workflow 驱动下的多次 step 级执行。

### 2. GUI 与 assistant 只是两个入口

两者不应拥有两套底层实现。

正确模型是：

- GUI 点击：直接指定某个 workflow 或 tool
- assistant 对话：理解意图后指定某个 workflow 或 tool

它们后面应当共用：

- command
- workflow runtime
- tool runtime
- domain mutation layer

### 3. 固定分析流程不是 assistant 自由 skill 链

像下面这些固定分析链路：

- `story-to-script`
- `script-to-storyboard`

本质上应被视为：

- fixed workflow packages

不是：

- assistant 动态技能规划链

### 4. Analysis 执行层运行时不再注入 `SKILL.md` 正文

当前已经确认的设计是：

- `SKILL.md` 继续保留给文档、元数据、UI、registry、assistant 层理解能力边界
- 但 analysis 执行层在每次 step 调模型时，只发送模板文件与结构化输入

也就是说，执行层的 prompt 只由：

- `template.zh.txt` / `template.en.txt`
- replacements

组成。

`SKILL.md` 正文不再是 analysis 执行层运行时 prompt 的一部分。

---

## 不可妥协的原则

### 1. AI 能改动一切人工能改动的内容

任何用户可以通过按钮、表单、弹窗、编辑器、批处理入口改动的内容，最终都必须能通过 AI 完成。

至少应覆盖：

- 项目配置
- 剧集配置
- 故事内容
- 角色
- 场景
- 道具
- 分析结果
- 剧本片段
- 分镜文本
- 分镜 panel
- panel 顺序
- panel prompt
- panel variant
- 图片或视频重生成请求
- 台词生成或重生成

长期看，不能存在“只能点 UI 改、不能通过 AI 改”的能力孤岛。

### 2. AI 必须知道项目当前最新状态

assistant 必须能读取项目当前最新相关状态。

这不等于每轮都塞整个项目上下文。

正确方式是提供统一的 snapshot / projection service，支持：

- 最新 artifacts
- 最新 editable entities
- 最新 run 状态
- 未处理审批
- 当前 selection/scope
- 当前 workflow 输出
- 当前 config / policy

### 3. 显式失败，零隐式兜底

系统禁止：

- 静默跳过步骤
- 静默模型降级
- 用默认值掩盖缺失状态
- 静默吞掉 mutation 冲突
- 静默忽略事件投递失败

### 4. 业务真相必须是确定性的

所有写操作最终都必须落到 deterministic domain mutation 上，并具备：

- typed inputs
- validation
- policy enforcement
- version checks
- idempotency
- audit trail

### 5. Tool Use 是系统手脚，不是业务真相源

tools 应负责：

- 读取状态
- 执行明确系统动作
- 调用 domain mutation services
- 返回结构化结果给 assistant 或 workflow

tools 不应负责：

- 隐藏业务规则
- 自行定义数据库写入语义
- 绕开 domain 层直接成为写入真相

### 6. Skills 是 assistant-facing 方法层，不是底层编辑动作本体

skills 应负责：

- 告诉 assistant 如何思考和行动
- 如何组合多个 tools
- 如何理解复杂任务
- 如何解释结果给用户

skills 不应承担：

- 最终业务 mutation 语义
- 直接替代 domain
- 替代固定 workflow 编排

### 7. UI 只是视图，不是真相源

Assistant UI、timeline、tool cards、thread 都只是表现层。

它们不是：

- mutation 真相源
- 审批权威
- durable workflow engine

---

## 目标架构

## 1. Domain Capability Plane

这是业务真相源。

职责：

- typed mutation APIs
- validators
- repositories
- versioning
- idempotency
- concurrency control
- authoritative business rules
- mutation batch recording

示例：

- `createCharacter`
- `updateCharacter`
- `createLocation`
- `updateLocation`
- `insertStoryboardPanel`
- `updateStoryboardPanel`
- `reorderStoryboardPanels`
- `updatePanelPrompt`
- `createPanelVariants`
- `updateProjectConfig`
- `updateEpisodeConfig`

skills、tools、workflows 都不能替代这一层。

## 2. Tool Use Plane

这是 AI 操控系统的真实能力入口。

任何明确的系统操作都应该优先做成 tool。

例如：

- `get_project_snapshot`
- `list_episode_clips`
- `create_character`
- `update_character`
- `create_location`
- `update_location`
- `insert_storyboard_panel`
- `update_storyboard_panel`
- `reorder_storyboard_panels`
- `update_panel_prompt`
- `panel_variant`
- `run_story_to_script`
- `run_script_to_storyboard`
- `retry_workflow_step`
- `list_recent_mutation_batches`
- `revert_mutation_batch`

tool 的职责是：

- 接受结构化输入
- 调用 domain mutation 或 workflow runtime
- 返回结构化结果

tool 不应把业务真相写进 prompt。

## 3. Skills Plane

skills 是 assistant-facing 的能力包装层。

每个 skill 可以包含：

- `SKILL.md`
- supporting prompt templates
- context shaping logic
- schema
- render metadata
- tool selection / usage instructions

skill 应回答的问题是：

- assistant 在什么场景该如何行动
- 该调用哪些 tools
- 该如何组合这些 tools
- 结果应该如何解释

### 特别说明

analysis 执行层里的 step module 目录目前仍然沿用 skill 目录结构，但它们不应再被理解为“assistant 自由调用的 skills”。

对固定长流程而言，这些目录更准确的角色是：

- workflow step modules

## 4. Workflow / Run Plane

固定长流程应继续由 workflow package 驱动。

例如：

- `story-to-script`
- `script-to-storyboard`

workflow package 负责：

- ordered steps
- dependencies
- map / join fan-out
- approval boundaries
- retry boundaries
- durable run lifecycle

workflow package 不应：

- 成为业务真相源
- 自己定义最终 mutation 语义
- 被 assistant 当成自由规划脚本

## 5. Snapshot / Projection Plane

职责：

- 组装项目最新状态
- 暴露 editable entities
- 暴露 workflow outputs
- 暴露 active runs
- 暴露 unresolved approvals
- 提供按 scope 的加载视图

这一层用于满足：

- AI 必须知道当前最新相关状态

## 6. Event / UI Plane

职责：

- 渲染 assistant thread
- 渲染 system/workflow 状态
- 渲染 tool cards
- 渲染审批
- 渲染运行进度

原则：

- UI 渲染 canonical state
- system/workflow 消息与 assistant 对话语义要区分
- GUI 触发的 workflow 允许展示在 Assistant 面板里，但语义必须明确是 system/workflow event

---

## 固定长流程应该是什么

固定长流程不是 assistant 自由思考链。

它们本质上是：

- fixed workflow packages

例如 `script-to-storyboard` 当前本质上是：

- workflow 决定 phase 顺序
- 每个 phase 由固定 step module 执行
- step module 读取模板
- step module 调模型
- step module parse 输出
- workflow 最终汇总并落库

所以：

- 不是 assistant 自己规划五步顺序
- 不是一次性把整个流程丢给 AI 做完
- 而是系统驱动固定流程，AI 只负责 step 内部生成

---

## 哪些东西应该 tool 化

未来所有真实系统操作，优先 tool 化，而不是 skill 化。

尤其是：

- 新建角色
- 修改角色
- 新建场景
- 修改场景
- 新建道具
- 修改道具
- 新增分镜
- 删除分镜
- 修改分镜
- 修改分镜文本
- 修改 panel prompt
- 调整分镜顺序
- 生成镜头变体
- 触发局部重生成
- 查询当前项目状态

这些都属于：

- deterministic system actions

应做成 tools，而不是让 assistant 直接输出数据库 JSON。

---

## 镜头变体等复杂功能应如何建模

以 `panel_variant` 为例：

用户可能说：

- “给第 18 个镜头增加一个顶视角俯视图”
- “给第 18 个镜头增加三个视角：顶视角、俯视角、侧视角”

正确做法不是让 assistant 直接输出最终数据库 JSON。

正确做法是：

1. assistant 理解意图
2. assistant 调用 `panel_variant` tool
3. tool 读取当前 panel 状态
4. tool 内部决定是否需要再调一次模型生成 variant proposal
5. tool 对结果做校验和归一化
6. tool 调用 domain mutation 写入系统

也就是说：

- assistant 负责理解和选择 tool
- tool 负责执行
- domain 负责最终真相

---

## 批量撤回与单次 AI 操作撤回

当前阶段不要求复杂的“大版本回滚”模型。

当前优先目标是：

- 单个操作可撤回
- 一次 AI 回复中包含的多次写操作可整体撤回

### 目标模型

每次 assistant 实际执行写操作时，都形成一个：

- `mutation batch`

这个 batch 可以包含多条 mutation entry。

例如：

- 用户让 AI 一次性新建 10 个分镜
- assistant 在一次回复前后实际完成了 10 次插入操作

那么这 10 次操作应被视为：

- 同一个 `mutation batch`

用户后续说：

- “撤回刚才那次修改”

系统应直接撤回这个 batch，而不是要求用户逐条撤回。

### 当前阶段的撤回原则

1. 单次 GUI 明确动作：
- 默认形成一个 mutation batch

2. 单次 assistant 回复导致的所有写操作：
- 形成一个 mutation batch

3. 撤回单位：
- 默认按 batch 撤回

4. domain 必须记录：
- batch id
- actor
- source
- mutation entries
- inverse payload 或足够恢复的 before/after 信息

### 不做的事情

当前阶段先不要求：

- 完整历史分支管理
- 多层 revision checkout
- 任意时间点全局回滚

当前优先目标是：

- 小撤回
- 单次 AI 操作整体撤回

---

## 审批策略

审批必须按入口语义区分。

### GUI 明确点击

默认规则：

- 直接执行
- 不走 assistant 审批模型

原因：

- 按钮点击本身就是明确确认

### assistant 对话发起

默认规则：

- 读操作：不审批
- 低风险小编辑：可直接执行或轻确认
- 高影响批量修改 / 长流程重生成 / 覆盖结果：走计划与审批

---

## 目录与命名方向

仓库目标结构应收敛到下面这种心智：

```text
src/lib/
  command-center/
  context/
  domain/
  run-runtime/
  project-workflow/
  skill-system/
  project-agent/

src/features/
  project-workspace/

skills/
  project-workflow/
    <assistant-facing skills or step modules>
    workflows/
```

指导原则：

- `src/lib/domain/**` 负责业务真相
- `src/lib/context/**` 提供 projections
- `src/lib/run-runtime/**` 负责 durable execution lifecycle
- `src/lib/project-agent/**` 处理 assistant-facing orchestration
- `skills/project-workflow/**` 继续承接 assistant skills 与 step modules 的包装层

---

## 当前最重要的未来任务

下一阶段应按下面顺序推进：

1. 把更多人工可编辑能力全面 tool 化
2. 为 assistant 建立更清晰的 skill 层，用于组合这些 tools
3. 继续保留固定 workflow，不让关键生产链滑回 agent 自由规划
4. 把所有 AI 写操作纳入 mutation batch 记录
5. 建立 `revert_mutation_batch` 能力
6. 让 assistant 能查询最近的 mutation batches
7. 让 assistant 能安全撤回自己刚刚做过的一次批量修改

---

## 成功标准

只有当以下条件都成立时，才说明架构真正健康：

- 每个人工可编辑动作都有 deterministic tool
- 每个 AI 可编辑动作都复用同一个 domain mutation layer
- skills 是 assistant 方法层，不是业务真相
- fixed workflows 是 durable 且 replay-safe
- assistant 能通过 projections 拿到最新状态
- analysis 执行层只运行固定 step，不再伪装成 agent skill planner
- GUI 与 assistant 入口共用同一底层执行链
- 每次 AI 写操作都能形成 mutation batch
- 用户可以撤回单次 AI 回复造成的整批修改

---

## 最终结论

正确的长期架构应是：

- domain-centric
- tool-driven
- skill-adapted
- workflow-orchestrated
- projection-backed
- undo-capable
- UI-rendered

系统绝不能演化成：

- prompt-centric
- workflow-centric
- UI-centric
- “所有东西都叫 skill”的混乱结构

因此，当前最先要锁死的设计决策不是“skill 目录长什么样”，而是：

1. `哪些能力必须是 tools`
2. `哪些能力只是 assistant skills`
3. `哪些能力必须继续是 fixed workflows`
4. `mutation batch undo 如何落地`
