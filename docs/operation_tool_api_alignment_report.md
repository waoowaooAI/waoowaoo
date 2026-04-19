# Operation / Tool / API 对齐审计报告

审计目标：核实当前仓库是否满足“业务能力只定义一次：以 operation 为中心，API 与 tool 只是 adapter”，并检查“工具最终覆盖所有人工可编辑动作”（所有 GUI/API 写入口都可被 operation 表达，且可通过 assistant tools 调用）。

> 审计范围：按要求扫描 `src/app/api/**/route.ts` 的 `POST/PUT/PATCH/DELETE`（mutation）入口；盘点 `src/lib/operations/*` 的 project-agent operation registry；核实 tool 暴露与执行链路。

---

## 1. Summary（结论）

**结论：部分对齐（Project Agent 体系内对齐较好，但全仓库层面未达标）。**

### 1.1 关键统计与证据

- API mutation routes（`src/app/api/**/route.ts` 中含 `POST/PUT/PATCH/DELETE` 的文件）共 **123** 个文件。
  - **47 / 123**（38.2%）通过 `executeProjectAgentOperationFromApi` 调用 operation（全部集中在 `src/app/api/projects/**`）。
  - **76 / 123** 未经过 operation adapter（包含 `asset-hub`、`assets`、`user`、`runs`、`tasks`、`mutation-batches` 等分组，且不少直接写 DB / 提交任务）。
- 在 `src/app/api/projects/**` 下的 mutation route files 共 **71** 个：
  - **47 / 71** 走 operation adapter；
  - **24 / 71** 不走 operation adapter（其中多项属于典型“人工可编辑动作”，例如项目 CRUD、计划审批、批量 regenerate、storyboard image modify 等）。

### 1.2 已对齐的部分（正向证据）

- **Operation registry 是单一来源**：`src/lib/operations/registry.ts` -> `createProjectAgentOperationRegistry()` 统一产出所有 project-agent operations，并在启动时校验 `operation.id === operationId`。
- **Assistant tools 从 registry 组装**：`src/lib/project-agent/runtime.ts` 使用 `createProjectAgentOperationRegistry()`，对每个 `operationId` 生成同名 tool，避免手写 tool 定义与 registry 漂移。
- **Tool 执行统一走 tool adapter**：`src/lib/adapters/tools/execute-project-agent-operation.ts` 统一做 input/output schema 校验，并基于 `sideEffects` 做 confirmation gate，再调用 `operation.execute(...)`。
- **API adapter 结构较薄**：`src/lib/adapters/api/execute-project-agent-operation.ts` 主要承担 inputSchema parse + execute + outputSchema 校验 + error mapping，符合“薄适配”预期。

### 1.3 未对齐/高风险点（必须优先关注）

1) **存在大量 mutation API route 未通过 `executeProjectAgentOperationFromApi`，且直接写 DB / 调 service / submitTask**  
   例如（均为 POST/PUT/PATCH/DELETE）：
   - `src/app/api/projects/[projectId]/route.ts`：`PATCH`/`DELETE` 直接 `prisma.project.update/delete`，并包含 COS/voice 清理等 destructive 副作用。
   - `src/app/api/projects/[projectId]/config/route.ts`：`PATCH` 直接更新项目模型/能力配置（手工可编辑动作）。
   - `src/app/api/projects/[projectId]/modify-storyboard-image/route.ts`：直接 `prisma` + `submitTask` + billing payload 构造。
   - `src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts`：直接 `approveProjectPlan(...)`，**绕过 operation `approve_plan` 的 sideEffects/confirmation 语义**。
   - `src/app/api/mutation-batches/[batchId]/revert/route.ts`：直接 `revertMutationBatch(...)` + `prisma`，**绕过 operation `revert_mutation_batch` 的 destructive+requiresConfirmation 语义**。

2) **“同一能力双轨实现”已出现且语义不一致（operation 存在，但 route 不使用）**
   - Plan approval/reject：route 直调 executor；operation `approve_plan`/`reject_plan` 已存在于 `src/lib/operations/plan-ops.ts`，且 `approve_plan` 标注 `billable=true`、`risk=high`、`requiresConfirmation=true`、`longRunning=true`。当前 route 旁路意味着：
     - API 写入口不复用 operation 的 schema 与 sideEffects 元数据；
     - assistant tools 的确认 gate 与 UI API 的行为存在分叉风险。
   - MutationBatch revert：同理，route 旁路 operation `revert_mutation_batch`（`destructive=true`、`requiresConfirmation=true`）。

3) **sideEffects/confirmation 语义在 Tool 与 API 两条 adapter 路径不一致**
   - Tool adapter 会根据 `sideEffects` 要求 `confirmed=true`；**API adapter 当前不做确认 gate**。
   - 在 mutation API adapter 已使用的 operations 中，`requiresConfirmation=true` 的 operationId **至少 31 个**（例如 `mutate_storyboard`、`generate_video`、`delete_voice_line`、`upload_asset_image` 等），但对应 API routes 未显式传入 `confirmed`，且 API adapter 不阻断执行。
   - 这意味着：即便“业务能力以 operation 为中心”，**“副作用治理”目前只在 tool path 生效**，API path 主要依赖 UI 侧自律。

---

## 2. Inventory: Operations（Operation 清单）

Operation registry 来源：
- `src/lib/operations/registry.ts`
- `src/lib/operations/project-agent.ts`（聚合 `read-ops` / `plan-ops` / `governance-ops` / `edit-ops` / `gui-ops` / `extra-ops`）

### 2.1 操作统计（基于 registry 实际运行时枚举）

- 总 operation 数：**71**
- 按 `sideEffects.mode` 粗分：`act` 46、`plan` 15、`query` 10
- `requiresConfirmation=true` 的 operation：较多（尤其是 destructive/billable/longRunning/bulk/overwrite 类）

