// Next.js Instrumentation - 在应用启动时执行
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // 在 Edge Runtime 中直接返回，避免加载 Prisma（它使用了动态代码生成）
  if (process.env.NEXT_RUNTIME === 'edge') {
    return
  }

  // 只在 Node.js 服务端运行
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { prisma } = await import('@/lib/prisma')
    const { logInfo: _ulogInfo, logError: _ulogError } = await import('@/lib/logging/core')

    // Phase 1: 将 processing 任务打回 queued
    try {
      const resetResult = await prisma.task.updateMany({
        where: {
          status: 'processing',
        },
        data: {
          status: 'queued',
          startedAt: null,
          heartbeatAt: null,
          // 保留 externalId，让 worker 重启后能从中断处继续轮询
          // 而不是重新提交给外部 API（Kling 等），避免重复扣费
        },
      })

      if (resetResult.count > 0) {
        _ulogInfo(`[Instrumentation] Reset ${resetResult.count} processing tasks to queued`)
      }
    } catch (error) {
      _ulogError('[Instrumentation] Failed to reset processing tasks:', error)
    }

    // Phase 2: pg-boss 为持久化队列，不再执行历史手工补投递逻辑。
    _ulogInfo('[Instrumentation] skip legacy re-enqueue phase under pg-boss runtime')

    // ─── Phase 3: 启动 Task Watchdog（DB ↔ Queue 持续对账）───
    try {
      const { startTaskWatchdog, stopTaskWatchdog } = await import('@/lib/task/reconcile')
      stopTaskWatchdog()
      startTaskWatchdog()
      _ulogInfo('[Instrumentation] Task watchdog started')
    } catch (error) {
      _ulogError('[Instrumentation] Failed to start task watchdog:', error)
    }
  }
}
