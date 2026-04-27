#!/usr/bin/env node

/**
 * no-ai-outside-ai-dirs
 *
 * §0.1 终极契约：所有"AI 调用 / 模型常量 / SDK 直接 import"逻辑
 *   仅允许出现在以下 4 个目录：
 *     src/lib/ai-providers/   ← 实现层
 *     src/lib/ai-registry/    ← 元数据/合同/选择/catalog
 *     src/lib/ai-exec/        ← 执行入口 + 治理
 *     src/lib/llm-observe/    ← 观测，正交
 *
 *   其余 src/** 路径：
 *     - 严禁 import openai / @google/genai / @google/generative-ai / fal-ai / @volcengine SDK
 *     - 严禁出现高识别度 modelId 字面量
 *     - 业务调用 AI 必须经 @/lib/ai-exec/engine
 *     - tests/** 不在管控内
 *
 * Allowlist 模式：snapshots/no-ai-outside-ai-dirs.json
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { loadAllowlist, writeAllowlist, hasUpdateFlag } from './_legacy-allowlist-snapshot.mjs'

const ROOT = process.cwd()
const SOURCE_EXT = new Set(['.ts', '.tsx'])
const SNAPSHOT_NAME = 'no-ai-outside-ai-dirs'

const ALLOWED_AI_DIRS = [
  'src/lib/ai-providers/',
  'src/lib/ai-registry/',
  'src/lib/ai-exec/',
  'src/lib/llm-observe/',
]

const FORBIDDEN_SDK_IMPORTS = [
  /from\s+['"]openai['"]/,
  /from\s+['"]openai\/[a-z0-9/-]+['"]/i,
  /from\s+['"]@google\/genai['"]/,
  /from\s+['"]@google\/generative-ai['"]/,
  /from\s+['"]@anthropic-ai\/sdk['"]/,
  /from\s+['"]fal-ai['"]/,
  /from\s+['"]@fal-ai\/[a-z0-9/-]+['"]/i,
  /from\s+['"]@volcengine\/[a-z0-9/-]+['"]/i,
  /from\s+['"]ali-cloud-sdk['"]/i,
]

const FORBIDDEN_MODEL_TOKENS = [
  /\bdoubao-[a-z0-9.-]+/i,
  /\bseedream-[a-z0-9.-]+/i,
  /\bgpt-image-[0-9]/i,
  /['"]fal-ai\/[a-z0-9/-]+['"]/i,
  /\bMiniMax-[A-Za-z0-9-]+/,
  /\bvidu(?:1\.5|2\.0|q1|q2)[a-z0-9-]*/i,
  /\bimagen-[0-9](?:\.[0-9])?/i,
  /\bveo-[0-9](?:\.[0-9])?/i,
  /\bwanx[0-9](?:\.[0-9])?-[a-z0-9-]+/i,
]

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

function isInAllowedDir(rel) {
  return ALLOWED_AI_DIRS.some((d) => rel.startsWith(d))
}

function findHits(content) {
  const hits = []
  for (const re of FORBIDDEN_SDK_IMPORTS) {
    const m = content.match(re)
    if (m) hits.push(`SDK import: ${m[0]}`)
  }
  for (const re of FORBIDDEN_MODEL_TOKENS) {
    const m = content.match(re)
    if (m) hits.push(`model token: ${m[0]}`)
  }
  return hits
}

function runCli() {
  const update = hasUpdateFlag(process.argv.slice(2))
  const files = walk(path.join(ROOT, 'src'))

  const violators = []
  const violationLines = []
  for (const fullPath of files) {
    const rel = path.relative(ROOT, fullPath).split(path.sep).join('/')
    if (isInAllowedDir(rel)) continue
    const hits = findHits(fs.readFileSync(fullPath, 'utf8'))
    if (hits.length > 0) {
      violators.push(rel)
      for (const h of hits) violationLines.push(`${rel}: ${h}; move under src/lib/ai-providers/** or call via @/lib/ai-exec/engine`)
    }
  }

  if (update) {
    const out = writeAllowlist(SNAPSHOT_NAME, violators, '由 no-ai-outside-ai-dirs.mjs --update-snapshot 生成；只可缩短。')
    console.log(`[no-ai-outside-ai-dirs] snapshot updated: ${out} files=${violators.length}`)
    return
  }

  const allowlist = loadAllowlist(SNAPSHOT_NAME)
  const newViolations = violationLines.filter((line) => !allowlist.has(line.split(':')[0]))
  const cleaned = []
  const missing = []
  for (const allowed of allowlist) {
    const full = path.join(ROOT, allowed)
    if (!fs.existsSync(full)) { missing.push(allowed); continue }
    if (findHits(fs.readFileSync(full, 'utf8')).length === 0) cleaned.push(allowed)
  }

  let failed = false
  if (newViolations.length > 0) {
    failed = true
    console.error('\n[no-ai-outside-ai-dirs] NEW AI usage outside ai-* dirs (forbidden):')
    for (const v of newViolations) console.error(`  - ${v}`)
  }
  if (cleaned.length > 0) {
    failed = true
    console.error('\n[no-ai-outside-ai-dirs] Allowlist shrink reminder — these files no longer violate; rerun with --update-snapshot:')
    for (const f of cleaned) console.error(`  - ${f}`)
  }
  if (missing.length > 0) {
    failed = true
    console.error('\n[no-ai-outside-ai-dirs] Allowlist stale — these files are gone; rerun with --update-snapshot:')
    for (const f of missing) console.error(`  - ${f}`)
  }
  if (failed) process.exit(1)
  console.log(`[no-ai-outside-ai-dirs] OK scanned=${files.length} allowlist=${allowlist.size}`)
}

runCli()
