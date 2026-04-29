import { describe, expect, it } from 'vitest'
import {
  canonicalizePanelCharacterReferences,
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
} from '@/lib/storyboard-character-bindings'

describe('storyboard character bindings', () => {
  const characters = [{
    id: 'char-1',
    name: '顾娘子/顾盼之',
    appearances: [
      { id: 'app-1', appearanceIndex: 0, changeReason: '初始形象' },
      { id: 'app-2', appearanceIndex: 1, changeReason: '夜行衣' },
    ],
  }]

  it('canonicalizes bound ids into stable display fields', () => {
    const refs = canonicalizePanelCharacterReferences(characters, [
      { characterId: 'char-1', name: '顾娘子', appearanceId: 'app-2', appearance: '夜行衣', slot: '门口左侧' },
    ])

    expect(refs).toEqual([{
      characterId: 'char-1',
      name: '顾娘子/顾盼之',
      appearanceId: 'app-2',
      appearanceIndex: 1,
      appearance: '夜行衣',
      slot: '门口左侧',
    }])
  })

  it('uses ids instead of display names when resolving references', () => {
    const reference = {
      characterId: 'char-1',
      name: '错误昵称',
      appearanceId: 'app-2',
      appearance: '错误形象',
    }
    const character = findCharacterForStoryboardReference(characters, reference)
    const appearance = findAppearanceForStoryboardReference(character?.appearances || [], reference)

    expect(character?.name).toBe('顾娘子/顾盼之')
    expect(appearance?.changeReason).toBe('夜行衣')
  })

  it('throws instead of silently accepting unbound characters', () => {
    expect(() => canonicalizePanelCharacterReferences(characters, [
      { name: '顾娘子', appearance: '夜行衣' },
    ])).toThrow('STORYBOARD_CHARACTER_BINDING_INVALID')
  })
})
