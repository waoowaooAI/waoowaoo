#!/usr/bin/env npx tsx
/**
 * 本地存储 → MinIO 迁移脚本
 * 使用 @aws-sdk/client-s3（项目已有依赖）
 * 
 * 用法: npx tsx scripts/migrate-local-to-minio.ts
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createReadStream } from 'fs'

// ==================== 配置 ====================
const LOCAL_DIR = process.env.LOCAL_UPLOAD_DIR || './data/uploads'
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://127.0.0.1:19000'
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'waoowaoo'
const MINIO_REGION = process.env.MINIO_REGION || 'us-east-1'
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin'
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin'
const CONCURRENCY = parseInt(process.env.MIGRATE_CONCURRENCY || '10')
const DRY_RUN = process.env.MIGRATE_DRY_RUN === 'true'

// ==================== S3 客户端 ====================
const s3 = new S3Client({
    endpoint: MINIO_ENDPOINT,
    region: MINIO_REGION,
    forcePathStyle: true,
    credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
    },
})

// ==================== 工具函数 ====================
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
        '.ogg': 'audio/ogg',
        '.json': 'application/json',
        '.txt': 'text/plain',
    }
    return types[ext] || 'application/octet-stream'
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// ==================== 扫描本地文件 ====================
async function scanLocalFiles(dir: string, basePath = ''): Promise<Array<{ localPath: string; key: string; size: number }>> {
    const files: Array<{ localPath: string; key: string; size: number }> = []

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            const relativePath = path.join(basePath, entry.name)

            if (entry.isDirectory()) {
                files.push(...await scanLocalFiles(fullPath, relativePath))
            } else {
                // 跳过隐藏文件
                if (entry.name.startsWith('.')) continue
                const stats = await fs.stat(fullPath)
                files.push({
                    localPath: fullPath,
                    key: relativePath.replace(/\\/g, '/'),
                    size: stats.size,
                })
            }
        }
    } catch (err: unknown) {
        console.error(`  ⚠️ 无法读取目录: ${dir}`, (err as Error).message)
    }

    return files
}

// ==================== 检查文件是否已存在 ====================
async function objectExists(key: string): Promise<boolean> {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: MINIO_BUCKET, Key: key }))
        return true
    } catch {
        return false
    }
}

// ==================== 上传文件 ====================
async function uploadFile(file: { localPath: string; key: string; size: number }): Promise<'success' | 'skipped' | 'error'> {
    // 检查是否已存在
    if (await objectExists(file.key)) {
        return 'skipped'
    }

    if (DRY_RUN) {
        console.log(`  [DRY RUN] 将上传: ${file.key} (${formatBytes(file.size)})`)
        return 'skipped'
    }

    try {
        const body = await fs.readFile(file.localPath)
        await s3.send(new PutObjectCommand({
            Bucket: MINIO_BUCKET,
            Key: file.key,
            Body: body,
            ContentType: guessContentType(file.key),
        }))
        return 'success'
    } catch (err: unknown) {
        console.error(`  ✗ 上传失败: ${file.key}`, (err as Error).message)
        return 'error'
    }
}

// ==================== 并行控制 ====================
async function runBatched<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency)
        await Promise.all(batch.map(fn))
    }
}

// ==================== 主流程 ====================
async function main() {
    console.log()
    console.log('╔══════════════════════════════════════════════════════╗')
    console.log('║      Local Storage → MinIO Migration Tool           ║')
    console.log('╚══════════════════════════════════════════════════════╝')
    console.log()
    console.log(`  📂 源目录:    ${path.resolve(LOCAL_DIR)}`)
    console.log(`  🪣 目标桶:    ${MINIO_ENDPOINT}/${MINIO_BUCKET}`)
    console.log(`  ⚡ 并发数:    ${CONCURRENCY}`)
    console.log(`  🔍 干运行:    ${DRY_RUN}`)
    console.log()

    // 1. 扫描文件
    console.log('📦 扫描本地文件...')
    const files = await scanLocalFiles(LOCAL_DIR)

    if (files.length === 0) {
        console.log('  没有需要迁移的文件')
        return
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0)
    console.log(`  找到 ${files.length} 个文件, 总大小: ${formatBytes(totalSize)}`)
    console.log()

    // 2. 开始上传
    console.log('🚀 开始迁移...')
    const startTime = Date.now()
    let success = 0
    let skipped = 0
    let failed = 0
    let processed = 0

    await runBatched(files, CONCURRENCY, async (file) => {
        const result = await uploadFile(file)
        processed++

        if (result === 'success') {
            success++
            if (success % 50 === 0 || success <= 5) {
                console.log(`  ✓ [${processed}/${files.length}] ${file.key} (${formatBytes(file.size)})`)
            }
        } else if (result === 'skipped') {
            skipped++
        } else {
            failed++
        }

        if (processed % 100 === 0) {
            const pct = ((processed / files.length) * 100).toFixed(1)
            console.log(`  📊 进度: ${pct}% (${processed}/${files.length}) | ✓${success} ⏭${skipped} ✗${failed}`)
        }
    })

    // 3. 结果
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log()
    console.log('╔══════════════════════════════════════════════════════╗')
    console.log('║                    迁移完成                          ║')
    console.log('╠══════════════════════════════════════════════════════╣')
    console.log(`║  总文件:  ${String(files.length).padEnd(40)} ║`)
    console.log(`║  成功:    ${String(success).padEnd(40)} ║`)
    console.log(`║  跳过:    ${String(skipped).padEnd(40)} ║`)
    console.log(`║  失败:    ${String(failed).padEnd(40)} ║`)
    console.log(`║  耗时:    ${String(duration + 's').padEnd(40)} ║`)
    console.log(`║  大小:    ${formatBytes(totalSize).padEnd(40)} ║`)
    console.log('╚══════════════════════════════════════════════════════╝')

    if (failed > 0) {
        console.log()
        console.log('⚠️  有文件上传失败，请重新运行脚本（已上传的会自动跳过）')
        process.exit(1)
    }
}

main().catch(err => {
    console.error('迁移失败:', err)
    process.exit(1)
})
