# waoowaoo Master Plan: Project Workspace Infinite Canvas Migration

> 状态机文档：本文件是 `waoowaoo` 项目从固定阶段式 UI 迁移到 `@xyflow/react` 规则化无限画布的唯一工程规划上下文。任何新接手模型必须先阅读本文件，再进行代码修改。每次代码修改完成后，必须同步更新本文档的任务状态、实际改动文件、验证结果与新增风险。

## 1. 🎯 项目全局目标与上下文 (Project Context & Objectives)

### 业务背景 (Why)

当前项目工作区以固定 stage/page UI 承载创作流程：故事输入、剧本、分镜图片、视频、成片编辑分别分散在不同视图中。分镜区域当前本质是顺序 grid/list：`StoryboardCanvas` 按 `sortedStoryboards` 顺序渲染分镜组，`StoryboardPanelList` 按 `panelIndex` 排序并用 CSS grid 展示 panel。该模式在节点数量增加、图片/视频/配音/成片关系变复杂后，会出现以下问题：

- 用户难以在同一空间理解从故事到成片的完整依赖链路。
- 图片、视频、任务状态、错误、重试入口分散，跨阶段定位成本高。
- 固定 grid 只能表达顺序，不能表达“生成关系、引用关系、视频依赖、成片组合”等图结构。
- 后续若加入更多 AI 节点、分支、版本、批注、资产引用，继续在固定 UI 上叠功能会导致低内聚、高耦合、难维护。

本迁移目标不是自由白板，而是 **规则化无限画布**：默认仍按系统规则排布，一排固定数量或按流程列/泳道自动排布；用户可以平移、缩放、拖动节点进行空间调整；拖动位置不改变业务顺序。

### 最终目标 (What)

将当前 Project Workspace 从固定 stage UI 逐步迁移为基于 `@xyflow/react` 的规则化无限画布工作台：

修改前：

- UI 由 story/script/storyboard/video/editor 等 stage 分散承载。
- 分镜图片通过 CSS grid/list 展示。
- 视频卡片独立于分镜图片区。
- UI 排布直接受页面结构限制。
- 用户无法在同一空间观察全链路关系。

修改后：

- Project Workspace 提供一个统一 Canvas View。
- 故事、剧本 clip、分镜 panel、图片状态、视频节点、成片 timeline 以 nodes/edges 投影到画布。
- 默认布局由确定性规则生成，用户拖动只保存 layout override。
- 业务顺序、生成关系、画布位置三者彻底分离。
- 旧业务数据、任务、worker、媒体归一化、route 语义保持为系统主数据，不被 React Flow 接管。
- 所有节点按钮、旧入口、assistant 操作最终收敛到统一 command/operation 出口。

核心原则：

```text
Domain Data + Workflow Runtime
        ↓
Canvas Projection
        ↓
@xyflow/react nodes / edges
        ↓
Canvas UI interaction
        ↓
Command Layer
        ↓
route / task / worker / DB
```

禁止方向：

```text
React Flow nodes 作为业务事实源
React Flow node.data 保存完整业务对象副本
拖动节点直接改变 panelIndex/panelNumber
节点组件绕过统一 command 直接写业务状态或 DB
```

### 影响范围 (Scope)

预计新增主模块：

- `src/features/project-canvas/**`
- `src/lib/project-canvas/**`
- `src/app/api/projects/[projectId]/canvas-layout/**` 或等价 route
- `tests/unit/project-canvas/**`
- `tests/integration/api/contract/project-canvas-layout.route.test.ts`
- `tests/regression/canvas-layout-*.test.ts`

预计改动现有模块：

- `src/features/project-workspace/ProjectWorkspace.tsx`
- `src/features/project-workspace/components/WorkspaceStageContent.tsx`
- `src/features/project-workspace/components/storyboard/**`
- `src/features/project-workspace/components/video/**`
- `src/features/project-workspace/WorkspaceStageRuntimeContext.tsx`
- `src/lib/command-center/**` 或现有 operation/adapter 层
- `src/lib/query/hooks/**`
- `src/types/project.ts`
- `prisma/schema.prisma`
- `tests/contracts/route-catalog.ts`
- `tests/contracts/requirements-matrix.ts`

预估规模：

- 新增文件：35-55 个。
- 修改文件：25-45 个。
- 新增/修改代码：约 3,000-6,500 行。
- 测试新增/修改：约 1,500-3,000 行。

### 技术栈与依赖 (Tech Stack)

当前系统：

- Next.js 15 App Router。
- React 19。
- TypeScript。
- Prisma 6。
- MySQL。
- TanStack Query。
- next-intl。
- Tailwind / 项目内 glass UI primitives。
- BullMQ worker/task runtime。
- Remotion video editor。
- Vitest。

新增画布依赖：

- 使用 `@xyflow/react`，也就是 React Flow v12+ 的新包名。
- 禁止使用旧包名 `reactflow`。
- React Flow 产品名仍然有效；`@xyflow/react` 是当前 npm 包名。

依赖选择结论：

