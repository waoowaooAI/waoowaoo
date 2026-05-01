# waoowaoo Master Plan: Canvas-First Workspace Full Migration

> 状态机文档：本文件是 `waoowaoo` 项目从多 stage 工作区彻底迁移到唯一受控无限画布工作区的唯一工程上下文。任何新接手模型必须先阅读本文件，再执行代码修改。每次代码修改完成后，必须同步更新本文档的状态、实际改动文件、验证结果和风险。

## 1. 🎯 项目全局目标与上下文 (Project Context & Objectives)

### 业务背景 (Why)

当前 Project Workspace 以多个 stage/page 承载创作流程：故事、剧本、分镜、视频、成片分散在不同视图。用户必须不断切换页面才能理解和推进完整工作流。这个模式带来四个核心问题：

- 创作链路割裂：故事、剧本、分镜、图片、视频、成片之间的依赖关系不在同一空间里。
- 复杂度外露：用户需要理解“阶段切换”，而不是直接看到下一步该做什么。
- 功能增长困难：未来加入多分支、资产引用、版本、批注、自定义节点后，继续叠 stage 会形成低内聚 UI。
- Assistant 定位困难：Assistant 可以操作业务对象，但当前 UI 缺少统一空间坐标和节点定位能力。

产品目标不是做自由白板，而是做“苹果式受控自由画布”：默认不需要学习、不需要思考，系统用规则布局直接呈现完整流程；用户可以缩放、平移、拖动大阶段查看全局，但阶段内部仍保持规则化、低自由度、高可用性。

### 最终目标 (What)

最终系统默认只有一个 Workspace Canvas。旧的故事/剧本/分镜/视频 stage tab 不再作为主入口存在，旧 stage 页面必须删除或收敛为画布内部组件。

修改前：

- `/workspace/[projectId]` 通过 `stage` query 在故事、剧本、分镜、视频等页面间切换。
- 每个 stage 各自持有 UI 结构和交互入口。
- 分镜和视频是不同页面，用户需要跳转理解上下游关系。
- 画布只是新增的半成品 tab。

修改后：

- 项目打开后默认进入唯一画布。
- 画布内直接显示完整阶段容器：

```text
StoryStageContainer
  StoryComposer

ScriptStageContainer
  ClipList / ClipEditor

StoryboardStageContainer
  StoryboardGroups / PanelCards

VideoStageContainer
  VideoPanelCards

FinalStageContainer
  Timeline / Export entry
```

- 阶段容器整体可拖动、可折叠、可恢复默认布局。
- 阶段内部默认保持当前规则化 UI，不允许普通空间拖动改变业务顺序。
- 插入镜头、删除真实数据、重排镜头、生成图片、生成视频等仍走现有业务 operation/task/worker。
- 第一版不做右侧 Inspector，不做手动连线，不做自由备注节点。
- Minimap 需要保留，用于右下角全局预览。
- Assistant 保留，可以定位阶段/节点、创建业务内容、打开对应节点操作。

核心分层：

```text
Domain Data
  project / episode / clips / storyboards / panels / videos / timeline

Workflow Runtime
  tasks / generation status / retry / rollback / errors

Canvas Projection
  stage containers + child view models

Canvas Layout
  stage x/y/width/height/zIndex/collapsed/viewport

Canvas Runtime
  @xyflow/react pan/zoom/minimap/stage dragging/reset layout

Command Layer
  create / update / delete / insert panel / reorder / generate / regenerate / export
```

必须保持的边界：

- 业务顺序、生成关系、画布位置三者分离。
- `panelIndex` / `panelNumber` / timeline 顺序仍来自业务数据。
- 普通画布拖动只改变阶段容器位置，不改变镜头顺序。
- 镜头排序必须走明确排序交互和 command。
- 删除真实数据必须二次确认。
- React Flow 不作为业务事实源。

### 影响范围 (Scope)

预计新增或重构主模块：

- `src/features/project-canvas/**`
- `src/lib/project-canvas/**`
- `src/features/project-workspace/canvas/**`
- `src/features/project-workspace/components/**` 旧 stage 组件拆分与复用
- `src/lib/command-center/**` 或现有 operation adapter
- `src/app/api/projects/[projectId]/canvas-layout/route.ts`
- `prisma/schema.prisma`
- `tests/unit/project-canvas/**`
- `tests/unit/project-workspace/**`
- `tests/integration/api/contract/project-canvas-layout.route.test.ts`
- `tests/regression/project-canvas-*.test.ts`
- `tests/system/project-canvas-workflow.system.test.ts`

预计删除或收敛模块：

- `src/features/project-workspace/components/WorkspaceStageContent.tsx`
- `src/features/project-workspace/hooks/useWorkspaceStageNavigation.ts`
- 旧 stage tab/capsule nav 主流程入口
- `ConfigStage.tsx` / `ScriptStage.tsx` / `StoryboardStage.tsx` / `VideoStageRoute.tsx` 作为独立页面入口
- 旧 `stage` query 作为主导航的语义

预估规模：

- 新增文件：30-50 个。
- 修改文件：45-75 个。
- 删除或收敛文件：8-20 个。
- 新增/修改代码：约 5,000-10,000 行。
- 测试新增/修改：约 2,000-4,000 行。

