import { describe, expect, it } from 'vitest'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'

describe('project agent operation registry', () => {
  it('keeps operation ids aligned and scopes defined', () => {
    const registry = createProjectAgentOperationRegistry()
    for (const [id, operation] of Object.entries(registry)) {
      expect(operation.id).toBe(id)
      expect(operation.scope).toBeTruthy()
      expect(operation.inputSchema).toBeDefined()
      expect(operation.outputSchema).toBeDefined()
    }
  })

  it('decorates manual high-frequency operations with tool metadata', () => {
    const registry = createProjectAgentOperationRegistry()
    for (const operationId of [
      'generate_character_image',
      'generate_location_image',
      'modify_asset_image',
      'regenerate_panel_image',
      'panel_variant',
      'create_storyboard_panel',
      'delete_storyboard_panel',
      'update_storyboard_panel_prompt',
      'update_storyboard_panel_fields',
      'reorder_storyboard_panels',
      'select_storyboard_panel_candidate',
      'cancel_storyboard_panel_candidates',
      'insert_storyboard_panel',
      'voice_generate',
      'voice_design',
      'lip_sync',
      'generate_video',
    ]) {
      const operation = registry[operationId]
      expect(operation).toBeDefined()
      expect(operation.tool?.groups?.length ?? 0).toBeGreaterThan(0)
      expect(operation.tool?.tags?.length ?? 0).toBeGreaterThan(0)
      expect(typeof operation.selection?.baseWeight).toBe('number')
      expect(operation.selection?.costHint).toBeTruthy()
    }
  })

  it('keeps legacy mutate_storyboard as api-only facade while explicit storyboard tools stay assistant-visible', () => {
    const registry = createProjectAgentOperationRegistry()

    expect(registry.mutate_storyboard?.channels).toEqual({ tool: false, api: true })
    expect(registry.delete_storyboard_panel?.channels?.tool ?? true).toBe(true)
    expect(registry.update_storyboard_panel_prompt?.channels?.tool ?? true).toBe(true)
    expect(registry.insert_storyboard_panel?.channels?.tool ?? true).toBe(true)
  })
})