- 主画布使用 `@xyflow/react`。
- 暂不使用 tldraw 作为主画布。
- tldraw 仅作为未来“自由批注/白板层”的候选，不进入当前主迁移路径。

## 2. 📂 核心文件目录树 (Directory Structure)

当前高度相关目录：

```text
waoowaoo/
  prisma/
    schema.prisma
  src/
    app/
      api/
        projects/
          [projectId]/
            panel/
            panel-variant/
            storyboards/
            storyboard-group/
            video/
            lip-sync/
    features/
      project-workspace/
        ProjectWorkspace.tsx
        WorkspaceProvider.tsx
        WorkspaceStageRuntimeContext.tsx
        components/
          WorkspaceStageContent.tsx
          StoryboardStage.tsx
          VideoStage.tsx
          storyboard/
            StoryboardCanvas.tsx
            StoryboardGroup.tsx
            StoryboardPanelList.tsx
            PanelCard.tsx
            hooks/
              useStoryboardState.ts
              useStoryboardStageController.ts
              storyboard-state-utils.ts
              usePanelOperations.ts
              useImageGeneration.ts
              usePanelVariant.ts
          video/
            VideoPanelCard.tsx
            panel-card/
        hooks/
          useProjectWorkspaceController.ts
          useWorkspaceStageRuntime.ts
    lib/
      project-workflow/
        stages/
          video-stage-runtime/
            useVideoPanelsProjection.ts
            useVideoPanelViewport.ts
      command-center/
      query/
      run-runtime/
      workers/
    types/
      project.ts
  tests/
    unit/
    integration/
    regression/
    system/
    contracts/
```

目标新增目录：

```text
src/
  features/
    project-canvas/
      ProjectCanvas.tsx
      ProjectCanvasRoute.tsx
      components/
        CanvasToolbar.tsx
        CanvasInspector.tsx
        CanvasMinimap.tsx
        CanvasEmptyState.tsx
      nodes/
        StoryNode.tsx
        ScriptClipNode.tsx
        StoryboardGroupNode.tsx
        PanelImageNode.tsx
        VideoPanelNode.tsx
        TimelineNode.tsx
        nodeTypes.ts
      edges/
        SequenceEdge.tsx
        DependencyEdge.tsx
        edgeTypes.ts
      hooks/
        useProjectCanvasRuntime.ts
        useCanvasSelection.ts
        useCanvasNodeActions.ts
        useCanvasViewportPersistence.ts
  lib/
    project-canvas/
      graph/
        build-project-canvas-graph.ts
        canvas-graph.types.ts
        canvas-node-key.ts
      layout/
        rule-grid-layout-engine.ts
        resolve-canvas-layout.ts
        canvas-layout.types.ts
        layout-engine.types.ts
        canvas-layout-contract.ts
        canvas-layout-service.ts
  app/
    api/
      projects/
        [projectId]/
          canvas-layout/
            route.ts
tests/
  unit/
    project-canvas/
      build-project-canvas-graph.test.ts
      auto-layout.test.ts
      resolve-canvas-layout.test.ts
      canvas-node-key.test.ts
  integration/
    api/
      contract/
        project-canvas-layout.route.test.ts
  regression/
    canvas-layout-preserves-business-order.test.ts
```

## 3. 🚀 阶段划分与原子任务分配 (Phases & Atomic Tasks)

### 阶段 0: 架构基线与依赖决策

- ✅ **Task 0.1**: `waoowaoo_Master_Plan.md` - 创建主规划文档，明确迁移目标、架构边界、任务拆分、测试策略和工程约束。
- ✅ **Task 0.2**: `package.json` - 新增 `@xyflow/react` 依赖声明；必须使用当前包名 `@xyflow/react`，禁止引入旧包名 `reactflow`。注意：受仓库命令限制，本次未运行 `npm install` 更新 `package-lock.json`，后续允许执行安装命令时必须同步 lockfile。
- ✅ **Task 0.3**: `src/features/project-canvas/**` - 创建画布模块根目录，禁止把画布代码塞进 `project-workspace/components/storyboard` 或 `video` 子目录。完成结果：画布成为独立 feature，不污染旧 stage 实现。
- ✅ **Task 0.4**: `src/features/project-workspace/components/WorkspaceStageContent.tsx` - 增加 Canvas View 入口，但不删除旧 stage。完成结果：用户可以在原 stage 和新 canvas 之间切换，第一阶段不破坏现有功能。

### 阶段 1: Canvas Graph 类型系统与节点 key 规范

- ✅ **Task 1.1**: `src/lib/project-canvas/graph/canvas-graph.types.ts` - 定义核心类型：

```ts
export type ProjectCanvasNodeType =
  | 'story'
  | 'scriptClip'
  | 'storyboardGroup'
  | 'panelImage'
  | 'videoPanel'
  | 'timeline'

export type ProjectCanvasEdgeType =
  | 'sequence'
  | 'dependsOn'
  | 'generates'
  | 'references'
  | 'voiceBinding'
  | 'timelinePlacement'

export interface ProjectCanvasNodeData {
  readonly nodeKey: string
  readonly nodeType: ProjectCanvasNodeType
  readonly targetId: string
  readonly targetType: string
  readonly title: string
  readonly status: 'idle' | 'queued' | 'processing' | 'failed' | 'ready'
}

export interface ProjectCanvasGraph {
  readonly nodes: ProjectCanvasNode[]
  readonly edges: ProjectCanvasEdge[]
}
```

