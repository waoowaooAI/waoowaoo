import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/api-errors'

const prismaMock = vi.hoisted(() => {
  const tx = {
    user: {
      create: vi.fn(),
    },
    userBalance: {
      create: vi.fn(),
    },
  }

  return {
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    __tx: tx,
  }
})

const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('bcryptjs', () => ({ default: bcryptMock }))
vi.mock('@/lib/logging/semantic', () => ({ logAuthAction: vi.fn() }))

import { createAuthOperations } from '@/lib/operations/domains/auth/auth-ops'

type RegisterInput = {
  name?: unknown
  password?: unknown
}

function buildContext() {
  return {
    request: new Request('http://localhost/api/auth/register') as unknown as NextRequest,
    userId: 'anonymous',
    projectId: 'system',
    context: {},
    source: 'auth',
    writer: null,
  }
}

async function executeRegister(input: RegisterInput | unknown) {
  const operation = createAuthOperations().auth_register_user
  return await operation.execute(buildContext(), input)
}

describe('auth register operation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.__tx.user.create.mockResolvedValue({ id: 'user-1', name: 'alice' })
    prismaMock.__tx.userBalance.create.mockResolvedValue({
      userId: 'user-1',
      balance: 0,
      frozenAmount: 0,
      totalSpent: 0,
    })
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock.__tx) => Promise<unknown>) => await callback(prismaMock.__tx),
    )
    bcryptMock.hash.mockResolvedValue('hashed-password')
  })

  it('[重复用户名注册] -> 返回友好的 CONFLICT 错误而不是 Invalid parameters', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-user' })

    const promise = executeRegister({ name: 'alice', password: 'secret1' })

    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({
      code: 'CONFLICT',
      message: '该用户名已被注册，请换一个用户名或直接登录',
      details: expect.objectContaining({
        message: '该用户名已被注册，请换一个用户名或直接登录',
      }),
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('[缺少用户名] -> 返回明确的用户名提示', async () => {
    const promise = executeRegister({ name: '   ', password: 'secret1' })

    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      message: '请输入用户名',
      details: expect.objectContaining({
        message: '请输入用户名',
      }),
    })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('[注册请求体不是对象] -> 返回明确的注册表单提示', async () => {
    const promise = executeRegister(null)

    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      message: '请填写用户名和密码',
      details: expect.objectContaining({
        message: '请填写用户名和密码',
      }),
    })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('[缺少密码] -> 返回明确的密码提示', async () => {
    const promise = executeRegister({ name: 'alice', password: '' })

    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      message: '请输入密码',
      details: expect.objectContaining({
        message: '请输入密码',
      }),
    })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('[密码过短] -> 返回明确的长度提示', async () => {
    const promise = executeRegister({ name: 'alice', password: '12345' })

    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      message: '密码长度至少6位',
      details: expect.objectContaining({
        message: '密码长度至少6位',
      }),
    })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('[并发唯一键冲突] -> 返回和重复用户名一致的友好错误', async () => {
    prismaMock.__tx.user.create.mockRejectedValue({ code: 'P2002', message: 'Unique constraint failed' })

    const promise = executeRegister({ name: 'alice', password: 'secret1' })

    await expect(promise).rejects.toMatchObject({
      code: 'CONFLICT',
      message: '该用户名已被注册，请换一个用户名或直接登录',
    })
    expect(bcryptMock.hash).toHaveBeenCalledWith('secret1', 12)
  })

  it('[有效注册] -> 归一化用户名并创建用户与初始余额', async () => {
    const result = await executeRegister({ name: ' alice ', password: 'secret1' })

    expect(result).toEqual({
      message: '注册成功',
      user: {
        id: 'user-1',
        name: 'alice',
      },
    })
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { name: 'alice' },
      select: { id: true },
    })
    expect(bcryptMock.hash).toHaveBeenCalledWith('secret1', 12)
    expect(prismaMock.__tx.user.create).toHaveBeenCalledWith({
      data: {
        name: 'alice',
        password: 'hashed-password',
      },
    })
    expect(prismaMock.__tx.userBalance.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        balance: 0,
        frozenAmount: 0,
        totalSpent: 0,
      },
    })
  })
})