### 技术栈与依赖 (Tech Stack)

当前系统：

- Next.js 15 App Router。
- React 19。
- TypeScript。
- Prisma 6。
- MySQL。
- TanStack Query。
- next-intl。
- Tailwind / 项目 glass UI primitives。
- BullMQ task/worker runtime。
- Remotion video/editor 相关能力。
- Vitest。

画布依赖：

- 主画布使用 `@xyflow/react`。
- 禁止使用旧包名 `reactflow`。
- 第一版不引入 tldraw。
- 第一版不引入 ELK/Dagre。阶段容器默认布局使用项目自研 rule-grid/stage-lane layout。未来如果需要复杂 DAG 自动布局，再通过 layout engine interface 接入 ELK。

## 2. 📂 核心文件目录树 (Directory Structure)

当前相关结构：

```text
waoowaoo/
  AGENTS.md
  waoowaoo_Master_Plan.md
  prisma/
    schema.prisma
    migrations/
      20260501153000_add_project_canvas_layouts/
        migration.sql
  src/
    app/
      [locale]/
        workspace/
          [projectId]/
            page.tsx
      api/
        projects/
          [projectId]/
            canvas-layout/
              route.ts
    features/
      project-canvas/
        ProjectCanvas.tsx
        ProjectCanvasRoute.tsx
        flow-types.ts
        components/
          CanvasInspector.tsx
        edges/
        hooks/
          useCanvasLayoutPersistence.ts
          useProjectCanvasRuntime.ts
        nodes/
      project-workspace/
        ProjectWorkspace.tsx
        WorkspaceProvider.tsx
        WorkspaceStageRuntimeContext.tsx
        components/
          ConfigStage.tsx
          ScriptStage.tsx
          StoryboardStage.tsx
          VideoStageRoute.tsx
          storyboard/
          video/
        hooks/
          useProjectWorkspaceController.ts
          useWorkspaceProjectSnapshot.ts
        workspace-stage.ts
    lib/
      project-canvas/
        graph/
        layout/
      query/
      operations/
      task/
      workers/
  tests/
    unit/
      project-canvas/
      project-workspace/
    integration/
    regression/
    system/
```

目标结构：

```text
src/
  features/
    project-workspace/
      ProjectWorkspace.tsx
      WorkspaceProvider.tsx
      canvas/
        ProjectWorkspaceCanvas.tsx
        CanvasWorkspaceShell.tsx
        CanvasToolbar.tsx
        CanvasStageFrame.tsx
        CanvasStageHeader.tsx
        CanvasResetLayoutButton.tsx
        CanvasMinimap.tsx
        stageTypes.ts
        stageRegistry.ts
        hooks/
          useCanvasWorkspaceRuntime.ts
          useCanvasStageLayout.ts
          useCanvasStageActions.ts
          useCanvasFocus.ts
        stages/
          StoryStageNode.tsx
          ScriptStageNode.tsx
          StoryboardStageNode.tsx
          VideoStageNode.tsx
          FinalStageNode.tsx
          stageNodeTypes.ts
      components/
        story/
          StoryComposer.tsx
        script/
          ScriptClipList.tsx
          ScriptClipCard.tsx
        storyboard/
          PanelCard.tsx
          PanelCardBody.tsx
          PanelCardActions.tsx
          StoryboardGroupView.tsx
        video/
          VideoPanelCard.tsx
          VideoPanelBody.tsx
          VideoPanelActions.tsx
    project-canvas/
      legacy-foundation/
        # Existing low-level graph/layout code may be kept or renamed after convergence.
  lib/
    project-canvas/
      layout/
        canvas-layout-contract.ts
        canvas-layout-service.ts
        stage-layout-engine.ts
        reset-canvas-layout.ts
      projection/
        build-canvas-workspace-projection.ts
        canvas-workspace-projection.types.ts
      commands/
        canvas-command.types.ts
        execute-canvas-command.ts
        canvas-command-registry.ts
  app/
    api/
      projects/
        [projectId]/
          canvas-layout/
            route.ts
tests/
  unit/
    project-workspace/
      canvas-workspace-runtime.test.ts
      canvas-stage-layout.test.ts
      workspace-stage.test.ts
    project-canvas/
      canvas-command-registry.test.ts
      canvas-layout-service.test.ts
  integration/
    api/
      contract/
        project-canvas-layout.route.test.ts
  regression/
    project-canvas-preserves-business-order.test.ts
    project-canvas-delete-confirmation.test.ts
  system/
    project-canvas-full-workflow.system.test.ts
```

## 3. 🚀 阶段划分与原子任务分配 (Phases & Atomic Tasks)

### 阶段 0: 当前状态冻结与计划重写

