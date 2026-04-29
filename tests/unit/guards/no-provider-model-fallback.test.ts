import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function runNoProviderModelFallbackGuard(): { status: number | null } {
  const result = spawnSync(process.execPath, ['scripts/guards/no-provider-model-fallback.mjs'], {
    encoding: 'utf8',
  })
  return { status: result.status }
}

describe('no-provider-model-fallback guard', () => {
  it('rejects implicit provider model fallback in provider execution code', () => {
    const tmpDir = path.join(process.cwd(), 'src', 'lib', 'ai-providers', '__guard_tmp__')
    const tmpFile = path.join(tmpDir, `no-provider-model-fallback.${Date.now()}.ts`)

    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(tmpFile, "export const bad = input.selection.modelId || 'fallback-model'\n", 'utf8')

    try {
      const failing = runNoProviderModelFallbackGuard()
      expect(failing.status).toBe(1)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }

    const passing = runNoProviderModelFallbackGuard()
    expect(passing.status).toBe(0)
  })
})
