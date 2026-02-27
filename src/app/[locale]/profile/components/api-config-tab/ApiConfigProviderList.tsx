'use client'

import type { CustomModel, Provider } from '../api-config'
import { ProviderCard, ProviderSection } from '../api-config'
import { AppIcon } from '@/components/ui/icons'

interface DefaultModels {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  lipSyncModel?: string
}

interface ApiConfigProviderListProps {
  modelProviders: Provider[]
  allModels: CustomModel[]
  defaultModels: DefaultModels
  audioProviders: Provider[]
  getModelsForProvider: (providerId: string) => CustomModel[]
  onAddGeminiProvider: () => void
  onToggleModel: (modelKey: string, providerId: string) => void
  onUpdateApiKey: (providerId: string, apiKey: string) => void
  onUpdateBaseUrl: (providerId: string, baseUrl: string) => void
  onDeleteModel: (modelKey: string, providerId: string) => void
  onUpdateModel: (modelKey: string, updates: Partial<CustomModel>, providerId: string) => void
  onDeleteProvider: (providerId: string) => void
  onAddModel: (model: Omit<CustomModel, 'enabled'>) => void
  labels: {
    providerPool: string
    addGeminiProvider: string
    otherProviders: string
    audioCategory: string
    audioApiKey: string
  }
}

const AUDIO_ICON = (
  <AppIcon name="cube" className="h-4 w-4 text-[var(--glass-text-secondary)]" />
)

export function ApiConfigProviderList({
  modelProviders,
  allModels,
  defaultModels,
  audioProviders,
  getModelsForProvider,
  onAddGeminiProvider,
  onToggleModel,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onDeleteModel,
  onUpdateModel,
  onDeleteProvider,
  onAddModel,
  labels,
}: ApiConfigProviderListProps) {
  const hasAudioProviders = audioProviders.length > 0
  const hasOtherProviders = hasAudioProviders

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-[var(--glass-text-primary)]">{labels.providerPool}</h2>
          <button
            onClick={onAddGeminiProvider}
            className="glass-btn-base glass-btn-primary cursor-pointer px-3 py-1.5 text-sm font-semibold"
          >
            {labels.addGeminiProvider}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {modelProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              models={getModelsForProvider(provider.id)}
              allModels={allModels}
              defaultModels={defaultModels}
              onToggleModel={(modelKey) => onToggleModel(modelKey, provider.id)}
              onUpdateApiKey={onUpdateApiKey}
              onUpdateBaseUrl={onUpdateBaseUrl}
              onDeleteModel={(modelKey) => onDeleteModel(modelKey, provider.id)}
              onUpdateModel={(modelKey, updates) => onUpdateModel(modelKey, updates, provider.id)}
              onDeleteProvider={onDeleteProvider}
              onAddModel={onAddModel}
            />
          ))}
        </div>
      </div>

      {hasOtherProviders && (
        <div className="pt-4">
          <h2 className="mb-4 px-1 text-base font-bold text-[var(--glass-text-primary)]">
            {labels.otherProviders}
            <span className="ml-2 text-sm font-normal text-[var(--glass-text-tertiary)]">
              ({labels.audioCategory})
            </span>
          </h2>
          <div className="space-y-4">
            {hasAudioProviders && (
              <ProviderSection
                title={labels.audioApiKey}
                icon={AUDIO_ICON}
                type="audio"
                providers={audioProviders}
                onUpdateApiKey={onUpdateApiKey}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
