import { loadTestEnv } from '../setup/env'
import { prisma } from '@/lib/prisma'

loadTestEnv()

export { prisma }
