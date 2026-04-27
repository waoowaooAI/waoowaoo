#!/usr/bin/env node

/**
 * no-cross-provider-model-data
 *
 * 强制 §3 物理迁移映射规则：
 *   每个 provider 的 modelId / 规格常量只允许出现在自己的 ai-providers/<providerKey>/** 内。
 *   出现在他处（其他 provider 目录、顶层 model-* / api-config / model-config-contract 等） → 阻塞。
 *
 * 见 docs/plans/ai-model-provider-refactor.md §3 §6。
 *
 * Allowlist 模式：snapshots/no-cross-provider-model-data.json，规则同 no-legacy-ai-entry-imports。
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { loadAllowlist, writeAllowlist, hasUpdateFlag } from './_legacy-allowlist-snapshot.mjs'

const ROOT = process.cwd()
const SOURCE_EXT = new Set(['.ts', '.tsx'])
const SNAPSHOT_NAME = 'no-cross-provider-model-data'

const PROVIDER_TOKENS = {
  ark: [
    /\bdoubao-[a-z0-9.-]+/i,
    /\bseedream-[a-z0-9.-]+/i,
    /\bseededit-[a-z0-9.-]+/i,
    /\bjimeng-[a-z0-9.-]+/i,
    /\bwan2-[a-z0-9.-]+/i,
    /\bkling-v[0-9]+/i,
  ],
  fal: [
    /['"]fal-ai\/[a-z0-9/-]+['"]/i,
    /\bhunyuan-video\b/i,
  ],
  minimax: [
    /\bMiniMax-[A-Za-z0-9-]+/,
    /\b(?:T2V|I2V|S2V)-01[a-z0-9-]*/i,
    /\bvideo-01[a-z0-9-]*/i,
    /\bMiniMax-Hailuo-[A-Za-z0-9-]+/,
  ],
  vidu: [
    /\bvidu(?:1\.5|2\.0|q1|q2)[a-z0-9-]*/i,
    /\bviduq[0-9]+/i,
  ],
  google: [
    /\bgemini-(?:1\.5|2\.0|2\.5)-[a-z0-9-]+/i,
    /\bimagen-[0-9](?:\.[0-9])?/i,
    /\bveo-[0-9](?:\.[0-9])?/i,
  ],
  'openai-compatible': [
    /\bgpt-[345](?:\.[0-9])?-[a-z0-9-]+/i,
    /\bsora-[0-9]/i,
    /\bdall-e-[23]/i,
    /\bgpt-image-[0-9]/i,
  ],
  bailian: [
    /\bwanx[0-9](?:\.[0-9])?-[a-z0-9-]+/i,
    /\bqwen-(?:image|vl|tts|audio)[a-z0-9-]*/i,
    /\bcosyvoice[a-z0-9-]*/i,
  ],
  siliconflow: [
    /['"]Pro\/[A-Za-z0-9/-]+['"]/,
    /['"]Kwai-Kolors\/[A-Za-z0-9/-]+['"]/,
  ],
}

function isAllowedHomeDir(file, providerKey) {
  const rel = file.replaceAll(path.sep, '/')
  if (rel.startsWith('tests/')) return true
  if (rel.startsWith(`src/lib/ai-providers/${providerKey}/`)) return true
  return false
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

function detectOffendingProviders(rel, content) {
  const offending = []
  for (const [providerKey, patterns] of Object.entries(PROVIDER_TOKENS)) {
    if (isAllowedHomeDir(rel, providerKey)) continue
    for (const re of patterns) {
      if (re.test(content)) { offending.push(providerKey); break }
    }
  }
  return offending
}

function runCli() {
  const update = hasUpdateFlag(process.argv.slice(2))
  const files = walk(path.join(ROOT, 'src'))

  const violators = []
  const violationLines = []
  for (const fullPath of files) {
    const rel = path.relative(ROOT, fullPath).split(path.sep).join('/')
    const offending = detectOffendingProviders(rel, fs.readFileSync(fullPath, 'utf8'))
    if (offending.length > 0) {
      violators.push(rel)
      for (const p of offending) {
        violationLines.push(`${rel}: contains "${p}" provider model tokens; move to src/lib/ai-providers/${p}/models.ts`)
      }
    }
  }

  if (update) {
    const out = writeAllowlist(SNAPSHOT_NAME, violators, '由 no-cross-provider-model-data.mjs --update-snapshot 生成；只可缩短。')
    console.log(`[no-cross-provider-model-data] snapshot updated: ${out} files=${violators.length}`)
    return
  }

  const allowlist = loadAllowlist(SNAPSHOT_NAME)
  const newViolations = violationLines.filter((line) => {
    const file = line.split(':')[0]
    return !allowlist.has(file)
  })
  const cleaned = []
  const missing = []
  for (const allowed of allowlist) {
    const full = path.join(ROOT, allowed)
    if (!fs.existsSync(full)) { missing.push(allowed); continue }
    const offending = detectOffendingProviders(allowed, fs.readFileSync(full, 'utf8'))
    if (offending.length === 0) cleaned.push(allowed)
  }

  let failed = false
  if (newViolations.length > 0) {
    failed = true
    console.error('\n[no-cross-provider-model-data] NEW cross-provider model data introduced (forbidden):')
    for (const v of newViolations) console.error(`  - ${v}`)
  }
  if (cleaned.length > 0) {
    failed = true
    console.error('\n[no-cross-provider-model-data] Allowlist shrink reminder — these files no longer violate; rerun with --update-snapshot:')
    for (const f of cleaned) console.error(`  - ${f}`)
  }
  if (missing.length > 0) {
    failed = true
    console.error('\n[no-cross-provider-model-data] Allowlist stale — these files are gone; rerun with --update-snapshot:')
    for (const f of missing) console.error(`  - ${f}`)
  }
  if (failed) process.exit(1)
  console.log(`[no-cross-provider-model-data] OK scanned=${files.length} allowlist=${allowlist.size}`)
}

runCli()
