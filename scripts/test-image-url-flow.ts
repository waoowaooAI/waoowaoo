/**
 * 图片 URL 流程测试
 * 模拟图片生成后的存储和读取流程
 * 运行: npx tsx scripts/test-image-url-flow.ts
 */
import { config } from 'dotenv'
config()

import { uploadObject, getSignedUrl, extractStorageKey, toFetchableUrl } from '../src/lib/storage'
import { keyToSignedUrl, addSignedUrlToLocation } from '../src/lib/storage'
import { encodeImageUrls, decodeImageUrlsFromDb } from '../src/lib/contracts/image-urls-contract'
import { randomUUID } from 'crypto'

async function testImageUrlFlow() {
  console.log('🧪 测试图片 URL 全流程...\n')

  // 1. 模拟上传图片到存储
  console.log('1️⃣ 模拟上传图片:')
  const testKey = `images/location-${randomUUID()}.jpg`
  const testImageContent = Buffer.from('fake-image-data')

  let storedKey: string
  try {
    storedKey = await uploadObject(testImageContent, testKey)
    console.log(`  ✅ 上传成功，返回 key: ${storedKey}`)
  } catch (error) {
    console.log(`  ❌ 上传失败:`, error)
    process.exit(1)
  }

  // 2. 模拟存储到数据库（encodeImageUrls）
  console.log('\n2️⃣ 模拟数据库存储（encodeImageUrls）:')
  const imageUrlsArray = [storedKey]
  const dbValue = encodeImageUrls(imageUrlsArray)
  console.log(`  ✅ 数据库值: ${dbValue}`)

  // 3. 模拟从数据库读取（decodeImageUrlsFromDb）
  console.log('\n3️⃣ 模拟数据库读取（decodeImageUrlsFromDb）:')
  const decodedKeys = decodeImageUrlsFromDb(dbValue)
  console.log(`  ✅ 解析出的 keys: ${JSON.stringify(decodedKeys)}`)

  // 4. 测试 keyToSignedUrl（用于 API 返回给前端）
  console.log('\n4️⃣ 测试 keyToSignedUrl（API 层转换）:')
  for (const key of decodedKeys) {
    const signedUrl = keyToSignedUrl(key)
    console.log(`  Key: ${key}`)
    console.log(`  → Signed URL: ${signedUrl}`)

    // 检查是否是 /api/storage/sign 格式
    if (signedUrl?.startsWith('/api/storage/sign')) {
      console.log(`  ✅ 正确生成了签名 URL 路径`)
    } else if (signedUrl?.startsWith('http')) {
      console.log(`  ⚠️ 返回了完整 HTTP URL，可能无法直接访问`)
    } else {
      console.log(`  ⚠️ URL 格式: ${signedUrl}`)
    }
  }

  // 5. 测试 addSignedUrlToLocation（完整对象转换）
  console.log('\n5️⃣ 测试 addSignedUrlToLocation（完整对象转换）:')
  const mockLocationFromDb = {
    id: 'loc-123',
    name: '测试场景',
    images: [
      {
        id: 'img-1',
        imageUrl: storedKey,
        imageIndex: 0,
      }
    ]
  }

  const locationWithSignedUrls = addSignedUrlToLocation(mockLocationFromDb)
  console.log(`  转换后的 location.images:`)
  for (const img of locationWithSignedUrls.images || []) {
    console.log(`    - imageIndex: ${img.imageIndex}`)
    console.log(`    - imageUrl: ${img.imageUrl}`)

    if (img.imageUrl?.startsWith('/api/storage/sign')) {
      console.log(`    ✅ 正确: 是相对路径签名 URL`)
    } else if (img.imageUrl?.startsWith('http://127.0.0.1:19000')) {
      console.log(`    ❌ 错误: 是 MinIO 直链，可能需要签名`)
    } else if (img.imageUrl?.startsWith('http')) {
      console.log(`    ⚠️ 是外部 HTTP URL`)
    } else {
      console.log(`    ⚠️ 其他格式: ${img.imageUrl}`)
    }
  }

  // 6. 测试 getSignedUrl 直接调用
  console.log('\n6️⃣ 测试 getSignedUrl 直接调用:')
  const directSignedUrl = getSignedUrl(storedKey)
  console.log(`  Key: ${storedKey}`)
  console.log(`  → URL: ${directSignedUrl}`)

  // 7. 测试 extractStorageKey
  console.log('\n7️⃣ 测试 extractStorageKey（从各种 URL 提取 key）:')
  const testUrls = [
    storedKey,
    `http://127.0.0.1:19000/waoowaoo/${storedKey}`,
    directSignedUrl,
  ]
  for (const url of testUrls) {
    const extracted = extractStorageKey(url)
    console.log(`  ${url.substring(0, 60)}...`)
    console.log(`    → extracted: ${extracted}`)
  }

  // 8. 清理测试数据
  console.log('\n8️⃣ 清理测试数据:')
  try {
    const { deleteObject } = await import('../src/lib/storage')
    await deleteObject(storedKey)
    console.log(`  ✅ 删除成功`)
  } catch (error) {
    console.log(`  ⚠️ 删除失败（可忽略）:`, error)
  }

  console.log('\n✨ 测试完成!')
  console.log('\n📋 总结:')
  console.log('  如果第4、5步返回的是 /api/storage/sign?key=... 格式 → ✅ 正常')
  console.log('  如果第4、5步返回的是 http://127.0.0.1:19000/... 格式 → ❌ 需要修复')
}

testImageUrlFlow().catch(console.error)
