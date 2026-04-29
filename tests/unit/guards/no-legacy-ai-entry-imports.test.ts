import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

function writeTempSource(source: string): string {
  const dir = join(tmpdir(), 'waoowaoo-guard-tests')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `legacy-${Math.random().toString(16).slice(2)}.ts`)
  writeFileSync(file, source)
  return relative(process.cwd(), file)
}

function runNoLegacyAiEntryImportsGuard(files: readonly string[]) {
  const result = spawnSync(
    process.execPath,
    ['scripts/guards/no-legacy-ai-entry-imports.mjs', ...files],
    { encoding: 'utf8' },
  )
  return {
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('no-legacy-ai-entry-imports guard', () => {
  it('rejects business imports from legacy generators', () => {
    const file = writeTempSource("import { createImageGenerator } from '@/" + "lib/generators/factory'\n")
    const result = runNoLegacyAiEntryImportsGuard([file])
    expect(result.code).toBe(1)
  })


  it('rejects ai-exec compatibility entry imports', () => {
    const file = writeTempSource("import { chatCompletion } from '@/lib/" + "ai-exec/llm/chat-completion'\n")
    const result = runNoLegacyAiEntryImportsGuard([file])
    expect(result.code).toBe(1)
  })

  it('allows engine imports', () => {
    const file = writeTempSource("import { generateImage } from '@/lib/ai-exec/engine'\n")
    const result = runNoLegacyAiEntryImportsGuard([file])
    expect(result.code).toBe(0)
  })
})