- ✅ **Task 0.1**: `AGENTS.md` - 已纳入 Git 追踪，明确授权修改后需要本地 commit、详细 commit 日志、pre-commit 不跑测试、pre-push 运行完整 `verify:push`。
- ✅ **Task 0.2**: `waoowaoo_Master_Plan.md` - 将旧“新增 Canvas tab”计划重写为“唯一 Canvas Workspace 全量迁移”计划。
- ✅ **Task 0.3**: `package.json` / `.husky/pre-commit` - 已调整 commit 验证策略：commit 不跑完整测试，push 前通过 `verify:push`。
- ✅ **Task 0.4**: 当前半成品 canvas 入口修复已提交：`stage=canvas` 有效、React Flow maximum update depth 已修复、当前 foundation 节点可拖拽。
- ⚠️ **Task 0.5**: 当前工作区存在无关删除 `CHANGELOG.md`。不得混入任何 canvas commit，除非用户明确要求处理。

### 阶段 1: 删除 stage 主导航，建立唯一 Canvas 入口

- 🔄 **Task 1.1**: `src/features/project-workspace/workspace-stage.ts` - 将 workspace stage 语义重定义为内部 canvas focus target，而不是页面切换枚举。已完成第一步：未知 stage 和空 stage 默认进入 `canvas`，旧 `editor` 仅映射到 `videos` 以保持 URL 解析稳定；后续需要把旧 stage 语义进一步收敛为 canvas focus hint。
- 🔄 **Task 1.2**: `src/app/[locale]/workspace/[projectId]/page.tsx` - 移除以 `stage` query 控制主页面的逻辑。当前页面层已不再通过 stage 渲染不同内容，但仍把解析后的 stage 传给 workspace runtime 作为 assistant/autoflow 上下文；后续需要把该字段重命名为 focus hint，避免继续表达页面分支。
- ✅ **Task 1.3**: `src/features/project-workspace/ProjectWorkspace.tsx` - 已删除 `WorkspaceStageContent` 分支渲染，并在阶段 2 升级为始终渲染 `ProjectWorkspaceCanvas`。函数签名保持：

```ts
export default function ProjectWorkspace(props: ProjectWorkspaceProps): JSX.Element
```

实际结果：Workspace 现在只有一个主画布入口；legacy `src/features/project-canvas/ProjectCanvasRoute.tsx` foundation 已不再作为 workspace 主内容入口，后续按阶段 3-8 把完整业务 UI 迁入五个 StageNode。

- ✅ **Task 1.4**: `src/features/project-workspace/components/WorkspaceHeaderShell.tsx` - 已删除 `CapsuleNav` 主阶段导航。保留 episode selector、全局资产入口、设置、刷新。后续阶段定位统一放入 `CanvasToolbar`。
- ✅ **Task 1.5**: `src/features/project-workspace/hooks/useWorkspaceStageNavigation.ts` - 已删除文件，workspace 主路径不再拥有页面 stage nav hook。
- ⏸ **Task 1.6**: `messages/en/project-workflow.json` / `messages/zh/project-workflow.json` - 移除或重命名 stage tab 文案，新增 canvas toolbar 文案：reset layout、collapse all、expand all、focus story/script/storyboard/video/final。
- ✅ **Task 1.7**: `tests/unit/project-workspace/workspace-stage.test.ts` - 已覆盖 `stage=canvas`、旧 `stage=editor`、未知 stage、空 stage 的解析规则。当前断言：未知/空 stage 进入 `canvas`。

### 阶段 2: Canvas Workspace Shell 与阶段容器布局

- ⏸ **Task 2.1**: `src/features/project-workspace/canvas/stageTypes.ts` - 新增阶段类型：

```ts
export type CanvasStageId = 'story' | 'script' | 'storyboard' | 'video' | 'final'

export interface CanvasStageDefinition {
  readonly id: CanvasStageId
  readonly titleKey: string
  readonly defaultWidth: number
  readonly defaultHeight: number
  readonly order: number
}
```

预期结果：阶段容器是稳定产品概念，不依赖旧 URL stage。

- ✅ **Task 2.2**: `src/features/project-workspace/canvas/stageTypes.ts` - 已注册五个固定阶段容器：story、script、storyboard、video、final。第一版不开放用户自定义阶段；未来如需扩展，可把当前 definition array 提升为 registry。
- ✅ **Task 2.3**: `src/features/project-workspace/canvas/stage-layout.ts` - 已新增阶段级布局引擎：

```ts
export function buildDefaultCanvasStageLayouts(episodeId: string): CanvasStageLayout[]
export function resolveCanvasStageLayouts(params: {
  readonly episodeId: string
  readonly savedLayouts: readonly CanvasNodeLayout[]
}): CanvasStageLayout[]
```

默认横向流程：story -> script -> storyboard -> video -> final。预期结果：打开项目自动 fit 全流程。

