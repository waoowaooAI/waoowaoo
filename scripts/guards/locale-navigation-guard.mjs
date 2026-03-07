#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const scanDirectories = [
  'src/app/[locale]',
]

const extraFiles = [
  'src/components/Navbar.tsx',
  'src/components/LanguageSwitcher.tsx',
]

function toRel(fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/')
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
    if (sourceExtensions.has(path.extname(fullPath))) {
      out.push(fullPath)
    }
  }
  return out
}

function gatherTargetFiles() {
  const files = scanDirectories.flatMap((dir) => walk(path.join(root, dir)))
  for (const relPath of extraFiles) {
    const fullPath = path.join(root, relPath)
    if (fs.existsSync(fullPath)) {
      files.push(fullPath)
    }
  }
  return Array.from(new Set(files))
}

function findViolations(content, relPath) {
  const violations = []
  const lines = content.split('\n')

  const nextLinkImport = /from\s+['"]next\/link['"]/
  const nextNavigationUseRouterImport = /import\s*{[\s\S]*?\buseRouter\b[\s\S]*?}\s*from\s*['"]next\/navigation['"]/m
  const rootHrefLiteral = /\bhref\s*=\s*["']\//
  const rootHrefTemplate = /\bhref\s*=\s*{`\//
  const rootRouterCall = /\brouter\.(push|replace|prefetch)\s*\(\s*["'`]\//

  const nextLinkIndex = content.search(nextLinkImport)
  if (nextLinkIndex >= 0) {
    const lineNo = content.slice(0, nextLinkIndex).split('\n').length
    violations.push(`${relPath}:${lineNo} do not import next/link in locale navigation surface; use @/i18n/navigation Link`)
  }

  const nextNavigationRouterIndex = content.search(nextNavigationUseRouterImport)
  if (nextNavigationRouterIndex >= 0) {
    const lineNo = content.slice(0, nextNavigationRouterIndex).split('\n').length
    violations.push(`${relPath}:${lineNo} do not import useRouter from next/navigation in locale navigation surface; use @/i18n/navigation useRouter`)
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNo = index + 1
    if (rootHrefLiteral.test(line) || rootHrefTemplate.test(line)) {
      violations.push(`${relPath}:${lineNo} do not use root-literal href; use Link href={{ pathname: '...' }} via @/i18n/navigation`)
    }
    if (rootRouterCall.test(line)) {
      violations.push(`${relPath}:${lineNo} do not use root-literal router navigation; use router.push/replace({ pathname: '...' }) via @/i18n/navigation`)
    }
  }

  return violations
}

const violations = []
for (const filePath of gatherTargetFiles()) {
  const content = fs.readFileSync(filePath, 'utf8')
  violations.push(...findViolations(content, toRel(filePath)))
}

if (violations.length > 0) {
  console.error('\n[locale-navigation-guard] violations found:')
  for (const violation of violations) {
    console.error(`  - ${violation}`)
  }
  process.exit(1)
}

console.log('[locale-navigation-guard] OK')
