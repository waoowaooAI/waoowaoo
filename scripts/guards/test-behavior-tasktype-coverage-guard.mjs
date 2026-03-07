#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const root = process.cwd()
const catalogPath = path.join(root, 'tests', 'contracts', 'task-type-catalog.ts')
const matrixPath = path.join(root, 'tests', 'contracts', 'tasktype-behavior-matrix.ts')

function fail(title, details = []) {
  console.error(`\n[test-behavior-tasktype-coverage-guard] ${title}`)
  for (const detail of details) {
    console.error(`  - ${detail}`)
  }
  process.exit(1)
}

if (!fs.existsSync(catalogPath)) {
  fail('task type catalog is missing', ['tests/contracts/task-type-catalog.ts'])
}
if (!fs.existsSync(matrixPath)) {
  fail('tasktype behavior matrix is missing', ['tests/contracts/tasktype-behavior-matrix.ts'])
}

const catalogText = fs.readFileSync(catalogPath, 'utf8')
const matrixText = fs.readFileSync(matrixPath, 'utf8')

if (!matrixText.includes('TASK_TYPE_CATALOG.map')) {
  fail('tasktype behavior matrix must derive entries from TASK_TYPE_CATALOG.map')
}

const taskTypeCount = Array.from(catalogText.matchAll(/\[TASK_TYPE\.([A-Z_]+)\]/g)).length
if (taskTypeCount === 0) {
  fail('no task types detected in task type catalog')
}

const testFiles = Array.from(matrixText.matchAll(/'tests\/[a-zA-Z0-9_\-/.]+\.test\.ts'/g))
  .map((match) => match[0].slice(1, -1))

if (testFiles.length === 0) {
  fail('tasktype behavior matrix does not declare any behavior test files')
}

const missingTests = Array.from(new Set(testFiles)).filter((file) => !fs.existsSync(path.join(root, file)))
if (missingTests.length > 0) {
  fail('tasktype behavior matrix references missing test files', missingTests)
}

console.log(`[test-behavior-tasktype-coverage-guard] OK taskTypes=${taskTypeCount} tests=${new Set(testFiles).size}`)
