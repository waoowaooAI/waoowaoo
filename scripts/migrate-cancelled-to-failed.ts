import { prisma } from '@/lib/prisma'

const OLD_STATUS = 'cancelled'
const NEW_STATUS = 'failed'
const OLD_EVENT_TYPE = 'task.cancelled'
const NEW_EVENT_TYPE = 'task.failed'
const MIGRATION_ERROR_CODE = 'USER_CANCELLED'
const MIGRATION_ERROR_MESSAGE = '用户已停止任务。'

function log(message: string) {
  process.stdout.write(`${message}\n`)
}

function logError(message: string) {
  process.stderr.write(`${message}\n`)
}

async function main() {
  const totalTasks = await prisma.task.count({
    where: { status: OLD_STATUS },
  })
  const totalEvents = await prisma.taskEvent.count({
    where: { eventType: OLD_EVENT_TYPE },
  })

  log(`[migrate-cancelled-to-failed] matched tasks: ${totalTasks}`)
  log(`[migrate-cancelled-to-failed] matched events: ${totalEvents}`)
  if (totalTasks === 0 && totalEvents === 0) {
    log('[migrate-cancelled-to-failed] no rows to migrate')
    return
  }

  const taskEmptyMessageResult = await prisma.task.updateMany({
    where: {
      status: OLD_STATUS,
      OR: [{ errorMessage: null }, { errorMessage: '' }],
    },
    data: {
      status: NEW_STATUS,
      errorCode: MIGRATION_ERROR_CODE,
      errorMessage: MIGRATION_ERROR_MESSAGE,
    },
  })

  const taskResult = await prisma.task.updateMany({
    where: { status: OLD_STATUS },
    data: {
      status: NEW_STATUS,
      errorCode: MIGRATION_ERROR_CODE,
    },
  })

  const eventResult = await prisma.taskEvent.updateMany({
    where: { eventType: OLD_EVENT_TYPE },
    data: {
      eventType: NEW_EVENT_TYPE,
    },
  })

  log(`[migrate-cancelled-to-failed] updated tasks (empty message): ${taskEmptyMessageResult.count}`)
  log(`[migrate-cancelled-to-failed] updated tasks (remaining): ${taskResult.count}`)
  log(`[migrate-cancelled-to-failed] updated events: ${eventResult.count}`)
}

main()
  .catch((error) => {
    logError(`[migrate-cancelled-to-failed] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
