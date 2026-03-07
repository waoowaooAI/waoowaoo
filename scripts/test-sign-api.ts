/**
 * 测试 /api/storage/sign 端点
 * 运行: npx tsx scripts/test-sign-api.ts
 */
import { config } from 'dotenv'
config()

import { uploadObject, getSignedObjectUrl } from '../src/lib/storage'
import { randomUUID } from 'crypto'
import http from 'http'

async function testSignApi() {
  console.log('🧪 测试 /api/storage/sign API...\n')

  // 1. 上传测试文件
  console.log('1️⃣ 上传测试文件:')
  const testKey = `images/test-${randomUUID()}.txt`
  const testContent = 'Hello from MinIO test!'
  
  await uploadObject(Buffer.from(testContent), testKey)
  console.log(`  ✅ 上传成功: ${testKey}`)

  // 2. 生成签名 URL（服务端直接调用）
  console.log('\n2️⃣ 服务端生成签名 URL:')
  const signedUrl = await getSignedObjectUrl(testKey, 300)
  console.log(`  URL: ${signedUrl}`)

  // 3. 测试直接访问签名 URL
  console.log('\n3️⃣ 测试直接访问签名 URL:')
  try {
    const response = await fetch(signedUrl)
    if (response.ok) {
      const content = await response.text()
      console.log(`  ✅ 访问成功，内容: "${content}"`)
    } else {
      console.log(`  ❌ 访问失败: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.log(`  ❌ 请求失败:`, error)
  }

  // 4. 测试 /api/storage/sign 端点（模拟前端访问）
  console.log('\n4️⃣ 测试 /api/storage/sign 端点（模拟前端）:')
  const signApiUrl = `http://localhost:3000/api/storage/sign?key=${encodeURIComponent(testKey)}&expires=300`
  console.log(`  URL: ${signApiUrl}`)
  
  try {
    const response = await fetch(signApiUrl, { redirect: 'manual' })
    console.log(`  状态: ${response.status}`)
    console.log(`  Location: ${response.headers.get('location')}`)
    
    if (response.status === 307 || response.status === 302) {
      const redirectUrl = response.headers.get('location')
      console.log(`  ✅ 重定向 URL: ${redirectUrl?.substring(0, 80)}...`)
      
      // 5. 测试跟随重定向
      console.log('\n5️⃣ 测试跟随重定向访问图片:')
      const finalResponse = await fetch(signApiUrl, { redirect: 'follow' })
      if (finalResponse.ok) {
        const content = await finalResponse.text()
        console.log(`  ✅ 最终访问成功，内容: "${content}"`)
      } else {
        console.log(`  ❌ 最终访问失败: ${finalResponse.status}`)
      }
    } else {
      const body = await response.text()
      console.log(`  响应: ${body.substring(0, 200)}`)
    }
  } catch (error) {
    console.log(`  ❌ 请求失败（可能服务器未启动）:`, error)
  }

  // 6. 测试 /api/cos/image 端点（旧版兼容）
  console.log('\n6️⃣ 测试 /api/cos/image 端点（旧版兼容）:')
  const cosApiUrl = `http://localhost:3000/api/cos/image?key=${encodeURIComponent(testKey)}&expires=300`
  console.log(`  URL: ${cosApiUrl}`)
  
  try {
    const response = await fetch(cosApiUrl, { redirect: 'manual' })
    console.log(`  状态: ${response.status}`)
    console.log(`  Location: ${response.headers.get('location')}`)
  } catch (error) {
    console.log(`  ❌ 请求失败（可能服务器未启动）:`, error)
  }

  // 清理
  console.log('\n7️⃣ 清理测试文件:')
  const { deleteObject } = await import('../src/lib/storage')
  await deleteObject(testKey)
  console.log(`  ✅ 清理完成`)

  console.log('\n✨ 测试完成!')
}

testSignApi().catch(console.error)