### 2.2 Operation 表格（可验收）

| operationId | definedIn | scope | mode | risk | billable | requiresConfirmation | destructive | overwrite | bulk | longRunning |
|---|---|---|---|---|---|---|---|---|---|---|
| `ai_create_character` | `src/lib/operations/extra-ops.ts` | project | act | high | Y | Y | - | - | - | Y |
| `ai_create_location` | `src/lib/operations/extra-ops.ts` | project | act | high | Y | Y | - | - | - | Y |
| `ai_modify_location` | `src/lib/operations/extra-ops.ts` | asset | act | high | Y | Y | - | - | - | Y |
| `approve_plan` | `src/lib/operations/plan-ops.ts` | plan | plan | high | Y | Y | - | - | - | Y |
| `batch_create_episodes` | `src/lib/operations/gui-ops.ts` | project | plan | high | - | Y | Y | - | Y | - |
| `bulk_update_speaker_voice_preset` | `src/lib/operations/gui-ops.ts` | episode | act | medium | - | - | - | Y | Y | - |
| `character_profile_batch_confirm` | `src/lib/operations/extra-ops.ts` | project | act | high | Y | Y | - | - | - | Y |
| `character_profile_confirm` | `src/lib/operations/extra-ops.ts` | asset | act | high | Y | Y | - | - | - | Y |
| `cleanup_unselected_images` | `src/lib/operations/edit-ops.ts` | project | plan | high | - | Y | Y | - | Y | Y |
| `clear_storyboard_error` | `src/lib/operations/gui-ops.ts` | storyboard | act | low | - | - | - | Y | - | - |
| `clips_build` | `src/lib/operations/extra-ops.ts` | episode | act | high | Y | Y | - | - | - | Y |
| `confirm_character_appearance_selection` | `src/lib/operations/gui-ops.ts` | asset | plan | high | - | Y | Y | - | - | - |
| `confirm_location_selection` | `src/lib/operations/gui-ops.ts` | asset | plan | high | - | Y | Y | - | - | - |
| `create_character` | `src/lib/operations/gui-ops.ts` | asset | act | medium | - | - | - | - | - | Y |
| `create_character_appearance` | `src/lib/operations/gui-ops.ts` | asset | act | medium | - | - | - | - | - | - |
| `create_episode` | `src/lib/operations/gui-ops.ts` | project | act | medium | - | - | - | Y | - | - |
| `create_location` | `src/lib/operations/gui-ops.ts` | asset | act | medium | - | - | - | - | - | - |
| `create_storyboard_group` | `src/lib/operations/gui-ops.ts` | episode | act | medium | - | - | - | - | - | - |
| `create_voice_line` | `src/lib/operations/gui-ops.ts` | episode | act | medium | - | - | - | - | - | - |
| `create_workflow_plan` | `src/lib/operations/plan-ops.ts` | episode | plan | low | - | - | - | - | - | - |
| `create_workflow_plan_from_saved_skill` | `src/lib/operations/plan-ops.ts` | episode | plan | low | - | - | - | - | - | - |
| `delete_character` | `src/lib/operations/gui-ops.ts` | asset | plan | high | - | Y | Y | - | - | - |
| `delete_character_appearance` | `src/lib/operations/gui-ops.ts` | asset | plan | high | - | Y | Y | - | - | - |
| `delete_episode` | `src/lib/operations/gui-ops.ts` | project | plan | high | - | Y | Y | - | - | - |
| `delete_location` | `src/lib/operations/gui-ops.ts` | asset | plan | high | - | Y | Y | - | - | - |
| `delete_storyboard_group` | `src/lib/operations/gui-ops.ts` | storyboard | plan | high | - | Y | Y | - | - | - |
| `delete_video_editor_project` | `src/lib/operations/gui-ops.ts` | episode | act | medium | - | Y | Y | Y | - | - |
| `delete_voice_line` | `src/lib/operations/gui-ops.ts` | episode | plan | high | - | Y | Y | - | - | - |
| `episode_split_llm` | `src/lib/operations/extra-ops.ts` | project | act | high | Y | Y | - | - | - | Y |
| `fetch_workflow_preview` | `src/lib/operations/read-ops.ts` | episode | query | low | - | - | - | - | - | - |
| `generate_character_image` | `src/lib/operations/project-agent.ts` | asset | act | medium | Y | Y | - | - | - | Y |
| `generate_location_image` | `src/lib/operations/project-agent.ts` | asset | act | medium | Y | Y | - | - | - | Y |
| `generate_video` | `src/lib/operations/project-agent.ts` | episode | act | high | Y | Y | - | Y | Y | Y |
| `get_project_context` | `src/lib/operations/read-ops.ts` | project | query | low | - | - | - | - | - | - |
| `get_project_phase` | `src/lib/operations/read-ops.ts` | project | query | none | - | - | - | - | - | - |
| `get_project_snapshot` | `src/lib/operations/read-ops.ts` | project | query | low | - | - | - | - | - | - |
| `get_task_status` | `src/lib/operations/read-ops.ts` | project | query | none | - | - | - | - | - | - |
| `lip_sync` | `src/lib/operations/project-agent.ts` | panel | act | high | Y | Y | - | Y | - | Y |
| `list_recent_commands` | `src/lib/operations/read-ops.ts` | project | query | low | - | - | - | - | - | - |
| `list_recent_mutation_batches` | `src/lib/operations/governance-ops.ts` | mutation-batch | query | low | - | - | - | - | - | - |
| `list_saved_skills` | `src/lib/operations/read-ops.ts` | project | query | low | - | - | - | - | - | - |
| `list_workflow_packages` | `src/lib/operations/read-ops.ts` | system | query | none | - | - | - | - | - | - |
| `modify_asset_image` | `src/lib/operations/project-agent.ts` | asset | act | high | Y | Y | Y | Y | - | Y |
| `move_storyboard_group` | `src/lib/operations/gui-ops.ts` | episode | act | medium | - | - | - | Y | - | - |
| `mutate_storyboard` | `src/lib/operations/project-agent.ts` | storyboard | act | high | - | Y | Y | Y | Y | - |
| `panel_variant` | `src/lib/operations/project-agent.ts` | storyboard | act | high | Y | Y | - | - | - | Y |
| `patch_character_voice` | `src/lib/operations/gui-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `patch_location` | `src/lib/operations/gui-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `reference_to_character` | `src/lib/operations/extra-ops.ts` | asset | act | high | Y | Y | - | - | - | Y |
| `regenerate_panel_image` | `src/lib/operations/project-agent.ts` | panel | act | medium | Y | Y | - | - | - | Y |
| `reject_plan` | `src/lib/operations/plan-ops.ts` | plan | plan | low | - | - | - | - | - | - |
| `revert_asset_render` | `src/lib/operations/gui-ops.ts` | asset | act | medium | - | Y | Y | Y | - | - |
| `revert_mutation_batch` | `src/lib/operations/governance-ops.ts` | mutation-batch | plan | high | - | Y | Y | - | - | - |
| `save_video_editor_project` | `src/lib/operations/gui-ops.ts` | episode | act | low | - | - | - | Y | - | - |
| `save_workflow_plan_as_skill` | `src/lib/operations/plan-ops.ts` | project | act | low | - | - | - | - | - | - |
| `select_asset_render` | `src/lib/operations/edit-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `set_speaker_voice` | `src/lib/operations/gui-ops.ts` | episode | act | medium | - | - | - | Y | - | - |
| `split_episodes_by_markers` | `src/lib/operations/extra-ops.ts` | project | query | low | - | - | - | - | - | - |
| `update_asset_render_label` | `src/lib/operations/edit-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `update_character` | `src/lib/operations/gui-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `update_character_appearance` | `src/lib/operations/gui-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `update_character_appearance_description` | `src/lib/operations/edit-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `update_clip` | `src/lib/operations/gui-ops.ts` | episode | act | low | - | - | - | Y | - | - |
| `update_episode` | `src/lib/operations/gui-ops.ts` | project | act | low | - | - | - | Y | - | - |
| `update_location_image_description` | `src/lib/operations/edit-ops.ts` | asset | act | low | - | - | - | Y | - | - |
| `update_shot_prompt` | `src/lib/operations/edit-ops.ts` | project | act | low | - | - | - | Y | - | - |
| `update_voice_line` | `src/lib/operations/gui-ops.ts` | episode | act | low | - | - | - | Y | - | - |
| `upload_asset_image` | `src/lib/operations/extra-ops.ts` | asset | act | high | - | Y | Y | Y | - | Y |
| `upload_character_voice_audio` | `src/lib/operations/gui-ops.ts` | asset | act | medium | - | - | - | Y | - | Y |
| `voice_design` | `src/lib/operations/project-agent.ts` | project | act | high | Y | Y | - | - | - | - |
| `voice_generate` | `src/lib/operations/project-agent.ts` | episode | act | high | Y | Y | - | - | Y | Y |

---

## 3. Inventory: API Mutation Routes（API 写入口清单）

### 3.1 盘点方法（可复现）

- 扫描所有 `src/app/api/**/route.ts`
- 识别 `export const|function POST|PUT|PATCH|DELETE` 的文件（mutation route files）
- 判断是否包含 `executeProjectAgentOperationFromApi(...)`
- 若调用 adapter：基于代码字面量提取可能的 `operationId`（含简单的动态分支，如 `generate-image` 的 conditional）
- 若未调用：用启发式标记其内部行为特征（`prisma` / `submitTask` / `maybeSubmitLLMTask` / `approveProjectPlan` 等）

### 3.2 Mutation routes 表格（按目录分组）

> 说明：该表是“mutation route files”的文件维度盘点（一个 `route.ts` 可能包含多个 methods）。

#### /api/asset-hub（全部未走 operation adapter）

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/asset-hub/ai-design-character/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `userAuth` |
| `src/app/api/asset-hub/ai-design-location/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `userAuth` |
| `src/app/api/asset-hub/ai-modify-character/route.ts` | `POST` | No | - | `prisma` `maybeSubmitLLMTask` `userAuth` |
| `src/app/api/asset-hub/ai-modify-location/route.ts` | `POST` | No | - | `prisma` `maybeSubmitLLMTask` `userAuth` |
| `src/app/api/asset-hub/ai-modify-prop/route.ts` | `POST` | No | - | `prisma` `maybeSubmitLLMTask` `userAuth` |
| `src/app/api/asset-hub/appearances/route.ts` | `POST` `PATCH` `DELETE` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/character-voice/route.ts` | `POST` `PATCH` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/characters/[characterId]/appearances/[appearanceIndex]/route.ts` | `PATCH` `POST` `DELETE` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/characters/[characterId]/route.ts` | `GET` `PATCH` `DELETE` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/characters/route.ts` | `GET` `POST` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/folders/[folderId]/route.ts` | `PATCH` `DELETE` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/folders/route.ts` | `GET` `POST` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/generate-image/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/asset-hub/locations/[locationId]/route.ts` | `GET` `PATCH` `DELETE` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/locations/route.ts` | `GET` `POST` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/modify-image/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/asset-hub/reference-to-character/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `userAuth` |
| `src/app/api/asset-hub/select-image/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/asset-hub/undo-image/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/asset-hub/update-asset-label/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/asset-hub/upload-image/route.ts` | `POST` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/upload-temp/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/asset-hub/voice-design/route.ts` | `POST` | No | - | `submitTask` `userAuth` |
| `src/app/api/asset-hub/voices/[id]/route.ts` | `DELETE` `PATCH` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/voices/route.ts` | `GET` `POST` | No | - | `prisma` `userAuth` |
| `src/app/api/asset-hub/voices/upload/route.ts` | `POST` | No | - | `prisma` `userAuth` |