- ✅ **Task 2.4**: `src/lib/project-canvas/layout/canvas-layout-contract.ts` - 当前 layout contract 已可表达 stage layout 所需字段：nodeKey、nodeType、targetType、targetId、x/y、width/height、zIndex、collapsed、viewport、schemaVersion。未保存业务字段；本阶段不需要扩大 DB/API contract。
- ✅ **Task 2.5**: `prisma/schema.prisma` - 现有 `ProjectCanvasNodeLayout` 足够表达阶段容器布局；本阶段不做破坏性 schema 变更、不新增 migration。
- ✅ **Task 2.6**: `src/features/project-workspace/canvas/ProjectWorkspaceCanvas.tsx` - 已创建唯一画布 shell，使用 `@xyflow/react` 渲染五个 top-level stage node，并启用 pan、zoom、minimap、fitView、stage dragging。
- ✅ **Task 2.7**: `src/features/project-workspace/canvas/CanvasToolbar.tsx` - 已新增 reset layout、collapse all、expand all、fit view、focus story/script/storyboard/video/final。按钮文案走 `messages/*/project-workflow.json` i18n。
- ✅ **Task 2.8**: `tests/unit/project-workspace/canvas/stage-layout.test.ts` - 已断言五个阶段默认顺序、nodeKey、collapsed 默认值，以及保存的 collapsed 布局不会沿用展开高度。
- ⏸ **Task 2.9**: `src/features/project-workspace/canvas/state/canvas-workspace-store.ts` 或等价细粒度订阅模块 - 建立 Canvas Workspace 的状态边界。StageNode 只接收稳定 `stageId/layout/actionIds`，业务数据由阶段内部组件通过 TanStack Query selector、细粒度 context 或 Zustand/Jotai 等 store 按需订阅。预期结果：单个 panel/video 状态变化不得触发整个 Canvas 或所有 StageNode 重渲染。

### 阶段 3: StoryStageNode 完整迁移

- ✅ **Task 3.1**: `src/features/project-workspace/components/ConfigStage.tsx` - 已拆分出 `StoryComposer`。`ConfigStage` 当前只保留薄 wrapper，后续删除旧 page wrapper 时不再承载业务逻辑。
- ✅ **Task 3.2**: `src/features/project-workspace/components/story/StoryComposer.tsx` - 已新增组件，复用 `ProjectInputStage`、`SmartImportWizard`、`WorkspaceStageRuntimeContext`、`useWorkspaceEpisodeStageData`，覆盖故事输入、配置、生成剧本、智能分集完成后的 episode 定位。

```ts
export default function StoryComposer(): React.ReactElement
```

预期结果：画布内故事阶段和旧故事输入功能等价。

- ✅ **Task 3.3**: `src/features/project-workspace/canvas/stages/CanvasStageNode.tsx` - Story stage 分支已直接渲染 `StoryComposer`，节点内显示完整故事输入能力，不依赖点击 Inspector。为防止画布拖拽抢占输入，StoryComposer 容器使用 `nodrag nowheel`。
- ⏸ **Task 3.4**: `tests/unit/project-workspace/story-stage-node.test.tsx` - 测试输入故事文本调用 `onUpdateEpisode` 的具体 key/value，点击生成调用 `onGenerateScript`。

### 阶段 4: ScriptStageNode 完整迁移

- ✅ **Task 4.1**: `src/features/project-workspace/components/ScriptStage.tsx` - 已拆分出 `ScriptComposer`。`ScriptStage` 当前只保留薄 wrapper，后续删除旧 page wrapper 时不再承载业务逻辑。
- ✅ **Task 4.2**: `src/features/project-workspace/components/script/ScriptComposer.tsx` - 已复用现有 `ScriptView`，展示完整剧本 clip 列表、clip 编辑、资产绑定、生成分镜入口。
- ✅ **Task 4.3**: `src/features/project-workspace/canvas/stages/CanvasStageNode.tsx` - Script stage 分支已直接渲染 `ScriptComposer`，节点内显示完整剧本功能和动作按钮，不依赖点击 Inspector。
- ⏸ **Task 4.4**: `tests/unit/project-workspace/script-stage-node.test.tsx` - 覆盖 clip 编辑、生成分镜按钮、任务状态展示。

### 阶段 5: StoryboardStageNode 完整迁移

- ⏸ **Task 5.1**: `src/features/project-workspace/components/storyboard/PanelCard.tsx` - 拆分为 `PanelCardBody`、`PanelCardActions`、`PanelGenerationStatus`。禁止复制第二套 canvas panel card。
- 🔄 **Task 5.2**: `src/features/project-workspace/components/storyboard-stage/StoryboardComposer.tsx` - 已先复用现有 `StoryboardStageView`，完整保留 panel 编号、完整内容、图片、prompt、按钮、错误/重试状态。待补：进一步拆出 `StoryboardGroupView` 以降低节点内部复杂度。
- ✅ **Task 5.3**: `src/features/project-workspace/canvas/stages/CanvasStageNode.tsx` - Storyboard stage 分支已直接渲染 `StoryboardComposer`，当前在阶段容器内展示所有 storyboard group 和 panel。阶段内部不开放普通空间拖动 panel。
- ⏸ **Task 5.4**: `src/features/project-workspace/canvas/hooks/useCanvasStageActions.ts` - 接入现有分镜动作：生成图片、重生成、候选确认、AI data、插入镜头、删除镜头。
- ⏸ **Task 5.5**: `src/features/project-workspace/canvas/stages/StoryboardStageVirtualizedList.tsx` - 为 `StoryboardStageNode` 内部 panel/group 列表实现独立虚拟化或分块懒渲染，优先使用 `@tanstack/react-virtual` 或等价项目认可方案。禁止只依赖 React Flow `onlyRenderVisibleElements`。预期结果：500 个 panel 时只渲染视口附近卡片。
- ⏸ **Task 5.6**: `tests/unit/project-workspace/storyboard-stage-virtualization.test.tsx` - 构造大量 panel fixture，断言初始渲染不会挂载全部 panel card，并验证滚动后可见窗口更新。
- ⏸ **Task 5.7**: `src/lib/project-canvas/commands/canvas-command.types.ts` - 定义业务命令，不包含屏幕坐标：

