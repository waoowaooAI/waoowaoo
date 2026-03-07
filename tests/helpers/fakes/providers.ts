const providerState: {
  falApiKey: string
  googleApiKey: string
  openrouterApiKey: string
} = {
  falApiKey: 'fake-fal-key',
  googleApiKey: 'fake-google-key',
  openrouterApiKey: 'fake-openrouter-key',
}

export function configureFakeProviders(params: {
  falApiKey?: string
  googleApiKey?: string
  openrouterApiKey?: string
}) {
  if (params.falApiKey) providerState.falApiKey = params.falApiKey
  if (params.googleApiKey) providerState.googleApiKey = params.googleApiKey
  if (params.openrouterApiKey) providerState.openrouterApiKey = params.openrouterApiKey
}

export function resetFakeProviders() {
  providerState.falApiKey = 'fake-fal-key'
  providerState.googleApiKey = 'fake-google-key'
  providerState.openrouterApiKey = 'fake-openrouter-key'
}

export function getFakeProviderConfig(provider: 'fal' | 'google' | 'openrouter') {
  if (provider === 'fal') {
    return { apiKey: providerState.falApiKey }
  }
  if (provider === 'google') {
    return { apiKey: providerState.googleApiKey }
  }
  return { apiKey: providerState.openrouterApiKey }
}