#### /api/assets（全部未走 operation adapter）

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/assets/[assetId]/copy/route.ts` | `POST` | No | - | `projectAuth` `copyFromGlobal` |
| `src/app/api/assets/[assetId]/generate/route.ts` | `POST` | No | - | `projectAuth` `userAuth` |
| `src/app/api/assets/[assetId]/modify-render/route.ts` | `POST` | No | - | `projectAuth` `userAuth` |
| `src/app/api/assets/[assetId]/revert-render/route.ts` | `POST` | No | - | `projectAuth` `userAuth` |
| `src/app/api/assets/[assetId]/route.ts` | `PATCH` `DELETE` | No | - | `projectAuth` `userAuth` |
| `src/app/api/assets/[assetId]/select-render/route.ts` | `POST` | No | - | `projectAuth` `userAuth` |
| `src/app/api/assets/[assetId]/update-label/route.ts` | `POST` | No | - | `projectAuth` `userAuth` |
| `src/app/api/assets/[assetId]/variants/[variantId]/route.ts` | `PATCH` | No | - | `projectAuth` `userAuth` |
| `src/app/api/assets/route.ts` | `GET` `POST` | No | - | `projectAuth` `userAuth` |

#### /api/auth

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/auth/register/route.ts` | `POST` | No | - | `prisma` |

