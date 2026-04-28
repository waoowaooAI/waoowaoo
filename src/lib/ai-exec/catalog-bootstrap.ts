import {
  BUILTIN_API_CONFIG_CATALOG_MODELS,
  BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  BUILTIN_DEFAULT_LIPSYNC_MODEL_KEY,
  BUILTIN_DEFAULT_VOICE_DESIGN_MODEL_KEY,
  BUILTIN_DEFAULT_VOICE_MODEL_KEY,
  BUILTIN_GOOGLE_COMPATIBLE_API_CONFIG_CATALOG_MODELS,
  BUILTIN_PRICING_CATALOG_ENTRIES,
} from '@/lib/ai-providers/builtin-catalog'
import { registerBuiltinApiConfigCatalog } from '@/lib/ai-registry/api-config-catalog'
import { registerBuiltinCapabilityCatalogEntries } from '@/lib/ai-registry/capabilities-catalog'
import { registerBuiltinPricingCatalogEntries } from '@/lib/ai-registry/pricing-catalog'

let registered = false

export function ensureAiCatalogsRegistered() {
  if (registered) return
  registerBuiltinCapabilityCatalogEntries(BUILTIN_CAPABILITY_CATALOG_ENTRIES)
  registerBuiltinPricingCatalogEntries(BUILTIN_PRICING_CATALOG_ENTRIES)
  registerBuiltinApiConfigCatalog({
    models: BUILTIN_API_CONFIG_CATALOG_MODELS,
    googleCompatibleModels: BUILTIN_GOOGLE_COMPATIBLE_API_CONFIG_CATALOG_MODELS,
    defaultLipSyncModelKey: BUILTIN_DEFAULT_LIPSYNC_MODEL_KEY,
    defaultVoiceModelKey: BUILTIN_DEFAULT_VOICE_MODEL_KEY,
    defaultVoiceDesignModelKey: BUILTIN_DEFAULT_VOICE_DESIGN_MODEL_KEY,
  })
  registered = true
}
