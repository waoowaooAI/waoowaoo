import { createScopedLogger } from '@/lib/logging/core'
import express, { type NextFunction, type Request, type Response } from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { imageQueue, textQueue, videoQueue, voiceQueue } from '@/lib/task/queues'

const host = process.env.BULL_BOARD_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.BULL_BOARD_PORT || '3010', 10) || 3010
const basePath = process.env.BULL_BOARD_BASE_PATH || '/admin/queues'
const authUser = process.env.BULL_BOARD_USER
const authPassword = process.env.BULL_BOARD_PASSWORD
const logger = createScopedLogger({
  module: 'ops.bull_board',
})

function unauthorized(res: Response) {
  res.setHeader('WWW-Authenticate', 'Basic realm="BullMQ Board"')
  res.status(401).send('Authentication required')
}

function basicAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!authUser && !authPassword) {
    next()
    return
  }

  const authorization = req.headers.authorization
  if (!authorization?.startsWith('Basic ')) {
    unauthorized(res)
    return
  }

  const encoded = authorization.slice(6).trim()
  let decoded = ''

  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    unauthorized(res)
    return
  }

  const index = decoded.indexOf(':')
  if (index === -1) {
    unauthorized(res)
    return
  }

  const username = decoded.slice(0, index)
  const password = decoded.slice(index + 1)
  if (username !== (authUser || '') || password !== (authPassword || '')) {
    unauthorized(res)
    return
  }

  next()
}

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath(basePath)

createBullBoard({
  queues: [
    new BullMQAdapter(imageQueue),
    new BullMQAdapter(videoQueue),
    new BullMQAdapter(voiceQueue),
    new BullMQAdapter(textQueue),
  ],
  serverAdapter,
})

const app = express()
app.disable('x-powered-by')
app.use(basePath, basicAuthMiddleware, serverAdapter.getRouter())

const server = app.listen(port, host, () => {
  const secured = authUser || authPassword ? 'enabled' : 'disabled'
  logger.info({
    action: 'bull_board.started',
    message: 'bull board listening',
    details: {
      host,
      port,
      basePath,
      auth: secured,
    },
  })
})

async function shutdown(signal: string) {
  logger.info({
    action: 'bull_board.shutdown',
    message: 'bull board shutting down',
    details: {
      signal,
    },
  })
  await Promise.allSettled([imageQueue.close(), videoQueue.close(), voiceQueue.close(), textQueue.close()])
  await new Promise<void>((resolve) => server.close(() => resolve()))
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