#### /api/mutation-batches

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/mutation-batches/[batchId]/revert/route.ts` | `POST` | No | - | `prisma` `userAuth` `revertMutationBatch` |

#### /api/projects（部分走 adapter，部分旁路）

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/projects/[projectId]/ai-create-character/route.ts` | `POST` | Yes | `ai_create_character` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/ai-create-location/route.ts` | `POST` | Yes | `ai_create_location` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/ai-modify-appearance/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/ai-modify-location/route.ts` | `POST` | Yes | `ai_modify_location` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/ai-modify-prop/route.ts` | `POST` | No | - | `prisma` `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/ai-modify-shot-prompt/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/analyze-global/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/analyze-shot-variants/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/analyze/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/assistant/chat/route.ts` | `GET` `PUT` `DELETE` `POST` | No | - | `projectAuth` |
| `src/app/api/projects/[projectId]/character-profile/batch-confirm/route.ts` | `POST` | Yes | `character_profile_batch_confirm` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/character-profile/confirm/route.ts` | `POST` | Yes | `character_profile_confirm` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/character-voice/route.ts` | `PATCH` `POST` | Yes | `patch_character_voice`<br/>`upload_character_voice_audio` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/character/appearance/route.ts` | `POST` `PATCH` `DELETE` | Yes | `create_character_appearance`<br/>`delete_character_appearance`<br/>`update_character_appearance` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/character/confirm-selection/route.ts` | `POST` | Yes | `confirm_character_appearance_selection` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/character/route.ts` | `PATCH` `DELETE` `POST` | Yes | `create_character`<br/>`delete_character`<br/>`update_character` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/cleanup-unselected-images/route.ts` | `POST` | Yes | `cleanup_unselected_images` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/clips/[clipId]/route.ts` | `PATCH` | Yes | `update_clip` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/clips/route.ts` | `POST` | Yes | `clips_build` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/commands/route.ts` | `GET` `POST` | Yes | `list_recent_commands` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/config/route.ts` | `GET` `PATCH` | No | - | `prisma` `projectAuth` |
| `src/app/api/projects/[projectId]/copy-from-global/route.ts` | `POST` | No | - | `projectAuth` `copyFromGlobal` |
| `src/app/api/projects/[projectId]/download-videos/route.ts` | `POST` | No | - | `prisma` `projectAuth` |
| `src/app/api/projects/[projectId]/editor/route.ts` | `GET` `PUT` `DELETE` | Yes | `delete_video_editor_project`<br/>`save_video_editor_project` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/episodes/[episodeId]/route.ts` | `GET` `PATCH` `DELETE` | Yes | `delete_episode`<br/>`update_episode` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/episodes/batch/route.ts` | `POST` | Yes | `batch_create_episodes` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/episodes/route.ts` | `GET` `POST` | Yes | `create_episode` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/episodes/split-by-markers/route.ts` | `POST` | Yes | `split_episodes_by_markers` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/episodes/split/route.ts` | `POST` | Yes | `episode_split_llm` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/generate-character-image/route.ts` | `POST` | Yes | `generate_character_image` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/generate-image/route.ts` | `POST` | Yes | `generate_character_image`<br/>`generate_location_image` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/generate-video/route.ts` | `POST` | Yes | `generate_video` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/insert-panel/route.ts` | `POST` | Yes | `mutate_storyboard` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/lip-sync/route.ts` | `POST` | Yes | `lip_sync` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/location/confirm-selection/route.ts` | `POST` | Yes | `confirm_location_selection` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/location/route.ts` | `DELETE` `POST` `PATCH` | Yes | `create_location`<br/>`delete_location`<br/>`patch_location` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/modify-asset-image/route.ts` | `POST` | Yes | `modify_asset_image` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/modify-storyboard-image/route.ts` | `POST` | No | - | `prisma` `submitTask` `projectAuth` |
| `src/app/api/projects/[projectId]/panel-link/route.ts` | `POST` | Yes | `mutate_storyboard` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/panel-variant/route.ts` | `POST` | Yes | `panel_variant` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/panel/route.ts` | `POST` `DELETE` `PATCH` `PUT` | Yes | `mutate_storyboard` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/panel/select-candidate/route.ts` | `POST` | Yes | `mutate_storyboard` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/photography-plan/route.ts` | `PUT` | No | - | `prisma` `projectAuth` |
| `src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts` | `POST` | No | - | `projectAuth` `approvePlan` |
| `src/app/api/projects/[projectId]/plans/[planId]/reject/route.ts` | `POST` | No | - | `projectAuth` `rejectPlan` |
| `src/app/api/projects/[projectId]/reference-to-character/route.ts` | `POST` | Yes | `reference_to_character` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/regenerate-group/route.ts` | `POST` | No | - | `prisma` `submitTask` `projectAuth` |
| `src/app/api/projects/[projectId]/regenerate-panel-image/route.ts` | `POST` | Yes | `regenerate_panel_image` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/regenerate-single-image/route.ts` | `POST` | No | - | `submitTask` `projectAuth` |
| `src/app/api/projects/[projectId]/regenerate-storyboard-text/route.ts` | `POST` | No | - | `submitTask` `projectAuth` |
| `src/app/api/projects/[projectId]/route.ts` | `GET` `PATCH` `DELETE` | No | - | `prisma` `userAuth` |
| `src/app/api/projects/[projectId]/screenplay-conversion/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/script-to-storyboard-stream/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/select-character-image/route.ts` | `POST` | Yes | `select_asset_render` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/select-location-image/route.ts` | `POST` | Yes | `select_asset_render` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/speaker-voice/route.ts` | `GET` `PATCH` | Yes | `set_speaker_voice` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/story-to-script-stream/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/storyboard-group/route.ts` | `POST` `PUT` `DELETE` | Yes | `create_storyboard_group`<br/>`delete_storyboard_group`<br/>`move_storyboard_group` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/storyboards/route.ts` | `GET` `PATCH` | Yes | `clear_storyboard_error` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/undo-regenerate/route.ts` | `POST` | Yes | `revert_asset_render` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/update-appearance/route.ts` | `POST` | Yes | `update_character_appearance_description` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/update-asset-label/route.ts` | `POST` | Yes | `update_asset_render_label` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/update-location/route.ts` | `POST` | Yes | `update_location_image_description` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/update-prompt/route.ts` | `POST` | Yes | `update_shot_prompt` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/upload-asset-image/route.ts` | `POST` | Yes | `upload_asset_image` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/video-urls/route.ts` | `POST` | No | - | `prisma` `projectAuth` |
| `src/app/api/projects/[projectId]/voice-analyze/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `projectAuth` |
| `src/app/api/projects/[projectId]/voice-design/route.ts` | `POST` | Yes | `voice_design` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/voice-generate/route.ts` | `POST` | Yes | `voice_generate` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/[projectId]/voice-lines/route.ts` | `GET` `POST` `PATCH` `DELETE` | Yes | `bulk_update_speaker_voice_preset`<br/>`create_voice_line`<br/>`delete_voice_line`<br/>`update_voice_line` | `executeProjectAgentOperationFromApi` |
| `src/app/api/projects/route.ts` | `GET` `POST` | No | - | `prisma` `userAuth` |

#### /api/runs

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/runs/[runId]/cancel/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/runs/[runId]/steps/[stepKey]/retry/route.ts` | `POST` | No | - | `submitTask` `userAuth` |
| `src/app/api/runs/route.ts` | `GET` `POST` | No | - | `userAuth` |

