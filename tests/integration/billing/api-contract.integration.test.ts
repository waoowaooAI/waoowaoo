import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { calcText } from '@/lib/billing/cost'
import { withTextBilling } from '@/lib/billing/service'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestProject, createTestUser, seedBalance } from '../../helpers/billing-fixtures'

describe('billing/api contract integration', () => {
  beforeEach(async () => {
    await resetBillingState()
    process.env.BILLING_MODE = 'ENFORCE'
  })

  it('returns 402 payload when balance is insufficient', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 0)

    const route = apiHandler(async () => {
      await withTextBilling(
        user.id,
        'anthropic/claude-sonnet-4',
        1000,
        500,
        { projectId: project.id, action: 'api_contract_insufficient' },
        async () => ({ ok: true }),
      )
      return NextResponse.json({ ok: true })
    })

    const req = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'x-request-id': 'req_insufficient' },
    })
    const response = await route(req, { params: Promise.resolve({}) })
    const body = await response.json()

    expect(response.status).toBe(402)
    expect(body?.error?.code).toBe('INSUFFICIENT_BALANCE')
    expect(typeof body?.required).toBe('number')
    expect(typeof body?.available).toBe('number')
  })

  it('rejects duplicate retry with same request id and prevents duplicate charge', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 5)

    const route = apiHandler(async () => {
      await withTextBilling(
        user.id,
        'anthropic/claude-sonnet-4',
        1000,
        500,
        { projectId: project.id, action: 'api_contract_dedupe' },
        async () => ({ ok: true }),
      )
      return NextResponse.json({ ok: true })
    })

    const req1 = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'x-request-id': 'same_request_id' },
    })
    const req2 = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'x-request-id': 'same_request_id' },
    })

    const resp1 = await route(req1, { params: Promise.resolve({}) })
    const resp2 = await route(req2, { params: Promise.resolve({}) })
    const body2 = await resp2.json()

    expect(resp1.status).toBe(200)
    expect(resp2.status).toBe(409)
    expect(body2?.error?.code).toBe('CONFLICT')
    expect(String(body2?.error?.message || '')).toContain('duplicate billing request already confirmed')

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    const expectedCharge = calcText('anthropic/claude-sonnet-4', 1000, 500)
    expect(balance?.totalSpent).toBeCloseTo(expectedCharge, 8)
    expect(await prisma.balanceFreeze.count()).toBe(1)
  })
})