```ts
export type CanvasCommand =
  | { readonly type: 'insert_panel_after'; readonly storyboardId: string; readonly panelId: string }
  | { readonly type: 'delete_panel'; readonly storyboardId: string; readonly panelId: string }
  | { readonly type: 'reorder_panel'; readonly storyboardId: string; readonly sourcePanelId: string; readonly targetPanelId: string }
  | { readonly type: 'generate_panel_image'; readonly panelId: string }
  | { readonly type: 'regenerate_panel_image'; readonly panelId: string }
```

- ⏸ **Task 5.8**: `tests/regression/project-canvas-preserves-business-order.test.ts` - 普通阶段拖动不改变 `panelIndex`；排序交互才改变业务顺序。
- ⏸ **Task 5.9**: `tests/regression/project-canvas-delete-confirmation.test.ts` - 删除 panel 必须二次确认，取消时 DB 不变，确认时走真实删除链路。

### 阶段 6: VideoStageNode 完整迁移

- ⏸ **Task 6.1**: `src/features/project-workspace/components/video/VideoPanelCard.tsx` - 拆分出 `VideoPanelBody`、`VideoPanelActions`、`VideoPromptEditor`，供 canvas 使用。
- ✅ **Task 6.2**: `src/features/project-workspace/canvas/stages/CanvasStageNode.tsx` - Video stage 分支已直接渲染 `VideoComposer`，复用现有 `VideoStage`，每个 panel video card 仍和 panel 业务绑定，并显示 prompt、首尾帧、生成按钮、错误、任务状态。
- 🔄 **Task 6.3**: `src/features/project-workspace/components/video-stage-canvas/VideoComposer.tsx` - 已接入现有视频动作：生成视频、批量生成视频、更新 video prompt、更新 panel video model、打开资产库。待补：统一进入 canvas command registry。
- ⏸ **Task 6.4**: `src/features/project-workspace/canvas/stages/VideoStageVirtualizedList.tsx` - 为 `VideoStageNode` 内部 video card 列表实现独立虚拟化或分块懒渲染。禁止只依赖 React Flow 视口剔除。预期结果：500 个 video card 时只渲染视口附近卡片。
- ⏸ **Task 6.5**: `tests/unit/project-workspace/video-stage-node.test.tsx` - 覆盖视频 prompt 修改、生成按钮、错误展示的具体入参。
- ⏸ **Task 6.6**: `tests/unit/project-workspace/video-stage-virtualization.test.tsx` - 构造大量 video panel fixture，断言初始渲染不会挂载全部 video card。
- ⏸ **Task 6.7**: `tests/regression/project-canvas-video-panel-binding.test.ts` - 断言 video card 永远绑定对应 panel，成片顺序来自业务数据。

### 阶段 7: FinalStageNode / 成片能力迁移

- ✅ **Task 7.1**: `src/features/project-workspace/canvas/stages/CanvasStageNode.tsx` - Final stage 分支已直接渲染 `FinalTimelineView`，显示 timeline 编辑器、预览、保存和导出入口。
- ✅ **Task 7.2**: `src/features/project-workspace/components/final/FinalTimelineView.tsx` - 已抽出可复用成片视图，使用 `createProjectFromPanels()` 从已生成视频的 panels 构建初始 `VideoEditorProject`，并复用现有 `VideoEditorStage`。
- ⏸ **Task 7.3**: `tests/unit/project-workspace/final-stage-node.test.tsx` - 覆盖 timeline 展示和导出入口。

### 阶段 8: Canvas Layout 持久化、折叠、重置和恢复

- ⏸ **Task 8.1**: `src/features/project-workspace/canvas/hooks/useCanvasStageLayout.ts` - 管理 stage dragging、collapsed、viewport、reset layout。阶段内部节点不参与 React Flow 独立拖动。
- ⏸ **Task 8.2**: `src/lib/project-canvas/layout/reset-canvas-layout.ts` - 新增 reset layout 服务函数，清除 saved stage overrides 或重写为默认布局。
- ⏸ **Task 8.3**: `src/lib/project-canvas/layout/canvas-layout-error-policy.ts` - 定义 layout 加载/解析/版本不兼容策略：layout 失败时使用默认布局继续工作，并显示非阻塞警告；业务数据失败不得降级为假数据。
- ⏸ **Task 8.4**: `src/features/project-workspace/canvas/components/CanvasLayoutWarning.tsx` - 展示 layout 加载失败、保存失败、schema version reset 等非阻塞状态。禁止静默吞错。
- ⏸ **Task 8.5**: `src/app/api/projects/[projectId]/canvas-layout/route.ts` - 扩展 PATCH 支持 collapsed、stage layout、viewport；新增 DELETE 或 POST reset endpoint 时必须更新 route catalog。
- ⏸ **Task 8.6**: `tests/integration/api/contract/project-canvas-layout.route.test.ts` - 覆盖保存 stage layout、折叠状态、viewport、reset layout、schemaVersion 不兼容。
- ⏸ **Task 8.7**: `tests/unit/project-canvas/canvas-layout-error-policy.test.ts` - 覆盖 layout API 失败、schemaVersion 不兼容、解析失败时使用默认布局并产生可见 warning 状态。
- ⏸ **Task 8.8**: `tests/system/project-canvas-layout-restore.system.test.ts` - 刷新后恢复画布位置、折叠状态、viewport；layout 失败时仍显示完整业务工作流和 warning。

