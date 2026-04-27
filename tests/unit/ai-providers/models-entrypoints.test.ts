import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function resolveFromRepoRoot(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath)
}

describe('ai-providers/<x>/models.ts entrypoints', () => {
  it('creates models.ts entrypoints for each provider directory', () => {
    const expectedFiles = [
      'src/lib/ai-providers/ark/models.ts',
      'src/lib/ai-providers/openai-compatible/models.ts',
      'src/lib/ai-providers/google/models.ts',
      'src/lib/ai-providers/minimax/models.ts',
      'src/lib/ai-providers/vidu/models.ts',
      'src/lib/ai-providers/bailian/models.ts',
      'src/lib/ai-providers/fal/models.ts',
      'src/lib/ai-providers/siliconflow/models.ts',
    ] as const

    for (const file of expectedFiles) {
      expect(fs.existsSync(resolveFromRepoRoot(file))).toBe(true)
    }
  })
})
