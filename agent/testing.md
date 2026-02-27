# 测试编写详细规范

## 1. 何时必须写或更新测试

| 触发场景 | 要求 |
|---|---|
| 修改 worker handler 逻辑 | 必须有对应行为测试 |
| 修复 bug | 必须新增回归测试，`it()` 名称体现该 bug 场景 |
| 新增 API route 或 task type | 必须更新 `tests/contracts/` 矩阵 |
| 修改 prompt 后缀、referenceImages 注入、DB 写回字段 | 必须有行为断言覆盖 |

未通过 `npm run test:regression` 不得宣称功能完成。

---

## 2. 断言必须是行为级（检查具体值）

**正确写法**：
```ts
// 断言 DB 写入了具体字段值
const updateData = prismaMock.globalCharacterAppearance.update.mock.calls.at(-1)?.[0].data
expect(updateData.description).toBe('AI_EXTRACTED_DESCRIPTION')

// 断言生图函数收到了正确参数
const { prompt, options } = readGenerateCall(0)
expect(prompt).toContain(CHARACTER_PROMPT_SUFFIX)
expect(options.referenceImages).toEqual(['https://ref.example/a.png'])

// 断言返回值
expect(result).toEqual({ success: true, count: 2 })
```

**禁止写法**（不能作为唯一主断言）：
```ts
expect(fn).toHaveBeenCalled()        // 只知道"调用了"，不知道"传了什么"
expect(fn).toHaveBeenCalledTimes(1)  // 次数本身无业务意义时无效
```

---

## 3. Mock 规范

**必须 Mock**：
- `prisma`（所有数据库操作）
- LLM / chatCompletionWithVision / generateImage
- COS / uploadToCOS / getSignedUrl
- 外部 HTTP（fetchWithTimeoutAndRetry 等）

**禁止 Mock**：
- 你要测试的业务逻辑函数本身
- 项目内部常量（如 `CHARACTER_PROMPT_SUFFIX`），直接 import 使用

**禁止"自给自答"**：
```ts
// 错误：mock 返回 X，马上断言 X，没有经过任何业务逻辑
mockLLM.mockReturnValue('result')
expect(await mockLLM()).toBe('result')  // 废测试

// 正确：mock AI 返回 X，断言业务代码把 X 写进了数据库
llmMock.getCompletionContent.mockReturnValue('高挑女性')
await handleTask(job)
expect(prismaMock.update.mock.calls.at(-1)[0].data.description).toBe('高挑女性')
```

---

## 4. 测试数据规范

- **影响分支的字段**须分开写 `it()`，例如：
  - `有 extraImageUrls` 和 `无 extraImageUrls` 分别写一个用例
  - `isBackgroundJob: true` 和 `false` 分别写
- **纯透传字段**（`taskId`、`userId` 等代码不处理）可用占位值 `'task-1'`
- **每个 `it()` 命名格式**：`[条件] -> [预期结果]`

**命名示例**：
```
有参考图 -> AI 分析结果写入 description
无参考图 -> 不触发 AI，description 不变
AI 调用失败 -> 主流程成功，description 不被污染
缺少必填参数 -> 抛出包含字段名的错误
批量确认 2 个角色 -> 逐个处理，count 返回 2
```

---

## 5. 每个测试文件的结构

```ts
// 1. vi.hoisted 定义所有 mock（必须在 import 之前）
const prismaMock = vi.hoisted(() => ({ ... }))
const llmMock = vi.hoisted(() => ({ ... }))

// 2. vi.mock 注册（在 import 之前）
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => llmMock)

// 3. import 真实业务代码（在 mock 注册之后）
import { handleXxxTask } from '@/lib/workers/handlers/xxx'

// 4. describe + beforeEach 重置 mock
describe('worker xxx behavior', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('[条件] -> [结果]', async () => {
    // 准备：覆盖这次场景需要的特殊 mock 返回值
    // 构造：buildJob(payload, taskType)
    // 执行：await handleXxxTask(job)
    // 断言：检查具体值
  })
})
```

---

## 6. 运行命令

| 场景 | 命令 |
|---|---|
| 改了 worker 逻辑 | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker` |
| 改了某个具体文件 | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/xxx.test.ts` |
| 改了 API 路由 | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api` |
| 改了 helpers / 常量 | `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/helpers` |
| 提交前完整验证 | `npm run test:regression` |

---

## 7. 目录说明

| 目录 | 用途 |
|---|---|
| `tests/unit/worker/` | worker handler 行为测试（主要回归防线） |
| `tests/unit/helpers/` | 纯函数 / 工具函数测试 |
| `tests/unit/optimistic/` | 前端状态 hook 行为测试 |
| `tests/integration/api/contract/` | API 路由契约（401/400/200 + payload 断言） |
| `tests/integration/chain/` | queue → worker → 结果完整链路 |
| `tests/contracts/` | 矩阵与守卫（route/tasktype/requirements） |
| `tests/helpers/fakes/` | 通用 mock 工具（llm、media、providers） |

---

## 8. 验证测试有效性（防假绿灯）

写完测试后，用以下方式确认测试没有虚假通过：

1. 临时注释掉你刚写的业务逻辑，测试应该变红
2. 还原业务逻辑，测试应该变绿
3. 如果注释后测试还是绿，说明断言没有覆盖到真实业务路径
