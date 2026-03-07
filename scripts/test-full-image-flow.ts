/**
 * 模拟完整的图像生成和显示流程
 * 运行: npx tsx scripts/test-full-image-flow.ts
 */
import { config } from 'dotenv'
config()

import { uploadObject, getStorageProvider } from '../src/lib/storage'
import { extractStorageKeyFromLegacyValue, resolveMediaRefFromLegacyValue, getMediaObjectByPublicId } from '../src/lib/media/service'
import { attachMediaFieldsToProject } from '../src/lib/media/attach'
import { randomUUID } from 'crypto'

async function testFullImageFlow() {
  console.log('🧪 模拟完整图像生成和显示流程...\n')

  const provider = getStorageProvider()
  console.log(`存储类型: ${provider.kind}\n`)

  // 1. 模拟图像生成后的上传
  console.log('1️⃣ 模拟图像生成后上传:')
  const testKey = `images/location-${randomUUID()}.jpg`
  const testImageContent = Buffer.from('fake-generated-image-data')
  
  const storedKey = await uploadObject(testImageContent, testKey)
  console.log(`  ✅ 上传成功，返回 key: ${storedKey}`)

  // 2. 模拟数据库存储（存储 key）
  console.log('\n2️⃣ 模拟数据库存储:')
  const mockDbLocation = {
    id: 'loc-test-123',
    name: '测试场景',
    images: [
      {
        id: 'img-1',
        imageUrl: storedKey,  // 存储的是 key，不是完整 URL
        imageIndex: 0,
      }
    ]
  }
  console.log(`  存储的 imageUrl: ${storedKey}`)

  // 3. 测试 extractStorageKeyFromLegacyValue
  console.log('\n3️⃣ 测试 extractStorageKeyFromLegacyValue:')
  const extractedKey = extractStorageKeyFromLegacyValue(storedKey)
  console.log(`  输入: ${storedKey}`)
  console.log(`  输出: ${extractedKey}`)
  if (extractedKey) {
    console.log(`  ✅ 成功提取 storageKey`)
  } else {
    console.log(`  ❌ 未能提取 storageKey - 这是问题所在！`)
  }

  // 4. 测试 resolveMediaRefFromLegacyValue（创建 MediaObject）
  console.log('\n4️⃣ 测试 resolveMediaRefFromLegacyValue:')
  try {
    const mediaRef = await resolveMediaRefFromLegacyValue(storedKey)
    if (mediaRef) {
      console.log(`  ✅ MediaObject 创建/获取成功`)
      console.log(`     id: ${mediaRef.id}`)
      console.log(`     publicId: ${mediaRef.publicId}`)
      console.log(`     url: ${mediaRef.url}`)
      console.log(`     storageKey: ${mediaRef.storageKey}`)
    } else {
      console.log(`  ❌ MediaRef 为 null`)
    }
  } catch (error) {
    console.log(`  ❌ 失败:`, error)
  }

  // 5. 测试 attachMediaFieldsToProject（完整流程）
  console.log('\n5️⃣ 测试 attachMediaFieldsToProject（API 层转换）:')
  try {
    const mockProject = {
      id: 'proj-test',
      locations: [mockDbLocation]
    }
    
    const result = await attachMediaFieldsToProject(mockProject)
    const location = result.locations?.[0]
    const image = location?.images?.[0]
    
    console.log(`  转换后的 imageUrl: ${image?.imageUrl}`)
    
    if (image?.imageUrl?.startsWith('/m/')) {
      console.log(`  ✅ 正确生成了 /m/ 格式的 URL`)
      
      // 提取 publicId
      const publicId = image.imageUrl.replace('/m/', '').split('?')[0]
      console.log(`  publicId: ${publicId}`)
      
      // 验证 MediaObject 存在
      const media = await getMediaObjectByPublicId(publicId)
      if (media) {
        console.log(`  ✅ MediaObject 存在，storageKey: ${media.storageKey}`)
      } else {
        console.log(`  ❌ MediaObject 不存在！`)
      }
    } else if (image?.imageUrl?.startsWith('http')) {
      console.log(`  ⚠️ 返回了完整 HTTP URL: ${image.imageUrl}`)
    } else if (!image?.imageUrl) {
      console.log(`  ❌ imageUrl 为空！`)
    } else {
      console.log(`  ⚠️ URL 格式: ${image.imageUrl}`)
    }
  } catch (error) {
    console.log(`  ❌ 失败:`, error)
  }

  // 6. 测试访问 /m/ URL
  console.log('\n6️⃣ 测试访问 /m/ URL:')
  try {
    const mockProject = {
      id: 'proj-test',
      locations: [mockDbLocation]
    }
    
    const result = await attachMediaFieldsToProject(mockProject)
    const imageUrl = result.locations?.[0]?.images?.[0]?.imageUrl
    
    if (imageUrl?.startsWith('/m/')) {
      const fullUrl = `http://localhost:3000${imageUrl}`
      console.log(`  尝试访问: ${fullUrl}`)
      
      try {
        const response = await fetch(fullUrl, { redirect: 'manual' })
        console.log(`  状态: ${response.status}`)
        
        if (response.status === 200) {
          console.log(`  ✅ /m/ 端点工作正常`)
        } else if (response.status === 307 || response.status === 302) {
          console.log(`  ✅ /m/ 端点返回重定向（正常）`)
          console.log(`  Location: ${response.headers.get('location')?.substring(0, 80)}...`)
        } else if (response.status === 404) {
          console.log(`  ❌ MediaObject 未找到（404）`)
        } else {
          console.log(`  ⚠️ 状态码: ${response.status}`)
        }
      } catch (error) {
        console.log(`  ⚠️ 请求失败（可能服务器未启动）:`, error)
      }
    } else {
      console.log(`  跳过测试（URL 格式不正确）`)
    }
  } catch (error) {
    console.log(`  跳过测试:`, error)
  }

  // 清理
  console.log('\n7️⃣ 清理测试数据:')
  try {
    const { deleteObject } = await import('../src/lib/storage')
    await deleteObject(storedKey)
    console.log(`  ✅ 删除成功`)
  } catch (error) {
    console.log(`  ⚠️ 删除失败:`, error)
  }

  console.log('\n✨ 测试完成!')
}

testFullImageFlow().catch(console.error)
