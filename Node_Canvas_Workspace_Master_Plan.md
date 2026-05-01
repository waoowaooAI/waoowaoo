# Node Canvas Workspace Master Plan

> 状态机文档：本文件是当前任务的唯一执行上下文。目标是删除临时测试页面，并把真实 Project Workspace 从“阶段大容器 + 旧 UI 塞进画布”重构为真实业务对象节点画布。任何新接手模型必须先阅读本文件，再执行代码修改。每次代码修改完成后必须同步更新本文档状态。

## 1. 🎯 项目全局目标与上下文 (Project Context & Objectives)

- **业务背景 (Why)**：当前真实工作台仍以 story/script/storyboard/video/final 大阶段容器承载旧页面 UI。用户已经确认这不是目标；目标是让工作台像一个受控节点画布：真实业务对象直接成为节点，用户看到的是创作链路，而不是阶段页面搬家。
- **最终目标 (What)**：打开项目后进入唯一画布；无 `/dev` 测试页；无 stage tab；无旧 stage 大容器。画布根据真实数据展示节点链路：空项目只显示故事输入节点；有故事显示分析状态；有剧本显示每个 clip；有分镜显示每个 panel/shot；有图片/视频产物或任务态显示 image/video 节点；有视频时显示成片节点。缺失数据不造假。
- **影响范围 (Scope)**：删除 `src/app/[locale]/dev/**` 与测试页 i18n；重构 `src/features/project-workspace/canvas/**`；新增真实节点 projection、节点组件、节点动作桥接、节点布局；更新 `messages/*/project-workflow.json`；新增/更新单元和回归测试。预计修改/新增 25-40 个文件，约 3,000-6,000 行。
- **技术栈与依赖 (Tech Stack)**：Next.js 15 App Router、React 19、TypeScript、next-intl、TanStack Query、Prisma、`@xyflow/react`、Vitest。正式 workspace 第一版采用 A 精简工作流风格，不保留 B/C 原型切换。

## 2. 📂 核心文件目录树 (Directory Structure)

```text
src/
  i18n.ts
  features/project-workspace/
    ProjectWorkspace.tsx
    canvas/
      ProjectWorkspaceCanvas.tsx
      CanvasToolbar.tsx
      node-canvas-types.ts
      hooks/
        useWorkspaceNodeCanvasProjection.ts
        useWorkspaceNodeCanvasActions.ts
        useCanvasLayoutPersistence.ts
      nodes/
        WorkspaceNode.tsx
        workspaceNodeTypes.ts
      details/
        CanvasObjectDetailLayer.tsx       # 画布内对象详情层，承载旧 GUI 非语音功能等价能力
  lib/project-canvas/
    layout/                               # 仅保留 layout persistence/API 合约；旧 graph/commands 已删除
messages/
  en/project-workflow.json
  zh/project-workflow.json
tests/
  unit/project-workspace/node-canvas-projection.test.ts
  unit/project-workspace/workspace-node-render.test.tsx
  unit/project-workspace/canvas-object-detail-layer.test.tsx
  unit/project-workflow/workspace-runtime.test.ts
  unit/components/workspace-assistant-panel-layout.test.tsx
  regression/project-canvas-preserves-business-order.test.ts
  integration/api/contract/project-canvas-layout.route.test.ts
```

## 3. 🚀 阶段划分与原子任务分配 (Phases & Atomic Tasks)

### 阶段 0: 文档与临时原型清理

- ✅ **Task 0.1**: `src/app/[locale]/dev/**` - 删除全部 dev/test 页面，包括 canvas 原型、workspace redesign、segmented control、selection preview。
- ✅ **Task 0.2**: `messages/*/canvasNodePrototype.json`、`workspaceRedesign.json`、`selectionPreview.json` - 删除临时测试页翻译文件。
- ✅ **Task 0.3**: `src/i18n.ts` - 移除测试页 namespace 的 import 和 messages 暴露。
- ✅ **Task 0.4**: `Node_Canvas_Workspace_Master_Plan.md` - 新建并持续维护本任务状态。
- ✅ **Task 0.5**: `waoowaoo_Master_Plan.md` - 已标记旧计划被本文件取代。
- ⚠️ **Task 0.6**: `CHANGELOG.md` - 当前存在无关删除，不得暂存、恢复或混入本任务。

