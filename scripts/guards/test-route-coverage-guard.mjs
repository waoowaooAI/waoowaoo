#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const root = process.cwd()
const apiDir = path.join(root, 'src', 'app', 'api')
const catalogPath = path.join(root, 'tests', 'contracts', 'route-catalog.ts')

function fail(title, details = []) {
  console.error(`\n[test-route-coverage-guard] ${title}`)
  for (const detail of details) {
    console.error(`  - ${detail}`)
  }
  process.exit(1)
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.next' || entry.name === 'node_modules') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    if (entry.name === 'route.ts') out.push(fullPath)
  }
  return out
}

function toRel(fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/')
}

if (!fs.existsSync(catalogPath)) {
  fail('route-catalog.ts is missing', ['tests/contracts/route-catalog.ts'])
}

const actualRoutes = walk(apiDir).map(toRel).sort()
const catalogText = fs.readFileSync(catalogPath, 'utf8')
const catalogRoutes = Array.from(catalogText.matchAll(/'src\/app\/api\/[^']+\/route\.ts'/g))
  .map((match) => match[0].slice(1, -1))
  .sort()

const missingInCatalog = actualRoutes.filter((routeFile) => !catalogRoutes.includes(routeFile))
const staleInCatalog = catalogRoutes.filter((routeFile) => !actualRoutes.includes(routeFile))

if (missingInCatalog.length > 0) {
  fail('Missing routes in tests/contracts/route-catalog.ts', missingInCatalog)
}
if (staleInCatalog.length > 0) {
  fail('Stale route entries found in tests/contracts/route-catalog.ts', staleInCatalog)
}

console.log(`[test-route-coverage-guard] OK routes=${actualRoutes.length}`)
