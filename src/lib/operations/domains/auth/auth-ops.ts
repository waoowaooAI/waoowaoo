import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { logAuthAction } from '@/lib/logging/semantic'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { getPrismaErrorCode } from '@/lib/prisma-error'
import { AUTH_REGISTER_RESULT_CODES, type AuthRegisterResultCode } from '@/lib/auth/register-result-codes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function throwRegisterInvalidParams(code: AuthRegisterResultCode): never {
  throw new ApiError('INVALID_PARAMS', { code, message: code })
}

function throwRegisterConflict(code: AuthRegisterResultCode): never {
  throw new ApiError('CONFLICT', { code, message: code })
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
          throwRegisterInvalidParams(AUTH_REGISTER_RESULT_CODES.invalidPayload)
        }

        const name = normalizeName(input.name)
        const password = normalizePassword(input.password)

        if (!name) {
          logAuthAction('REGISTER', 'unknown', { error: 'Missing username' })
          throwRegisterInvalidParams(AUTH_REGISTER_RESULT_CODES.missingName)
        }
        if (!password) {
          logAuthAction('REGISTER', name, { error: 'Missing password' })
          throwRegisterInvalidParams(AUTH_REGISTER_RESULT_CODES.missingPassword)
        }
        if (password.length < 6) {
          logAuthAction('REGISTER', name, { error: 'Password too short' })
          throwRegisterInvalidParams(AUTH_REGISTER_RESULT_CODES.passwordTooShort)
        }

        const existingUser = await prisma.user.findUnique({
          where: { name },
          select: { id: true },
        })
        if (existingUser) {
          logAuthAction('REGISTER', name, { error: 'User already exists' })
          throwRegisterConflict(AUTH_REGISTER_RESULT_CODES.userExists)
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
              throwRegisterConflict(AUTH_REGISTER_RESULT_CODES.userExists)
            }
            throw error
          }
        })

        logAuthAction('REGISTER', name, { userId: user.id, success: true })

        return {
          message: AUTH_REGISTER_RESULT_CODES.success,
          user: {
            id: user.id,
            name: user.name,
          },
        }
      },
    }),
  }
}