完成结果：画布 graph 有明确类型，不使用任何 `any`。

- ✅ **Task 1.2**: `src/lib/project-canvas/graph/canvas-node-key.ts` - 实现稳定 node key 生成函数：

```ts
export function createStoryNodeKey(projectId: string): string
export function createScriptClipNodeKey(clipId: string): string
export function createStoryboardGroupNodeKey(storyboardId: string): string
export function createPanelImageNodeKey(panelId: string): string
export function createVideoPanelNodeKey(panelId: string): string
export function createTimelineNodeKey(episodeId: string): string
```

完成结果：所有节点刷新后 key 稳定，layout 能可靠匹配。

- ✅ **Task 1.3**: `tests/unit/project-canvas/canvas-node-key.test.ts` - 覆盖所有 node key 生成函数，断言具体字符串值。预期结果：防止后续改动破坏 layout 匹配。

### 阶段 2: 确定性自动布局引擎

- ✅ **Task 2.1**: `src/lib/project-canvas/layout/canvas-layout.types.ts` - 定义 layout 类型：

```ts
export interface CanvasNodeLayout {
  readonly nodeKey: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
  readonly locked: boolean
  readonly collapsed: boolean
}

export interface CanvasViewportLayout {
  readonly x: number
  readonly y: number
  readonly zoom: number
}
```

完成结果：layout 只表达画布位置和 UI 状态，不包含业务字段。

- ✅ **Task 2.2**: `src/lib/project-canvas/layout/rule-grid-layout-engine.ts` - 实现规则化自动布局，并新增 `src/lib/project-canvas/layout/layout-engine.types.ts` 预留 `rule-grid | elk` 引擎接口：

```ts
export interface AutoLayoutOptions {
  readonly columnsPerRow: number
  readonly nodeWidth: number
  readonly nodeHeight: number
  readonly columnGap: number
  readonly rowGap: number
  readonly laneGap: number
}

export function buildRuleGridCanvasLayout(
  graph: ProjectCanvasGraph,
  options: AutoLayoutOptions,
): Map<string, CanvasNodeLayout>
```

布局规则：

- `StoryNode` 放在最左侧 lane。
- `ScriptClipNode` 按 clip 顺序排列。
- `StoryboardGroupNode` 放在对应 clip 下游。
- `PanelImageNode` 在 group 内按 `panelIndex` 规则排布，一排 `columnsPerRow` 个。
- `VideoPanelNode` 放在对应 `PanelImageNode` 下游或下一 lane。
- `TimelineNode` 放在最右侧或底部固定 lane。

完成结果：没有用户 override 时，画布每次生成位置完全一致；第一版使用自研 `rule-grid`，不引入 ELK/Dagre。

- ✅ **Task 2.3**: `src/lib/project-canvas/layout/resolve-canvas-layout.ts` - 实现自动布局 + 用户 override 合并：

```ts
export function resolveCanvasNodeLayouts(params: {
  readonly autoLayouts: Map<string, CanvasNodeLayout>
  readonly savedLayouts: readonly CanvasNodeLayout[]
}): Map<string, CanvasNodeLayout>
```

规则：

- 有 saved layout 的 node 使用 saved x/y/width/height/zIndex。
- 没有 saved layout 的 node 使用 auto layout。
- saved layout 指向已不存在 node 时不得渲染，不得自动创建假节点。

完成结果：新增节点自动排布，旧节点保持用户拖动位置。

- ✅ **Task 2.4**: `tests/unit/project-canvas/auto-layout.test.ts` - 测试固定输入下位置确定、同一行列规则正确、显式失败。断言具体 x/y。
- ✅ **Task 2.5**: `tests/unit/project-canvas/resolve-canvas-layout.test.ts` - 测试 saved override 优先、缺失节点回退自动布局、孤儿 saved layout 被忽略。

### 阶段 3: 只读 Canvas Graph Builder

- ✅ **Task 3.1**: `src/lib/project-canvas/graph/build-project-canvas-graph.ts` - 新增只读投影函数：

```ts
export interface BuildProjectCanvasGraphInput {
  readonly projectId: string
  readonly episodeId: string
  readonly storyText: string | null
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
}

export function buildProjectCanvasGraph(input: BuildProjectCanvasGraphInput): ProjectCanvasGraph
```

投影规则：

- 每个 project 生成一个 `story` node。
- 每个 clip 生成一个 `scriptClip` node。
- 每个 storyboard 生成一个 `storyboardGroup` node。
- 每个 panel 生成一个 `panelImage` node。
- 每个 panel 若存在视频相关字段或视频阶段开启，生成一个 `videoPanel` node。
- 每个 episode 生成一个 `timeline` node。

