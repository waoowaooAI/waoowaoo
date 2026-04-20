# Agent 功能完成现状

> 这份文档只描述当前事实，不重复设计构想。
> 最新评估基于代码扫描和当前实现，不再引用旧时间线中的历史结论。

## 1. 总体判断

当前 Project Agent 已经不是“聊天面板 + 少量工具”的原型，而是一套可运行的项目助手主链路。

它已经具备以下完整闭环：

- 项目级 assistant 入口。
- runtime 执行链。
- project phase / projection / context 读取。
- operation registry 统一暴露工具和 API。
- confirmed gate 与结构化错误返回。
- async task 提交与状态回看。
- 对应的 unit / integration 测试。

综合判断：

- 核心 P0 能力已经完成。
- 大部分 P1 能力已经完成。
- 现阶段主要剩余工作是工程收敛、细节补齐和体验优化，而不是重做架构。

## 2. 当前实现主链路

```text
UI / API route
  -> createProjectAgentChatResponse
  -> resolveProjectPhase
  -> selectProjectAgentTools
  -> streamText
  -> executeProjectAgentOperationFromTool
  -> operation.execute / submit task / write ui data parts
```

现在的关键事实是：

- runtime 已使用 AI SDK streamText。
- tool 集合不是静态全量暴露，而是按 route / phase / intent / risk 动态裁剪。
- stop 条件是硬上限 999，并在触顶时显式输出 stop part。
- tool 错误统一返回结构化 result，不再让失败直接吞没上下文。
- API 侧也复用了 operation registry，不再是 route 自己各写一套逻辑。

## 3. 已落地能力

### 3.1 Runtime

`src/lib/project-agent/runtime.ts` 现在承担的是完整执行入口，而不是薄壳。

已实现的关键点：

- 消息校验和模型消息转换。
- 按用户模型配置选择语言模型。
- phase + context + route policy 组合成 system prompt。
- 动态装配 tools。
- 流式输出到 UIMessage stream。
- stop controller 触顶显式输出 data-agent-stop。

### 3.2 Project phase

`src/lib/project-agent/project-phase.ts` 已经不只是简单枚举，而是一个带进度和判断依据的状态快照。

它现在能提供：

- phase。
- progress 计数。
- active runs。
- failed items。
- stale artifacts。
- available actions（plan / act）。

这比早期只看单一阶段值更接近真实项目助手需要的状态表达。

### 3.3 Projection / context

当前已经形成两层结构：

- lite projection：适合多数状态判断和 prompt 注入。
- full projection / context：适合需要 panel、clip、storyboard、voice line 细节的读取场景。

当前 full projection 和 context 已经能提供较完整的分镜细节，包括：

- panel 级别的 description、imagePrompt、imageUrl、candidateImages、videoPrompt、videoUrl。
- storyboard / clip 的关联信息。
- 运行中的 workflow 和最新 artifacts。

这意味着“参考某个分镜继续生成”这类动作已经有了真实的数据基础。

### 3.4 Operation / adapter

现在的 operation 层已经是系统的主事实源：

- 读、写、计划、治理、任务、项目、用户配置、资产中心等能力都收敛到 operation registry。
- tool adapter 统一处理输入校验、confirmed gate、执行错误和输出校验。
- API adapter 统一把 GUI / route 调用落到 operation 上。

这套结构的质量比“route 各写各的”明显更好，因为：

- 重复逻辑减少了。
- 危险动作的判定集中化了。
- 代码事实比文档叙述更一致了。

### 3.5 状态和任务

当前已经支持：

- workflow plan / approval / status。
- 任务提交后的 taskId / runId / batchId 回传。
- mutation batch / undo 相关能力。
- 运行中的任务和失败任务查询。

这说明 assistant 已经能够把“做什么”与“如何完成”分开表达。

## 4. 实现质量评估

### 4.1 优点

1. 事实源比较清楚。

   operation registry、projection、context、runtime 各自分工明确，避免了单文件吞掉所有责任。

2. 错误处理比早期健康。

   tool 层现在返回结构化错误，不再依赖流中断让模型“猜”发生了什么。

3. 动态工具选择是有效的。

   不是把所有能力都塞给模型，而是按场景裁剪，这对降低误调用和噪音是有帮助的。

4. 测试覆盖已经跟上关键链路。

   runtime、tool adapter、registry、route contract、projection 相关测试都已经是可维护的最小闭环。

### 4.2 仍需留意的质量问题

1. prompt 里仍包含一定量的运行时快照字符串。

   这比旧版本好很多，但还不是完全“状态通过工具读取、prompt 只保留规则”的极简形态。

2. 工具裁剪策略仍然偏保守。

   目前通过 route / phase / risk / scope 做选择，整体正确，但对极少数边缘场景的覆盖还需要持续校准。

3. 代码仍有继续收敛空间。

   project-agent、project-projection、project-context、operations 之间的边界已经明确，但一些辅助层还可以继续削薄。

4. 文档必须继续保持和代码同步。

   这套 agent 变化速度快，如果文档不按事实更新，很容易重新出现历史状态和当前状态混写的问题。

## 5. 当前完成度

### 5.1 已完成

- 项目级 assistant 入口。
- runtime / stop 机制。
- dynamic tool selection。
- confirmed gate。
- structured tool result。
- projection / context 两层。
- operation registry 收口。
- API adapter 收口。
- 主要 route 的 operation 化。
- 关键测试补齐。

### 5.2 部分完成

- prompt 结构继续优化。
- 工具选择策略继续精调。
- UI 对不同操作结果的富渲染继续增强。
- 代码目录继续收敛。
- 事件桥接继续减少。

### 5.3 仍在进行中

- 进一步减少系统对长 prompt 的依赖。
- 进一步提升 projection 的使用一致性。
- 进一步统一 assistant 与 workspace 的状态来源。
- 对剩余边缘 route / operation 进行持续收口。

## 6. 结论

如果只看主链路，Project Agent 已经完成了“能用”的阶段，并且在执行、确认、错误和投影四个方面都比早期版本稳很多。

如果看工程质量，它目前是“可交付的项目助手骨架”，不是“最终收敛态”。后续最该做的不是加新概念，而是继续削减噪音、补齐边缘场景、统一状态来源。
