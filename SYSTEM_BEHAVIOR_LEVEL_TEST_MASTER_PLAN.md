你必须按照目前的md文件详细执行我们的代码修改计划，且必须时刻关注，维护本次md文档，确保该文档能始终保持最新，和我们代码库保持完全一致，除非用户要求，否则默认禁止打补丁，禁止兼容层，我们需要的是简洁干净可扩展的系统，我们这个系统目前没有人用，可以一次性全量，彻底，不留遗留的修改，并且需要一次性完成所有，禁止停下，禁止自己停止任务，一次性完成所有内容。

# 全系统真实行为级测试替换执行主计划
版本: v1.0  
仓库: /Users/earth/Desktop/waoowaoo  
最后更新: 2026-02-25  
定位: 用真实“行为结果断言”替换结构级/字符串级测试，覆盖全系统功能回归链路  

---

## 1: 项目目标

### 1.1 为什么要做
当前系统历史回归集中在“链路行为错了但结构没变”的问题：
- 编辑角色/场景后字段未正确回写。
- 上传参考图后没有按参考图生成。
- 三视图后缀、locale、meta、referenceImages 在 route -> task -> worker 过程中丢失。
- 前端状态看起来正常，但真实任务状态或写库结果错误。

现有部分测试仍是结构级（例如检查源码里是否包含 `apiHandler`、`submitTask`、`maybeSubmitLLMTask`，或者仅检查 `TASK_TYPE -> queue` 映射），这类测试无法拦截真实业务回归。

### 1.2 需要达到的目标
把测试体系升级为“行为级为主、结构级为辅”：
- 每个关键功能都必须有“输入 -> 执行 -> 输出/副作用”的断言。
- 断言必须检查具体值（写入字段值、payload 值、response 值），不接受只断言“被调用了”。
- route、task type、worker handler 三层都要有行为级覆盖矩阵。
- 外部 API 全 fake，不走真实高成本调用。

### 1.3 本次扫描结论（基于当前仓库）
- API 路由文件覆盖面: `src/app/api/**/route.ts`（全量 catalog 已维护）。
- Worker 文件覆盖面: `src/lib/workers/handlers/*.ts` + `src/lib/workers/*.worker.ts`。
- `tests/**/*.test.ts` 实际数量: `71`。
- `src/lib/workers/handlers/*.ts` 文件数量: `43`（含 helper/shared/re-export 文件）。
- `handlers` 目录中 `export async function handle...` 入口函数数量: `26`（这是 worker 行为测试的主覆盖对象）。
- 计数口径说明:
  - helper/shared/prompt-utils 文件不计入“handler 入口数”。
  - 仅 re-export 的别名文件（如 `modify-asset-image-task-handler.ts`、`image-task-handlers.ts`）不单独计入口径。
- 已有结构级测试（需替换/下沉，已替换项会在阶段状态中标记）：
  - `tests/integration/api/contract/direct-submit-routes.test.ts`
  - `tests/integration/api/contract/llm-observe-routes.test.ts`
  - `tests/integration/api/contract/crud-routes.test.ts`
  - `tests/integration/api/contract/task-infra-routes.test.ts`
  - `tests/integration/chain/{text,image,video,voice}.chain.test.ts`
  - `tests/unit/worker/video-worker.test.ts`（已替换为行为断言）
  - `tests/unit/worker/voice-worker.test.ts`（已替换为行为断言）
  - `tests/unit/optimistic/sse-invalidation.test.ts`（已替换为行为断言）
  - `tests/unit/optimistic/task-target-state-map.test.ts`（已替换为行为断言）
- 已落地的行为级样板（保留并扩展）：
  - `tests/unit/worker/reference-to-character.test.ts`
  - `tests/unit/worker/asset-hub-image-suffix.test.ts`
  - `tests/unit/worker/modify-image-reference-description.test.ts`
  - `tests/integration/api/specific/characters-post-reference-forwarding.test.ts`
  - `tests/contracts/requirements-matrix.test.ts`

### 1.4 修改前后的预计区别
修改前：
- 大量“永远绿灯”风险：结构级测试通过但真实业务错误。
- 关键回归（参考图链路、提示词后缀、写回字段）无法稳定拦截。

修改后：
- 结构级测试只做守卫，不作为回归主防线。
- 行为级测试覆盖 route 入参、task payload、worker 分支、DB 写回、返回值契约。
- 新增或修改功能时，必须补行为级用例，否则 guard 失败。

### 1.5 规模预估
- 预计新增/重写测试文件: 45-70 个
- 预计修改文件: 25-40 个
- 预计新增代码: 9,000-16,000 行（以测试与守卫脚本为主）
- 预计执行阶段: 8 个阶段

---

## 2: 阶段+具体代码修改地方以及需要修改的内容

### 状态图例
✅ 已完成  
🔄 正在执行  
⏸ 待执行  
⚠️ 问题

