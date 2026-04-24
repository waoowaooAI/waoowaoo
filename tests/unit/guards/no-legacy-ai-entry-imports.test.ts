import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectLegacyAiEntryImports } from '../../../scripts/guards/no-legacy-ai-entry-imports.mjs'

function writeTempSource(source: string): string {
  const dir = join(tmpdir(), 'waoowaoo-guard-tests')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `legacy-${Math.random().toString(16).slice(2)}.ts`)
  writeFileSync(file, source)
  return relative(process.cwd(), file)
}

describe('no-legacy-ai-entry-imports guard', () => {
  it('rejects business imports from legacy generators', () => {
    const file = writeTempSource("import { createImageGenerator } from '@/" + "lib/generators/factory'\n")
    const violations = inspectLegacyAiEntryImports([file])
    expect(violations).toEqual([
      `${file}: imports legacy AI entry @/lib/generators; use @/lib/ai-exec/engine or provider adapter paths`,
    ])
  })


  it('rejects ai-exec compatibility entry imports', () => {
    const file = writeTempSource("import { chatCompletion } from '@/lib/" + "ai-exec/llm/chat-completion'\n")
    const violations = inspectLegacyAiEntryImports([file])
    expect(violations).toEqual([
      `${file}: imports legacy AI entry @/lib/ai-exec compatibility entry; use @/lib/ai-exec/engine or provider adapter paths`,
    ])
  })

  it('allows engine imports', () => {
    const file = writeTempSource("import { generateImage } from '@/lib/ai-exec/engine'\n")
    expect(inspectLegacyAiEntryImports([file])).toEqual([])
  })
})
