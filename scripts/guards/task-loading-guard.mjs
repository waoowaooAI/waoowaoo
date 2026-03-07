#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const workspaceRoot = process.cwd()
const baselinePath = path.join(workspaceRoot, 'scripts/guards/task-loading-baseline.json')

function walkFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, out)
    } else {
      out.push(fullPath)
    }
  }
  return out
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/')
}

function collectMatches(files, pattern) {
  const matches = []
  for (const fullPath of files) {
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) continue
    const relPath = toPosixRelative(fullPath)
    const content = fs.readFileSync(fullPath, 'utf8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes(pattern)) {
        matches.push(`${relPath}:${i + 1}`)
      }
    }
  }
  return matches
}

function fail(title, lines) {
  console.error(`\n[task-loading-guard] ${title}`)
  for (const line of lines) {
    console.error(`  - ${line}`)
  }
  process.exit(1)
}

if (!fs.existsSync(baselinePath)) {
  fail('Missing baseline file', [toPosixRelative(baselinePath)])
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const allowedFiles = new Set(baseline.allowedDirectTaskStateUsageFiles || [])
const allowedLegacyGeneratingFiles = new Set(baseline.allowedLegacyGeneratingUsageFiles || [])
const allFiles = walkFiles(path.join(workspaceRoot, 'src'))

const directTaskStateUsage = collectMatches(allFiles, 'useTaskTargetStates(')
const directUsageOutOfAllowlist = directTaskStateUsage
  .map((entry) => entry.split(':')[0])
  .filter((file) => !allowedFiles.has(file))

if (directUsageOutOfAllowlist.length > 0) {
  fail(
    'Found component-level direct useTaskTargetStates outside baseline allowlist',
    Array.from(new Set(directUsageOutOfAllowlist)),
  )
}

const crossDomainLabels = collectMatches(allFiles, 'video.panelCard.generating')
if (crossDomainLabels.length > 0) {
  fail('Found cross-domain loading label reuse (video.panelCard.generating)', crossDomainLabels)
}

const uiFiles = allFiles.filter((file) => {
  const relPath = toPosixRelative(file)
  return relPath.startsWith('src/app/') || relPath.startsWith('src/components/')
})
const legacyGeneratingPatterns = [
  'appearance.generating',
  'panel.generatingImage',
  'shot.generatingImage',
  'line.generating',
]
const legacyGeneratingMatches = legacyGeneratingPatterns.flatMap((pattern) =>
  collectMatches(uiFiles, pattern),
)
const legacyGeneratingOutOfAllowlist = legacyGeneratingMatches
  .map((entry) => entry.split(':')[0])
  .filter((file) => !allowedLegacyGeneratingFiles.has(file))
if (legacyGeneratingOutOfAllowlist.length > 0) {
  fail(
    'Found legacy generating truth usage in UI components',
    Array.from(new Set(legacyGeneratingOutOfAllowlist)),
  )
}

const hooksIndexPath = path.join(workspaceRoot, 'src/lib/query/hooks/index.ts')
if (fs.existsSync(hooksIndexPath)) {
  const hooksIndex = fs.readFileSync(hooksIndexPath, 'utf8')
  const bannedReexports = [
    {
      pattern: /export\s*\{[^}]*useGenerateCharacterImage[^}]*\}\s*from\s*['"]\.\/useGlobalAssets['"]/m,
      message: 'hooks/index.ts must not export useGenerateCharacterImage from useGlobalAssets',
    },
    {
      pattern: /export\s*\{[^}]*useGenerateLocationImage[^}]*\}\s*from\s*['"]\.\/useGlobalAssets['"]/m,
      message: 'hooks/index.ts must not export useGenerateLocationImage from useGlobalAssets',
    },
    {
      pattern: /export\s*\{[^}]*useGenerateProjectCharacterImage[^}]*\}\s*from\s*['"]\.\/useProjectAssets['"]/m,
      message: 'hooks/index.ts must not export useGenerateProjectCharacterImage from useProjectAssets',
    },
    {
      pattern: /export\s*\{[^}]*useGenerateProjectLocationImage[^}]*\}\s*from\s*['"]\.\/useProjectAssets['"]/m,
      message: 'hooks/index.ts must not export useGenerateProjectLocationImage from useProjectAssets',
    },
  ]

  const violations = bannedReexports
    .filter((item) => item.pattern.test(hooksIndex))
    .map((item) => item.message)

  if (violations.length > 0) {
    fail('Found non-canonical mutation re-exports', violations)
  }
}

console.log('[task-loading-guard] OK')