---

### 阶段1: 基线与约束固化

✅ Phase 1.1: 盘点路由、task type、worker 入口并建立 catalog。  
修改位置:
- `/Users/earth/Desktop/waoowaoo/tests/contracts/route-catalog.ts`
- `/Users/earth/Desktop/waoowaoo/tests/contracts/task-type-catalog.ts`

✅ Phase 1.2: requirements matrix 存在性校验落地，阻断“文档写了但文件不存在”。  
修改位置:
- `/Users/earth/Desktop/waoowaoo/tests/contracts/requirements-matrix.ts`
- `/Users/earth/Desktop/waoowaoo/tests/contracts/requirements-matrix.test.ts`

✅ Phase 1.3: 定义“行为级测试判定标准”并加入守卫。  
要改内容:
- 新增 `/Users/earth/Desktop/waoowaoo/tests/contracts/behavior-test-standard.md`
- 新增 `/Users/earth/Desktop/waoowaoo/scripts/guards/test-behavior-quality-guard.mjs`
硬性规则:
- 禁止只断言 `toHaveBeenCalled()`
- 必须断言具体 payload/data 字段值或返回值
- 禁止在 contract/chain 目录内读取源码文本做契约主断言

✅ Phase 1.3.a: 后端 Worker 单元测试硬规范已写入本主计划（本文件第 3 章）。  
当前状态:
- 规范文本已固化
- 自动化守卫脚本已落地（Phase 1.3 完成）

⚠️ Phase 1.4: 历史结构级测试较多，改造期间可能出现“同名文件语义变化”导致误解。  
处理策略:
- 每次改造完成后，在本文件执行日志记录“此文件已由结构级改为行为级”。

---

### 阶段2: API 契约从结构级替换为行为级

依赖关系:
- Phase 2 可先行推进（route 行为契约）。
- Phase 3 与 Phase 4 依赖 Phase 2 的 route 输入输出基线稳定。

✅ Phase 2.1: 重写 direct-submit contract 为真实调用断言。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/api/contract/direct-submit-routes.test.ts`
必须断言:
- 未登录 401
- 参数缺失 400（错误码一致）
- 正常请求返回 `{ taskId, async: true }`
- `submitTask` 入参包含 `type/targetType/targetId/payload/locale`

✅ Phase 2.2: 重写 llm-observe contract 为真实调用断言。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/api/contract/llm-observe-routes.test.ts`
必须断言:
- `maybeSubmitLLMTask` 入参正确透传
- `displayMode/flow/meta` 不丢失
- 越权请求被拒绝

✅ Phase 2.3: 重写 crud contract 为真实行为断言（已补齐 asset-hub + novel-promotion 写回断言）。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/api/contract/crud-routes.test.ts`
必须断言:
- PATCH 后数据库字段值确实变化
- DELETE 后实体不存在
- 无权限用户无法操作他人资源

✅ Phase 2.4: 重写 task-infra contract 为真实行为断言（已补 SSE 终态事件序列断言）。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/api/contract/task-infra-routes.test.ts`
必须断言:
- dismiss 后任务状态变化
- task-target-state 与任务终态一致
- SSE 事件序列含终态事件

⏸ Phase 2.5: 扩展 route specific 测试，补关键历史回归点。  
新增/扩展:
- `/Users/earth/Desktop/waoowaoo/tests/integration/api/specific/reference-to-character-api.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/integration/api/specific/characters-post-reference-forwarding.test.ts`（已完成，继续扩展）
- `/Users/earth/Desktop/waoowaoo/tests/integration/api/specific/characters-post.test.ts`

---

### 阶段3: Worker 决策测试全量行为化

依赖关系:
- Phase 3 依赖 Phase 2（route 契约稳定后再固化 worker 结果断言）。

✅ Phase 3.1: 关键历史 bug 已有行为级样板落地。  
已完成文件:
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/reference-to-character.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/asset-hub-image-suffix.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/modify-image-reference-description.test.ts`

✅ Phase 3.2: 把“失败快照类”worker 测试升级为“结果断言类”。  
优先重写:
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/image-task-handlers-core.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/script-to-storyboard.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/episode-split.test.ts`
必须断言:
- 具体生成参数（referenceImages/aspectRatio/resolution）
- 具体写库字段值（description/imageUrl/imageUrls/selectedIndex）
- 关键分支（character/location/storyboard）均触发

