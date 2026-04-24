import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { logAuthAction } from '@/lib/logging/semantic'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { getPrismaErrorCode } from '@/lib/prisma-error'

const REGISTER_ERROR_MESSAGES = {
  invalidPayload: '请填写用户名和密码',
  missingName: '请输入用户名',
  missingPassword: '请输入密码',
  passwordTooShort: '密码长度至少6位',
  userExists: '该用户名已被注册，请换一个用户名或直接登录',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

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
      inputSchema: z.unknown(),
      outputSchema: z.object({
        message: z.string(),
        user: z.object({
          id: z.string(),
          name: z.string(),
        }),
      }),
      execute: async (_ctx, input) => {
        if (!isRecord(input)) {
          logAuthAction('REGISTER', 'unknown', { error: 'Invalid payload' })
          throw new ApiError('INVALID_PARAMS', { message: REGISTER_ERROR_MESSAGES.invalidPayload })
        }

        const name = normalizeName(input.name)
        const password = normalizePassword(input.password)

        if (!name) {
          logAuthAction('REGISTER', 'unknown', { error: 'Missing username' })
          throw new ApiError('INVALID_PARAMS', { message: REGISTER_ERROR_MESSAGES.missingName })
        }
        if (!password) {
          logAuthAction('REGISTER', name, { error: 'Missing password' })
          throw new ApiError('INVALID_PARAMS', { message: REGISTER_ERROR_MESSAGES.missingPassword })
        }
        if (password.length < 6) {
          logAuthAction('REGISTER', name, { error: 'Password too short' })
          throw new ApiError('INVALID_PARAMS', { message: REGISTER_ERROR_MESSAGES.passwordTooShort })
        }

        const existingUser = await prisma.user.findUnique({
          where: { name },
          select: { id: true },
        })
        if (existingUser) {
          logAuthAction('REGISTER', name, { error: 'User already exists' })
          throw new ApiError('CONFLICT', { message: REGISTER_ERROR_MESSAGES.userExists })
        }

        const hashedPassword = await bcrypt.hash(password, 12)

        const user = await prisma.$transaction(async (tx) => {
          try {
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
          } catch (error) {
            if (getPrismaErrorCode(error) === 'P2002') {
              logAuthAction('REGISTER', name, { error: 'User already exists' })
              throw new ApiError('CONFLICT', { message: REGISTER_ERROR_MESSAGES.userExists })
            }
            throw error
          }
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
