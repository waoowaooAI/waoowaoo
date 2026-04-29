import { describe, expect, it } from 'vitest'
import { createEmptyAssetGroupMap } from '@/lib/assets/grouping'
import { mapAssetGroupsToProjectAssetsData } from '@/lib/query/hooks/useProjectAssets'

describe('useProjectAssets adapters', () => {
  it('preserves profileData for character profiles', () => {
    const groups = createEmptyAssetGroupMap()
    groups.character.push({
      id: 'character-1',
      scope: 'project',
      kind: 'character',
      family: 'visual',
      name: '林夏',
      folderId: null,
      capabilities: {
        canGenerate: true,
        canSelectRender: true,
        canRevertRender: true,
        canModifyRender: true,
        canUploadRender: true,
        canBindVoice: true,
        canCopyFromGlobal: true,
      },
      taskRefs: [],
      taskState: {
        isRunning: false,
        lastError: null,
      },
      variants: [],
      introduction: '主角',
      profileData: JSON.stringify({ archetype: 'lead' }),
      profileConfirmed: true,
      voice: {
        voiceType: null,
        voiceId: null,
        customVoiceUrl: null,
        media: null,
      },
    })

    const data = mapAssetGroupsToProjectAssetsData(groups)

    expect(data.characters).toHaveLength(1)
    expect(data.characters[0]).toEqual(expect.objectContaining({
      id: 'character-1',
      profileData: JSON.stringify({ archetype: 'lead' }),
      profileConfirmed: true,
    }))
  })
})