✅ Phase 3.3: 新增核心 handler 行为测试文件（按模块拆分，已全部落地）。  
新增文件:
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/character-image-task-handler.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/location-image-task-handler.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/panel-image-task-handler.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/panel-variant-task-handler.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/story-to-script.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/screenplay-convert.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/voice-design.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/voice-analyze.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/analyze-novel.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/analyze-global.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/character-profile.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/clips-build.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/asset-hub-ai-design.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/asset-hub-ai-modify.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/llm-proxy.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-tasks.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-variants.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-prompt-appearance.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-prompt-location.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-prompt-shot.test.ts`
当前进度:
- 已完成: `character-image-task-handler`、`location-image-task-handler`、`panel-image-task-handler`、`panel-variant-task-handler`、`story-to-script`、`screenplay-convert`、`voice-design`、`voice-analyze`、`analyze-novel`、`analyze-global`、`character-profile`、`clips-build`、`asset-hub-ai-design`、`asset-hub-ai-modify`、`llm-proxy`、`shot-ai-tasks`、`shot-ai-variants`、`shot-ai-prompt-appearance`、`shot-ai-prompt-location`、`shot-ai-prompt-shot`
- 待完成: 无（Phase 3.3 范围内）

⚠️ Phase 3.3.a: 边界说明（避免误算）。  
不纳入“handler 入口测试清单”的文件:
- `llm-stream.ts`（stream context/callback helper）
- `modify-asset-image-task-handler.ts`（re-export 别名）
- `image-task-handlers.ts`（re-export 聚合）

✅ Phase 3.4: worker 入口层行为测试替换 routing-only 断言。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/video-worker.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/worker/voice-worker.test.ts`
必须断言:
- 任务类型分发到正确 handler
- handler 结果被正确回传与封装
- 失败分支日志与错误码一致

⚠️ Phase 3.5: 避免“mock 自己返回答案”造成假安全。  
硬要求:
- 每个测试至少 1 个断言检查具体字段值（不是调用次数）
- 对 DB update/create 入参做 `objectContaining(data: ...)` 断言

---

### 阶段4: Chain 测试从队列映射升级为端到端行为链路

依赖关系:
- Phase 4 依赖 Phase 2 + Phase 3（先稳定 route 和 handler 行为，再做链路端到端）。

✅ Phase 4.1: 重写 image chain（enqueue + worker 消费 + 持久化写回断言已落地）。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/chain/image.chain.test.ts`
覆盖链路:
- route -> submitTask -> queue -> image worker -> DB 回写
示例断言:
- 任务状态从 queued -> processing -> completed
- 目标实体 imageUrl/imageUrls 有值且结构正确

✅ Phase 4.2: 重写 text chain（enqueue + worker 消费 + 结果级边界断言已落地）。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/chain/text.chain.test.ts`
覆盖链路:
- analyze/story/script/reference-to-character 全链路关键节点

✅ Phase 4.3: 重写 video chain（enqueue + video worker 消费 + lip-sync 持久化断言已落地）。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/chain/video.chain.test.ts`
覆盖链路:
- generate-video/lip-sync 任务执行结果与状态持久化

✅ Phase 4.4: 重写 voice chain（enqueue + voice worker 消费 + 关键参数透传断言已落地）。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/integration/chain/voice.chain.test.ts`
覆盖链路:
- voice-design/voice-generate 的实体写回与任务状态

⏸ Phase 4.5: 固化外部 fake 层，保证零真实外网请求。  
使用/扩展:
- `/Users/earth/Desktop/waoowaoo/tests/helpers/fakes/llm.ts`
- `/Users/earth/Desktop/waoowaoo/tests/helpers/fakes/media.ts`
- `/Users/earth/Desktop/waoowaoo/tests/helpers/fakes/providers.ts`

---

### 阶段5: 前端状态回归测试行为化

✅ Phase 5.1: 替换源码字符串检查为 hook 真实行为测试。  
重写文件:
- `/Users/earth/Desktop/waoowaoo/tests/unit/optimistic/sse-invalidation.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/optimistic/task-target-state-map.test.ts`
必须断言:
- 给定事件序列时 query invalidation 实际触发条件正确
- target state map 在 queued/processing/completed/failed 下输出正确

✅ Phase 5.2: 现有 optimistic mutation 行为测试保留并扩展。  
文件:
- `/Users/earth/Desktop/waoowaoo/tests/unit/optimistic/asset-hub-mutations.test.ts`
- `/Users/earth/Desktop/waoowaoo/tests/unit/optimistic/project-asset-mutations.test.ts`

---

### 阶段6: 覆盖矩阵升级为“行为测试矩阵”

✅ Phase 6.1: 新增 route 行为覆盖矩阵。  
新增:
- `/Users/earth/Desktop/waoowaoo/tests/contracts/route-behavior-matrix.ts`
要求:
- 117 个 route 每个都映射到至少 1 条行为级 caseId + test 文件

✅ Phase 6.2: 新增 task type 行为覆盖矩阵。  
新增:
- `/Users/earth/Desktop/waoowaoo/tests/contracts/tasktype-behavior-matrix.ts`
要求:
- 37 个 TASK_TYPE 每个都映射 worker 行为测试 + chain 行为测试