### 阶段 9: Assistant 接入唯一画布

- ⏸ **Task 9.1**: `src/lib/project-canvas/commands/canvas-command-registry.ts` - 建立 command registry，将 assistant、节点按钮、快捷键统一映射到现有 operation。
- ⏸ **Task 9.2**: `src/features/project-workspace/components/workspace-assistant/**` - Assistant 保留在画布旁边；执行结果可定位阶段/节点、创建业务内容、打开节点相关操作。
- ⏸ **Task 9.3**: `src/features/project-workspace/canvas/hooks/useCanvasFocus.ts` - 暴露 `focusStage(stageId)`、`focusPanel(panelId)`、`focusVideoPanel(panelId)`，只操作 UI 视角，不改业务数据。
- ⏸ **Task 9.4**: `tests/unit/project-canvas/canvas-command-registry.test.ts` - 测试 assistant 和节点按钮共享同一个 command path。

### 阶段 10: 删除旧 Stage 页面壳与清理双轨

- ✅ **Task 10.1**: `src/features/project-workspace/components/WorkspaceStageContent.tsx` - 已删除文件并移除引用。Workspace 主内容不再根据 stage 分支渲染不同页面。
- ⏸ **Task 10.2**: `src/features/project-workspace/components/ConfigStage.tsx` / `ScriptStage.tsx` / `StoryboardStage.tsx` / `VideoStageRoute.tsx` / `VoiceStageRoute.tsx` - 删除旧 page wrapper，保留已拆出的共享子组件。
- ⏸ **Task 10.3**: `src/features/project-workspace/hooks/useProjectWorkspaceController.ts` - 删除 stage nav state，保留 runtime/actions；所有功能供 canvas stage 使用。
- 🔄 **Task 10.4**: `src/features/project-workspace/StageNavigation.tsx` / `src/components/ui/CapsuleNav.tsx` 使用点 - workspace 主流程已不再渲染 `CapsuleNav`；若其他页面仍使用 CapsuleNav，不删除组件本体。后续需要清理剩余旧 stage 文案和死代码。
- ⏸ **Task 10.5**: `tests/contracts/requirements-matrix.ts` - 更新需求矩阵，确保旧 stage 功能全部映射到 canvas 测试。

### 阶段 11: 最终系统验收

- ⏸ **Task 11.1**: `tests/system/project-canvas-full-workflow.system.test.ts` - 系统级覆盖：输入故事 -> 生成剧本 -> 生成分镜 -> 生成图片 -> 生成视频 -> 成片入口，全程不进入旧 stage 页面。
- ⏸ **Task 11.2**: `npm run verify:push` - push 前完整验证：lint、typecheck、test:all、build 全部通过。
- ⏸ **Task 11.3**: 手动 QA - 打开项目默认画布，确认无 stage tab、全流程 fitView、minimap 可见、阶段可拖动、阶段可折叠、reset layout 可用、刷新后恢复。

## 4. 🧪 测试与验证策略 (Validation Strategy)

### 量化验收标准

产品验收：

- 打开 `/workspace/[projectId]` 默认显示唯一 canvas，不显示旧 stage tab。
- 用户无需进入任何非画布页面，即可完成故事输入、剧本生成、分镜生成、图片生成、视频生成、成片入口查看。
- 画布默认显示完整流程，并自动 fit 到全流程。
- 五个阶段容器默认可见：故事、剧本、分镜、视频、成片。
- 阶段容器可整体拖动，阶段内部业务卡片默认不自由拖动。
- 所有阶段可折叠/展开，刷新后保持状态。
- Reset layout 后，阶段位置恢复默认规则布局。
- Minimap 可见，并能反映全流程位置。
- 删除真实数据必须二次确认。
- 普通画布拖动不改变 `panelIndex`、`panelNumber`、timeline 顺序。
- 镜头排序只能通过明确排序交互改变业务顺序。
- 旧 stage 页面主入口完全消失。

工程验收：

- `@xyflow/react` 是唯一画布库。
- 没有引入 `reactflow` 旧包名。
- 没有引入 tldraw。
- 没有在 React Flow node data 中塞完整业务对象副本。
- route 仍使用 `apiHandler`、`requireProjectAuthLight` 等统一出口。
- 节点按钮、assistant、快捷入口共享 command/operation，不直接绕过 route/task/worker。
- UI 文案走 i18n。
- 不使用 `any`。
- 旧 stage wrapper 删除或无引用。

性能验收：