### 阶段 1: 真实节点数据模型与投影

- ✅ **Task 1.1**: `src/features/project-workspace/canvas/node-canvas-types.ts` - 定义 `WorkspaceCanvasNodeKind`、`WorkspaceCanvasNodeData`、`WorkspaceCanvasFlowNode`、`WorkspaceCanvasFlowEdge`。
- ✅ **Task 1.2**: `src/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasProjection.ts` - 从真实 `novelText`、`clips`、`storyboards.panels` 生成 nodes/edges，不使用 mock/fake fallback。
- ✅ **Task 1.3**: `useWorkspaceNodeCanvasProjection.ts` - 实现默认横向规则布局：story -> analysis -> clips -> shots -> image/video -> final。
- ✅ **Task 1.4**: `tests/unit/project-workspace/node-canvas-projection.test.ts` - 覆盖空项目、只有故事、有 clips、有 panels、有图片/视频的投影结果。

### 阶段 2: 替换旧阶段容器 UI

- ✅ **Task 2.1**: `src/features/project-workspace/canvas/ProjectWorkspaceCanvas.tsx` - 删除 stage container 渲染路线，改为渲染真实业务节点和真实 edges。
- ✅ **Task 2.2**: `src/features/project-workspace/canvas/nodes/WorkspaceNode.tsx` - 实现 A 精简工作流节点 UI：白底、细边框、低色彩、状态 chip、核心内容、主动作按钮。
- ✅ **Task 2.3**: `src/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasActions.ts` - 节点按钮桥接现有 runtime：故事输入、生成剧本、生成分镜、生成图片、生成视频、批量生成视频。
- ✅ **Task 2.4**: `src/features/project-workspace/canvas/CanvasToolbar.tsx` - 顶部只保留状态摘要、fit view、reset layout、layout 状态，不显示 stage focus/collapse/expand。
- ✅ **Task 2.5**: `src/features/project-workspace/canvas/stages/**` / `stageTypes.ts` / `stage-layout.ts` / `workspace-canvas-types.ts` / `hooks/useCanvasWorkspaceNodes.ts` / `hooks/useCanvasFocus.ts` / `tests/unit/project-workspace/canvas/stage-layout.test.ts` - 用户已确认删除旧 stage 死代码；文件已删除，`rg` 确认正式路径无旧 stage 容器残留引用。
- ✅ **Task 2.6**: `src/features/project-canvas/**` - 删除早期只读 canvas feature，包括旧 node/edge/inspector/runtime 组件；正式工作台只保留 `src/features/project-workspace/canvas/**` 节点画布。
- ✅ **Task 2.7**: `src/lib/project-canvas/graph/**`、`src/lib/project-canvas/commands/**`、`rule-grid-layout-engine.ts`、`resolve-canvas-layout.ts` - 删除旧 graph builder、command registry、规则布局引擎和对应单元测试；layout persistence/API 合约继续保留。
- ✅ **Task 2.8**: `src/features/project-workspace/components/story/StoryComposer.tsx`、`script/ScriptComposer.tsx`、`storyboard-stage/StoryboardComposer.tsx`、`video-stage-canvas/VideoComposer.tsx`、`final/FinalTimelineView.tsx`、`workspace-stage.ts` - 删除旧 stage wrapper 和旧 stage resolver，避免正式工作台继续沿用“阶段跳转”概念。
- ✅ **Task 2.9**: `src/app/[locale]/workspace/[projectId]/page.tsx`、`ProjectWorkspace.tsx`、`useProjectWorkspaceController.ts`、`WorkspaceAssistantPanel.tsx` - 移除 workspace 前端的 `stage` URL 状态、`currentStage` 传递和 assistant stage chip；真实页面只传 episode/project 上下文。
- ✅ **Task 2.10**: `src/features/project-workspace/hooks/useWorkspaceImageActions.ts`、`WorkspaceStageRuntimeContext.tsx`、`useWorkspaceStageRuntime.ts`、`useWorkspaceNodeCanvasProjection.ts` - 给 shot/image 节点补齐真实图片生成入口，复用 `useRegenerateProjectPanelImage`，不依赖旧分镜页按钮。
- ✅ **Task 2.11**: `src/features/project-workspace/components/ProjectInputStage.tsx`、`tests/unit/project-workflow/asset-stage-mutations.test.ts` - 删除旧故事输入 stage 组件和对应旧 UI 断言；故事输入由 `WorkspaceNode` 的 `storyInput` 节点承担。
- ✅ **Task 2.12**: `src/features/project-workspace/components/ScriptView.tsx`、`src/features/project-workspace/components/script-view/ScriptView*.tsx`、`SpotlightCards.tsx`、`asset-state-utils.ts`、`selection-sync.ts`、`tests/unit/script-view/script-view-assets-panel.test.ts`、`selection-sync.test.ts` - 删除旧剧本页面 UI 岛；保留 `clip-asset-utils.ts`，因为资产库仍复用该纯工具函数。