边规则：

- `story -> scriptClip` 使用 `generates`。
- `scriptClip -> storyboardGroup` 使用 `generates`。
- `storyboardGroup -> panelImage` 使用 `contains` 不作为 edge type；若需要可用 `dependsOn`，但第一版建议只渲染 sequence edge。
- panel 之间按 `panelIndex` 生成 `sequence` edge。
- `panelImage -> videoPanel` 使用 `generates` 或 `dependsOn`，第一版统一用 `dependsOn`。
- 所有 videoPanel 汇入 `timeline` 使用 `timelinePlacement`。

完成结果：业务数据被稳定投影为画布 view model，不发生 DB 或 query 写入。

- ✅ **Task 3.2**: `tests/unit/project-canvas/build-project-canvas-graph.test.ts` - 构造 project/clips/storyboards/panels fixture，断言节点 key、edge source/target、panel 顺序。
- ✅ **Task 3.3**: `src/features/project-canvas/hooks/useProjectCanvasRuntime.ts` - 从现有 workspace controller 接收 project/episode 数据，调用 `buildProjectCanvasGraph`、`buildRuleGridCanvasLayout` 和 `resolveCanvasNodeLayouts`，输出 React Flow nodes/edges。完成结果：hook 内不调用业务 mutation，React Flow 只接收轻量 node view model。

### 阶段 4: React Flow 只读画布壳

- ✅ **Task 4.1**: `src/features/project-canvas/ProjectCanvas.tsx` - 创建主画布组件，使用 `@xyflow/react`：

```tsx
export interface ProjectCanvasProps {
  readonly projectId: string
  readonly episodeId: string
}
```

必须包含：

- `<ReactFlow />`
- `<Background />`
- `<Controls />`
- `<MiniMap />`
- nodeTypes / edgeTypes 注册
- 只读模式下禁用业务 mutation

完成结果：能显示只读 nodes/edges，可 pan/zoom。

- ✅ **Task 4.2**: `src/features/project-canvas/nodes/StoryNode.tsx` - 渲染故事摘要节点。节点只展示标题、状态和简要文本，不提供编辑。
- ✅ **Task 4.3**: `src/features/project-canvas/nodes/ScriptClipNode.tsx` - 渲染剧本 clip 节点。展示 clip 顺序、summary、location、characters。
- ✅ **Task 4.4**: `src/features/project-canvas/nodes/StoryboardGroupNode.tsx` - 渲染分镜组节点。展示 clip 标题、panel 数量、任务状态。
- ✅ **Task 4.5**: `src/features/project-canvas/nodes/PanelImageNode.tsx` - 第一版只渲染压缩版 panel 卡片，不复用完整 `PanelCard`。展示编号、图片、shot type、状态。
- ✅ **Task 4.6**: `src/features/project-canvas/nodes/VideoPanelNode.tsx` - 第一版只渲染视频缩略状态、生成状态、错误信息。
- ✅ **Task 4.7**: `src/features/project-canvas/nodes/TimelineNode.tsx` - 展示成片入口和已有 timeline 状态，不执行导出。
- ✅ **Task 4.8**: `src/features/project-canvas/edges/SequenceEdge.tsx` - 实现顺序边视觉。
- ✅ **Task 4.9**: `src/features/project-canvas/edges/DependencyEdge.tsx` - 实现依赖边视觉。
- ✅ **Task 4.10**: `src/features/project-workspace/components/WorkspaceStageContent.tsx` - 增加 canvas stage 分支，接入 `ProjectCanvas`。禁止删除旧 stage。完成结果：用户可打开新画布验证视觉密度。

### 阶段 5: Layout 持久化数据模型与 API

- ✅ **Task 5.1**: `prisma/schema.prisma` - 新增 layout 模型，并通过 `npx prisma generate` 验证 Prisma Client 类型生成：

```prisma
model ProjectCanvasLayout {
  id            String   @id @default(uuid())
  projectId     String
  episodeId     String
  schemaVersion Int      @default(1)
  viewportX     Float    @default(0)
  viewportY     Float    @default(0)
  zoom          Float    @default(1)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @default(now()) @updatedAt
  nodeLayouts   ProjectCanvasNodeLayout[]

  @@unique([projectId, episodeId])
  @@index([projectId])
  @@index([episodeId])
  @@map("project_canvas_layouts")
}

model ProjectCanvasNodeLayout {
  id          String   @id @default(uuid())
  layoutId    String
  nodeKey     String
  nodeType    String
  targetType  String
  targetId    String
  x           Float
  y           Float
  width       Float
  height      Float
  zIndex      Int      @default(0)
  locked      Boolean  @default(false)
  collapsed   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt
  layout      ProjectCanvasLayout @relation(fields: [layoutId], references: [id], onDelete: Cascade)

  @@unique([layoutId, nodeKey])
  @@index([layoutId])
  @@index([targetType, targetId])
  @@map("project_canvas_node_layouts")
}
```

完成结果：layout 独立于业务表，panel/clip/storyboard 表不增加 x/y 字段；`ProjectEpisode` 通过一对一关系关联当前 episode 的 layout，`Project` 保留 layouts 集合关系。

