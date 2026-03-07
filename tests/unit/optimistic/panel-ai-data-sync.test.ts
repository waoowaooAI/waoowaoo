import { describe, expect, it } from 'vitest'
import {
  serializeStructuredJsonField,
  syncPanelCharacterDependentJson,
} from '@/lib/novel-promotion/panel-ai-data-sync'

describe('panel ai data sync helpers', () => {
  it('removes deleted character from acting notes and photography rules', () => {
    const synced = syncPanelCharacterDependentJson({
      characters: [
        { name: '楚江锴/当朝皇帝', appearance: '初始形象' },
        { name: '燕画乔/魏画乔', appearance: '初始形象' },
      ],
      removeIndex: 0,
      actingNotesJson: JSON.stringify([
        { name: '楚江锴/当朝皇帝', acting: '紧握手腕' },
        { name: '燕画乔/魏画乔', acting: '本能后退' },
      ]),
      photographyRulesJson: JSON.stringify({
        lighting: {
          direction: '侧逆光',
          quality: '硬光',
        },
        characters: [
          { name: '楚江锴/当朝皇帝', screen_position: 'left' },
          { name: '燕画乔/魏画乔', screen_position: 'right' },
        ],
      }),
    })

    expect(synced.characters).toEqual([{ name: '燕画乔/魏画乔', appearance: '初始形象' }])
    expect(JSON.parse(synced.actingNotesJson || 'null')).toEqual([
      { name: '燕画乔/魏画乔', acting: '本能后退' },
    ])
    expect(JSON.parse(synced.photographyRulesJson || 'null')).toEqual({
      lighting: {
        direction: '侧逆光',
        quality: '硬光',
      },
      characters: [
        { name: '燕画乔/魏画乔', screen_position: 'right' },
      ],
    })
  })

  it('keeps notes by character name when another appearance of same name remains', () => {
    const synced = syncPanelCharacterDependentJson({
      characters: [
        { name: '顾娘子/顾盼之', appearance: '素衣' },
        { name: '顾娘子/顾盼之', appearance: '华服' },
      ],
      removeIndex: 1,
      actingNotesJson: JSON.stringify([
        { name: '顾娘子/顾盼之', acting: '抬眼看向窗外' },
      ]),
      photographyRulesJson: JSON.stringify({
        characters: [
          { name: '顾娘子/顾盼之', screen_position: 'center' },
        ],
      }),
    })

    expect(JSON.parse(synced.actingNotesJson || 'null')).toEqual([
      { name: '顾娘子/顾盼之', acting: '抬眼看向窗外' },
    ])
    expect(JSON.parse(synced.photographyRulesJson || 'null')).toEqual({
      characters: [
        { name: '顾娘子/顾盼之', screen_position: 'center' },
      ],
    })
  })

  it('supports double-serialized JSON string inputs', () => {
    const actingNotes = JSON.stringify([{ name: '甲', acting: '动作' }])
    const doubleSerialized = JSON.stringify(actingNotes)
    expect(serializeStructuredJsonField(doubleSerialized, 'actingNotes')).toBe(actingNotes)
  })

  it('throws on malformed acting notes to avoid silent fallback', () => {
    expect(() => syncPanelCharacterDependentJson({
      characters: [{ name: '甲', appearance: '初始形象' }],
      removeIndex: 0,
      actingNotesJson: '[{"name":"甲","acting":"动作"}, {"acting":"缺少名字"}]',
      photographyRulesJson: null,
    })).toThrowError('actingNotes item.name must be a non-empty string')
  })
})