#### /api/task-target-states

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/task-target-states/route.ts` | `POST` | No | - | `prisma` `projectAuth` `userAuth` |

#### /api/tasks

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/tasks/[taskId]/route.ts` | `GET` `DELETE` | No | - | `userAuth` |
| `src/app/api/tasks/dismiss/route.ts` | `POST` | No | - | `userAuth` |

#### /api/user

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/user/ai-story-expand/route.ts` | `POST` | No | - | `maybeSubmitLLMTask` `userAuth` |
| `src/app/api/user/api-config/assistant/probe-media-template/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/user/api-config/assistant/validate-media-template/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/user/api-config/probe-model-llm-protocol/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/user/api-config/route.ts` | `GET` `PUT` | No | - | `prisma` `userAuth` |
| `src/app/api/user/api-config/test-connection/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/user/api-config/test-provider/route.ts` | `POST` | No | - | `userAuth` |
| `src/app/api/user/assistant/chat/route.ts` | `POST` | No | - | `userAuth` |

#### /api/user-preference

| Route file | Methods | Via operation adapter | operationId(s) | Notes (heuristic) |
|---|---|---|---|---|
| `src/app/api/user-preference/route.ts` | `GET` `PATCH` | No | - | `prisma` `userAuth` |

---

## 4. Mapping: Route -> Operation -> Tool（写入口链路映射）

### 4.1 对齐路径（已走 operation adapter 的 mutation routes）

对齐链路应为：**route -> `executeProjectAgentOperationFromApi` -> operation registry -> operation.execute**  
并且 tool 暴露应为：**assistant runtime 从 registry 组装 tool（tool 名=operationId） -> `executeProjectAgentOperationFromTool` -> operation.execute**

下面表格列出 **47 个已走 adapter 的 mutation route files**（可验收）：

| Route file | Methods | OperationId(s) | Tool name(s) | Operation defined in |
|---|---|---|---|---|
| `src/app/api/projects/[projectId]/ai-create-character/route.ts` | `POST` | `ai_create_character` | `ai_create_character` | `ai_create_character`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/ai-create-location/route.ts` | `POST` | `ai_create_location` | `ai_create_location` | `ai_create_location`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/ai-modify-location/route.ts` | `POST` | `ai_modify_location` | `ai_modify_location` | `ai_modify_location`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/character-profile/batch-confirm/route.ts` | `POST` | `character_profile_batch_confirm` | `character_profile_batch_confirm` | `character_profile_batch_confirm`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/character-profile/confirm/route.ts` | `POST` | `character_profile_confirm` | `character_profile_confirm` | `character_profile_confirm`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/character-voice/route.ts` | `PATCH` `POST` | `patch_character_voice`<br/>`upload_character_voice_audio` | `patch_character_voice`<br/>`upload_character_voice_audio` | `patch_character_voice`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`upload_character_voice_audio`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/character/appearance/route.ts` | `POST` `PATCH` `DELETE` | `create_character_appearance`<br/>`delete_character_appearance`<br/>`update_character_appearance` | `create_character_appearance`<br/>`delete_character_appearance`<br/>`update_character_appearance` | `create_character_appearance`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`delete_character_appearance`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`update_character_appearance`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/character/confirm-selection/route.ts` | `POST` | `confirm_character_appearance_selection` | `confirm_character_appearance_selection` | `confirm_character_appearance_selection`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/character/route.ts` | `PATCH` `DELETE` `POST` | `create_character`<br/>`delete_character`<br/>`update_character` | `create_character`<br/>`delete_character`<br/>`update_character` | `create_character`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`delete_character`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`update_character`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/cleanup-unselected-images/route.ts` | `POST` | `cleanup_unselected_images` | `cleanup_unselected_images` | `cleanup_unselected_images`<br/><small>`src/lib/operations/edit-ops.ts`</small> |
| `src/app/api/projects/[projectId]/clips/[clipId]/route.ts` | `PATCH` | `update_clip` | `update_clip` | `update_clip`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/clips/route.ts` | `POST` | `clips_build` | `clips_build` | `clips_build`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/commands/route.ts` | `GET` `POST` | `list_recent_commands` | `list_recent_commands` | `list_recent_commands`<br/><small>`src/lib/operations/read-ops.ts`</small> |
| `src/app/api/projects/[projectId]/editor/route.ts` | `GET` `PUT` `DELETE` | `delete_video_editor_project`<br/>`save_video_editor_project` | `delete_video_editor_project`<br/>`save_video_editor_project` | `delete_video_editor_project`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`save_video_editor_project`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/episodes/[episodeId]/route.ts` | `GET` `PATCH` `DELETE` | `delete_episode`<br/>`update_episode` | `delete_episode`<br/>`update_episode` | `delete_episode`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`update_episode`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/episodes/batch/route.ts` | `POST` | `batch_create_episodes` | `batch_create_episodes` | `batch_create_episodes`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/episodes/route.ts` | `GET` `POST` | `create_episode` | `create_episode` | `create_episode`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/episodes/split-by-markers/route.ts` | `POST` | `split_episodes_by_markers` | `split_episodes_by_markers` | `split_episodes_by_markers`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/episodes/split/route.ts` | `POST` | `episode_split_llm` | `episode_split_llm` | `episode_split_llm`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/generate-character-image/route.ts` | `POST` | `generate_character_image` | `generate_character_image` | `generate_character_image`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/generate-image/route.ts` | `POST` | `generate_character_image`<br/>`generate_location_image` | `generate_character_image`<br/>`generate_location_image` | `generate_character_image`<br/><small>`src/lib/operations/project-agent.ts`</small><br/>`generate_location_image`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/generate-video/route.ts` | `POST` | `generate_video` | `generate_video` | `generate_video`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/insert-panel/route.ts` | `POST` | `mutate_storyboard` | `mutate_storyboard` | `mutate_storyboard`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/lip-sync/route.ts` | `POST` | `lip_sync` | `lip_sync` | `lip_sync`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/location/confirm-selection/route.ts` | `POST` | `confirm_location_selection` | `confirm_location_selection` | `confirm_location_selection`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/location/route.ts` | `DELETE` `POST` `PATCH` | `create_location`<br/>`delete_location`<br/>`patch_location` | `create_location`<br/>`delete_location`<br/>`patch_location` | `create_location`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`delete_location`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`patch_location`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/modify-asset-image/route.ts` | `POST` | `modify_asset_image` | `modify_asset_image` | `modify_asset_image`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/panel-link/route.ts` | `POST` | `mutate_storyboard` | `mutate_storyboard` | `mutate_storyboard`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/panel-variant/route.ts` | `POST` | `panel_variant` | `panel_variant` | `panel_variant`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/panel/route.ts` | `POST` `DELETE` `PATCH` `PUT` | `mutate_storyboard` | `mutate_storyboard` | `mutate_storyboard`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/panel/select-candidate/route.ts` | `POST` | `mutate_storyboard` | `mutate_storyboard` | `mutate_storyboard`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/reference-to-character/route.ts` | `POST` | `reference_to_character` | `reference_to_character` | `reference_to_character`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/regenerate-panel-image/route.ts` | `POST` | `regenerate_panel_image` | `regenerate_panel_image` | `regenerate_panel_image`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/select-character-image/route.ts` | `POST` | `select_asset_render` | `select_asset_render` | `select_asset_render`<br/><small>`src/lib/operations/edit-ops.ts`</small> |
| `src/app/api/projects/[projectId]/select-location-image/route.ts` | `POST` | `select_asset_render` | `select_asset_render` | `select_asset_render`<br/><small>`src/lib/operations/edit-ops.ts`</small> |
| `src/app/api/projects/[projectId]/speaker-voice/route.ts` | `GET` `PATCH` | `set_speaker_voice` | `set_speaker_voice` | `set_speaker_voice`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/storyboard-group/route.ts` | `POST` `PUT` `DELETE` | `create_storyboard_group`<br/>`delete_storyboard_group`<br/>`move_storyboard_group` | `create_storyboard_group`<br/>`delete_storyboard_group`<br/>`move_storyboard_group` | `create_storyboard_group`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`delete_storyboard_group`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`move_storyboard_group`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/storyboards/route.ts` | `GET` `PATCH` | `clear_storyboard_error` | `clear_storyboard_error` | `clear_storyboard_error`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/undo-regenerate/route.ts` | `POST` | `revert_asset_render` | `revert_asset_render` | `revert_asset_render`<br/><small>`src/lib/operations/gui-ops.ts`</small> |
| `src/app/api/projects/[projectId]/update-appearance/route.ts` | `POST` | `update_character_appearance_description` | `update_character_appearance_description` | `update_character_appearance_description`<br/><small>`src/lib/operations/edit-ops.ts`</small> |
| `src/app/api/projects/[projectId]/update-asset-label/route.ts` | `POST` | `update_asset_render_label` | `update_asset_render_label` | `update_asset_render_label`<br/><small>`src/lib/operations/edit-ops.ts`</small> |
| `src/app/api/projects/[projectId]/update-location/route.ts` | `POST` | `update_location_image_description` | `update_location_image_description` | `update_location_image_description`<br/><small>`src/lib/operations/edit-ops.ts`</small> |
| `src/app/api/projects/[projectId]/update-prompt/route.ts` | `POST` | `update_shot_prompt` | `update_shot_prompt` | `update_shot_prompt`<br/><small>`src/lib/operations/edit-ops.ts`</small> |
| `src/app/api/projects/[projectId]/upload-asset-image/route.ts` | `POST` | `upload_asset_image` | `upload_asset_image` | `upload_asset_image`<br/><small>`src/lib/operations/extra-ops.ts`</small> |
| `src/app/api/projects/[projectId]/voice-design/route.ts` | `POST` | `voice_design` | `voice_design` | `voice_design`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/voice-generate/route.ts` | `POST` | `voice_generate` | `voice_generate` | `voice_generate`<br/><small>`src/lib/operations/project-agent.ts`</small> |
| `src/app/api/projects/[projectId]/voice-lines/route.ts` | `GET` `POST` `PATCH` `DELETE` | `bulk_update_speaker_voice_preset`<br/>`create_voice_line`<br/>`delete_voice_line`<br/>`update_voice_line` | `bulk_update_speaker_voice_preset`<br/>`create_voice_line`<br/>`delete_voice_line`<br/>`update_voice_line` | `bulk_update_speaker_voice_preset`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`create_voice_line`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`delete_voice_line`<br/><small>`src/lib/operations/gui-ops.ts`</small><br/>`update_voice_line`<br/><small>`src/lib/operations/gui-ops.ts`</small> |