- ✅ **Task 5.2**: `prisma/migrations/20260501153000_add_project_canvas_layouts/migration.sql` - 新增结构迁移文件，创建 `project_canvas_layouts` 与 `project_canvas_node_layouts` 两张表。完成结果：这是前向 schema 变更，不删除旧业务表和旧业务字段。

- ✅ **Task 5.3**: `src/lib/project-canvas/layout/canvas-layout-contract.ts` - 新增 zod contract，集中定义 GET/PATCH route 与前端保存 payload 的字段语义：

```ts
export const CANVAS_LAYOUT_SCHEMA_VERSION = 1
export const canvasViewportLayoutSchema = z.object(...)
export const canvasNodeLayoutInputSchema = z.object(...)
export const upsertCanvasLayoutInputSchema = z.object(...)
```

完成结果：payload、route、service、前端 hook 共用同一份类型，避免前端允许、服务端拒绝的双轨语义。

- ✅ **Task 5.4**: `src/lib/project-canvas/layout/canvas-layout-service.ts` - 新增读取与保存服务：

```ts
export async function getProjectCanvasLayout(params: {
  readonly projectId: string
  readonly episodeId: string
}): Promise<ProjectCanvasLayoutSnapshot | null>

export async function upsertProjectCanvasLayout(params: {
  readonly projectId: string
  readonly input: UpsertCanvasLayoutInput
}): Promise<ProjectCanvasLayoutSnapshot>
```

完成结果：服务层包含 episode/project 归属校验和事务；保存时替换当前 layout 的 nodeLayouts，显式失败，不做静默兜底。

- ✅ **Task 5.5**: `src/app/api/projects/[projectId]/canvas-layout/route.ts` - 新增 GET/PATCH route，复用 `apiHandler` 与 `requireProjectAuthLight`。完成结果：route 只负责鉴权、参数校验、调用 service 和返回响应，复杂业务下沉到 `src/lib/project-canvas/**`。
- ✅ **Task 5.6**: `tests/integration/api/contract/project-canvas-layout.route.test.ts` - 覆盖 GET、PATCH、非法 payload、鉴权错误。完成结果：新增 route 有契约测试，断言具体入参和返回值。
- ✅ **Task 5.7**: `tests/contracts/route-catalog.ts` - 加入 `/api/projects/[projectId]/canvas-layout` GET/PATCH route。完成结果：route catalog 与实际 API 同步。

### 阶段 6: 拖拽保存与 viewport 保存

- ✅ **Task 6.1**: `src/features/project-canvas/hooks/useCanvasLayoutPersistence.ts` - 实现 layout GET/PATCH hook，使用 TanStack Query、`apiFetch`、`checkApiResponse` 和 `queryKeys.project.canvasLayout(projectId, episodeId)`。完成结果：画布持久化入口集中，不散落在节点组件里。
- ✅ **Task 6.2**: `src/features/project-canvas/ProjectCanvas.tsx` - 接入 React Flow controlled nodes、`applyNodeChanges`、拖拽保存和 viewport 保存。完成结果：保存 payload 只包含 viewport 与 node layout，不触碰业务字段。
- ✅ **Task 6.3**: `src/features/project-canvas/hooks/useProjectCanvasRuntime.ts` - 接收 `savedNodeLayouts` 并合并到自动布局。完成结果：拖动 panel 后刷新位置可恢复，但 `panelIndex/panelNumber` 不变。
- ⏸ **Task 6.4**: `tests/regression/canvas-layout-preserves-business-order.test.ts` - 保存某 panel 的 x/y 后，重新读取业务 panels，断言 `panelIndex`、`panelNumber`、`storyboardId` 未变化。

### 阶段 7: 分镜图片区迁移为画布节点

- ⏸ **Task 7.1**: `src/features/project-canvas/nodes/PanelImageNode.tsx` - 从压缩版节点升级为复用现有分镜能力。不得直接复制 `PanelCard` 大量逻辑；应通过 adapter props 传入已存在的 panel actions。
- ⏸ **Task 7.2**: `src/features/project-canvas/hooks/useCanvasNodeActions.ts` - 将画布节点动作映射到现有分镜操作：

```ts
export interface CanvasPanelActions {
  readonly regeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  readonly openImageEdit: (storyboardId: string, panelIndex: number) => void
  readonly openAIData: (storyboardId: string, panelIndex: number) => void
  readonly insertAfter: (storyboardId: string, panelId: string) => void
  readonly generateVariant: (sourcePanelId: string, storyboardId: string) => void
}
```

预期结果：节点按钮不直接调用 route，而是复用 workspace controller/operation。

