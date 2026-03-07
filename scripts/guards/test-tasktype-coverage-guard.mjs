#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const root = process.cwd()
const taskTypesPath = path.join(root, 'src', 'lib', 'task', 'types.ts')
const catalogPath = path.join(root, 'tests', 'contracts', 'task-type-catalog.ts')

function fail(title, details = []) {
  console.error(`\n[test-tasktype-coverage-guard] ${title}`)
  for (const detail of details) {
    console.error(`  - ${detail}`)
  }
  process.exit(1)
}

if (!fs.existsSync(taskTypesPath)) {
  fail('Task type source file is missing', ['src/lib/task/types.ts'])
}
if (!fs.existsSync(catalogPath)) {
  fail('Task type catalog file is missing', ['tests/contracts/task-type-catalog.ts'])
}

const taskTypesText = fs.readFileSync(taskTypesPath, 'utf8')
const catalogText = fs.readFileSync(catalogPath, 'utf8')

const taskTypeBlockMatch = taskTypesText.match(/export const TASK_TYPE = \{([\s\S]*?)\n\} as const/)
if (!taskTypeBlockMatch) {
  fail('Unable to parse TASK_TYPE block from src/lib/task/types.ts')
}
const taskTypeBlock = taskTypeBlockMatch ? taskTypeBlockMatch[1] : ''
const taskTypeKeys = Array.from(taskTypeBlock.matchAll(/^\s+([A-Z_]+):\s'[^']+',?$/gm)).map((match) => match[1])
const catalogKeys = Array.from(catalogText.matchAll(/\[TASK_TYPE\.([A-Z_]+)\]/g)).map((match) => match[1])

const missingKeys = taskTypeKeys.filter((key) => !catalogKeys.includes(key))
const staleKeys = catalogKeys.filter((key) => !taskTypeKeys.includes(key))

if (missingKeys.length > 0) {
  fail('Missing TASK_TYPE owners in tests/contracts/task-type-catalog.ts', missingKeys)
}
if (staleKeys.length > 0) {
  fail('Stale TASK_TYPE keys in tests/contracts/task-type-catalog.ts', staleKeys)
}

console.log(`[test-tasktype-coverage-guard] OK taskTypes=${taskTypeKeys.length}`)
