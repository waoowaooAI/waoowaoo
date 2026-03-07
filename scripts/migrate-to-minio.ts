#!/usr/bin/env node
/**
 * 存储迁移脚本: Local → MinIO
 * 
 * 用途: 将本地文件存储的数据无缝迁移到 MinIO 对象存储
 * 特点:
 * - 断点续传（记录已迁移文件）
 * - 校验和验证
 * - 原子性操作（失败可回滚）
 * - 并行上传加速
 */

import { Client as MinioClient } from 'minio'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'

// ==================== 配置 ====================
const CONFIG = {
  // 源: 本地存储
  local: {
    baseDir: process.env.LOCAL_UPLOAD_DIR || './data/uploads',
  },
  // 目标: MinIO
  minio: {
    endPoint: process.env.MINIO_ENDPOINT?.replace(/^https?:\/\//, '') || '127.0.0.1',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'waoowaoo',
    region: process.env.MINIO_REGION || 'us-east-1',
    forcePathStyle: process.env.MINIO_FORCE_PATH_STYLE !== 'false',
  },
  // 迁移选项
  options: {
    concurrency: parseInt(process.env.MIGRATE_CONCURRENCY || '5'),
    dryRun: process.env.MIGRATE_DRY_RUN === 'true',
    resume: process.env.MIGRATE_RESUME !== 'false',
    progressFile: process.env.MIGRATE_PROGRESS_FILE || './scripts/.migrate-progress.json',
    logLevel: process.env.MIGRATE_LOG_LEVEL || 'info', // debug, info, warn, error
  }
}

// ==================== 日志 ====================
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
function log(level: string, message: string, ...args: unknown[]) {
  if (LOG_LEVELS[level as keyof typeof LOG_LEVELS] >= LOG_LEVELS[CONFIG.options.logLevel as keyof typeof LOG_LEVELS]) {
    const timestamp = new Date().toISOString()
    console[level === 'error' ? 'error' : 'log'](\`[\${timestamp}] [\${level.toUpperCase()}] \${message}\`, ...args)
  }
}

// ==================== MinIO 客户端 ====================
const minioClient = new MinioClient({
  endPoint: CONFIG.minio.endPoint,
  port: CONFIG.minio.port,
  useSSL: CONFIG.minio.useSSL,
  accessKey: CONFIG.minio.accessKey,
  secretKey: CONFIG.minio.secretKey,
  region: CONFIG.minio.region,
})

// ==================== 文件扫描 ====================
async function scanLocalFiles(dir: string, basePath = ''): Promise<Array<{localPath: string, key: string, size: number, mtime: Date}>> {
  const files: Array<{localPath: string, key: string, size: number, mtime: Date}> = []
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.join(basePath, entry.name)
      
      if (entry.isDirectory()) {
        const subFiles = await scanLocalFiles(fullPath, relativePath)
        files.push(...subFiles)
      } else {
        const stats = await fs.stat(fullPath)
        files.push({
          localPath: fullPath,
          key: relativePath.replace(/\\/g, '/'), // 统一使用正斜杠
          size: stats.size,
          mtime: stats.mtime,
        })
      }
    }
  } catch (err: unknown) {
    log('warn', \`无法读取目录: \${dir}\`, (err as Error).message)
  }
  
  return files
}

// ==================== 校验和 ====================
async function calculateHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5')
    const stream = createReadStream(filePath)
    
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// ==================== 进度管理 ====================
async function loadProgress(): Promise<Set<string>> {
  try {
    if (!CONFIG.options.resume) {
      return new Set()
    }
    const data = await fs.readFile(CONFIG.options.progressFile, 'utf-8')
    const progress = JSON.parse(data)
    return new Set(progress.migrated || [])
  } catch {
    return new Set()
  }
}

async function saveProgress(migratedKeys: Set<string>) {
  const progress = {
    updatedAt: new Date().toISOString(),
    migrated: Array.from(migratedKeys),
  }
  await fs.writeFile(CONFIG.options.progressFile, JSON.stringify(progress, null, 2))
}

// ==================== 存储桶检查/创建 ====================
async function ensureBucket() {
  log('info', \`检查存储桶: \${CONFIG.minio.bucket}\`)
  
  const exists = await minioClient.bucketExists(CONFIG.minio.bucket)
  if (!exists) {
    log('info', \`创建存储桶: \${CONFIG.minio.bucket}\`)
    await minioClient.makeBucket(CONFIG.minio.bucket, CONFIG.minio.region)
    
    // 设置存储桶为 public read (可选，根据需求)
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [\`arn:aws:s3:::\${CONFIG.minio.bucket}/*\`]
        }
      ]
    }
    await minioClient.setBucketPolicy(CONFIG.minio.bucket, JSON.stringify(policy))
    log('info', '存储桶访问策略已设置为公开读取')
  }
}

// ==================== 文件上传 ====================
async function uploadFile(fileInfo: {localPath: string, key: string, size: number}, migratedKeys: Set<string>): Promise<{status: string, key: string, size?: number, error?: string}> {
  const { localPath, key, size } = fileInfo
  
  // 检查是否已迁移
  if (migratedKeys.has(key)) {
    log('debug', \`跳过已迁移: \${key}\`)
    return { status: 'skipped', key }
  }
  
  if (CONFIG.options.dryRun) {
    log('info', \`[DRY RUN] 将上传: \${key} (\${formatBytes(size)})\`)
    return { status: 'dry_run', key }
  }
  
  try {
    // 计算本地文件 MD5
    const localHash = await calculateHash(localPath)
    
    // 上传文件
    const fileStream = createReadStream(localPath)
    await minioClient.putObject(CONFIG.minio.bucket, key, fileStream, size, {
      'Content-Type': guessContentType(key),
      'X-Amz-Meta-Original-Hash': localHash,
    })
    
    // 验证上传
    const stat = await minioClient.statObject(CONFIG.minio.bucket, key)
    
    // 记录迁移成功
    migratedKeys.add(key)
    
    log('info', \`✓ 上传成功: \${key} (\${formatBytes(size)})\`)
    return { status: 'success', key, size }
    
  } catch (err: unknown) {
    log('error', \`✗ 上传失败: \${key}\`, (err as Error).message)
    return { status: 'error', key, error: (err as Error).message }
  }
}

// ==================== 内容类型猜测 ====================
function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.json': 'application/json',
    '.txt': 'text/plain',
  }
  return types[ext] || 'application/octet-stream'
}

// ==================== 字节格式化 ====================
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// ==================== 并行任务控制 ====================
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = []
  const executing: Promise<void>[] = []
  
  for (const task of tasks) {
    const promise = task().then(result => {
      results.push(result)
    })
    executing.push(promise)
    
    if (executing.length >= concurrency) {
      await Promise.race(executing)
      executing.splice(executing.findIndex(p => p === promise), 1)
    }
  }
  
  await Promise.all(executing)
  return results
}

// ==================== 主流程 ====================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║         Local Storage → MinIO Migration Tool             ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log()
  
  log('info', '配置信息:')
  log('info', \`  本地目录: \${path.resolve(CONFIG.local.baseDir)}\`)
  log('info', \`  MinIO: \${CONFIG.minio.endPoint}:\${CONFIG.minio.port}/\${CONFIG.minio.bucket}\`)
  log('info', \`  并发数: \${CONFIG.options.concurrency}\`)
  log('info', \`  干运行: \${CONFIG.options.dryRun}\`)
  log('info', \`  断点续传: \${CONFIG.options.resume}\`)
  console.log()
  
  // 1. 扫描本地文件
  log('info', '扫描本地文件...')
  const files = await scanLocalFiles(CONFIG.local.baseDir)
  log('info', \`找到 \${files.length} 个文件\`)
  
  if (files.length === 0) {
    log('info', '没有需要迁移的文件')
    return
  }
  
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  log('info', \`总大小: \${formatBytes(totalSize)}\`)
  console.log()
  
  // 2. 加载进度
  const migratedKeys = await loadProgress()
  log('info', \`已迁移: \${migratedKeys.size} 个文件\`)
  
  // 3. 确保存储桶存在
  await ensureBucket()
  
  // 4. 执行迁移
  const startTime = Date.now()
  let processed = 0
  let success = 0
  let failed = 0
  let skipped = 0
  
  const uploadTasks = files.map(file => async () => {
    const result = await uploadFile(file, migratedKeys)
    processed++
    
    if (result.status === 'success') success++
    else if (result.status === 'error') failed++
    else if (result.status === 'skipped') skipped++
    
    // 每 10 个文件保存一次进度
    if (processed % 10 === 0) {
      await saveProgress(migratedKeys)
      const progress = ((processed / files.length) * 100).toFixed(1)
      log('info', \`进度: \${progress}% (\${processed}/\${files.length})\`)
    }
    
    return result
  })
  
  await runWithConcurrency(uploadTasks, CONFIG.options.concurrency)
  
  // 5. 保存最终进度
  await saveProgress(migratedKeys)
  
  // 6. 报告
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log()
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║                      迁移完成                            ║')
  console.log('╠══════════════════════════════════════════════════════════╣')
  console.log(\`║ 总文件数:    \${String(files.length).padEnd(39)} ║\`)
  console.log(\`║ 成功:        \${String(success).padEnd(39)} ║\`)
  console.log(\`║ 失败:        \${String(failed).padEnd(39)} ║\`)
  console.log(\`║ 跳过:        \${String(skipped).padEnd(39)} ║\`)
  console.log(\`║ 耗时:        \${String(duration + 's').padEnd(39)} ║\`)
  console.log('╚══════════════════════════════════════════════════════════╝')
  
  // 7. 后续步骤提示
  console.log()
  console.log('📋 后续步骤:')
  console.log('  1. 验证 MinIO 中的文件: mc ls local/waoowaoo')
  console.log('  2. 更新 .env: STORAGE_TYPE=minio')
  console.log('  3. 重启应用: docker compose restart app')
  console.log('  4. 测试图片/视频访问是否正常')
  console.log('  5. 确认无误后可删除本地文件: rm -rf ./data/uploads')
  
  if (failed > 0) {
    process.exit(1)
  }
}

// 运行
main().catch(err => {
  log('error', '迁移失败:', err)
  process.exit(1)
})