### 4.2 未对齐路径（route 无法映射到 tool）

所有 **未走 operation adapter 的 mutation routes** 默认无法被 project-agent assistant tools 调用（因为 project-agent runtime 只暴露 registry 内 operationId 为 tools）。

典型“人工可编辑动作但未 operation 化”的 routes（不完整，完整清单见第 3 节表格）：

- Project CRUD / Config：
  - `src/app/api/projects/route.ts`（`POST` 创建项目，直接 `prisma`）
  - `src/app/api/projects/[projectId]/route.ts`（`PATCH`/`DELETE` 更新/删除项目，直接 `prisma` + 存储/voice 清理）
  - `src/app/api/projects/[projectId]/config/route.ts`（`PATCH` 更新项目模型/能力配置，直接 `prisma`）
- Workflow Plan 审批：
  - `src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts`（`POST` 旁路 `approve_plan`）
  - `src/app/api/projects/[projectId]/plans/[planId]/reject/route.ts`（`POST` 旁路 `reject_plan`）
- Undo / Revert：
  - `src/app/api/mutation-batches/[batchId]/revert/route.ts`（`POST` 旁路 `revert_mutation_batch`）
- Regenerate / Modify：
  - `src/app/api/projects/[projectId]/regenerate-group/route.ts`（`POST` 直接 `submitTask`）
  - `src/app/api/projects/[projectId]/regenerate-single-image/route.ts`（`POST` 直接 `submitTask`）
  - `src/app/api/projects/[projectId]/regenerate-storyboard-text/route.ts`（`POST` 直接 `submitTask`）
  - `src/app/api/projects/[projectId]/modify-storyboard-image/route.ts`（`POST` 直接 `prisma` + `submitTask` + billing payload 组装）
