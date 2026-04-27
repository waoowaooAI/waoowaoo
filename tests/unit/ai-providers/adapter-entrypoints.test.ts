import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function resolveFromRepoRoot(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath)
}

describe('ai-providers/<x>/adapter.ts entrypoints', () => {
  it('creates adapter.ts entrypoints for each provider directory', () => {
    const expectedFiles = [
      'src/lib/ai-providers/ark/adapter.ts',
      'src/lib/ai-providers/bailian/adapter.ts',
      'src/lib/ai-providers/fal/adapter.ts',
      'src/lib/ai-providers/google/adapter.ts',
      'src/lib/ai-providers/minimax/adapter.ts',
      'src/lib/ai-providers/openai-compatible/adapter.ts',
      'src/lib/ai-providers/openrouter/adapter.ts',
      'src/lib/ai-providers/siliconflow/adapter.ts',
      'src/lib/ai-providers/vidu/adapter.ts',
    ] as const

    for (const file of expectedFiles) {
      expect(fs.existsSync(resolveFromRepoRoot(file))).toBe(true)
    }
  })
})
