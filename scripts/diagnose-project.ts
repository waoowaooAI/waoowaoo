/**
 * 诊断项目任务状态
 * 运行: npx tsx scripts/diagnose-project.ts <projectId>
 */
import { config } from 'dotenv'
config()

import { prisma } from '../src/lib/prisma'

async function diagnoseProject(projectId: string) {
  console.log(`🔍 诊断项目: ${projectId}\n`)

  // 1. 检查项目是否存在
  console.log('1️⃣ 项目基本信息:')
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      novelPromotionData: true
    }
  })
  
  if (!project) {
    console.log('  ❌ 项目不存在')
    process.exit(1)
  }
  
  console.log(`  名称: ${project.name}`)
  console.log(`  模式: ${project.mode}`)
  console.log(`  用户ID: ${project.userId}`)

  // 2. 检查 NovelPromotionProject
  console.log('\n2️⃣ 小说推广项目配置:')
  const novelData = project.novelPromotionData
  if (!novelData) {
    console.log('  ❌ novelPromotionData 未创建')
  } else {
    console.log(`  ID: ${novelData.id}`)
    console.log(`  视频比例: ${novelData.videoRatio || '未设置'}`)
    console.log(`  画风提示: ${novelData.artStylePrompt || '未设置'}`)
  }

  // 3. 检查场景和场景图片
  console.log('\n3️⃣ 场景资产:')
  const novelProjectId = novelData?.id
  if (!novelProjectId) {
    console.log('  ❌ 无法获取 novelPromotionProject ID')
    process.exit(1)
  }
  
  const locations = await prisma.novelPromotionLocation.findMany({
    where: { novelPromotionProjectId: novelProjectId },
    include: {
      images: {
        orderBy: { imageIndex: 'asc' }
      }
    }
  })
  
  console.log(`  场景数量: ${locations.length}`)
  
  for (const loc of locations) {
    console.log(`\n  📍 ${loc.name} (${loc.id})`)
    console.log(`     图片数量: ${loc.images?.length || 0}`)
    
    for (const img of loc.images || []) {
      console.log(`     - [${img.imageIndex}] imageUrl: ${img.imageUrl || 'null'}`)
      console.log(`       isSelected: ${img.isSelected}`)
      console.log(`       description: ${img.description || 'null'}`)

      // 检查 MediaObject
      if (img.imageUrl) {
        const media = await prisma.mediaObject.findFirst({
          where: { 
            OR: [
              { storageKey: img.imageUrl },
              { storageKey: { contains: img.imageUrl.split('/').pop() || '' } }
            ]
          }
        })
        if (media) {
          console.log(`       ✅ MediaObject: ${media.publicId}`)
        } else {
          console.log(`       ⚠️ 未找到 MediaObject`)
        }
      }
    }
  }

  // 4. 检查最近的任务
  console.log('\n4️⃣ 最近的任务:')
  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  
  console.log(`  任务数量: ${tasks.length}`)
  
  for (const task of tasks) {
    console.log(`\n  📝 ${task.type} (${task.id})`)
    console.log(`     状态: ${task.status}`)
    console.log(`     目标: ${task.targetType} / ${task.targetId}`)
    console.log(`     创建时间: ${task.createdAt}`)
    console.log(`     更新时间: ${task.updatedAt}`)

    if (task.errorMessage || task.errorCode) {
      console.log(`     ❌ 错误码: ${task.errorCode || 'N/A'}`)
      console.log(`     ❌ 错误信息: ${task.errorMessage?.substring(0, 200) || 'N/A'}`)
    }

    // 获取任务事件
    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'desc' },
      take: 3
    })
    
    if (events.length > 0) {
      console.log(`     最近事件:`)
      for (const event of events) {
        console.log(`       - ${event.eventType}: ${JSON.stringify(event.payload).substring(0, 100)}`)
      }
    }
  }

  // 5. 检查 Worker 队列状态
  console.log('\n5️⃣ 检查 Worker 配置:')
  console.log(`  REDIS_HOST: ${process.env.REDIS_HOST || '未设置'}`)
  console.log(`  REDIS_PORT: ${process.env.REDIS_PORT || '未设置'}`)
  
  // 尝试连接 Redis
  try {
    const { Redis } = await import('ioredis')
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      connectTimeout: 5000
    })
    
    const pingResult = await redis.ping()
    console.log(`  ✅ Redis 连接: ${pingResult}`)
    
    // 检查 BullMQ 队列
    const queueKeys = await redis.keys('bull:*:id')
    console.log(`  BullMQ 队列数量: ${queueKeys.length}`)
    
    for (const key of queueKeys.slice(0, 5)) {
      const queueName = key.replace('bull:', '').replace(':id', '')
      const jobCounts = await redis.hgetall(`bull:${queueName}:id`)
      console.log(`    - ${queueName}`)
    }
    
    redis.disconnect()
  } catch (error) {
    console.log(`  ❌ Redis 连接失败:`, error)
  }

  // 6. 检查模型配置
  console.log('\n6️⃣ 检查用户模型配置:')
  const userPreference = await prisma.userPreference.findUnique({
    where: { userId: project.userId }
  })

  if (!userPreference) {
    console.log('  ❌ 用户偏好配置不存在')
  } else {
    console.log(`  角色模型: ${userPreference.characterModel || '未设置'}`)
    console.log(`  场景模型: ${userPreference.locationModel || '未设置'}`)
    console.log(`  视频模型: ${userPreference.videoModel || '未设置'}`)
    console.log(`  编辑模型: ${userPreference.editModel || '未设置'}`)
    console.log(`  口型同步模型: ${userPreference.lipSyncModel || '未设置'}`)
    console.log(`  分析模型: ${userPreference.analysisModel || '未设置'}`)
  }

  console.log('\n✨ 诊断完成!')
  
  await prisma.$disconnect()
}

const projectId = process.argv[2]
if (!projectId) {
  console.log('用法: npx tsx scripts/diagnose-project.ts <projectId>')
  console.log('示例: npx tsx scripts/diagnose-project.ts fae709e9-9215-4b3f-9f53-dad871f09896')
  process.exit(1)
}

diagnoseProject(projectId).catch(console.error)