- ⏸ **Task 7.3**: `src/features/project-workspace/components/storyboard/PanelCard.tsx` - 若复用完整卡片导致节点过大，拆出 `PanelCardBody` 和 `PanelCardActions`，让 grid UI 与 canvas node 共享子组件。禁止复制粘贴两套卡片。
- ⏸ **Task 7.4**: `src/features/project-canvas/components/CanvasInspector.tsx` - 将复杂编辑放在右侧 inspector。节点只承载缩略展示和快捷动作。
- ⏸ **Task 7.5**: `tests/unit/project-canvas/panel-node-actions.test.tsx` - 测试点击节点生成按钮调用 action adapter 的具体入参，禁止只断言 `toHaveBeenCalled()`。

### 阶段 8: 视频区接入同一画布

- ⏸ **Task 8.1**: `src/lib/project-canvas/graph/build-project-canvas-graph.ts` - 为每个 panel 生成 `videoPanel` node，并建立 `panelImage -> videoPanel` edge。预期结果：视频节点和图片节点一一对应。
- ⏸ **Task 8.2**: `src/features/project-canvas/nodes/VideoPanelNode.tsx` - 复用或拆分现有 `VideoPanelCard` 能力。节点展示视频状态、生成入口、首尾帧状态、错误态。
- ⏸ **Task 8.3**: `src/features/project-canvas/hooks/useCanvasNodeActions.ts` - 增加视频动作：

```ts
export interface CanvasVideoActions {
  readonly generateVideo: (storyboardId: string, panelIndex: number) => Promise<void>
  readonly updateVideoPrompt: (
    storyboardId: string,
    panelIndex: number,
    value: string,
    field: 'videoPrompt' | 'firstLastFramePrompt',
  ) => Promise<void>
  readonly togglePanelLink: (storyboardId: string, panelIndex: number) => Promise<void>
}
```

预期结果：视频生成仍复用现有 video runtime，不新造独立业务路径。

- ⏸ **Task 8.4**: `src/lib/project-workflow/stages/video-stage-runtime/useVideoPanelViewport.ts` - 增加 canvas-aware 定位适配：旧滚动定位保留，canvas view 下使用 `focusNode(createVideoPanelNodeKey(panelId))`。
- ⏸ **Task 8.5**: `tests/regression/canvas-video-node-panel-binding.test.ts` - 断言 video node 的 target panel 与原 `storyboardId + panelIndex` 绑定一致。

### 阶段 9: Story / Script / Timeline 整合

- ⏸ **Task 9.1**: `src/features/project-canvas/nodes/StoryNode.tsx` - 增加故事输入/摘要展示和打开 inspector 编辑入口。编辑必须走现有 config/story operation。
- ⏸ **Task 9.2**: `src/features/project-canvas/nodes/ScriptClipNode.tsx` - 增加 clip 查看、定位对应 storyboard group 的交互。
- ⏸ **Task 9.3**: `src/features/project-canvas/nodes/TimelineNode.tsx` - 接入现有 Remotion/editor 状态，展示最终成片入口。
- ⏸ **Task 9.4**: `src/features/project-canvas/graph/build-project-canvas-graph.ts` - 完整连通 `StoryNode -> ScriptClipNode -> StoryboardGroupNode -> PanelImageNode -> VideoPanelNode -> TimelineNode`。
- ⏸ **Task 9.5**: `tests/system/project-canvas-workflow.system.test.ts` - 系统级验证从已有 episode 数据进入 canvas，节点完整、边完整、关键操作可执行。

### 阶段 10: Assistant 与 Command Layer 收敛

- ⏸ **Task 10.1**: `src/lib/project-canvas/commands/canvas-command.types.ts` - 定义画布命令类型。命令只表达业务意图，不表达屏幕坐标：

```ts
export type CanvasCommand =
  | { readonly type: 'focus_node'; readonly nodeKey: string }
  | { readonly type: 'select_node'; readonly nodeKey: string }
  | { readonly type: 'open_inspector'; readonly nodeKey: string }
  | { readonly type: 'regenerate_panel_image'; readonly panelId: string }
  | { readonly type: 'generate_panel_video'; readonly storyboardId: string; readonly panelIndex: number }
```

预期结果：assistant 可以让 UI 聚焦节点，但不依赖坐标点击。

- ⏸ **Task 10.2**: `src/lib/project-canvas/commands/execute-canvas-command.ts` - 将 canvas command 路由到现有 operation。禁止新增绕过鉴权/任务/回滚的快捷路径。
- ⏸ **Task 10.3**: `src/features/project-workspace/components/workspace-assistant/**` - assistant 结果中若包含 target panel/clip，canvas view 下调用 `focus_node` 和 `open_inspector`。
- ⏸ **Task 10.4**: `tests/unit/project-canvas/execute-canvas-command.test.ts` - 覆盖 focus/select/open inspector 与业务 command 的分离。

### 阶段 11: 旧 Stage 收敛与代码清理

