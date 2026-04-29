#!/usr/bin/env node

/**
 * no-cross-provider-switch
 *
 * 强制 §1.2 抽象规则：
 *   adapter 内部禁止 `providerKey === 'X'` / `provider === 'X'` 这类按字面值分流。
 *   分流是 ai-exec/engine + ai-providers/index.ts(注册表) 的唯一职责。
 *
 * 检查范围：src/lib/{ai-providers,ai-exec,ai-registry}/**
 * 白名单文件（允许出现 providerKey 字面量做注册/分发）：
 *   - src/lib/ai-providers/index.ts
 *
 * Allowlist 模式：snapshots/no-cross-provider-switch.json，规则同 no-legacy-ai-entry-imports。
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { loadAllowlist, writeAllowlist, hasUpdateFlag } from './_legacy-allowlist-snapshot.mjs'

const ROOT = process.cwd()
const SOURCE_EXT = new Set(['.ts', '.tsx'])
const SNAPSHOT_NAME = 'no-cross-provider-switch'

const SCAN_ROOTS = [
  'src/lib/ai-providers',
  'src/lib/ai-exec',
  'src/lib/ai-registry',
]

const WHITELIST = new Set([
  'src/lib/ai-providers/index.ts',
  'src/lib/ai-registry/runtime-selection.ts',
])

const JS_PRIMITIVE_TYPE_NAMES = new Set(['string', 'number', 'boolean', 'object', 'function', 'undefined', 'symbol', 'bigint'])

function getProviderDirKey(rel) {
  const match = /^src\/lib\/ai-providers\/([^/]+)\//.exec(rel)
  return match ? match[1] : null
}

function findHits(content, rel = '') {
  const hits = []
  const providerDirKey = getProviderDirKey(rel)
  const re = /(^|[^A-Za-z0-9_])(providerKey|providerId|provider)\s*(===|!==|==|!=)\s*['"]([A-Za-z0-9_-]+)['"]/g
  let m
  while ((m = re.exec(content)) !== null) {
    const before = content.slice(Math.max(0, m.index - 8), m.index + m[1].length)
    if (/\btypeof\s+$/.test(before)) continue
    if (JS_PRIMITIVE_TYPE_NAMES.has(m[4])) continue
    if (providerDirKey && m[4] === providerDirKey) continue
    hits.push(`${m[2]} ${m[3]} '${m[4]}'`)
  }
  return hits
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.next', 'node_modules', '.tmp'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

function runCli() {
  const update = hasUpdateFlag(process.argv.slice(2))
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(ROOT, root)))

  const violators = []
  const violationLines = []
  for (const fullPath of files) {
    const rel = path.relative(ROOT, fullPath).split(path.sep).join('/')
    if (WHITELIST.has(rel)) continue
    const hits = findHits(fs.readFileSync(fullPath, 'utf8'), rel)
    if (hits.length > 0) {
      violators.push(rel)
      for (const h of hits) violationLines.push(`${rel}: forbidden cross-provider switch literal: ${h}`)
    }
  }

  if (update) {
    const out = writeAllowlist(SNAPSHOT_NAME, violators, '由 no-cross-provider-switch.mjs --update-snapshot 生成；只可缩短。')
    console.log(`[no-cross-provider-switch] snapshot updated: ${out} files=${violators.length}`)
    return
  }

  const allowlist = loadAllowlist(SNAPSHOT_NAME)
  const newViolations = violationLines.filter((line) => !allowlist.has(line.split(':')[0]))
  const cleaned = []
  const missing = []
  for (const allowed of allowlist) {
    const full = path.join(ROOT, allowed)
    if (!fs.existsSync(full)) { missing.push(allowed); continue }
    if (findHits(fs.readFileSync(full, 'utf8'), allowed).length === 0) cleaned.push(allowed)
  }

  let failed = false
  if (newViolations.length > 0) {
    failed = true
    console.error('\n[no-cross-provider-switch] NEW cross-provider literal switches introduced (forbidden):')
    for (const v of newViolations) console.error(`  - ${v}`)
    console.error('\n  Move the branch into src/lib/ai-providers/<providerKey>/<modality>.ts and route via ai-exec/engine.')
  }
  if (cleaned.length > 0) {
    failed = true
    console.error('\n[no-cross-provider-switch] Allowlist shrink reminder — these files no longer violate; rerun with --update-snapshot:')
    for (const f of cleaned) console.error(`  - ${f}`)
  }
  if (missing.length > 0) {
    failed = true
    console.error('\n[no-cross-provider-switch] Allowlist stale — these files are gone; rerun with --update-snapshot:')
    for (const f of missing) console.error(`  - ${f}`)
  }
  if (failed) process.exit(1)
  console.log(`[no-cross-provider-switch] OK scanned=${files.length} allowlist=${allowlist.size}`)
}

runCli()