✅ Phase 6.3: 新增矩阵守卫脚本。  
新增:
- `/Users/earth/Desktop/waoowaoo/scripts/guards/test-behavior-route-coverage-guard.mjs`
- `/Users/earth/Desktop/waoowaoo/scripts/guards/test-behavior-tasktype-coverage-guard.mjs`

⚠️ Phase 6.4: 矩阵维护成本高。  
策略:
- 优先通过脚本自动校验文件存在与 caseId 唯一性
- 每次新增 route/tasktype 必须更新矩阵，否则 CI 失败

---

### 阶段7: CI 门禁与执行策略

✅ Phase 7.1: 新增行为级门禁命令。  
修改:
- `/Users/earth/Desktop/waoowaoo/package.json`
新增脚本:
- `test:behavior:unit`
- `test:behavior:api`
- `test:behavior:chain`
- `test:behavior:guards`
- `test:behavior:full`

⏸ Phase 7.2: PR workflow 强制执行行为级全量门禁。  
修改:
- `/Users/earth/Desktop/waoowaoo/.github/workflows/test-regression-pr.yml`

✅ Phase 7.3: 失败诊断脚本已接入（保留）。  
文件:
- `/Users/earth/Desktop/waoowaoo/scripts/test-regression-runner.sh`

---

### 阶段8: 收口与冻结

⏸ Phase 8.1: 删除/降级旧结构级测试（仅保留轻量守卫，不计入行为覆盖率）。  
目标:
- contract/chain 中不再有“只读源码字符串”的主断言

⏸ Phase 8.2: 建立“新增功能必须附行为测试”的提交流程。  
落地:
- PR 模板加检查项
- guard 失败提示明确指出缺失 case

✅ Phase 8.3: 冻结基线并发布“行为级测试开发规范”。  
新增:
- `/Users/earth/Desktop/waoowaoo/docs/testing/behavior-test-guideline.md`

⚠️ Phase 8.4: 不可达目标声明。  
说明:
- “100% 无 bug”不可证明；可达目标是“100% 关键功能链路行为覆盖 + 关键字段结果断言 + 变更自动门禁”。

---

### 阶段9: Billing 与并发测试纳入总蓝图

🔄 Phase 9.1: billing 现有测试纳入“行为级总体覆盖说明”，避免遗漏域。  
覆盖现状:
- `tests/unit/billing/*.test.ts`
- `tests/integration/billing/*.integration.test.ts`
- `tests/concurrency/billing/ledger.concurrency.test.ts`

⏸ Phase 9.2: 明确 billing worker/ledger 行为级断言增强点。  
新增/重写方向:
- 计费写账一致性（usage->ledger）字段级断言
- 异常重试/幂等行为断言
- 并发写入冲突场景断言

⏸ Phase 9.3: 将 billing 与 concurrency 纳入 `test:behavior:full` 报告维度。  
要求:
- 输出 billing/concurrency 独立通过率
- 与 route/worker/chain 覆盖率同级展示

---

## 3: 后端 Worker 单元测试硬规范（强制）

### 3.1 必须覆盖的测试类型
每个 worker handler 必须至少包含三类用例：
1. 失败路径：参数缺失/格式错误时，抛出正确错误信息。  
2. 成功路径：正常输入时，副作用结果正确（数据库写入/关键调用参数/返回值）。  
3. 关键分支：`if/else` 分支每条至少 1 个用例。  

### 3.2 Mock 规范
必须 Mock：
1. `prisma` 等数据库访问。  
2. LLM/图像生成/视觉分析等 AI 调用。  
3. COS/上传等文件存储。  
4. 外部 HTTP 请求。  
5. 一切需要网络的依赖。  

不能 Mock：
1. 待测业务逻辑函数本身。  
2. 项目内业务常量（例如 `CHARACTER_PROMPT_SUFFIX`），必须直接 import 使用。  

### 3.3 断言规范（最高优先级）
每个 `it()` 必须断言“结果”，不能只断言“过程”。

必须断言：
1. 数据库 `update/create` 的具体字段值（如 `description`、`imageUrl`、`imageUrls`）。  
2. AI/生成函数收到的核心参数（如 `prompt` 必含内容）。  
3. 图像生成相关关键参数（如 `referenceImages`、`aspectRatio`、`resolution`）。  

弱断言限制：
1. `toHaveBeenCalled()` 不能作为唯一主断言。  
2. `toHaveBeenCalledTimes(N)` 仅在“次数本身有业务意义”时使用。  

### 3.4 测试数据规范
1. 数据必须能触发目标分支（例如“有参考图/无参考图”分别建用例）。  
2. 关键业务字段必须使用有语义的固定值。  
3. 无关透传字段可用占位值（如 `task-1`）。  

禁止模式：
1. “自己给答案自己验证”：mock 返回值与断言目标完全同源。  
2. 正确做法：mock AI 返回值，断言该值被写入到 `prisma.update({ data })` 的具体字段。  

