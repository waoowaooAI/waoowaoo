import { describe, expect, it } from 'vitest'
import { buildPromptAssetContext, compileAssetPromptFragments } from '@/lib/assets/services/asset-prompt-context'

describe('asset prompt context', () => {
  it('compiles subject, environment, and prop prompt fragments from the centralized asset context', () => {
    const context = buildPromptAssetContext({
      characters: [
        {
          name: '小雨/雨',
          appearances: [
            {
              changeReason: '初始形象',
              descriptions: ['黑色短发，校服，冷静表情'],
              selectedIndex: 0,
              description: 'fallback description',
            },
          ],
        },
      ],
      locations: [
        {
          name: '天台',
          images: [
            {
              isSelected: true,
              description: '夜晚天台，冷风，霓虹远景',
              availableSlots: JSON.stringify([
                '天台栏杆左侧靠近边缘的位置',
              ]),
            },
          ],
        },
      ],
      props: [
        {
          name: '青铜匕首',
          summary: '古旧短刃，雕纹手柄',
        },
      ],
      clipCharacters: [{ name: '雨' }],
      clipLocation: '天台',
      clipProps: ['青铜匕首'],
    })

    expect(compileAssetPromptFragments(context)).toEqual({
      appearanceListText: '小雨/雨: [{"appearance":"初始形象"}]',
      fullDescriptionText: '【小雨/雨 - 初始形象】黑色短发，校服，冷静表情',
      locationDescriptionText: '夜晚天台，冷风，霓虹远景\n\n可站位置：\n- 天台栏杆左侧靠近边缘的位置',
      propsDescriptionText: '【青铜匕首】古旧短刃，雕纹手柄',
      charactersIntroductionText: '暂无角色介绍',
    })
  })
})
