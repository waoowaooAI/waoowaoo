import { prisma } from '@/lib/prisma'

const id = 'a3cbc6d3-8720-4584-addd-e2bc4ace7759'

async function main() {
  const t = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      userId: true,
      projectId: true,
      payload: true,
      errorMessage: true,
      createdAt: true,
    },
  })
  console.log(JSON.stringify(t, null, 2))

  if (!t) return

  const pref = await prisma.userPreference.findUnique({
    where: { userId: t.userId },
    select: {
      analysisModel: true,
      customProviders: true,
      customModels: true,
    },
  })
  console.log('userPreference', JSON.stringify(pref, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