### 3.5 it() 结构模板（强制推荐）
```ts
it('[条件] -> [预期结果]', async () => {
  // 1. 准备 mock（仅覆盖本场景差异）
  // 2. 构造 job/payload（只给本场景关键字段）
  // 3. 执行 handler
  // 4. 断言：
  //    a. DB data 字段
  //    b. 核心调用参数（prompt/referenceImages/aspectRatio）
  //    c. 返回值关键字段（如 success）
})
```

### 3.6 命名规范
统一格式：`[条件] -> [预期结果]`  
示例：
1. `没有 extraImageUrls -> 不调用分析，description 不更新`  
2. `有 extraImageUrls -> AI 分析结果写入 description`  
3. `AI 调用失败 -> 主流程成功且 description 不被污染`  
4. `缺少必填参数 -> 抛出包含字段名的错误信息`  

### 3.7 一条 bug 一条测试（强制）
1. 每修复一个 bug，必须新增至少一条对应回归测试。  
2. 测试名必须可追溯该 bug 场景（例如“防止 XXX 回归”）。  
3. 未补测试不得标记该 bug 任务完成。  

---

### 执行日志（必须持续追加）
格式:
- [YYYY-MM-DD HH:mm] 状态变更: <Phase/任务> <旧状态> -> <新状态>
- [YYYY-MM-DD HH:mm] 修改文件: <绝对路径列表>
- [YYYY-MM-DD HH:mm] 运行命令: <命令>
- [YYYY-MM-DD HH:mm] 结果: <通过/失败 + 摘要>
- [YYYY-MM-DD HH:mm] 问题: <若有>

- [2026-02-25 21:59] 状态变更: Phase 3.1 ⏸ -> ✅
- [2026-02-25 21:59] 修改文件: /Users/earth/Desktop/waoowaoo/tests/unit/worker/reference-to-character.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/asset-hub-image-suffix.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/modify-image-reference-description.test.ts, /Users/earth/Desktop/waoowaoo/src/lib/workers/handlers/reference-to-character.ts
- [2026-02-25 21:59] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/reference-to-character.test.ts tests/unit/worker/asset-hub-image-suffix.test.ts tests/unit/worker/modify-image-reference-description.test.ts
- [2026-02-25 21:59] 结果: 关键历史回归点（后缀失效/参考图描述不更新）已行为级可测
- [2026-02-25 21:59] 问题: 无

- [2026-02-25 22:00] 状态变更: Phase 1.2 ⏸ -> ✅
- [2026-02-25 22:00] 修改文件: /Users/earth/Desktop/waoowaoo/tests/contracts/requirements-matrix.ts, /Users/earth/Desktop/waoowaoo/tests/contracts/requirements-matrix.test.ts
- [2026-02-25 22:00] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/contracts/requirements-matrix.test.ts
- [2026-02-25 22:00] 结果: 阻断不存在测试路径引用（已修复 `crud-asset-hub-routes.test.ts` 错误引用）
- [2026-02-25 22:00] 问题: 无

- [2026-02-25 22:10] 状态变更: Phase 1.3.a ⏸ -> ✅
- [2026-02-25 22:10] 修改文件: /Users/earth/Desktop/waoowaoo/SYSTEM_BEHAVIOR_LEVEL_TEST_MASTER_PLAN.md
- [2026-02-25 22:10] 运行命令: 文档更新（无测试执行）
- [2026-02-25 22:10] 结果: 已将后端 Worker 单元测试硬规范（覆盖/Mock/断言/命名/一 bug 一测试）固化为主计划强制章节
- [2026-02-25 22:10] 问题: 自动化守卫脚本仍待实现（Phase 1.3）

- [2026-02-25 22:20] 状态变更: 文档校正（扫描计数与范围修正）
- [2026-02-25 22:20] 修改文件: /Users/earth/Desktop/waoowaoo/SYSTEM_BEHAVIOR_LEVEL_TEST_MASTER_PLAN.md
- [2026-02-25 22:20] 运行命令: rg --files/rg -n 扫描 tests 与 handlers
- [2026-02-25 22:20] 结果: 已修正 test 文件数=51、handlers 文件数=43、handler 入口数=26；补齐 Phase 3.3 遗漏 handler；新增 Phase 依赖关系与 Phase 9（billing/concurrency）
- [2026-02-25 22:20] 问题: Phase 1.3 自动守卫脚本尚未实现

- [2026-02-25 23:05] 状态变更: Phase 2.1 🔄 -> ✅, Phase 2.2 ⏸ -> ✅
- [2026-02-25 23:05] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/direct-submit-routes.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/llm-observe-routes.test.ts
- [2026-02-25 23:05] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract/direct-submit-routes.test.ts tests/integration/api/contract/llm-observe-routes.test.ts
- [2026-02-25 23:05] 结果: 两类 contract 测试已由结构级改为行为级并通过，覆盖 16 个 direct-submit routes 与 22 个 llm-observe routes
- [2026-02-25 23:05] 问题: 无

