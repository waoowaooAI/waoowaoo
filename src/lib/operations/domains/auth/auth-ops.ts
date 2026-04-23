import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { logAuthAction } from '@/lib/logging/semantic'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function createAuthOperations(): ProjectAgentOperationRegistryDraft {
  return {
    auth_register_user: defineOperation({
      id: 'auth_register_user',
      summary: 'Register a new user and create initial balance record.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        name: z.string().min(1),
        password: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        const name = normalizeName(input.name) || 'unknown'
        const password = normalizePassword(input.password)

        if (!name || !password) {
          logAuthAction('REGISTER', name, { error: 'Missing credentials' })
          throw new ApiError('INVALID_PARAMS')
        }
        if (password.length < 6) {
          logAuthAction('REGISTER', name, { error: 'Password too short' })
          throw new ApiError('INVALID_PARAMS')
        }

        const existingUser = await prisma.user.findUnique({
          where: { name },
          select: { id: true },
        })
        if (existingUser) {
          logAuthAction('REGISTER', name, { error: 'User already exists' })
          throw new ApiError('INVALID_PARAMS')
        }

        const hashedPassword = await bcrypt.hash(password, 12)

        const user = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              name,
              password: hashedPassword,
            },
          })

          await tx.userBalance.create({
            data: {
              userId: newUser.id,
              balance: 0,
              frozenAmount: 0,
              totalSpent: 0,
            },
          })

          return newUser
        })

        logAuthAction('REGISTER', name, { userId: user.id, success: true })

        return {
          message: '注册成功',
          user: {
            id: user.id,
            name: user.name,
          },
        }
      },
    }),
  }
}
