# iVibeMovie 任务状态机（冻结版）

## 1. 状态定义

1. `queued`：任务已创建并等待消费。
2. `processing`：任务被 worker 消费中。
3. `completed`：任务执行完成并产出结果。
4. `failed`：任务执行失败。
5. `cancelled`：任务被用户或系统取消。

## 2. 合法迁移

1. `queued -> processing`
2. `processing -> completed`
3. `processing -> failed`
4. `queued -> cancelled`
5. `processing -> cancelled`

## 3. 非法迁移

1. `completed -> *`
2. `failed -> processing`
3. `cancelled -> processing`

## 4. 失败与重试

1. 可重试错误：进入队列重试，不改变终态定义。
2. 不可重试错误：直接 `failed`。
3. 重试仍失败：`failed` 并记录 error_code/error_message。

## 5. 对账与恢复

1. watchdog 定期扫描 `queued/processing`。
2. 对丢失任务进行状态修正并写入 task_event。
3. 所有恢复动作必须可审计。

