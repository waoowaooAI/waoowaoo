# iVibeMovie

iVibeMovie 是面向个人创作者的 AI 短剧创作平台，聚焦“从文本到分镜到时间轴导出”的可控生产链路。

## 产品目标

- 可控：流程状态可追踪，失败可重试，任务可回放。
- 可编辑：脚本、分镜、资产、时间轴均支持局部修改。
- 可量化：用统一指标评估生成质量与系统稳定性。

## Agent Team（9 角色）

- PM/Owner：冻结目标用户、MVP 边界、验收门槛。
- AI Architect：模型路由、置信度、成本/时延预算。
- Prompt/Workflow：模板化 + 参数化 + Schema + Validator。
- Backend：PG 数据层、任务编排、状态机、审计。
- Frontend：创作工作台、局部重生成、对比与回滚。
- QA：功能回归、合约回归、内容质量回归。
- Head Writer：题材与节奏规则、台词规范、连载一致性。
- Storyboard Director：镜头语言与可拍性约束。
- Delivery Captain：节奏控制、风险闸门、发布准入。

## 核心流程（11 Stage）

1. 项目输入与时长约束：描述 + 可选小说 + 时长公式校验。
2. AI 剧集拆分（大纲 -> 分集）。
3. AI 片段拆分（分集 -> 片段）。
4. 统一上下文生成（世界观/关系网/风格约束）。
5. 角色/场景/道具全量提取。
6. 资产生成工作台（上传/重做/重生成）。
7. 角色三视图与场景多视图（4/9/16 宫格）。
8. 分镜脚本（秒级区间 + 台词 + 音效 + 语气）。
9. 分镜图（默认 9 宫格，可替换/重做）。
10. 片段视频（生成/重生成/上传/下载）。
11. 时间轴剪辑与导出（拼接/裁剪/拖动/预览/导出）。

## API v2（当前主链路）

- 项目与拆分：
  - `POST /api/v2/projects`
  - `POST /api/v2/projects/{projectId}/episodes/split`
  - `POST /api/v2/projects/{projectId}/segments/split`
  - `POST /api/v2/projects/{projectId}/context/build`
- 资产：
  - `POST /api/v2/projects/{projectId}/assets/extract`
  - `POST /api/v2/projects/{projectId}/assets/generate`
  - `POST /api/v2/projects/{projectId}/assets/views/generate`
- 分镜：
  - `POST /api/v2/projects/{projectId}/storyboards/generate`
  - `PATCH /api/v2/projects/{projectId}/storyboards/entries/{entryId}`
  - `POST /api/v2/projects/{projectId}/storyboards/entries/{entryId}/regenerate`
  - `POST /api/v2/projects/{projectId}/storyboards/entries/{entryId}/images`
- 视频与时间轴：
  - `POST /api/v2/projects/{projectId}/segments/{segmentId}/video`
  - `GET /api/v2/projects/{projectId}/segments/{segmentId}/video/download`
  - `GET|PATCH /api/v2/projects/{projectId}/timeline`
  - `POST|GET /api/v2/projects/{projectId}/timeline/export`
  - `POST /api/v2/projects/{projectId}/exports`
- 运维：
  - `GET /api/ops/queue/summary`

## 技术架构

- Framework：Next.js 15 + React 19
- UI：shadcn/ui + Tailwind CSS
- Database：PostgreSQL + Prisma
- Queue：PostgreSQL 队列兼容层（替代 Redis/BullMQ）
- Event：`task_event` 持久化 + SSE 回放/轮询
- Auth：NextAuth

## 重构约束（强制）

- 不保留旧接口兼容层。
- 不迁移历史 MySQL 数据。
- 移除 Redis、BullMQ、bull-board、3010 端口监控服务。
- 数据命名统一 `snake_case`。
- 数据库表与字段需中文注释（迁移脚本层落实）。
- 错误处理遵循“显式失败、零隐式回退”。

## 快速开始

### 环境要求

- Node.js >= 18.18
- npm >= 9
- 可访问 PostgreSQL 实例

### 安装

```bash
npm install
```

### 环境变量

参考 `.env.example`，最少配置：

```bash
DATABASE_URL=postgresql://postgres:***@<host>:<port>/ivibemovie?schema=public
PG_BOSS_SCHEMA=pgboss
```

### 初始化数据库

```bash
npx prisma db push --skip-generate
npx prisma generate
```

### 启动开发

```bash
npm run dev
```

默认地址：`http://localhost:3533`

## 测试与验收

### 核心回归（建议）

```bash
npx vitest run \
  tests/integration/api/contract/v2-project-create.test.ts \
  tests/integration/api/contract/v2-split-chain-routes.test.ts \
  tests/integration/api/contract/v2-assets-routes.test.ts \
  tests/integration/api/contract/v2-storyboard-routes.test.ts \
  tests/integration/api/contract/v2-storyboard-images-route.test.ts \
  tests/integration/api/contract/v2-segment-video-routes.test.ts \
  tests/integration/api/contract/v2-timeline-route.test.ts \
  tests/integration/api/contract/v2-timeline-export-route.test.ts \
  tests/integration/api/contract/v2-exports-route.test.ts
```

### 构建验证

```bash
npm run build
```

### 发布门槛

- 结构化输出合规率 >= 95%
- 核心流程成功率 >= 90%
- 任务恢复成功率 >= 99%

## 文档索引

- `docs/ivibemovie-prd-v1.md`
- `docs/ivibemovie-api-v2-contract.md`
- `docs/ivibemovie-task-state-machine.md`
- `docs/ivibemovie-refactor-task-backlog.md`

## License

MIT
