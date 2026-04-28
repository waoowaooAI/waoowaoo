import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function runNoAiOutsideAiDirsGuard(): { status: number | null } {
  const result = spawnSync(process.execPath, ['scripts/guards/no-ai-outside-ai-dirs.mjs'], {
    encoding: 'utf8',
  })
  return { status: result.status }
}

describe('no-ai-outside-ai-dirs guard', () => {
  it('rejects provider probe implementations under user-api', () => {
    const tmpDir = path.join(process.cwd(), 'src', 'lib', 'user-api', '__guard_tmp__')
    const tmpFile = path.join(tmpDir, `provider-probe.${Date.now()}.ts`)

    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(tmpFile, "export async function probeProvider() { return fetch('https://example.test') }\n", 'utf8')

    try {
      const failing = runNoAiOutsideAiDirsGuard()
      expect(failing.status).toBe(1)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }

    const passing = runNoAiOutsideAiDirsGuard()
    expect(passing.status).toBe(0)
  })
})