### 阶段 3: Layout、状态与性能

- ✅ **Task 3.1**: `ProjectWorkspaceCanvas.tsx` - 复用 canvas layout 持久化，但 nodeKey 语义改为 `kind:targetId`；不保存完整业务对象。
- ✅ **Task 3.2**: `ProjectWorkspaceCanvas.tsx` - layout 读取失败或 schema 不兼容时显示非阻塞 warning 并用默认布局显示真实数据；业务数据失败不得伪造。
- ✅ **Task 3.3**: `ProjectWorkspaceCanvas.tsx` - 使用 `onlyRenderVisibleElements`，大量 panel/video 依赖 React Flow 节点剔除，避免旧大阶段内部全量挂载。
- ✅ **Task 3.4**: `tests/regression/project-canvas-preserves-business-order.test.ts` - 断言节点位置不参与 clip/panel 业务顺序。
- ✅ **Task 3.5**: `src/lib/project-canvas/layout/canvas-layout-contract.ts` - layout node type 合约改为真实节点类型：`story`、`analysis`、`scriptClip`、`shot`、`imageAsset`、`videoClip`、`finalTimeline`。

### 阶段 4: 验证与收口

- ✅ **Task 4.1**: `messages/*/project-workflow.json` - 新增正式 node canvas 文案；删除/停用旧 stage focus 文案。
- ✅ **Task 4.2**: `npm run typecheck` - 已通过。
- ✅ **Task 4.3**: `BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/node-canvas-projection.test.ts tests/regression/project-canvas-preserves-business-order.test.ts tests/unit/project-canvas/canvas-layout-error-policy.test.ts` - 已通过，3 个文件 7 个测试全部通过。
- ✅ **Task 4.4**: `BILLING_TEST_BOOTSTRAP=1 npm exec -- vitest run tests/integration/api/contract/project-canvas-layout.route.test.ts` - 已通过，5 个 API 契约测试全部通过；fixture 已更新为新节点类型。
- ✅ **Task 4.5**: `tests/unit/project-workflow/workspace-runtime.test.ts`、`tests/unit/components/workspace-assistant-panel-layout.test.tsx` - 已同步单画布语义，删除对 `currentStage` / `stageLabel` 的测试依赖。
- ✅ **Task 4.6**: `tests/unit/project-workspace/node-canvas-projection.test.ts` - 补充 shot/image 节点 `generate_image` 动作断言，确保图片生成入口已经迁入节点画布。
- ✅ **Task 4.7**: `src/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasProjection.ts` - 修复正式 workspace 节点画布 i18n key；`useTranslations('projectWorkflow.canvas.workspace')` 下只传相对 key，避免 `projectWorkflow.canvas.workspace.nodeCanvas.*` 缺文案。
- 🔄 **Task 4.8**: 手动验收：真实项目不出现旧 stage 大容器，所有真实 clips/panels/images/videos 独立成节点。代码层正式渲染路径已切到 `workspaceNodeTypes`，旧 canvas/stage UI 代码已删除。

