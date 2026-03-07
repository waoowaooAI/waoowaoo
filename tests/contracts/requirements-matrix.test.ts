import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REQUIREMENTS_MATRIX } from './requirements-matrix'

function fileExists(repoPath: string) {
  return fs.existsSync(path.resolve(process.cwd(), repoPath))
}

describe('requirements matrix integrity', () => {
  it('requirement ids are unique', () => {
    const ids = REQUIREMENTS_MATRIX.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all declared test files exist', () => {
    for (const entry of REQUIREMENTS_MATRIX) {
      expect(entry.tests.length, entry.id).toBeGreaterThan(0)
      for (const testPath of entry.tests) {
        expect(fileExists(testPath), `${entry.id} -> ${testPath}`).toBe(true)
      }
    }
  })
})
