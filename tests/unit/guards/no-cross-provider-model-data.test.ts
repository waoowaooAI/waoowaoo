import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type GuardRunResult = {
  status: number | null
}

function runNoCrossProviderModelDataGuard(): GuardRunResult {
  const result = spawnSync(process.execPath, ['scripts/guards/no-cross-provider-model-data.mjs'], {
    encoding: 'utf8',
  })
  return { status: result.status }
}

describe('no-cross-provider-model-data guard', () => {
  it('fails when provider model tokens appear outside their provider directory', () => {
    const tmpDir = path.join(process.cwd(), 'src', '__guard_tmp__')
    const tmpFile = path.join(tmpDir, `no-cross-provider-model-data.${Date.now()}.ts`)

    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(tmpFile, "export const bad = 'gpt-4.1-mini' as const\n", 'utf8')

    try {
      const failing = runNoCrossProviderModelDataGuard()
      expect(failing.status).toBe(1)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }

    const passing = runNoCrossProviderModelDataGuard()
    expect(passing.status).toBe(0)
  })
})
