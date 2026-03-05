import 'dotenv/config'
import { createScopedLogger } from '@/lib/logging/core'
import { createImageWorker } from './image.worker'
import { createVideoWorker } from './video.worker'
import { createVoiceWorker } from './voice.worker'
import { createTextWorker } from './text.worker'
import { QUEUE_NAME } from '@/lib/task/queues'

const logger = createScopedLogger({
  module: 'worker.entry',
  action: 'worker.entry.bootstrap',
})

const workers = [createImageWorker(), createVideoWorker(), createVoiceWorker(), createTextWorker()]

logger.info({
  action: 'worker.entry.started',
  message: 'workers started',
  details: {
    count: workers.length,
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV || 'development',
    queues: Object.values(QUEUE_NAME),
    concurrency: {
      image: Number.parseInt(process.env.QUEUE_CONCURRENCY_IMAGE || '20', 10) || 20,
      video: Number.parseInt(process.env.QUEUE_CONCURRENCY_VIDEO || '4', 10) || 4,
      voice: Number.parseInt(process.env.QUEUE_CONCURRENCY_VOICE || '10', 10) || 10,
      text: Number.parseInt(process.env.QUEUE_CONCURRENCY_TEXT || '10', 10) || 10,
    },
  },
})

for (const worker of workers) {
  worker.on('ready', () => {
    logger.info({
      action: 'worker.entry.ready',
      message: 'worker ready',
      details: {
        workerName: worker.name,
      },
    })
  })

  worker.on('error', (err) => {
    logger.error({
      action: 'worker.entry.error',
      message: err instanceof Error ? err.message : String(err),
      errorCode: 'WORKER_RUNTIME_ERROR',
      retryable: true,
      details: {
        workerName: worker.name,
      },
      error:
        err instanceof Error
          ? {
              name: err.name,
              message: err.message,
              stack: err.stack,
            }
          : {
              message: String(err),
            },
    })
  })

  worker.on('failed', (job, err) => {
    logger.error({
      action: 'worker.entry.job_failed',
      message: err instanceof Error ? err.message : String(err),
      errorCode: 'WORKER_JOB_FAILED',
      retryable: true,
      details: {
        workerName: worker.name,
        jobId: job?.id,
        taskId: job?.data?.taskId,
        taskType: job?.data?.type,
      },
      error:
        err instanceof Error
          ? {
              name: err.name,
              message: err.message,
              stack: err.stack,
            }
          : {
              message: String(err),
            },
    })
  })
}

async function shutdown(signal: string) {
  logger.info({
    action: 'worker.entry.shutdown.begin',
    message: 'worker shutdown signal received',
    details: {
      signal,
      workerCount: workers.length,
    },
  })
  await Promise.all(workers.map(async (worker) => await worker.close()))
  logger.info({
    action: 'worker.entry.shutdown.completed',
    message: 'all workers stopped',
    details: {
      signal,
    },
  })
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('uncaughtException', (error) => {
  logger.error({
    action: 'worker.entry.uncaught_exception',
    message: error.message,
    errorCode: 'WORKER_UNCAUGHT_EXCEPTION',
    retryable: false,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  })
})
process.on('unhandledRejection', (reason) => {
  logger.error({
    action: 'worker.entry.unhandled_rejection',
    message: reason instanceof Error ? reason.message : String(reason),
    errorCode: 'WORKER_UNHANDLED_REJECTION',
    retryable: false,
    error:
      reason instanceof Error
        ? {
            name: reason.name,
            message: reason.message,
            stack: reason.stack,
          }
        : {
            message: String(reason),
          },
  })
})