- 100 个 panel + 100 个 video card 的项目，初次打开 canvas 到可交互不超过 2 秒。
- 500 个业务卡片时，画布 pan/zoom 不出现明显卡死。
- StoryboardStageNode / VideoStageNode 内部必须有独立虚拟化或分块懒渲染；500 个 panel/video card 时初始挂载数量不得等于总数量。
- 单个 panel/video 状态变化不得触发整个 Canvas 或全部 StageNode 重渲染。
- 拖动阶段容器保存 layout 不产生高频 API 风暴。
- React 控制台无 maximum update depth、key warning、hydration warning。

### 具体测试步骤

快速检查当前工作区：

```bash
git status --short --branch --untracked-files=all
```

阶段解析和画布基础测试：

```bash
BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/workspace-stage.test.ts tests/unit/project-canvas
```

画布 layout API 契约：

```bash
BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/integration/api/contract/project-canvas-layout.route.test.ts
```

业务顺序回归：

```bash
SYSTEM_TEST_BOOTSTRAP=1 npm exec -- vitest run tests/regression/project-canvas-preserves-business-order.test.ts
```

删除确认回归：

```bash
SYSTEM_TEST_BOOTSTRAP=1 npm exec -- vitest run tests/regression/project-canvas-delete-confirmation.test.ts
```

完整画布工作流系统测试：

```bash
SYSTEM_TEST_BOOTSTRAP=1 npm exec -- vitest run tests/system/project-canvas-full-workflow.system.test.ts
```

阶段内虚拟化测试：

```bash
BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/storyboard-stage-virtualization.test.tsx tests/unit/project-workspace/video-stage-virtualization.test.tsx
```

layout 降级策略测试：

```bash
BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-canvas/canvas-layout-error-policy.test.ts
```

提交前按改动风险手动运行必要测试；push 前必须运行：

```bash
npm run verify:push
```

手动 QA：

- 打开项目 URL，不带 `stage` 参数，确认默认是画布。
- 输入故事并生成剧本，确认不跳转旧页面。
- 生成分镜，确认分镜阶段容器直接更新。
- 对某 panel 生成图片，确认任务状态和图片在同一 panel card 内展示。
- 对某 panel 生成视频，确认 video stage 对应 card 更新。
- 拖动故事阶段容器，刷新后位置恢复。
- 折叠视频阶段，刷新后仍折叠。
- 点击 reset layout，全部阶段回到默认位置。
- 删除 panel，确认弹出二次确认；取消时业务数据不变。

## 5. 📝 架构备忘与工程约束 (Architecture Notes & Constraints)

### 产品约束

- Workspace 第一屏必须是唯一 canvas。
- 第一版不做 Inspector，节点/阶段内容直接显示完整功能。
- 第一版不做手动连线。
- 第一版不做自由便签/备注节点。
- 第一版不开放用户自定义阶段类型；“新建”先表达为现有业务创建：新建剧集、分镜组、插入镜头、生成视频等。
- 未来可扩展到自由 workflow graph，但当前不改业务内核。

### 数据约束

- Canvas layout 只保存 UI 状态：stage position、size、zIndex、collapsed、viewport。
- Domain Data 仍是主数据：episode、clips、storyboards、panels、video、timeline。
- 删除真实数据必须走现有 operation/route 并二次确认。
- 生成/重生成必须走 task/worker，不允许 UI 直接写结果。
- 画布位置不得隐式改变业务顺序。
- Layout 是 UI 偏好，可以在加载失败、保存失败或 schemaVersion 不兼容时使用默认布局继续工作，但必须显示非阻塞 warning 并记录错误；业务数据加载失败必须显式报错，禁止伪造默认业务数据。

### React Flow 约束

- React Flow 顶层节点应优先是阶段容器，而不是每个业务小卡片。
- 阶段内部复杂 UI 使用普通 React 组件渲染，避免把每个按钮/卡片都建成 React Flow node。
- `nodeTypes` 必须稳定注册，不得在 render 内动态创建。
- 禁止 `node.data` 持有完整 project/episode/storyboard/panel 对象。
- React Flow 的 `onlyRenderVisibleElements` 只能剔除顶层 StageNode，不能剔除 StageNode 内部卡片。StoryboardStageNode 和 VideoStageNode 必须实现阶段内部虚拟化或分块懒渲染，禁止只依赖 React Flow 视口剔除。
- StageNode 只接收稳定、轻量 props。业务数据更新必须通过细粒度订阅进入阶段内部组件，禁止把完整 project/episode/panels/videos 从 Canvas 顶层逐层 props drilling 到所有卡片。

### 状态管理约束

- Canvas 顶层只管理画布 UI 状态：viewport、stage layout、selection/focus、collapse。
- Domain 数据由业务组件按需订阅：优先使用 TanStack Query cache selector、细粒度 hooks，或引入明确的 Zustand/Jotai store；选择 store 前必须说明取舍。
- 单个 panel/video 的任务状态、错误、图片或视频 URL 更新，不得导致 StoryStageNode、ScriptStageNode、FinalStageNode 重渲染。
- Command/action 引用必须稳定，禁止在 Canvas render 中为每个卡片创建新闭包造成大面积重渲染。

### Command 约束

- 所有业务动作必须进入 command/operation 层。
- Canvas button、assistant、快捷键、未来右键菜单必须共享 command registry。
- Command 表达业务意图，不表达屏幕坐标。
- Assistant 暂时不感知画布位置；以后可增加 canvas-aware context。

