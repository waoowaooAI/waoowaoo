import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  parseSyncFlag,
  resolveDisplayMode,
  resolvePositiveInteger,
  shouldRunSyncTask,
} from '@/lib/llm-observe/route-task'

function buildRequest(path: string, headers?: Record<string, string>) {
  return new NextRequest(new URL(path, 'http://localhost'), {
    method: 'POST',
    headers: headers || {},
  })
}

describe('route-task helpers', () => {
  it('parseSyncFlag supports boolean-like values', () => {
    expect(parseSyncFlag(true)).toBe(true)
    expect(parseSyncFlag(1)).toBe(true)
    expect(parseSyncFlag('1')).toBe(true)
    expect(parseSyncFlag('true')).toBe(true)
    expect(parseSyncFlag('yes')).toBe(true)
    expect(parseSyncFlag('on')).toBe(true)
    expect(parseSyncFlag('false')).toBe(false)
    expect(parseSyncFlag(0)).toBe(false)
  })

  it('shouldRunSyncTask true when internal task header exists', () => {
    const req = buildRequest('/api/test', { 'x-internal-task-id': 'task-1' })
    expect(shouldRunSyncTask(req, {})).toBe(true)
  })

  it('shouldRunSyncTask true when body sync flag exists', () => {
    const req = buildRequest('/api/test')
    expect(shouldRunSyncTask(req, { sync: 'true' })).toBe(true)
  })

  it('shouldRunSyncTask true when query sync flag exists', () => {
    const req = buildRequest('/api/test?sync=1')
    expect(shouldRunSyncTask(req, {})).toBe(true)
  })

  it('resolveDisplayMode falls back to default on invalid value', () => {
    expect(resolveDisplayMode('detail', 'loading')).toBe('detail')
    expect(resolveDisplayMode('loading', 'detail')).toBe('loading')
    expect(resolveDisplayMode('invalid', 'loading')).toBe('loading')
  })

  it('resolvePositiveInteger returns safe integer fallback', () => {
    expect(resolvePositiveInteger(2.9, 1)).toBe(2)
    expect(resolvePositiveInteger('9', 1)).toBe(9)
    expect(resolvePositiveInteger('0', 7)).toBe(7)
    expect(resolvePositiveInteger('abc', 7)).toBe(7)
  })
})
