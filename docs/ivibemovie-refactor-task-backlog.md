# iVibeMovie 重构任务总清单（48 项）

> 状态：`completed`  
> 原则：无旧接口兼容、PostgreSQL 直切、移除 Redis/BullMQ/3010、MVP 含时间轴剪辑导出。

## Phase 0：项目治理与规格冻结（1-2 周）

| ID | 角色 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T001 | PM | 冻结 MVP 范围与 out-of-scope 清单 | - | PRD v1 发布并评审通过 |
| T002 | PM | 定义首发 Persona（个人创作者）任务流 | T001 | 核心用户旅程图完成 |
| T003 | PM | 制定质量分数卡（爆点/节奏/一致性等） | T001 | 评分维度与阈值可执行 |
| T004 | Delivery Captain | 建立周节奏、风险看板、发布准入模板 | T001 | 每周审查模板落地 |
| T005 | Head Writer | 输出 Story Bible v1（题材库/禁忌库） | T002 | Bible 文档评审通过 |
| T006 | Director | 输出分镜规则与可拍性约束 v1 | T002 | 分镜规则文档评审通过 |
| T007 | Prompt | 定义脚本 JSON Schema v1 | T005 | JSON Schema 可机检 |
| T008 | Prompt | 定义分镜 JSON Schema v1 | T006 | JSON Schema 可机检 |
| T009 | AI Architect | 定义模型路由矩阵（质量/成本/时延） | T007,T008 | 路由矩阵含 fallback 禁止说明 |
| T010 | QA | 设计黄金样本集规范与评分流程 | T003 | 黄金样本规范发布 |

## Phase 1：品牌与配置换骨（并行）

| ID | 角色 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T011 | Frontend | 品牌词 `ivibemovie` 全量替换为 `iVibeMovie` | T001 | 全仓 `rg ivibemovie` 结果为 0（排除历史文档） |
| T012 | Frontend | 品牌色 token（#FFB103→#FF9500）落地 | T011 | 全局 CSS token 生效 |
| T013 | Frontend | Logo SVG 小改并接入站点资源 | T011 | 新 logo 在 header/favicon 生效 |
| T014 | PM | README 重写（定位、架构、启动、贡献） | T011 | README 全量替换完成 |
| T015 | Backend | `.env/.env.example` 切 PG 参数与命名 | T011 | 无 REDIS/BULL_BOARD 变量 |
| T016 | Backend | `docker-compose.yml` 移除 Redis/3010 | T015 | compose 仅保留 app(+可选 pg) |
| T017 | Backend | Dockerfile 移除 3010 暴露端口 | T016 | 仅 EXPOSE 3533 |
| T018 | QA | 配置变更回归（本地启动） | T016,T017 | `npm run dev/start` 正常 |

## Phase 2：数据库迁移到 PostgreSQL（重建）

| ID | 角色 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T019 | Backend | Prisma datasource provider 改 `postgresql` | T015 | `prisma validate` 通过 |
| T020 | Backend | 统一 snake_case 映射策略（@map/@@map） | T019 | 新增模型命名规范文档 |
| T021 | Backend | 关键业务表中文注释 SQL 迁移脚本（第一批） | T019 | `COMMENT ON` 可执行且覆盖 |
| T022 | Backend | 关键业务表中文注释 SQL 迁移脚本（第二批） | T021 | 覆盖全部核心表字段 |
| T023 | Backend | 清理 MySQL 相关依赖与配置 | T019 | `mysql2` 不再被业务代码引用 |
| T024 | QA | PG 建库 + schema push + 冒烟测试 | T019,T023 | 新库可完成 CRUD |
| T025 | QA | 测试基础设施改 PG（docker-compose.test） | T024 | 自动化测试可启动 |

## Phase 3：队列系统替换（Redis/BullMQ -> PostgreSQL）

| ID | 角色 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T026 | Backend | 引入 `pg-boss` 兼容层（替代 bullmq API） | T019 | `Queue/Worker/Job` 适配可运行 |
| T027 | Backend | `task/queues.ts` 切换到 PG 队列命名 | T026 | 入队成功并可消费 |
| T028 | Backend | 4 类 worker 去 Redis 连接依赖 | T026 | worker 能启动并处理任务 |
| T029 | Backend | watchdog/reconcile 去 Redis 假设 | T028 | 卡死任务仍可恢复 |
| T030 | Backend | `scripts/bull-board.ts` 下线并移除脚本 | T027 | 无 3010 相关脚本 |
| T031 | Backend | 队列监控 API `/api/ops/queue/summary` | T027 | 返回积压/失败/吞吐指标 |
| T032 | Frontend | 内置运维页接入队列监控 API | T031 | 可视化查看队列健康 |
| T033 | QA | 队列恢复/重试/取消回归用例 | T028,T029 | 通过并产出报告 |

## Phase 4：实时事件链路替换（Redis PubSub -> DB 事件流）

| ID | 角色 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T034 | Backend | task publisher 改为 DB 持久事件 | T019 | task_event 写入稳定 |
| T035 | Backend | run publisher 去 Redis 发布逻辑 | T034 | run event 正常写入 |
| T036 | Backend | SSE route 改“重放 + 增量轮询”模式 | T034 | 前端状态流实时更新 |
| T037 | Backend | 移除/替换 shared-subscriber Redis 组件 | T036 | 无 Redis 依赖编译通过 |
| T038 | QA | SSE 断线重连与回放一致性测试 | T036 | 无丢事件/乱序问题 |

## Phase 5：接口契约 v2 与流程闭环

| ID | 角色 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T039 | Backend | 定义并落地 v2 错误模型（code/message/details/request_id） | T001 | 全新路由返回一致 |
| T040 | Backend | 新建项目 + 时长公式校验接口 | T039 | 不合法输入显式失败 |
| T041 | Backend | 拆分链路接口（剧集/片段/统一上下文） | T039 | 链路可串联执行 |
| T042 | Backend | 资产生成/重生成/重做接口统一化 | T041 | 角色/场景/道具一致 |
| T043 | Backend | 分镜编辑/重生成接口（按秒区间） | T041 | 分镜可局部改写 |
| T044 | Backend | 视频片段生成与下载接口 | T042,T043 | 片段可重复生成 |
| T045 | Frontend | 时间轴剪辑（拖拽/裁剪/预览/导出） | T044 | MVP 剪辑闭环可用 |
| T046 | Frontend | 约束可视化（节奏/钩子/字数提示） | T007,T008 | 规则提示稳定触发 |

## Phase 6：质量闭环与发布

| ID | 角色 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|
| T047 | QA | 功能 + 合约 + 稳定 + 内容四维回归 | T045,T046 | 回归报告完整 |
| T048 | Delivery Captain | 发布评审、上线 checklist、回滚预案 | T047 | 准入门槛全部达标 |

---

## 发布门槛（硬条件）

1. 结构化输出合规率 >= 95%。
2. 核心流程成功率 >= 90%。
3. 任务恢复成功率 >= 99%。
4. 无 Redis/BullMQ/3010 残留依赖。
5. 无 `ivibemovie` 品牌标识残留（历史归档除外）。

## 当前执行状态

- 已完成：任务系统 35/35（completed 35，in_progress 0，pending 0）。
- 发布门槛验证：已完成（结构化契约回归通过、核心流程回归通过、构建通过）。
- 阻塞项：无。