- Asset Hub 全量旁路：
  - `src/app/api/asset-hub/**`（角色/场景/音色/文件夹 CRUD，多数直接 `prisma`）

---

## 5. Gaps & Risks（差距清单与风险）

按严重程度排序（Critical -> High -> Medium -> Low）。

### 5.1 Critical

1) **Plan approve/reject 双轨实现，旁路 operation sideEffects/confirmation**
   - Route：
     - `src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts`（`POST`）
     - `src/app/api/projects/[projectId]/plans/[planId]/reject/route.ts`（`POST`）
   - 现状：route 直调 `approveProjectPlan(...)` / `rejectProjectPlan(...)`。
   - 对齐点缺失：
     - operation `approve_plan`（`src/lib/operations/plan-ops.ts`）标注 `billable=true`、`risk=high`、`requiresConfirmation=true`、`longRunning=true`，但 API 写入口不复用该治理语义。

2) **MutationBatch revert 双轨实现，旁路 destructive+confirmation**
   - Route：`src/app/api/mutation-batches/[batchId]/revert/route.ts`（`POST`）
   - Operation：`revert_mutation_batch`（`src/lib/operations/governance-ops.ts`）标注 `risk=high`、`destructive=true`、`requiresConfirmation=true`。
   - 现状：route 直连 `prisma` 查 batch + `revertMutationBatch(...)`，旁路 operation。