### 阶段 5: 节点画布功能等价迁移（不含语音）

- ✅ **Task 5.1**: `src/features/project-workspace/canvas/details/CanvasObjectDetailLayer.tsx` - 新增画布内对象详情层；点击剧本、分镜、图片、视频、成片节点后打开对应详情，不恢复旧 stage tab，不把旧页面级 UI 原样塞进节点。
- ✅ **Task 5.2**: `src/features/project-workspace/canvas/ProjectWorkspaceCanvas.tsx` - 增加 selected node 状态、节点点击打开详情、点击画布关闭详情；`open_details` action 由 canvas shell 处理，其他动作继续走 runtime bridge。
- ✅ **Task 5.3**: `src/features/project-workspace/canvas/node-canvas-types.ts` - 扩展节点命令类型，覆盖 clip 编辑、panel 保存/删除/复制/插入/变体、候选图选择/取消、图片编辑/下载、视频 prompt/model/options/生成、资产库打开、最终成片入口。
- ✅ **Task 5.4**: `src/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasActions.ts` - 将节点动作桥接到现有 workspace runtime；复杂写操作由详情层调用既有 mutation/runtime，禁止 UI 直接改 DB。
- ✅ **Task 5.5**: `CanvasObjectDetailLayer.tsx` - 剧本详情恢复完整 screenplay、原始片段、角色、场景、道具、保存 clip、生成分镜入口；保存走 `useUpdateProjectClip`。
- ✅ **Task 5.6**: `CanvasObjectDetailLayer.tsx` - 分镜详情恢复景别、运镜、描述、场景、角色、道具、SRT、时长、video prompt、摄影规则、表演指导、保存、删除、复制、插入、变体、生成图片；角色/场景选择从真实资产库读取。
- ✅ **Task 5.7**: `src/lib/operations/domains/storyboard/panel-mutations.ts` - 扩展 `update_storyboard_panel_fields` 支持 `srtSegment`，确保分镜详情里的 SRT 文本不是只在 UI 中编辑而无法保存。
- ✅ **Task 5.8**: `CanvasObjectDetailLayer.tsx` - 图片详情恢复图片预览、候选图确认/取消、参考图 URL、重新生成、图片修改、下载图片、上一张图片只读提示；不制造不存在的撤回接口。
- ✅ **Task 5.9**: `CanvasObjectDetailLayer.tsx` - 视频详情恢复播放器、lip-sync 结果展示、video prompt、首尾帧 prompt、视频模型、生成参数 JSON、单镜头生成、批量生成、镜头衔接状态；生成参数 JSON 无效时显式报错并禁用生成。
- ✅ **Task 5.10**: `CanvasObjectDetailLayer.tsx` - 成片详情恢复时间线顺序、总镜头、总视频、缺失视频、总时长、批量生成视频、下载视频；最终导出能力未真实接入时显式显示“未接入”，不放假按钮。
- ✅ **Task 5.11**: `messages/en/project-workflow.json`、`messages/zh/project-workflow.json` - 新增详情层全部正式文案；禁止硬编码中文。
- ✅ **Task 5.12**: `tests/unit/project-workspace/canvas-object-detail-layer.test.tsx` - 覆盖剧本、分镜、图片、视频、成片详情字段渲染；断言不出现 voice node。
- ✅ **Task 5.13**: `tests/integration/api/contract/project-panel-routes.test.ts` - 更新 panel PUT 契约，确认 `srtSegment` 通过统一 operation 输入传递。

### 当前验证结果

