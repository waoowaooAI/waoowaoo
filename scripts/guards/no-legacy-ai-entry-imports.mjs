#!/usr/bin/env node

/**
 * no-legacy-ai-entry-imports
 *
 * 拒绝 import "AI 调用 / 模型常量 / catalog / runtime"散文件路径。
 * 见 docs/plans/ai-model-provider-refactor.md §6 — 这是 ai-* 三目录契约的硬护栏。
 *
 * Allowlist 模式：
 *   - 快照位于 scripts/guards/snapshots/no-legacy-ai-entry-imports.json
 *   - 不在快照中的文件出现违规 → 阻塞
 *   - 快照中文件被删除 / 不再违规 → 阻塞（提醒缩短快照）
 *   - 通过 `--update-snapshot` 重新生成（**仅限**初始化或合法删除）
 *   - PR 中 snapshot.files 新增任意一项 = code review 阻塞
 */

import { readFileSync, existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'
import { loadAllowlist, writeAllowlist, hasUpdateFlag } from './_legacy-allowlist-snapshot.mjs'

const SNAPSHOT_NAME = 'no-legacy-ai-entry-imports'

const LEGACY_IMPORT_PATTERNS = [
  // 旧执行入口（已物理删除，禁止恢复）
  { label: '@/lib/llm/{chat-completion,chat-stream,vision}', pattern: /['"]@\/lib\/llm\/(?:chat-completion|chat-stream|vision)['"]/ },
  { label: '@/lib/generators/**',  pattern: /['"]@\/lib\/generators(?:\/[^'"]*)?['"]/ },
  { label: '@/lib/model-gateway/**', pattern: /['"]@\/lib\/model-gateway(?:\/[^'"]*)?['"]/ },
  { label: '@/lib/ai-exec compatibility entry', pattern: /['"]@\/lib\/ai-exec\/(?:media\/generator-api|llm\/(?:chat-completion|chat-stream|vision))['"]/ },

  // ai-* 之外的 AI 散文件（Step 3 应清空）
  { label: '@/lib/ark-api',                       pattern: /['"]@\/lib\/ark-api['"]/ },
  { label: '@/lib/ark-llm',                       pattern: /['"]@\/lib\/ark-llm['"]/ },
  { label: '@/lib/llm-client',                    pattern: /['"]@\/lib\/llm-client['"]/ },
  { label: '@/lib/openai-compat-template-runtime', pattern: /['"]@\/lib\/openai-compat-template-runtime['"]/ },
  { label: '@/lib/openai-compat-media-template',   pattern: /['"]@\/lib\/openai-compat-media-template['"]/ },
  { label: '@/lib/gemini-batch-utils',             pattern: /['"]@\/lib\/gemini-batch-utils['"]/ },
  { label: '@/lib/model-config-contract',          pattern: /['"]@\/lib\/model-config-contract['"]/ },

  // 第二/三/四套 catalog（Step 1+4 应清空）
  { label: '@/lib/model-capabilities/**', pattern: /['"]@\/lib\/model-capabilities(?:\/[^'"]*)?['"]/ },
  { label: '@/lib/model-pricing/**',      pattern: /['"]@\/lib\/model-pricing(?:\/[^'"]*)?['"]/ },
  { label: '@/lib/user-api/api-config-catalog', pattern: /['"]@\/lib\/user-api\/api-config-catalog['"]/ },

  // 冗余的第四个 ai-* 目录（Step 3 应清空）
  { label: '@/lib/ai-runtime/**', pattern: /['"]@\/lib\/ai-runtime(?:\/[^'"]*)?['"]/ },

  // 仍承担运行时职责的非 ai-* llm/ 目录（Step 3 应清空）
  { label: '@/lib/llm/**',  pattern: /['"]@\/lib\/llm(?:\/[^'"]*)?['"]/ },

  // 顶层 api-config.ts（Step 3 拆分到 ai-registry/selection.ts）
  { label: '@/lib/api-config', pattern: /['"]@\/lib\/api-config['"]/ },
]

function listTrackedFiles() {
  const output = execSync('git ls-files', {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  })
  return output.split('\n')
    .map((line) => line.trim())
    .filter((file) => /^(src|tests)\/.*\.(?:ts|tsx)$/.test(file) || /^scripts\/migrations\/.*\.(?:ts|tsx|mjs|js)$/.test(file))
}

function fileViolates(file) {
  let source = ''
  try { source = readFileSync(file, 'utf8') } catch { return [] }
  const labels = []
  for (const rule of LEGACY_IMPORT_PATTERNS) {
    if (rule.pattern.test(source)) labels.push(rule.label)
  }
  return labels
}

function runCli() {
  const cwd = process.cwd()
  const argv = process.argv.slice(2)
  const update = hasUpdateFlag(argv)
  const fileArgs = argv.filter((a) => !a.startsWith('--'))
  const files = fileArgs.length > 0
    ? fileArgs.map((f) => relative(cwd, resolve(cwd, f)))
    : listTrackedFiles()

  const violators = []
  for (const file of files) {
    if (fileViolates(file).length > 0) violators.push(file)
  }

  if (update) {
    const path = writeAllowlist(SNAPSHOT_NAME, violators, '由 no-legacy-ai-entry-imports.mjs --update-snapshot 生成；只可缩短。')
    console.log(`[no-legacy-ai-entry-imports] snapshot updated: ${path} files=${violators.length}`)
    return
  }

  const allowlist = loadAllowlist(SNAPSHOT_NAME)
  const newViolations = []
  const cleaned = []
  const missing = []

  for (const file of violators) {
    if (!allowlist.has(file)) {
      for (const label of fileViolates(file)) {
        newViolations.push(`${file}: imports legacy AI entry ${label}`)
      }
    }
  }
  for (const allowed of allowlist) {
    if (!existsSync(resolve(cwd, allowed))) { missing.push(allowed); continue }
    if (fileViolates(allowed).length === 0) cleaned.push(allowed)
  }

  let failed = false
  if (newViolations.length > 0) {
    failed = true
    console.error('\n[no-legacy-ai-entry-imports] NEW legacy AI imports introduced (forbidden):')
    for (const v of newViolations) console.error(`  - ${v}`)
  }
  if (cleaned.length > 0) {
    failed = true
    console.error('\n[no-legacy-ai-entry-imports] Allowlist shrink reminder — these files no longer violate; rerun with --update-snapshot:')
    for (const f of cleaned) console.error(`  - ${f}`)
  }
  if (missing.length > 0) {
    failed = true
    console.error('\n[no-legacy-ai-entry-imports] Allowlist stale — these files are gone; rerun with --update-snapshot:')
    for (const f of missing) console.error(`  - ${f}`)
  }
  if (failed) process.exit(1)
  console.log(`[no-legacy-ai-entry-imports] OK files=${files.length} allowlist=${allowlist.size}`)
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (entryHref && import.meta.url === entryHref) runCli()