- ⏸ **Task 11.1**: `src/features/project-workspace/components/StoryboardStage.tsx` - 当 canvas 分镜能力达到功能等价后，旧 grid/list stage 只保留为短期入口或删除。若删除必须同步更新 stage navigation 和 tests。
- ⏸ **Task 11.2**: `src/features/project-workspace/components/VideoStage.tsx` - 当 canvas 视频能力达到功能等价后，旧视频 stage 收敛为 canvas inspector 或删除。
- ⏸ **Task 11.3**: `src/features/project-workspace/hooks/useWorkspaceStageNavigation.ts` - 重新定义导航：从固定 stage 转为 canvas 主入口 + inspector/workflow modes。禁止硬编码根路由，必须遵守 `@/i18n/navigation` 规则。
- ⏸ **Task 11.4**: `src/features/project-workspace/components/storyboard/**` - 删除不再使用的 grid-only 包装层，保留可复用卡片子组件。禁止保留双轨业务逻辑。
- ⏸ **Task 11.5**: `tests/contracts/requirements-matrix.ts` - 更新需求矩阵，确保 canvas 替代旧 stage 的功能有测试映射。

## 4. 🧪 测试与验证策略 (Validation Strategy)

### 量化验收标准

功能验收：

- Canvas View 能展示 story/script/storyboard/panel/video/timeline 全链路节点。
- 默认自动布局稳定，同一输入连续构建 10 次，nodes x/y 完全一致。
- 用户拖动节点刷新后位置保持。
- 拖动节点不得改变任何 `panelIndex`、`panelNumber`、`storyboardId`。
- 图片生成、修改、候选图确认、插入 panel、镜头变体仍走现有业务链路。
- 视频生成、首尾帧、prompt 更新、镜头联动仍走现有业务链路。
- assistant 不依赖画布坐标，只通过 nodeKey 进行 focus/select/inspector。
- 所有新增 route 使用统一鉴权与错误出口。
- 所有新增 UI 文案走 i18n，禁止硬编码固定语言。

性能验收：

- 100 个 panel + 100 个 video node 时，Canvas 初次渲染可交互时间不超过 2 秒。
- 500 个节点拖动画布不卡死，控制台无 React key warning、hydration warning。
- node 拖动保存 debounce 后不产生高频 API 风暴。

质量验收：

- TypeScript 无 `any`。
- `npm run typecheck` 通过。
- 新增和改动功能均有对应 unit/integration/regression/system 测试。
- route catalog、requirements matrix 更新。
- 不存在 React Flow node.data 保存完整业务对象副本的实现。
- 不存在 canvas node 直接调用 DB 或绕过现有 operation 的实现。

### 具体测试步骤

每个阶段最小验证：

```bash
npm run typecheck
npm run lint:all
```

画布核心单元测试：

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/project-canvas
```

layout route 契约测试：

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/project-canvas-layout.route.test.ts
```

业务顺序回归：

```bash
cross-env SYSTEM_TEST_BOOTSTRAP=1 vitest run tests/regression/canvas-layout-preserves-business-order.test.ts
```

视频绑定回归：

```bash
cross-env SYSTEM_TEST_BOOTSTRAP=1 vitest run tests/regression/canvas-video-node-panel-binding.test.ts
```

最终系统级验证：

```bash
cross-env SYSTEM_TEST_BOOTSTRAP=1 vitest run tests/system/project-canvas-workflow.system.test.ts
```

发布前完整验证：

```bash
npm run test:all
npm run build
```

手动 QA 清单：

- 打开项目工作区，进入 Canvas View。
- 缩放、平移、拖动 panel 节点。
- 刷新页面，确认 layout 恢复。
- 点击某 panel 的图片生成入口，确认任务状态从 queued/processing 到 ready 或 failed。
- 打开 inspector 修改 prompt，确认保存后旧 stage 与 canvas 显示一致。
- 生成视频，确认 video node 与原 video stage 状态一致。
- assistant 定位某个 panel 后，canvas 聚焦该节点且打开 inspector。

## 5. 📝 架构备忘与工程约束 (Architecture Notes & Constraints)

### 不可违反的领域边界

- 业务顺序、生成关系、画布位置必须分离。
- `panelIndex/panelNumber` 仍是故事和镜头顺序的事实源。
- layout 只保存 `x/y/width/height/zIndex/viewport/collapsed/locked`。
- 拖动节点不得隐式触发 reorder。
- reorder 必须是显式 command，并同步 tests。
- 画布不得成为第二套业务数据源。

### React Flow 使用约束

- 只使用 `@xyflow/react`。
- 禁止使用旧 npm 包名 `reactflow`。
- React Flow nodes 的 `data` 必须轻量，只包含 nodeKey、targetId、status、必要展示字段和 action adapter 引用。
- 禁止在 node.data 中塞完整 `Project`、`ProjectStoryboard`、`ProjectPanel`。
- nodeTypes/edgeTypes 必须集中注册，禁止在组件内动态创建导致重渲染。
- 大量节点场景必须评估 `onlyRenderVisibleElements` 或等价性能策略。

### 文件与模块化约束

- 画布代码必须进入 `src/features/project-canvas/**` 和 `src/lib/project-canvas/**`。
- 不得把新画布逻辑散落到旧 storyboard/video 组件中。
- 可复用 UI 从旧组件中拆出，但禁止复制粘贴两套业务卡片。
- route 只负责鉴权、参数校验、调用服务、返回响应；复杂业务放入 `src/lib/project-canvas/**`。
- 所有 route 复用 `apiHandler`、`requireUserAuth`、`requireProjectAuth`、`requireProjectAuthLight`。