- ✅ `npx prisma generate` - 已执行，Prisma Client 同步到当前 schema。
- ✅ `npm run typecheck` - 删除旧 canvas/stage 死代码、同步 Prisma Client、移除 workspace 前端 stage 状态、删除旧故事输入 stage 和旧 ScriptView UI 岛、修复节点画布 i18n key 后重新运行，通过。
- ✅ `BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/node-canvas-projection.test.ts` - i18n key 修复后单独复跑，通过。
- ✅ `BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/node-canvas-projection.test.ts tests/regression/project-canvas-preserves-business-order.test.ts tests/unit/project-canvas/canvas-layout-error-policy.test.ts tests/unit/project-workflow/workspace-runtime.test.ts tests/unit/components/workspace-assistant-panel-layout.test.tsx tests/unit/project-workflow/asset-stage-mutations.test.ts tests/unit/script-view/clip-asset-utils.test.ts` - 通过，7 个文件 30 个测试全部通过。
- ✅ `BILLING_TEST_BOOTSTRAP=1 npm exec -- vitest run tests/integration/api/contract/project-canvas-layout.route.test.ts` - 通过，1 个文件 5 个测试全部通过。
- ✅ `BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/node-canvas-projection.test.ts tests/unit/project-workspace/workspace-node-render.test.tsx tests/unit/project-workspace/canvas-object-detail-layer.test.tsx tests/regression/project-canvas-preserves-business-order.test.ts tests/integration/api/contract/project-panel-routes.test.ts` - 功能等价详情层完成后通过，5 个文件 18 个测试全部通过。
- ✅ `/src/app/[locale]/dev` - 已删除，`rg`/`find` 检查无剩余测试页文件。
- ✅ 旧 stage/canvas 容器死代码 - 已删除，`rg` 确认无 `CanvasStageNode`、`ProjectCanvas`、旧 graph/commands/layout engine 正式引用。
- ✅ 前端 stage 导航残留 - `rg "ProjectInputStage|StoryComposer|ScriptComposer|StoryboardComposer|VideoComposer|FinalTimelineView|workspace-stage|currentStage|stageNav|handleStageChange|onStageChange|urlStage|stageLabel"` 在 workspace 前端、页面和相关测试范围内无结果；后端 agent 协议仍保留可选 `currentStage?` 字段但真实页面不再传入。
- ⚠️ `CHANGELOG.md` 仍存在无关删除，未处理。

## 4. 🧪 测试与验证策略 (Validation Strategy)

- **量化验收标准**：`/zh/dev/*` 不存在；workspace 只显示节点画布；空项目只显示故事输入节点；真实 clips/panels/images/videos 都是独立节点；画布拖动不改变业务顺序；所有可见文字走 i18n；TypeScript 无 error；禁止 `any`。
- **具体测试步骤**：

```bash
npm run typecheck
BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/unit/project-workspace/node-canvas-projection.test.ts tests/unit/project-workspace/workspace-node-render.test.tsx tests/unit/project-workspace/canvas-object-detail-layer.test.tsx tests/regression/project-canvas-preserves-business-order.test.ts tests/unit/project-canvas/canvas-layout-error-policy.test.ts tests/unit/project-workflow/workspace-runtime.test.ts tests/unit/components/workspace-assistant-panel-layout.test.tsx tests/unit/project-workflow/asset-stage-mutations.test.ts tests/unit/script-view/clip-asset-utils.test.ts
BILLING_TEST_BOOTSTRAP=1 npm exec -- vitest run tests/integration/api/contract/project-canvas-layout.route.test.ts
BILLING_TEST_BOOTSTRAP=0 npm exec -- vitest run tests/integration/api/contract/project-panel-routes.test.ts
```

## 5. 📝 架构备忘与工程约束 (Architecture Notes & Constraints)

- 真实业务数据是唯一事实源；React Flow 只负责空间投影。
- 禁止把旧页面级 UI 放进节点里。
- 禁止 mock/fake fallback；没有真实数据就不显示对应节点。
- 节点位置、业务顺序、生成依赖必须分离。
- 第一版选用 A 精简工作流，不保留 B/C 风格切换到正式 workspace。
- 删除本地文件已由用户明确确认；不得扩大删除范围。
- 不 touch 无关 `CHANGELOG.md` 删除。
- 每次代码修改后必须同步更新本文档。
