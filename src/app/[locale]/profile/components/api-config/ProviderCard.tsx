'use client'

import { useTranslations } from 'next-intl'
import { ProviderAdvancedFields } from './provider-card/ProviderAdvancedFields'
import { ProviderBaseFields } from './provider-card/ProviderBaseFields'
import { ProviderCardShell } from './provider-card/ProviderCardShell'
import { useProviderCardState } from './provider-card/hooks/useProviderCardState'
import type { ProviderCardProps } from './provider-card/types'

export function ProviderCard({
  provider,
  models,
  allModels,
  defaultModels,
  onToggleModel,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onDeleteModel,
  onUpdateModel,
  onDeleteProvider,
  onAddModel,
}: ProviderCardProps) {
  const t = useTranslations('apiConfig')

  const state = useProviderCardState({
    provider,
    models,
    allModels,
    defaultModels,
    onUpdateApiKey,
    onUpdateBaseUrl,
    onUpdateModel,
    onAddModel,
    t,
  })

  return (
    <ProviderCardShell provider={provider} onDeleteProvider={onDeleteProvider} t={t} state={state}>
      <ProviderBaseFields provider={provider} t={t} state={state} />
      <ProviderAdvancedFields
        provider={provider}
        onToggleModel={onToggleModel}
        onDeleteModel={onDeleteModel}
        onUpdateModel={onUpdateModel}
        t={t}
        state={state}
      />
    </ProviderCardShell>
  )
}

export default ProviderCard