- [2026-02-25 23:06] 状态变更: Phase 2.3 ⏸ -> 🔄, Phase 2.4 ⏸ -> 🔄
- [2026-02-25 23:06] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/crud-routes.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/task-infra-routes.test.ts
- [2026-02-25 23:06] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract/crud-routes.test.ts tests/integration/api/contract/task-infra-routes.test.ts
- [2026-02-25 23:06] 结果: 已替换为真实 route 调用断言；crud 完成鉴权行为覆盖，task-infra 完成鉴权/参数/核心成功路径，后续补 DB 写回与 SSE 终态序列
- [2026-02-25 23:06] 问题: 无

- [2026-02-25 23:06] 状态变更: Phase 3.2 🔄 -> ✅, Phase 3.4 ⏸ -> ✅
- [2026-02-25 23:06] 修改文件: /Users/earth/Desktop/waoowaoo/tests/unit/worker/image-task-handlers-core.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/episode-split.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/script-to-storyboard.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/video-worker.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/voice-worker.test.ts
- [2026-02-25 23:06] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/script-to-storyboard.test.ts tests/unit/worker/video-worker.test.ts tests/unit/worker/voice-worker.test.ts tests/unit/worker/image-task-handlers-core.test.ts tests/unit/worker/episode-split.test.ts
- [2026-02-25 23:06] 结果: worker 测试已升级为结果级断言，覆盖失败路径、成功路径、关键分支与关键写库字段
- [2026-02-25 23:06] 问题: 无

- [2026-02-25 23:07] 状态变更: Phase 4.2 ⏸ -> 🔄, Phase 4.3 ⏸ -> 🔄, Phase 4.4 ⏸ -> 🔄
- [2026-02-25 23:07] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/chain/image.chain.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/chain/text.chain.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/chain/video.chain.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/chain/voice.chain.test.ts
- [2026-02-25 23:07] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/chain/image.chain.test.ts tests/integration/chain/text.chain.test.ts tests/integration/chain/video.chain.test.ts tests/integration/chain/voice.chain.test.ts
- [2026-02-25 23:07] 结果: chain 测试已由映射断言升级为 addTaskJob enqueue 行为断言（校验 queue 选择 + jobId/priority）
- [2026-02-25 23:07] 问题: route->worker->DB 端到端链路仍待补

- [2026-02-25 23:08] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract tests/integration/chain tests/unit/worker
- [2026-02-25 23:08] 结果: 16 个测试文件全部通过，117/117 测试通过

- [2026-02-25 23:09] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/crud-routes.test.ts
- [2026-02-25 23:09] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract/crud-routes.test.ts
- [2026-02-25 23:09] 结果: 新增 CRUD 结果级断言（PATCH 写入字段值、DELETE 删除调用与越权 403），从“仅鉴权检查”升级为“含写库行为检查”
- [2026-02-25 23:09] 问题: novel-promotion 侧 CRUD 的字段级断言仍待扩展

- [2026-02-25 23:09] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/task-infra-routes.test.ts
- [2026-02-25 23:09] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract/task-infra-routes.test.ts
- [2026-02-25 23:09] 结果: 新增 SSE replay 成功路径断言（`text/event-stream`、`last-event-id` 回放、channel 订阅行为）
- [2026-02-25 23:09] 问题: SSE 终态事件的 completed/failed 序列断言仍待补

- [2026-02-25 23:10] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract tests/integration/chain tests/unit/worker
- [2026-02-25 23:10] 结果: 16 个测试文件全部通过，120/120 测试通过

- [2026-02-25 23:11] 状态变更: Phase 1.3 🔄 -> ✅
- [2026-02-25 23:11] 修改文件: /Users/earth/Desktop/waoowaoo/tests/contracts/behavior-test-standard.md, /Users/earth/Desktop/waoowaoo/scripts/guards/test-behavior-quality-guard.mjs, /Users/earth/Desktop/waoowaoo/package.json
- [2026-02-25 23:11] 运行命令: node scripts/guards/test-behavior-quality-guard.mjs && npm run check:test-coverage-guards
- [2026-02-25 23:11] 结果: 行为级质量守卫已接入（拦截源码字符串契约 + 弱断言），并纳入 `check:test-coverage-guards`
- [2026-02-25 23:11] 问题: 无

- [2026-02-25 23:12] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/direct-submit-routes.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/llm-observe-routes.test.ts
- [2026-02-25 23:12] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract/direct-submit-routes.test.ts tests/integration/api/contract/llm-observe-routes.test.ts
- [2026-02-25 23:12] 结果: 两个 contract 测试新增 `toHaveBeenCalledWith(objectContaining(...))` 强断言，通过行为质量守卫
- [2026-02-25 23:12] 问题: 无

