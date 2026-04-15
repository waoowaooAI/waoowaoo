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

export async function resetProjectWorkflowState() {
  await prisma.projectVoiceLine.deleteMany()
  await prisma.projectPanel.deleteMany()
  await prisma.supplementaryPanel.deleteMany()
  await prisma.projectStoryboard.deleteMany()
  await prisma.projectShot.deleteMany()
  await prisma.projectClip.deleteMany()
  await prisma.characterAppearance.deleteMany()
  await prisma.locationImage.deleteMany()
  await prisma.projectCharacter.deleteMany()
  await prisma.projectLocation.deleteMany()
  await prisma.videoEditorProject.deleteMany()
  await prisma.projectEpisode.deleteMany()
}

export async function resetSystemState() {
  await resetTaskState()
  await resetAssetHubState()
  await resetProjectWorkflowState()
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
