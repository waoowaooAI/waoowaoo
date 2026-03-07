#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const root = process.cwd()
const catalogPath = path.join(root, 'tests', 'contracts', 'route-catalog.ts')
const matrixPath = path.join(root, 'tests', 'contracts', 'route-behavior-matrix.ts')

function fail(title, details = []) {
  console.error(`\n[test-behavior-route-coverage-guard] ${title}`)
  for (const detail of details) {
    console.error(`  - ${detail}`)
  }
  process.exit(1)
}

if (!fs.existsSync(catalogPath)) {
  fail('route catalog is missing', ['tests/contracts/route-catalog.ts'])
}
if (!fs.existsSync(matrixPath)) {
  fail('route behavior matrix is missing', ['tests/contracts/route-behavior-matrix.ts'])
}

const catalogText = fs.readFileSync(catalogPath, 'utf8')
const matrixText = fs.readFileSync(matrixPath, 'utf8')

if (!matrixText.includes('ROUTE_CATALOG.map')) {
  fail('route behavior matrix must derive entries from ROUTE_CATALOG.map')
}

const routeFilesBlockMatch = catalogText.match(/const ROUTE_FILES = \[([\s\S]*?)\] as const/)
if (!routeFilesBlockMatch) {
  fail('unable to parse ROUTE_FILES block from route catalog')
}
const routeFilesBlock = routeFilesBlockMatch ? routeFilesBlockMatch[1] : ''
const routeCount = Array.from(routeFilesBlock.matchAll(/'src\/app\/api\/[^']+\/route\.ts'/g)).length
if (routeCount === 0) {
  fail('no routes detected in route catalog')
}

const testFiles = Array.from(matrixText.matchAll(/'tests\/[a-zA-Z0-9_\-/.]+\.test\.ts'/g))
  .map((match) => match[0].slice(1, -1))

if (testFiles.length === 0) {
  fail('route behavior matrix does not declare any behavior test files')
}

const missingTests = Array.from(new Set(testFiles)).filter((file) => !fs.existsSync(path.join(root, file)))
if (missingTests.length > 0) {
  fail('route behavior matrix references missing test files', missingTests)
}

console.log(`[test-behavior-route-coverage-guard] OK routes=${routeCount} tests=${new Set(testFiles).size}`)