3) **项目删除属于典型 destructive 人工动作，但完全未 operation 化**
   - Route：`src/app/api/projects/[projectId]/route.ts`（`DELETE`）
   - 现状：route 内聚合收集 COS keys、清理 voice、批量删除对象等副作用；无统一 operationId、无统一确认 gate、无 mutation-batch 语义（难以统一 undo/审计）。

### 5.2 High

1) **大量 mutation route 仍直连 DB/服务（写操作散落在 route 内）**
   - 统计：未走 operation adapter 的 mutation route files **76** 个，其中启发式识别到直接使用 `prisma` 的至少 **30** 个。
   - 代表性示例：
     - `src/app/api/projects/route.ts`（`POST` 创建项目）
     - `src/app/api/projects/[projectId]/config/route.ts`（`PATCH` 更新模型/能力配置）
     - `src/app/api/asset-hub/characters/route.ts`（`POST` 创建全局角色）
     - `src/app/api/asset-hub/voices/[id]/route.ts`（`PATCH`/`DELETE` 修改/删除全局音色）

2) **“工具最终覆盖所有人工可编辑动作”未满足（跨域：asset-hub/assets/user）**
   - Project Agent tools 仅覆盖 project-agent registry 内的 71 个 operations。
   - `src/app/api/asset-hub/**`、`src/app/api/assets/**`、`src/app/api/user/**` 的写入口无对应 operation registry/tool 暴露，assistant 无法通过 tool 完成这些 GUI/API 写动作。

### 5.3 Medium

1) **sideEffects/confirmation 在 API adapter 路径不生效（语义不统一）**
   - Tool path：`src/lib/adapters/tools/execute-project-agent-operation.ts` 会根据 `sideEffects` 要求 `confirmed=true`。
   - API path：`src/lib/adapters/api/execute-project-agent-operation.ts` 不做 confirmation gate。
   - 影响：即便某个写入口已经“route -> operation”，API 仍可能绕过 `requiresConfirmation` 治理。典型 operationId（均在 API mutation adapter 路径被调用且 `requiresConfirmation=true`）：
     - `mutate_storyboard`、`generate_video`、`delete_voice_line`、`upload_asset_image`、`cleanup_unselected_images` 等（完整列表见 Summary）。

2) **缺失 operation：若这些属于 GUI 动作，则需要补 operation 才能 tool 覆盖**
   - 例如（当前为 mutation routes 且不走 adapter）：
     - `src/app/api/projects/[projectId]/regenerate-group/route.ts`
     - `src/app/api/projects/[projectId]/regenerate-single-image/route.ts`
     - `src/app/api/projects/[projectId]/regenerate-storyboard-text/route.ts`
     - `src/app/api/projects/[projectId]/modify-storyboard-image/route.ts`

### 5.4 Low

1) **少量已对齐 route 仍包含 DB lookup / 结果 reshape（可接受但不够“极薄”）**
   - 示例：`src/app/api/projects/[projectId]/panel/route.ts` 在 `DELETE`/`PATCH` 分支中用 `prisma` 查 `storyboardId`，再调用 `mutate_storyboard`。
   - 这类逻辑可进一步下沉到 operation（让 route 只负责 parse input + call adapter）。

---

## 6. Recommendations（收敛路线图建议）

按“先止血、再收敛、最后扩展覆盖面”的优先级建议：

1) **立即收敛双轨实现（Critical）**
   - 将以下 routes 改为统一走 `executeProjectAgentOperationFromApi`：
     - `src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts` -> `operationId: 'approve_plan'`
     - `src/app/api/projects/[projectId]/plans/[planId]/reject/route.ts` -> `operationId: 'reject_plan'`
     - `src/app/api/mutation-batches/[batchId]/revert/route.ts` -> `operationId: 'revert_mutation_batch'`
   - 这样可以保证：inputSchema/outputSchema/sideEffects 元数据在 API 与 tool 两条路径一致复用，避免同能力双实现漂移。

2) **补齐“人工可编辑动作”的 operation 覆盖（High）**
   - 为当前未 operation 化但属于 UI 写入口的能力新增 operations（命名建议与现有风格一致）：
     - `regenerate_group`、`regenerate_single_image`、`regenerate_storyboard_text`、`modify_storyboard_image`
     - `update_project`、`delete_project`、`update_project_config`、`create_project`（或单独建立 `project-admin`/`project-management` 的 operation registry）
   - 目标：UI 写入口只做 adapter，业务逻辑落到 operation/service 层，assistant tools 也能覆盖。

3) **扩展 operation/tool 体系到 asset-hub / assets / user-config（High）**
   - 选择其一：
     - A) 将这些域的“可编辑动作”纳入同一 operation registry（扩 scope），由不同 assistant runtime 暴露不同子集 tools；
     - B) 为每个域建立独立 registry + api/tool adapters（推荐更清晰），并在各自 assistant runtime 中从 registry 组装 tools。

4) **统一 confirmation 语义（Medium，建议尽快）**
   - 当前 `requiresConfirmation` 仅在 tool adapter 生效；建议至少实现以下之一：
     - 在 `executeProjectAgentOperationFromApi` 中实现与 tool adapter 一致的 confirmation gate（由 UI 传 `confirmed=true` 或通过 header/explicit field 表示已确认）。
     - 或者将 `confirmed` 校验下沉到 operation.execute 内部（从根源避免 adapter 旁路）。

5) **增加自动化 guard（防回归）**
   - 新增或扩展脚本守卫：扫描所有 `POST/PUT/PATCH/DELETE` 的 `src/app/api/**/route.ts`，若属于“人工可编辑动作”域且未调用 operation adapter，则 CI 失败（允许白名单，如 auth/register）。

