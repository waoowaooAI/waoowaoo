# Agent Delivery Progress

开始时间：2026-04-19T06:08:42.480Z  
目标摘要：端到端补齐 Project Agent（Workspace Assistant）P0 关键能力与未完成任务，完善测试与文档，并拆分多次提交。  
范围假设：
- 仓库内未发现 `AGENTS.md`，将按实际代码与现有 docs 继续推进并在文档中注明缺失。
- 仅聚焦 project-agent 相关 runtime/adapters/operations/routes/tests/docs 与必要的前端渲染补齐。
- 不新增外部依赖、不重写历史、不做大规模目录迁移。
验收标准（DoD）：
- `npm run typecheck` 通过。
- agent 相关改动均有对应测试覆盖（runtime/adapters/route contract）。
- 自适应停止 + cap=999 实现且达到上限有显式提示。
- tool 错误以结构化结果返回，confirmed gate 强制且具备预算元信息预留。
- docs/agent_* 与代码事实一致。
- 进度记录含命令与结果摘要。

## 未完成功能清单（来自 docs/agent_task.md）

| id | 描述 | 涉及模块 | 风险 | 需要的测试层级 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P8 | 项目阶段推导 `resolveProjectPhase` 细化 | `src/lib/project-agent/project-phase.ts` | 中 | unit | 部分完成 |
| P9 | Act Mode 直接操作 tools 覆盖收口 | `src/lib/operations/*` | 高 | unit/integration(api) | 部分完成 |
| P11 | Prompt 升级与 Act/Plan 分流规则补齐 | `src/lib/project-agent/runtime.ts` | 中 | unit | 部分完成 |
| P12 | Lite / Full Context 拆分 | `src/lib/project-context/*` `src/lib/project-projection/*` | 中 | unit | 未开始 |
| P13 | Act Mode 富渲染组件补齐 | `src/features/project-workspace/components/workspace-assistant/*` | 中 | unit(component) | 部分完成 |
| P14 | Workspace 与 Assistant 状态统一 | `src/lib/query/hooks/*` `src/features/project-workspace/*` | 中 | integration(api)/unit | 部分完成 |
| P15 | 抽象收口与精简 | `src/lib/command-center/*` `src/lib/project-context/*` | 中 | unit | 进行中 |
| P16 | operation registry 收敛 | `src/lib/operations/registry.ts` | 低 | unit | 进行中 |
| P17 | agent 代码量削减与目录收敛 | `src/lib/project-agent/*` | 中 | unit | 进行中 |
| P18 | Project Projection（snapshot/projection）补全 | `src/lib/project-projection/*` | 中 | unit | 部分完成 |
| P19 | mutation batch 与撤回（undo）收口 | `src/lib/mutation-batch/*` `src/lib/operations/governance-ops.ts` | 中 | unit/integration(api) | 部分完成 |
| P20 | sideEffects 驱动的审批分流完善 | `src/lib/operations/types.ts` `src/lib/adapters/*` | 中 | unit | 部分完成 |
| P21 | Saved Skills（沉淀/重做）完善 | `src/lib/saved-skills/*` | 低 | unit | 部分完成 |

## 里程碑进度

- [x] 基线检查与计划落地
  - 状态：done
  - 涉及文件：`docs/agent_delivery_progress.md`
  - 测试覆盖点：N/A
  - 命令与结果摘要：
    - `npm run lint:all` -> 失败（eslint 未安装）
    - `npm run typecheck` -> 失败（缺少依赖与类型：`process`/`undici`）
    - `npm run test:all` -> 失败（`cross-env` 未安装）
    - `npm run build` -> 失败（`prisma` 未安装）

- [x] Runtime：自适应停止 + cap=999
  - 状态：done
  - 涉及文件：`src/lib/project-agent/runtime.ts` `src/lib/project-agent/types.ts` `src/lib/project-agent/stop-conditions.ts` `src/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers.tsx`
  - 测试覆盖点：`tests/unit/project-agent/stop-conditions.test.ts` 覆盖 stop cap
  - 命令与结果摘要：待执行

- [x] Tool adapter：结构化错误 + confirmed gate 预算预留
  - 状态：done
  - 涉及文件：`src/lib/adapters/tools/execute-project-agent-operation.ts` `src/lib/operations/types.ts`
  - 测试覆盖点：`tests/unit/project-agent/tool-adapter.test.ts` 覆盖 input/output schema、confirmed gate、结构化错误
  - 命令与结果摘要：待执行
    - 代码修正：toMessage 使用 trim 兜底（code review 跟进）

- [x] Tests：agent runtime / adapter / route contract / registry
  - 状态：done
  - 涉及文件：`tests/unit/project-agent/*` `tests/unit/operations/*` `tests/integration/api/contract/*`
  - 测试覆盖点：cap stop、adapter error/confirmation、route contract
  - 命令与结果摘要：
    - `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/project-agent tests/unit/operations/registry.test.ts tests/unit/components/workspace-assistant-message-parts.test.tsx` -> 失败（`vitest/config` 缺失）

- [x] Docs：对齐 agent_* 文档与代码事实
  - 状态：done
  - 涉及文件：`docs/agent_design.md` `docs/agent_design_analysis.md` `docs/agent_handoff_report.md` `docs/agent_task.md`
  - 测试覆盖点：N/A
  - 命令与结果摘要：N/A

- [ ] 验证：typecheck + agent 相关测试/回归
  - 状态：doing
  - 涉及文件：N/A
  - 测试覆盖点：`npm run typecheck` + 相关 test suites
  - 命令与结果摘要：
    - `npm install` -> 失败（npm: Exit handler never called）
    - `npm install --no-audit --no-fund` -> 失败（npm: Exit handler never called）
    - `npm run typecheck` -> 失败（缺少 `@types/node`/`undici`）
    - `npm run lint:all` -> 失败（eslint 未安装）
    - `npm run build` -> 失败（prisma 未安装）
    - `npm run test:regression:cases` -> 失败（`cross-env` 未安装）