- [2026-02-25 23:13] 状态变更: Phase 5.1 ⏸ -> ✅
- [2026-02-25 23:13] 修改文件: /Users/earth/Desktop/waoowaoo/tests/unit/optimistic/sse-invalidation.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/optimistic/task-target-state-map.test.ts
- [2026-02-25 23:13] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/optimistic/sse-invalidation.test.ts tests/unit/optimistic/task-target-state-map.test.ts
- [2026-02-25 23:13] 结果: 两个 optimistic 结构级测试已替换为行为级（SSE 终态 invalidation 与 target-state overlay 合并规则）
- [2026-02-25 23:13] 问题: 无

- [2026-02-25 23:16] 状态变更: Phase 3.3 ⏸ -> 🔄
- [2026-02-25 23:16] 修改文件: /Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-tasks.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/voice-design.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/asset-hub-ai-design.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/asset-hub-ai-modify.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-prompt-appearance.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-prompt-location.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-prompt-shot.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/shot-ai-variants.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/llm-proxy.test.ts
- [2026-02-25 23:16] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/shot-ai-tasks.test.ts tests/unit/worker/voice-design.test.ts tests/unit/worker/asset-hub-ai-design.test.ts tests/unit/worker/asset-hub-ai-modify.test.ts tests/unit/worker/shot-ai-prompt-appearance.test.ts tests/unit/worker/shot-ai-prompt-location.test.ts tests/unit/worker/shot-ai-prompt-shot.test.ts tests/unit/worker/shot-ai-variants.test.ts tests/unit/worker/llm-proxy.test.ts
- [2026-02-25 23:16] 结果: 新增 9 个 worker 行为测试文件（20 条用例+5 条用例），覆盖 shot-ai 分发、prompt 修改链路、asset-hub ai 设计/修改、voice-design、llm-proxy 显式失败
- [2026-02-25 23:16] 问题: 无

- [2026-02-25 23:16] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker
- [2026-02-25 23:16] 结果: worker 套件通过，17 文件 / 48 测试通过

- [2026-02-25 23:17] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/optimistic tests/unit/worker tests/integration/api/contract tests/integration/chain
- [2026-02-25 23:17] 结果: 全回归分组通过，31 文件 / 155 测试通过

- [2026-02-25 23:25] 修改文件: /Users/earth/Desktop/waoowaoo/tests/unit/worker/story-to-script.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/screenplay-convert.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/analyze-novel.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/analyze-global.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/voice-analyze.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/clips-build.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/character-profile.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/character-image-task-handler.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/location-image-task-handler.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/panel-image-task-handler.test.ts, /Users/earth/Desktop/waoowaoo/tests/unit/worker/panel-variant-task-handler.test.ts
- [2026-02-25 23:25] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/story-to-script.test.ts tests/unit/worker/screenplay-convert.test.ts tests/unit/worker/analyze-novel.test.ts tests/unit/worker/analyze-global.test.ts tests/unit/worker/voice-analyze.test.ts tests/unit/worker/clips-build.test.ts tests/unit/worker/character-profile.test.ts tests/unit/worker/character-image-task-handler.test.ts tests/unit/worker/location-image-task-handler.test.ts tests/unit/worker/panel-image-task-handler.test.ts tests/unit/worker/panel-variant-task-handler.test.ts
- [2026-02-25 23:25] 结果: 新增 11 个 worker handler 行为测试文件，覆盖剩余未落地入口（文本链路 + 图片链路），失败路径/成功路径/关键分支断言全部落地
- [2026-02-25 23:25] 问题: 首轮运行出现 5 个断言问题（重试分支 mock 泄漏与断言过窄），已在同轮修复

- [2026-02-25 23:26] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker
- [2026-02-25 23:26] 结果: worker 套件通过，28 文件 / 76 测试通过

- [2026-02-25 23:26] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/optimistic tests/unit/worker tests/integration/api/contract tests/integration/chain
- [2026-02-25 23:26] 结果: 全回归分组通过，42 文件 / 183 测试通过

- [2026-02-25 23:27] 状态变更: Phase 3.3 🔄 -> ✅
- [2026-02-25 23:27] 运行命令: npm run check:test-coverage-guards
- [2026-02-25 23:27] 结果: 覆盖守卫通过（behavior quality / route=117 / taskType=37）
- [2026-02-25 23:27] 问题: 无

- [2026-02-25 23:27] 运行命令: rg \"export async function handle\" src/lib/workers/handlers -l + tests/unit/worker import 对账
- [2026-02-25 23:27] 结果: 26/26 handler 入口均存在对应 worker 行为测试文件引用
- [2026-02-25 23:27] 问题: 无