### 数据安全约束

- 新增 Prisma schema 和迁移属于结构变更，执行实际迁移前必须获得用户明确同意。
- 不得运行 destructive database 操作。
- 不得留下孤儿业务数据。
- layout 保存失败必须显式报错，不允许静默忽略。

### i18n 与导航约束

- UI 文案必须走项目 i18n。
- 页面导航必须使用 `@/i18n/navigation`。
- 禁止硬编码根字面量页面路由。

### Assistant 约束

- assistant 操作业务对象，不操作屏幕坐标。
- assistant 可新增 canvas-aware UI command：focus/select/highlight/open inspector。
- assistant 不得依赖 DOM 点击坐标。
- assistant 与节点按钮必须共享 command/operation 出口。

### 零补丁原则

- 当前目标是彻底重构 UI 架构，不是在旧 grid/list 上打补丁。
- 允许阶段性并行旧 stage 与新 canvas，但业务逻辑不得双轨。
- 旧 stage 保留期间只能作为旧入口，不能新增独立业务路径。
- 功能等价后必须删除旧 wrapper 或收敛到共享组件。

### 当前进度快照

- ✅ 已完成：确定主方案为 `@xyflow/react`，不是 tldraw。
- ✅ 已完成：确定这是规则化无限画布，不是完全自由白板。
- ✅ 已完成：确定核心原则为 Domain Data / Workflow Runtime / Canvas Projection / Canvas Layout / Command Layer 分离。
- ✅ 已完成：创建本 Master Plan 文档。
- ✅ 已完成：新增 `@xyflow/react` 依赖声明，并运行 `npm install` 同步 `package-lock.json`。
- ✅ 已完成：创建 `src/lib/project-canvas/**` 的第一批 graph/layout 类型、稳定 node key、rule-grid 布局、layout override 合并、只读 graph builder。
- ✅ 已完成：新增 `tests/unit/project-canvas/**` 第一批单元测试。
- ✅ 已验证：`BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-canvas` 通过，4 个测试文件 / 5 个测试通过。
- ✅ 已验证：`npm run typecheck` 通过。
- ✅ 已完成：创建 `src/features/project-canvas/**` 的只读 React Flow 画布壳、节点、边、runtime hook，并接入 workspace `canvas` stage。
- ✅ 已完成：新增 `messages/en/project-workflow.json` 与 `messages/zh/project-workflow.json` 的 canvas 文案，避免硬编码固定语言。
- ✅ 已完成：新增 `tests/unit/project-canvas/workspace-stage-navigation.test.ts` 验证 canvas 导航入口。
- ✅ 已完成：节点标题改为组件内 i18n 渲染，graph builder 仅输出结构化元数据；新增 panel 图片预览与 `CanvasInspector` 只读检查器骨架。
- ✅ 已验证：`BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-canvas` 通过，5 个测试文件 / 7 个测试通过。
- ✅ 已验证：`npm run typecheck` 通过。
- ✅ 已验证：`npm run lint:all` 通过，存在仓库既有 warning，无新增 error。
- ✅ 已验证：`npm run build` 通过，存在仓库既有 lint warning 与 bullmq dynamic dependency warning，无构建失败。
- ✅ 已完成：用户已明确授权执行结构变更与推送；新增 `ProjectCanvasLayout`、`ProjectCanvasNodeLayout` Prisma 模型和迁移文件 `prisma/migrations/20260501153000_add_project_canvas_layouts/migration.sql`。
- ✅ 已完成：新增 `src/lib/project-canvas/layout/canvas-layout-contract.ts` 与 `canvas-layout-service.ts`，layout payload、route、service、前端保存逻辑共用同一语义。
- ✅ 已完成：新增 `/api/projects/[projectId]/canvas-layout` GET/PATCH route，并同步 `tests/contracts/route-catalog.ts`。
- ✅ 已完成：新增 `src/features/project-canvas/hooks/useCanvasLayoutPersistence.ts`，`ProjectCanvas.tsx` 已支持拖动节点保存 layout override 与 viewport 保存。
- ✅ 已完成：新增 `queryKeys.project.canvasLayout(projectId, episodeId)`，画布 layout query key 与现有 query key 体系一致。
- ✅ 已验证：`npx prisma generate` 通过。
- ✅ 已验证：`BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-canvas tests/integration/api/contract/project-canvas-layout.route.test.ts` 通过，6 个测试文件 / 11 个测试通过。
- ✅ 已验证：`npm run typecheck` 通过。
- ✅ 已验证：`npm run lint:all` 通过，存在仓库既有 warning，无新增 error。
- ✅ 已验证：`npm run build` 通过，存在仓库既有 lint warning 与 bullmq dynamic dependency warning，无构建失败。
- ⚠️ 当前边界：尚未执行真实数据库迁移命令；当前提交只包含 Prisma schema 与 migration 文件。落库迁移应在部署环境按标准发布流程执行。
