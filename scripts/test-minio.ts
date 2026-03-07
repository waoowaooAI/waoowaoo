/**
 * MinIO 存储测试脚本
 * 运行: npx tsx scripts/test-minio.ts
 */
import { config } from 'dotenv'
config() // 加载 .env 文件

import { getStorageProvider, uploadObject, getSignedObjectUrl, getObjectBuffer, deleteObject } from '../src/lib/storage'
import { randomUUID } from 'crypto'

async function testMinio() {
  console.log('🧪 开始测试 MinIO 存储...\n')

  // 1. 检查环境变量
  console.log('1️⃣ 检查环境变量:')
  const requiredEnv = [
    'STORAGE_TYPE',
    'MINIO_ENDPOINT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'MINIO_BUCKET',
  ]
  for (const key of requiredEnv) {
    const value = process.env[key]
    if (value) {
      // 隐藏敏感信息
      const displayValue = key.includes('SECRET') || key.includes('KEY') && key !== 'STORAGE_TYPE'
        ? '*'.repeat(Math.min(value.length, 8))
        : value
      console.log(`  ✅ ${key}=${displayValue}`)
    } else {
      console.log(`  ❌ ${key}=未设置`)
    }
  }

  // 2. 初始化 Provider
  console.log('\n2️⃣ 初始化存储 Provider:')
  try {
    const provider = getStorageProvider()
    console.log(`  ✅ Provider 类型: ${provider.kind}`)
  } catch (error) {
    console.log(`  ❌ 初始化失败:`, error)
    process.exit(1)
  }

  // 3. 测试上传
  console.log('\n3️⃣ 测试上传:')
  const testKey = `test/${randomUUID()}.txt`
  const testContent = `Hello MinIO! 测试时间: ${new Date().toISOString()}`
  let uploadedKey: string

  try {
    uploadedKey = await uploadObject(Buffer.from(testContent), testKey)
    console.log(`  ✅ 上传成功: ${uploadedKey}`)
  } catch (error) {
    console.log(`  ❌ 上传失败:`, error)
    process.exit(1)
  }

  // 4. 测试获取签名 URL
  console.log('\n4️⃣ 测试获取签名 URL:')
  let signedUrl: string
  try {
    signedUrl = await getSignedObjectUrl(uploadedKey, 300)
    console.log(`  ✅ 签名 URL 生成成功`)
    console.log(`     URL: ${signedUrl.substring(0, 100)}...`)
  } catch (error) {
    console.log(`  ❌ 签名 URL 生成失败:`, error)
    process.exit(1)
  }

  // 5. 测试下载
  console.log('\n5️⃣ 测试下载:')
  try {
    const buffer = await getObjectBuffer(uploadedKey)
    const content = buffer.toString()
    if (content === testContent) {
      console.log(`  ✅ 下载成功，内容匹配`)
    } else {
      console.log(`  ❌ 下载成功，但内容不匹配`)
      console.log(`     预期: ${testContent}`)
      console.log(`     实际: ${content}`)
    }
  } catch (error) {
    console.log(`  ❌ 下载失败:`, error)
    process.exit(1)
  }

  // 6. 通过 HTTP 访问签名 URL
  console.log('\n6️⃣ 测试通过 HTTP 访问签名 URL:')
  try {
    const response = await fetch(signedUrl)
    if (response.ok) {
      const content = await response.text()
      if (content === testContent) {
        console.log(`  ✅ HTTP 访问成功，内容匹配`)
      } else {
        console.log(`  ❌ HTTP 访问成功，但内容不匹配`)
      }
    } else {
      console.log(`  ❌ HTTP 访问失败: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.log(`  ❌ HTTP 请求失败:`, error)
  }

  // 7. 清理测试文件
  console.log('\n7️⃣ 清理测试文件:')
  try {
    await deleteObject(uploadedKey)
    console.log(`  ✅ 删除成功`)
  } catch (error) {
    console.log(`  ❌ 删除失败:`, error)
  }

  console.log('\n✨ 测试完成!')
}

testMinio().catch(console.error)