- [2026-02-25 23:46] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/crud-routes.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/api/contract/task-infra-routes.test.ts
- [2026-02-25 23:46] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/contract/crud-routes.test.ts tests/integration/api/contract/task-infra-routes.test.ts
- [2026-02-25 23:46] 结果: CRUD 合同新增 novel-promotion 写回断言（select-character-image / select-location-image / clips PATCH），task-infra 新增 SSE channel 终态事件序列断言（processing -> completed）
- [2026-02-25 23:46] 问题: 无

- [2026-02-25 23:46] 修改文件: /Users/earth/Desktop/waoowaoo/tests/integration/chain/image.chain.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/chain/text.chain.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/chain/video.chain.test.ts, /Users/earth/Desktop/waoowaoo/tests/integration/chain/voice.chain.test.ts
- [2026-02-25 23:46] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/chain/image.chain.test.ts tests/integration/chain/text.chain.test.ts tests/integration/chain/video.chain.test.ts tests/integration/chain/voice.chain.test.ts
- [2026-02-25 23:46] 结果: 4 个 chain 文件由“仅 queue 映射”升级为“queue payload -> worker 消费 -> 结果/写回断言”
- [2026-02-25 23:46] 问题: 无

- [2026-02-25 23:47] 修改文件: /Users/earth/Desktop/waoowaoo/tests/contracts/route-behavior-matrix.ts, /Users/earth/Desktop/waoowaoo/tests/contracts/tasktype-behavior-matrix.ts, /Users/earth/Desktop/waoowaoo/scripts/guards/test-behavior-route-coverage-guard.mjs, /Users/earth/Desktop/waoowaoo/scripts/guards/test-behavior-tasktype-coverage-guard.mjs, /Users/earth/Desktop/waoowaoo/package.json, /Users/earth/Desktop/waoowaoo/tests/contracts/task-type-catalog.ts, /Users/earth/Desktop/waoowaoo/docs/testing/behavior-test-guideline.md
- [2026-02-25 23:47] 运行命令: BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/optimistic tests/unit/worker tests/integration/api/contract tests/integration/chain && npm run check:test-coverage-guards
- [2026-02-25 23:47] 结果: 分组回归通过（42 文件 / 191 测试），覆盖门禁通过（behavior quality + route 117 + taskType 37 + behavior matrices）
- [2026-02-25 23:47] 问题: 无

- [2026-02-25 23:51] 运行命令: npm run test:behavior:full
- [2026-02-25 23:51] 结果: 行为级全链路命令通过（guards + unit + api + chain）；unit=39 文件/107 测试，api=4 文件/93 测试，chain=4 文件/12 测试
- [2026-02-25 23:51] 问题: unit 辅助测试阶段出现本地 Redis 连接拒绝日志（127.0.0.1:6380）但不影响用例通过，后续可按需优化为静默 mock

---

## 4: 验证策略

### 4.1 可量化验收目标（全部必须达成）
1. Route 行为覆盖率: `117/117`（每个 route 至少 1 个行为级用例）。  
2. TASK_TYPE 行为覆盖率: `37/37`（每个 task type 至少 1 个 worker 行为用例 + 1 个 chain 行为用例）。  
3. 结构级 contract/chain 主断言占比: `0%`（不得再以源码字符串匹配作为主断言）。  
4. 关键回归场景覆盖: `100%`（参考图链路、后缀链路、编辑写回链路、task state 链路）。  
5. 外部真实调用次数: `0`（测试环境必须全 fake）。  
6. PR 门禁: `100%` 执行 `test:behavior:full`，任一缺失即失败。  
7. Worker 用例规范符合率: `100%`（每个 worker 测试文件均满足 3.1~3.7 规则）。  
8. Billing + Concurrency 维度通过率: `100%`（纳入统一验收报告）。

### 4.2 核心验证命令
- `npm run test:guards`
- `cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/worker`
- `cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/helpers`
- `cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/api`
- `cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/chain`
- `npm run test:pr`

### 4.3 用例质量验证（防假绿灯）
每个新增行为测试必须至少满足两条：
1. 断言具体业务字段值（例如 `description/imageUrls/locale/meta/referenceImages`）。  
2. 覆盖至少一个历史回归分支。  
3. 覆盖一个失败分支（权限/参数/模型未配置）。  
4. 不使用“mock 自己返回结果并直接断言调用次数”的空测试模式。  

---

## 5: 备注

1. 本文档是“行为级测试替换计划”，与 `SYSTEM_REGRESSION_COVERAGE_MASTER_PLAN.md` 并行存在；冲突时以“行为级优先”原则执行。  
2. 本计划默认不引入兼容层与静默回退，错误必须显式暴露。  
3. 新接手模型必须先阅读本文件，再执行代码修改；执行后必须回写执行日志。  
4. 如果出现“测试通过但线上仍回归”，优先审计断言是否为结果级而不是调用级。  
