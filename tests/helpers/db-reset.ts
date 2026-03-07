import { prisma } from './prisma'

export async function resetBillingState() {
  await prisma.balanceTransaction.deleteMany()
  await prisma.balanceFreeze.deleteMany()
  await prisma.usageCost.deleteMany()
  await prisma.taskEvent.deleteMany()
  await prisma.task.deleteMany()
  await prisma.userBalance.deleteMany()
  await prisma.project.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.userPreference.deleteMany()
  await prisma.user.deleteMany()
}

export async function resetTaskState() {
  await prisma.taskEvent.deleteMany()
  await prisma.task.deleteMany()
}

export async function resetAssetHubState() {
  await prisma.globalCharacterAppearance.deleteMany()
  await prisma.globalCharacter.deleteMany()
  await prisma.globalLocationImage.deleteMany()
  await prisma.globalLocation.deleteMany()
  await prisma.globalVoice.deleteMany()
  await prisma.globalAssetFolder.deleteMany()
}

export async function resetNovelPromotionState() {
  await prisma.novelPromotionVoiceLine.deleteMany()
  await prisma.novelPromotionPanel.deleteMany()
  await prisma.supplementaryPanel.deleteMany()
  await prisma.novelPromotionStoryboard.deleteMany()
  await prisma.novelPromotionShot.deleteMany()
  await prisma.novelPromotionClip.deleteMany()
  await prisma.characterAppearance.deleteMany()
  await prisma.locationImage.deleteMany()
  await prisma.novelPromotionCharacter.deleteMany()
  await prisma.novelPromotionLocation.deleteMany()
  await prisma.videoEditorProject.deleteMany()
  await prisma.novelPromotionEpisode.deleteMany()
  await prisma.novelPromotionProject.deleteMany()
}

export async function resetSystemState() {
  await resetTaskState()
  await resetAssetHubState()
  await resetNovelPromotionState()
  await prisma.usageCost.deleteMany()
  await prisma.project.deleteMany()
  await prisma.userPreference.deleteMany()
  await prisma.account.deleteMany()
  await prisma.session.deleteMany()
  await prisma.userBalance.deleteMany()
  await prisma.balanceFreeze.deleteMany()
  await prisma.balanceTransaction.deleteMany()
  await prisma.user.deleteMany()
}