### 文件拆分约束

- 新画布 UI 放在 `src/features/project-workspace/canvas/**`。
- 底层投影、布局、命令放在 `src/lib/project-canvas/**`。
- 旧 stage 组件必须拆为共享子组件，不允许复制两套 PanelCard/VideoPanelCard。
- 删除旧 wrapper 前必须保证 canvas 功能等价并有测试覆盖。

### Git 与文档约束

- 每次代码修改后必须更新 `waoowaoo_Master_Plan.md`。
- 完成授权修改后必须本地 commit，commit message 包含变更摘要、核心文件、验证结果、风险/后续。
- commit 不自动跑完整测试；push 前必须通过 `npm run verify:push`。
- push 必须单独获得用户明确授权。
- 当前无关 `CHANGELOG.md` 删除不得混入 canvas 相关提交。

### 当前进度快照

- ✅ 已完成：初始 `@xyflow/react` 依赖和 canvas foundation。
- ✅ 已完成：canvas layout Prisma 模型、migration、GET/PATCH route、layout persistence hook。
- ✅ 已完成：AGENTS.md 已纳入 Git 追踪，并定义提交/验证策略。
- ✅ 已完成：Husky pre-commit 已改为不跑测试；pre-push 保留完整验证。
- ✅ 已完成：将旧“新增 Canvas tab”计划升级为“唯一 Canvas Workspace 全量迁移”计划，并补充 React Flow culling、状态订阅、layout 降级三类风险控制。
- ✅ 已完成：修复 `stage=canvas` 被 workspace 页面路由层判定为无效 stage 后回退到故事阶段的问题。新增 `src/features/project-workspace/workspace-stage.ts`，让 `canvas` 成为有效 workspace stage。
- ✅ 已完成：修复进入当前半成品 canvas 后 React maximum update depth 问题。原因是空 saved layout 每次 render 创建新数组，导致 `flowNodes` 重新生成并触发 `setNodes` 循环；现在使用稳定空数组常量。
- ✅ 已完成：让当前半成品 canvas 节点保持可拖拽，为 layout 保存验证提供基础。
- ✅ 已完成：第一阶段主入口收敛。`ProjectWorkspace.tsx` 现在始终渲染唯一画布，`WorkspaceStageContent.tsx` 和 `useWorkspaceStageNavigation.ts` 已删除，`WorkspaceHeaderShell.tsx` 已移除 workspace 主阶段 `CapsuleNav`。
- ✅ 已完成：`workspace-stage.ts` 已将未知/空 stage 解析为 `canvas`，避免默认进入故事阶段；旧 `editor` 仍映射到 `videos`，后续会进一步收敛为 focus hint。
- ✅ 已完成：第二阶段基础画布壳。新增 `src/features/project-workspace/canvas/**`，当前 workspace 主内容已经从 legacy `ProjectCanvasRoute` 切到 `ProjectWorkspaceCanvas`，画布顶层为五个固定 StageNode。
- ✅ 已完成：阶段布局支持保存/读取现有 canvas layout 表；本阶段不改 Prisma schema，不做破坏性 DB 变更。
- ✅ 已完成：`CanvasToolbar` 已提供 reset layout、collapse all、expand all、fit view、focus stage。
- ✅ 已完成：故事阶段第一块完整迁移。`StoryComposer` 已从 `ConfigStage` 中抽出，Story StageNode 直接渲染故事输入、配置、生成剧本和智能分集入口。
- ✅ 已完成：剧本阶段第一块完整迁移。`ScriptComposer` 已从 `ScriptStage` 中抽出，Script StageNode 直接渲染现有 `ScriptView` 的剧本 clip、资产绑定和生成分镜入口。
- ✅ 已完成：分镜阶段第一块完整迁移。`StoryboardComposer` 已从 `StoryboardStage` 中抽出，Storyboard StageNode 直接渲染现有 `StoryboardStageView` 的分镜组、panel、图片生成、编辑、插入、删除等入口。
- ✅ 已完成：视频阶段第一块完整迁移。`VideoComposer` 已从 `VideoStageRoute` 中抽出，Video StageNode 直接渲染现有 `VideoStage` 的 panel video card、prompt、首尾帧、生成和批量生成入口。
- ✅ 已完成：成片阶段第一块完整迁移。`FinalTimelineView` 已接入 Final StageNode，复用 `VideoEditorStage` 和 `createProjectFromPanels()` 从业务 panel 视频生成初始时间线。
- ✅ 已验证：`BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/canvas/stage-layout.test.ts tests/unit/project-workspace/workspace-stage.test.ts tests/unit/project-canvas` 通过，6 个测试文件 / 9 个测试通过。
- ✅ 已验证：`npm run typecheck` 通过。
- ✅ 已验证：`npm run lint` 通过，0 errors；当前仓库仍有 91 个既有 warnings，未在本次迁移中扩大为 error。
- ⚠️ 当前代码仍需强化：五个阶段大节点均已接入完整现有功能；下一步重点是阶段内部虚拟化、command registry、旧 wrapper 清理、组件级/系统级测试和浏览器 QA。
- ⚠️ 当前工作区有无关 `CHANGELOG.md` 删除，后续提交必须精确控制范围。
